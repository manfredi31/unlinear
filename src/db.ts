import { eq, desc, and, ne, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  repos,
  repoStates,
  stateSignals,
  repoLinks,
  incidents,
} from "./db/schema.js";

// ---------------------------------------------------------------------------
// Re-export types that index.ts and tools still use
// ---------------------------------------------------------------------------

export type ServiceTier = "prod" | "staging" | "dev";
export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";
export type DeployStatus = "succeeded" | "failed" | "running" | "queued" | "unknown";
export type Severity = "p0" | "p1" | "p2" | "p3";
export type IncidentStatus = "open" | "monitoring" | "resolved";

export interface StateSignal {
  signal_id: string;
  type: string;
  severity: Severity;
  summary: string;
  link?: string | null;
}

export interface IncidentEvidence {
  kind: string;
  link: string;
}

export interface IncidentHypothesis {
  rank: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Input types (kept compatible with index.ts tool handlers)
// ---------------------------------------------------------------------------

export interface RegisterRepoInput {
  repo_full_name: string;
  primary_owner?: string;
  service_tier?: ServiceTier;
  notes_md?: string;
}

export interface RefreshRepoDevMetadataInput {
  repo_id: string;
  expected_rev?: number;
  notes_md?: string;
  repo_tree_paths?: string[];
  dev_patch?: Record<string, unknown>;
}

export interface UpdateOperationalStateInput {
  repo_id: string;
  expected_rev?: number;
  health?: { status?: HealthStatus; warnings_count?: number };
  deploy?: Record<string, unknown>;
  signals?: StateSignal[];
  work?: { open_issues_count?: number; top?: unknown[] };
}

export interface CreateIncidentInput {
  repo_id: string;
  incident_id?: string;
  started_at?: string;
  severity: Severity;
  signal_type: string;
  evidence?: IncidentEvidence[];
  summary_md?: string;
  hypotheses?: IncidentHypothesis[];
  create_github_issue?: boolean;
  issue_title?: string;
  issue_body?: string;
  assignee?: string | null;
  labels?: string[];
  work_item?: { provider: string; issue_number: number; url: string } | null;
  status?: IncidentStatus;
}

export interface HandleRecoveryInput {
  repo_id: string;
  expected_state_rev?: number;
  state_patch?: Omit<UpdateOperationalStateInput, "repo_id" | "expected_rev">;
  incident_id?: string;
  update_incident_status?: boolean;
  recovery_note?: string;
}

export interface SummarizeIncidentInput {
  repo_id: string;
  incident_id?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeRepoFullName(repoFullName: string): string {
  const value = repoFullName.trim().toLowerCase();
  const parts = value.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("repo_full_name must be in owner/name format.");
  }
  return `${parts[0]}/${parts[1]}`;
}

export function deriveRepoId(repoFullName: string): string {
  return normalizeRepoFullName(repoFullName).replace("/", "__").replace(/[^a-z0-9._-]/g, "-");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function assertExpectedRev(currentRev: number, expectedRev: number | undefined, label: string): void {
  if (expectedRev !== undefined && currentRev !== expectedRev) {
    throw new Error(`Optimistic concurrency check failed for ${label}. Expected rev=${expectedRev}, actual rev=${currentRev}.`);
  }
}

// ---------------------------------------------------------------------------
// Public API — functional wrappers around Drizzle queries
// ---------------------------------------------------------------------------

export async function registerRepo(input: RegisterRepoInput) {
  const repoFullName = normalizeRepoFullName(input.repo_full_name);
  const repoId = deriveRepoId(repoFullName);

  const existing = await db.select({ id: repos.repoId }).from(repos).where(eq(repos.repoId, repoId));
  if (existing.length > 0) {
    throw new Error(`Repo already registered: ${repoId}`);
  }

  const ownerFromRepo = repoFullName.split("/")[0] ?? null;
  const primaryOwner = input.primary_owner ?? ownerFromRepo;
  const now = new Date();

  const [repo] = await db.insert(repos).values({
    repoId,
    repoFullName,
    serviceTier: input.service_tier ?? "prod",
    owners: { primary: primaryOwner, backup: null },
    dev: {
      primary_language: "unknown",
      stack: [],
      package_manager: "unknown",
      entrypoints: [],
      run_commands: {},
      env: { has_env_example: false, env_example_path: null },
    },
    architecture: { one_liner: "", key_dirs: [], gotchas: [] },
    notesMd: input.notes_md ?? "",
    rev: 1,
    createdAt: now,
    updatedAt: now,
  }).returning();

  const [state] = await db.insert(repoStates).values({
    repoId,
    healthStatus: "unknown",
    warningsCount: 0,
    deploy: {
      provider: "unknown",
      branch: "main",
      status: "unknown",
      last_deploy_id: null,
      link: null,
    },
    openIssuesCount: 0,
    rev: 1,
    updatedAt: now,
  }).returning();

  const [links] = await db.insert(repoLinks).values({
    repoId,
    repoUrl: `https://github.com/${repoFullName}`,
    issuesUrl: `https://github.com/${repoFullName}/issues`,
    actionsUrl: `https://github.com/${repoFullName}/actions`,
    deployDashboard: null,
    updatedAt: now,
  }).returning();

  return { repo_id: repoId, repo, state, links };
}

export async function refreshRepoDevMetadata(input: RefreshRepoDevMetadataInput) {
  const [repo] = await db.select().from(repos).where(eq(repos.repoId, input.repo_id));
  if (!repo) throw new Error(`Repo not found: ${input.repo_id}`);
  assertExpectedRev(repo.rev, input.expected_rev, "repos");

  const currentDev = repo.dev as Record<string, unknown>;
  const mergedDev = { ...currentDev, ...(input.dev_patch ?? {}) };
  if (input.dev_patch?.run_commands) {
    mergedDev.run_commands = {
      ...((currentDev.run_commands as Record<string, unknown>) ?? {}),
      ...(input.dev_patch.run_commands as Record<string, unknown>),
    };
  }
  if (input.dev_patch?.env) {
    mergedDev.env = {
      ...((currentDev.env as Record<string, unknown>) ?? {}),
      ...(input.dev_patch.env as Record<string, unknown>),
    };
  }

  const [updated] = await db
    .update(repos)
    .set({
      dev: mergedDev,
      notesMd: input.notes_md ?? repo.notesMd,
      rev: repo.rev + 1,
      updatedAt: new Date(),
    })
    .where(eq(repos.repoId, input.repo_id))
    .returning();

  return updated;
}

export async function updateOperationalState(input: UpdateOperationalStateInput) {
  const [currentState] = await db.select().from(repoStates).where(eq(repoStates.repoId, input.repo_id));
  if (!currentState) throw new Error(`State not found for repo: ${input.repo_id}`);
  assertExpectedRev(currentState.rev, input.expected_rev, "repo_states");

  const currentDeploy = currentState.deploy as Record<string, unknown>;
  const now = new Date();

  const [nextState] = await db
    .update(repoStates)
    .set({
      healthStatus: input.health?.status ?? currentState.healthStatus,
      warningsCount: input.health?.warnings_count ?? currentState.warningsCount,
      deploy: input.deploy ? { ...currentDeploy, ...input.deploy } : currentDeploy,
      openIssuesCount: input.work?.open_issues_count ?? currentState.openIssuesCount,
      rev: currentState.rev + 1,
      updatedAt: now,
    })
    .where(eq(repoStates.repoId, input.repo_id))
    .returning();

  if (input.signals !== undefined) {
    await db.delete(stateSignals).where(eq(stateSignals.repoId, input.repo_id));
    if (input.signals.length > 0) {
      await db.insert(stateSignals).values(
        input.signals.map((s) => ({
          repoId: input.repo_id,
          signalId: s.signal_id,
          type: s.type,
          severity: s.severity as "p0" | "p1" | "p2" | "p3",
          summary: s.summary,
          link: s.link ?? null,
        }))
      );
    }
  }

  return nextState;
}

export async function createIncident(input: CreateIncidentInput) {
  const now = new Date();
  const startedAt = input.started_at ? new Date(input.started_at) : now;
  const incidentId =
    input.incident_id ??
    `${startedAt.toISOString().slice(0, 10)}_${slugify(input.signal_type)}`;

  const existing = await db.select({ id: incidents.incidentId }).from(incidents).where(eq(incidents.incidentId, incidentId));
  if (existing.length > 0) {
    throw new Error(`Incident already exists: ${incidentId}`);
  }

  let workItem = input.work_item ?? null;

  if (input.create_github_issue) {
    const [repo] = await db.select().from(repos).where(eq(repos.repoId, input.repo_id));
    if (!repo) throw new Error(`Repo not found: ${input.repo_id}`);

    const issue = await createGitHubIssue(repo.repoFullName, {
      title: input.issue_title ?? `Incident: ${input.signal_type}`,
      body: input.issue_body ?? input.summary_md ?? `Signal detected: ${input.signal_type}`,
      labels: input.labels ?? [],
      assignee: input.assignee === null ? undefined : input.assignee,
    });
    workItem = { provider: "github", issue_number: issue.number, url: issue.url };
  }

  const defaultSummary = `## Symptom\nSignal detected: \`${input.signal_type}\`.\n\n## Next steps\n1) Validate recent deploy/logs.\n2) Triage owner and mitigation.\n`;

  const [incident] = await db.insert(incidents).values({
    incidentId,
    repoId: input.repo_id,
    severity: input.severity,
    signalType: input.signal_type,
    summaryMd: input.summary_md ?? defaultSummary,
    status: input.status ?? "open",
    startedAt,
    evidence: input.evidence ?? [],
    hypotheses: input.hypotheses ?? [],
    workItem,
    createdBy: "mcp",
    createdAt: now,
    updatedAt: now,
  }).returning();

  return incident;
}

export async function handleRecovery(input: HandleRecoveryInput) {
  const state = await updateOperationalState({
    repo_id: input.repo_id,
    expected_rev: input.expected_state_rev,
    ...input.state_patch,
  });

  let incident = null;
  if (input.incident_id && input.update_incident_status) {
    const [updated] = await db
      .update(incidents)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(eq(incidents.incidentId, input.incident_id))
      .returning();
    incident = updated ?? null;
  }

  return { state, incident };
}

export async function listProjects() {
  const allRepos = await db
    .select({ repoId: repos.repoId, repoFullName: repos.repoFullName })
    .from(repos)
    .orderBy(repos.repoId);

  const unhealthy = await db
    .select({
      repoId: repoStates.repoId,
      health: repoStates.healthStatus,
      warningsCount: repoStates.warningsCount,
    })
    .from(repoStates)
    .where(ne(repoStates.healthStatus, "healthy"));

  return {
    repos_all: {
      updated_at: new Date().toISOString(),
      repos: allRepos.map((r) => ({ repo_id: r.repoId, repo_full_name: r.repoFullName })),
    },
    repos_by_health: {
      updated_at: new Date().toISOString(),
      unhealthy: unhealthy.map((r) => ({
        repo_id: r.repoId,
        health: r.health,
        warnings_count: r.warningsCount,
      })),
    },
  };
}

export async function getProjectOverview(repoId: string) {
  const [repo] = await db.select().from(repos).where(eq(repos.repoId, repoId));
  if (!repo) throw new Error(`Repo not found: ${repoId}`);

  const [state] = await db.select().from(repoStates).where(eq(repoStates.repoId, repoId));
  const [links] = await db.select().from(repoLinks).where(eq(repoLinks.repoId, repoId));
  const signals = await db.select().from(stateSignals).where(eq(stateSignals.repoId, repoId));

  const [latestIncident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.repoId, repoId))
    .orderBy(desc(incidents.startedAt))
    .limit(1);

  return {
    repo,
    state: state ?? null,
    links: links ?? null,
    signals,
    latest_incident: latestIncident ?? null,
  };
}

export async function summarizeIncident(input: SummarizeIncidentInput) {
  let incident;
  if (input.incident_id) {
    const [found] = await db.select().from(incidents).where(eq(incidents.incidentId, input.incident_id));
    incident = found;
  } else {
    const [latest] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.repoId, input.repo_id))
      .orderBy(desc(incidents.startedAt))
      .limit(1);
    incident = latest;
  }

  if (!incident) {
    throw new Error(`No incidents found for repo ${input.repo_id}`);
  }

  const summaryMd =
    incident.summaryMd.trim().length > 0
      ? incident.summaryMd
      : formatIncidentMarkdown(incident);

  return { incident, summary_md: summaryMd };
}

// ---------------------------------------------------------------------------
// GitHub helpers (kept for incident creation)
// ---------------------------------------------------------------------------

interface GitHubIssueApi {
  number: number;
  title: string;
  state: string;
  assignee: { login: string } | null;
  labels: Array<{ name: string }>;
  html_url: string;
  pull_request?: unknown;
}

function githubToken(): string | null {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
}

async function createGitHubIssue(
  repoFullName: string,
  input: { title: string; body?: string; labels?: string[]; assignee?: string }
) {
  const token = githubToken();
  if (!token) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required for GitHub issue operations.");

  const payload: Record<string, unknown> = { title: input.title, body: input.body ?? "" };
  if (input.labels?.length) payload.labels = input.labels;
  if (input.assignee) payload.assignees = [input.assignee];

  const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "unlinear-mcp",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${body}`);
  }

  const data = (await response.json()) as GitHubIssueApi;
  return {
    number: data.number,
    title: data.title,
    state: data.state,
    assignee: data.assignee?.login ?? null,
    labels: data.labels.map((l) => l.name).filter(Boolean),
    url: data.html_url,
  };
}

function formatIncidentMarkdown(incident: typeof incidents.$inferSelect) {
  const ev = (incident.evidence as IncidentEvidence[])
    .map((item) => `- ${item.kind}: ${item.link}`)
    .join("\n");
  const hyp = (incident.hypotheses as IncidentHypothesis[])
    .sort((a, b) => a.rank - b.rank)
    .map((item) => `${item.rank}. ${item.text}`)
    .join("\n");

  return [
    `# Incident ${incident.incidentId}`,
    "",
    `- Severity: \`${incident.severity}\``,
    `- Status: \`${incident.status}\``,
    `- Signal: \`${incident.signalType}\``,
    "",
    "## Evidence",
    ev || "- None recorded",
    "",
    "## Hypotheses",
    hyp || "1. No hypotheses recorded",
  ].join("\n");
}
