import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { access, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const SCHEMA_VERSION = 1;
const LOCK_WAIT_TIMEOUT_MS = 12_000;
const LOCK_POLL_INTERVAL_MS = 120;
const LOCK_STALE_MS = 60_000;

export type ServiceTier = "prod" | "staging" | "dev";
export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";
export type DeployStatus = "succeeded" | "failed" | "running" | "queued" | "unknown";
export type Severity = "p0" | "p1" | "p2" | "p3";
export type IncidentStatus = "open" | "monitoring" | "resolved";

export interface DbMeta {
  schema_version: number;
  created_at: string;
  db_id: string;
  safe_mode: boolean;
}

export interface RepoFile {
  type: "repo";
  schema_version: number;
  repo_id: string;
  repo_full_name: string;
  owners: {
    primary: string | null;
    backup: string | null;
  };
  service_tier: ServiceTier;
  dev: {
    primary_language: string;
    stack: string[];
    package_manager: string;
    entrypoints: string[];
    run_commands: {
      install?: string;
      dev?: string;
      test?: string;
      build?: string;
      [key: string]: string | undefined;
    };
    env: {
      has_env_example: boolean;
      env_example_path: string | null;
    };
  };
  architecture: {
    one_liner: string;
    key_dirs: Array<{
      path: string;
      role: string;
    }>;
    gotchas: string[];
  };
  notes_md: string;
  rev: number;
  updated_at: string;
}

export interface StateSignal {
  signal_id: string;
  type: string;
  severity: Severity;
  summary: string;
  link?: string | null;
}

export interface StateIssueLite {
  provider: "github";
  number: number;
  title: string;
  state: string;
  assignee: string | null;
  labels: string[];
  url?: string;
}

export interface StateFile {
  type: "state";
  schema_version: number;
  repo_id: string;
  updated_at: string;
  health: {
    status: HealthStatus;
    warnings_count: number;
  };
  deploy: {
    provider: string;
    branch: string;
    status: DeployStatus;
    last_deploy_id: string | null;
    link: string | null;
  };
  signals: StateSignal[];
  work: {
    open_issues_count: number;
    top: StateIssueLite[];
  };
  rev: number;
}

export interface PolicyFile {
  type: "policy";
  schema_version: number;
  repo_id: string;
  permissions: {
    default: "read_only" | "read_write";
    github_issues_write: boolean;
  };
  routing: {
    default_assignee: string | null;
    labels_by_severity: Record<Severity, string[]>;
  };
  auto_actions: {
    on_p0_deploy_failed: {
      create_github_issue: boolean;
      assign: string | null;
      add_labels: string[];
    };
    on_recovery: {
      comment_on_issue: boolean;
      close_issue: boolean;
    };
  };
  rev: number;
  updated_at: string;
}

export interface LinksFile {
  type: "links";
  schema_version: number;
  repo_id: string;
  repo_url: string;
  issues_url: string;
  actions_url: string;
  deploy_dashboard: string | null;
  updated_at: string;
}

export interface RepoTreeLightCache {
  updated_at: string;
  paths: string[];
}

export interface IssuesLightCache {
  updated_at: string;
  source: "github" | "bootstrap" | "manual";
  items: StateIssueLite[];
}

export interface IncidentEvidence {
  kind: string;
  link: string;
}

export interface IncidentHypothesis {
  rank: number;
  text: string;
}

export interface IncidentFile {
  type: "incident";
  schema_version: number;
  incident_id: string;
  repo_id: string;
  started_at: string;
  severity: Severity;
  signal_type: string;
  evidence: IncidentEvidence[];
  summary_md: string;
  hypotheses: IncidentHypothesis[];
  work_item: {
    provider: "github";
    issue_number: number;
    url: string;
  } | null;
  status: IncidentStatus;
  created_by: string;
  created_at: string;
}

export interface ReposAllIndex {
  updated_at: string;
  repos: Array<{
    repo_id: string;
    repo_full_name: string;
  }>;
}

export interface ReposByHealthIndex {
  updated_at: string;
  unhealthy: Array<{
    repo_id: string;
    health: HealthStatus;
    warnings_count: number;
  }>;
}

export interface OpenIncidentsIndex {
  updated_at: string;
  items: Array<{
    repo_id: string;
    incident_id: string;
    severity: Severity;
    started_at: string;
  }>;
}

export interface RegisterRepoInput {
  repo_full_name: string;
  primary_owner?: string;
  service_tier?: ServiceTier;
  notes_md?: string;
  actor?: string;
}

export interface RefreshRepoDevMetadataInput {
  repo_id: string;
  expected_rev?: number;
  actor?: string;
  notes_md?: string;
  repo_tree_paths?: string[];
  dev_patch?: Partial<Omit<RepoFile["dev"], "run_commands" | "env">> & {
    run_commands?: Partial<RepoFile["dev"]["run_commands"]>;
    env?: Partial<RepoFile["dev"]["env"]>;
  };
}

export interface UpdateOperationalStateInput {
  repo_id: string;
  expected_rev?: number;
  actor?: string;
  health?: Partial<StateFile["health"]>;
  deploy?: Partial<StateFile["deploy"]>;
  signals?: StateSignal[];
  work?: Partial<StateFile["work"]>;
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
  work_item?: IncidentFile["work_item"];
  status?: IncidentStatus;
  actor?: string;
}

export interface HandleRecoveryInput {
  repo_id: string;
  expected_state_rev?: number;
  actor?: string;
  recovery_note?: string;
  state_patch?: Omit<UpdateOperationalStateInput, "repo_id" | "expected_rev" | "actor">;
  incident_id?: string;
  update_incident_status?: boolean;
}

export interface ListWorkItemsInput {
  repo_id: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface CreateWorkItemInput {
  repo_id: string;
  title: string;
  body?: string;
  labels?: string[];
  assignee?: string;
  actor?: string;
}

export interface SummarizeIncidentInput {
  repo_id: string;
  incident_id?: string;
}

interface GitHubIssueApi {
  number: number;
  title: string;
  state: string;
  assignee: { login: string } | null;
  labels: Array<{ name: string }>;
  html_url: string;
  pull_request?: unknown;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toFileStamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function isUnhealthy(status: HealthStatus): boolean {
  return status !== "healthy";
}

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

export class JsonFsDb {
  private readonly rootDir: string;
  private layoutReady = false;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  public getRootDir(): string {
    return this.rootDir;
  }

  public async ensureBaseLayout(): Promise<void> {
    if (this.layoutReady) {
      return;
    }

    await mkdir(this.rootDir, { recursive: true });
    await mkdir(this.indexesDir(), { recursive: true });
    await mkdir(this.reposDir(), { recursive: true });
    await mkdir(this.auditDir(), { recursive: true });
    await mkdir(this.locksDir(), { recursive: true });

    const ts = nowIso();
    if (!(await this.exists(this.metaPath()))) {
      await this.writeJsonAtomic(this.metaPath(), {
        schema_version: SCHEMA_VERSION,
        created_at: ts,
        db_id: "local-dev",
        safe_mode: true,
      } satisfies DbMeta);
    }

    if (!(await this.exists(this.indexPath("repos_all")))) {
      await this.writeJsonAtomic(this.indexPath("repos_all"), {
        updated_at: ts,
        repos: [],
      } satisfies ReposAllIndex);
    }

    if (!(await this.exists(this.indexPath("repos_by_health")))) {
      await this.writeJsonAtomic(this.indexPath("repos_by_health"), {
        updated_at: ts,
        unhealthy: [],
      } satisfies ReposByHealthIndex);
    }

    if (!(await this.exists(this.indexPath("open_incidents")))) {
      await this.writeJsonAtomic(this.indexPath("open_incidents"), {
        updated_at: ts,
        items: [],
      } satisfies OpenIncidentsIndex);
    }

    this.layoutReady = true;
  }

  public async readJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  }

  public async writeJsonAtomic(filePath: string, obj: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const payload = `${JSON.stringify(obj, null, 2)}\n`;
    let handle: FileHandle | null = null;

    try {
      handle = await open(tmpPath, "w");
      await handle.writeFile(payload, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(tmpPath, filePath);
      await this.fsyncDir(path.dirname(filePath));
    } catch (err) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      await rm(tmpPath, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  public async appendJsonl(filePath: string, event: Record<string, unknown>): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const line = `${JSON.stringify(event)}\n`;
    const handle = await open(filePath, "a");
    try {
      await handle.writeFile(line, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  public async withRepoLock<T>(repoId: string, fn: () => Promise<T>): Promise<T> {
    await this.ensureBaseLayout();
    const lockPath = this.lockPath(repoId);
    const lockHandle = await this.acquireLock(lockPath);

    try {
      return await fn();
    } finally {
      await lockHandle.close().catch(() => undefined);
      await rm(lockPath, { force: true }).catch(() => undefined);
    }
  }

  public async updateIndex<T extends object>(
    name: string,
    updaterFn: (current: T) => T | Promise<T>
  ): Promise<T> {
    await this.ensureBaseLayout();
    return this.withRepoLock("__indexes", async () => {
      const targetPath = this.indexPath(name);
      const current = (await this.tryReadJson<T>(targetPath)) ?? ({} as T);
      const next = await updaterFn(current);
      await this.writeJsonAtomic(targetPath, next);
      return next;
    });
  }

  public async registerRepo(input: RegisterRepoInput): Promise<{
    repo_id: string;
    repo: RepoFile;
    state: StateFile;
    policy: PolicyFile;
    links: LinksFile;
  }> {
    await this.ensureBaseLayout();
    const repoFullName = normalizeRepoFullName(input.repo_full_name);
    const repoId = deriveRepoId(repoFullName);
    const actor = input.actor ?? "mcp";

    return this.withRepoLock(repoId, async () => {
      const repoDir = this.repoDir(repoId);
      if (await this.exists(this.repoJsonPath(repoId))) {
        throw new Error(`Repo already registered: ${repoId}`);
      }

      await mkdir(path.join(repoDir, "cache"), { recursive: true });
      await mkdir(path.join(repoDir, "incidents"), { recursive: true });
      await mkdir(path.join(repoDir, "history"), { recursive: true });

      const ts = nowIso();
      const ownerFromRepo = repoFullName.split("/")[0] ?? null;
      const primaryOwner = input.primary_owner ?? ownerFromRepo;

      const repo: RepoFile = {
        type: "repo",
        schema_version: SCHEMA_VERSION,
        repo_id: repoId,
        repo_full_name: repoFullName,
        owners: { primary: primaryOwner, backup: null },
        service_tier: input.service_tier ?? "prod",
        dev: {
          primary_language: "unknown",
          stack: [],
          package_manager: "unknown",
          entrypoints: [],
          run_commands: {},
          env: {
            has_env_example: false,
            env_example_path: null,
          },
        },
        architecture: {
          one_liner: "",
          key_dirs: [],
          gotchas: [],
        },
        notes_md: input.notes_md ?? "",
        rev: 1,
        updated_at: ts,
      };

      const state: StateFile = {
        type: "state",
        schema_version: SCHEMA_VERSION,
        repo_id: repoId,
        updated_at: ts,
        health: { status: "unknown", warnings_count: 0 },
        deploy: {
          provider: "unknown",
          branch: "main",
          status: "unknown",
          last_deploy_id: null,
          link: null,
        },
        signals: [],
        work: {
          open_issues_count: 0,
          top: [],
        },
        rev: 1,
      };

      const policy: PolicyFile = {
        type: "policy",
        schema_version: SCHEMA_VERSION,
        repo_id: repoId,
        permissions: {
          default: "read_only",
          github_issues_write: true,
        },
        routing: {
          default_assignee: primaryOwner,
          labels_by_severity: {
            p0: ["incident", "p0"],
            p1: ["bug", "p1"],
            p2: ["bug", "p2"],
            p3: ["chore", "p3"],
          },
        },
        auto_actions: {
          on_p0_deploy_failed: {
            create_github_issue: true,
            assign: primaryOwner,
            add_labels: ["incident", "p0"],
          },
          on_recovery: {
            comment_on_issue: true,
            close_issue: false,
          },
        },
        rev: 1,
        updated_at: ts,
      };

      const links: LinksFile = {
        type: "links",
        schema_version: SCHEMA_VERSION,
        repo_id: repoId,
        repo_url: `https://github.com/${repoFullName}`,
        issues_url: `https://github.com/${repoFullName}/issues`,
        actions_url: `https://github.com/${repoFullName}/actions`,
        deploy_dashboard: null,
        updated_at: ts,
      };

      await this.writeJsonAtomic(this.repoJsonPath(repoId), repo);
      await this.writeJsonAtomic(this.stateJsonPath(repoId), state);
      await this.writeJsonAtomic(this.policyJsonPath(repoId), policy);
      await this.writeJsonAtomic(this.linksJsonPath(repoId), links);
      await this.writeJsonAtomic(this.issuesLightCachePath(repoId), {
        updated_at: ts,
        source: "bootstrap",
        items: [],
      } satisfies IssuesLightCache);
      await this.writeJsonAtomic(this.repoTreeLightCachePath(repoId), {
        updated_at: ts,
        paths: [],
      } satisfies RepoTreeLightCache);

      await this.upsertRepoAllIndex(repoId, repoFullName);
      await this.appendAuditEvent("repo.registered", {
        actor,
        repo_id: repoId,
        repo_full_name: repoFullName,
      });

      return { repo_id: repoId, repo, state, policy, links };
    });
  }

  public async refreshRepoDevMetadata(input: RefreshRepoDevMetadataInput): Promise<RepoFile> {
    await this.ensureBaseLayout();
    const actor = input.actor ?? "mcp";

    return this.withRepoLock(input.repo_id, async () => {
      const repo = await this.readJson<RepoFile>(this.repoJsonPath(input.repo_id));
      this.assertExpectedRev(repo.rev, input.expected_rev, "repo.json");

      const ts = nowIso();
      if (input.repo_tree_paths && input.repo_tree_paths.length > 0) {
        await this.writeJsonAtomic(this.repoTreeLightCachePath(input.repo_id), {
          updated_at: ts,
          paths: input.repo_tree_paths,
        } satisfies RepoTreeLightCache);
      }

      const mergedDev: RepoFile["dev"] = {
        ...repo.dev,
        ...input.dev_patch,
        stack: input.dev_patch?.stack ?? repo.dev.stack,
        entrypoints:
          input.dev_patch?.entrypoints ??
          this.inferEntrypoints(input.repo_tree_paths ?? [], repo.dev.entrypoints),
        run_commands: {
          ...repo.dev.run_commands,
          ...(input.dev_patch?.run_commands ?? {}),
        },
        env: {
          ...repo.dev.env,
          ...(input.dev_patch?.env ?? {}),
        },
      };

      const nextRepo: RepoFile = {
        ...repo,
        dev: mergedDev,
        notes_md: input.notes_md ?? repo.notes_md,
        updated_at: ts,
        rev: repo.rev + 1,
      };

      await this.writeJsonAtomic(this.repoJsonPath(input.repo_id), nextRepo);
      await this.appendAuditEvent("repo.dev_metadata.updated", {
        actor,
        repo_id: input.repo_id,
        rev: nextRepo.rev,
      });

      return nextRepo;
    });
  }

  public async updateOperationalState(input: UpdateOperationalStateInput): Promise<StateFile> {
    await this.ensureBaseLayout();
    const actor = input.actor ?? "mcp";

    return this.withRepoLock(input.repo_id, async () => {
      const currentState = await this.readJson<StateFile>(this.stateJsonPath(input.repo_id));
      this.assertExpectedRev(currentState.rev, input.expected_rev, "state.json");

      const ts = nowIso();
      await this.writeJsonAtomic(
        path.join(this.repoDir(input.repo_id), "history", `state_${toFileStamp(ts)}_rev-${currentState.rev}.json`),
        currentState
      );

      const nextState: StateFile = {
        ...currentState,
        health: {
          ...currentState.health,
          ...(input.health ?? {}),
        },
        deploy: {
          ...currentState.deploy,
          ...(input.deploy ?? {}),
        },
        signals: input.signals ?? currentState.signals,
        work: {
          ...currentState.work,
          ...(input.work ?? {}),
          top: input.work?.top ?? currentState.work.top,
        },
        updated_at: ts,
        rev: currentState.rev + 1,
      };

      await this.writeJsonAtomic(this.stateJsonPath(input.repo_id), nextState);
      await this.upsertReposByHealthIndex(input.repo_id, nextState.health);
      await this.appendAuditEvent("state.updated", {
        actor,
        repo_id: input.repo_id,
        rev: nextState.rev,
      });

      return nextState;
    });
  }

  public async createIncident(input: CreateIncidentInput): Promise<IncidentFile> {
    await this.ensureBaseLayout();
    const actor = input.actor ?? "mcp";

    return this.withRepoLock(input.repo_id, async () => {
      const repo = await this.readJson<RepoFile>(this.repoJsonPath(input.repo_id));
      const policy = await this.readJson<PolicyFile>(this.policyJsonPath(input.repo_id));

      const ts = nowIso();
      const startedAt = input.started_at ?? ts;
      const incidentId =
        input.incident_id ?? `${startedAt.slice(0, 10)}_${slugify(input.signal_type)}`;
      const incidentPath = this.incidentJsonPath(input.repo_id, incidentId);
      if (await this.exists(incidentPath)) {
        throw new Error(`Incident already exists: ${incidentId}`);
      }

      let workItem: IncidentFile["work_item"] = input.work_item ?? null;
      if (input.create_github_issue) {
        const labels = input.labels ?? policy.routing.labels_by_severity[input.severity] ?? [];
        const assignee =
          input.assignee === null
            ? undefined
            : input.assignee ?? policy.routing.default_assignee ?? undefined;
        const issue = await this.createGitHubIssue(repo.repo_full_name, {
          title: input.issue_title ?? `Incident: ${input.signal_type}`,
          body: input.issue_body ?? input.summary_md ?? `Signal detected: ${input.signal_type}`,
          labels,
          assignee,
        });
        workItem = {
          provider: "github",
          issue_number: issue.number,
          url: issue.url,
        };

        await this.appendAuditEvent("github.issue.created", {
          actor,
          repo_id: input.repo_id,
          issue_number: issue.number,
        });
      }

      const incident: IncidentFile = {
        type: "incident",
        schema_version: SCHEMA_VERSION,
        incident_id: incidentId,
        repo_id: input.repo_id,
        started_at: startedAt,
        severity: input.severity,
        signal_type: input.signal_type,
        evidence: input.evidence ?? [],
        summary_md: input.summary_md ?? this.defaultIncidentSummary(input.signal_type),
        hypotheses: input.hypotheses ?? [],
        work_item: workItem,
        status: input.status ?? "open",
        created_by: actor,
        created_at: ts,
      };

      await this.writeJsonAtomic(incidentPath, incident);
      if (incident.status === "open") {
        await this.upsertOpenIncidentsIndex(incident);
      }
      await this.appendAuditEvent("incident.created", {
        actor,
        repo_id: input.repo_id,
        incident_id: incidentId,
      });

      return incident;
    });
  }

  public async handleRecovery(input: HandleRecoveryInput): Promise<{
    state: StateFile;
    incident: IncidentFile | null;
  }> {
    await this.ensureBaseLayout();
    const actor = input.actor ?? "mcp";

    const state = await this.updateOperationalState({
      repo_id: input.repo_id,
      expected_rev: input.expected_state_rev,
      actor,
      ...input.state_patch,
    });

    let incident: IncidentFile | null = null;
    if (input.incident_id) {
      if (input.update_incident_status) {
        incident = await this.updateIncidentStatus(input.repo_id, input.incident_id, "resolved", actor);
      } else {
        await this.appendAuditEvent("incident.recovery_event", {
          actor,
          repo_id: input.repo_id,
          incident_id: input.incident_id,
          note: input.recovery_note ?? "Recovery detected",
        });
      }
    }

    await this.appendAuditEvent("recovery.handled", {
      actor,
      repo_id: input.repo_id,
      rev: state.rev,
    });

    return { state, incident };
  }

  public async listProjects(): Promise<{
    repos_all: ReposAllIndex;
    repos_by_health: ReposByHealthIndex;
  }> {
    await this.ensureBaseLayout();
    const [reposAll, reposByHealth] = await Promise.all([
      this.readJson<ReposAllIndex>(this.indexPath("repos_all")),
      this.readJson<ReposByHealthIndex>(this.indexPath("repos_by_health")),
    ]);

    return {
      repos_all: reposAll,
      repos_by_health: reposByHealth,
    };
  }

  public async getProjectOverview(repoId: string): Promise<{
    repo: RepoFile;
    state: StateFile;
    policy: PolicyFile;
    links: LinksFile;
    latest_incident: IncidentFile | null;
  }> {
    await this.ensureBaseLayout();
    const [repo, state, policy, links, latestIncident] = await Promise.all([
      this.readJson<RepoFile>(this.repoJsonPath(repoId)),
      this.readJson<StateFile>(this.stateJsonPath(repoId)),
      this.readJson<PolicyFile>(this.policyJsonPath(repoId)),
      this.readJson<LinksFile>(this.linksJsonPath(repoId)),
      this.readLatestIncident(repoId),
    ]);

    return {
      repo,
      state,
      policy,
      links,
      latest_incident: latestIncident,
    };
  }

  public async listWorkItems(input: ListWorkItemsInput): Promise<{
    source: "github" | "cache";
    items: StateIssueLite[];
    warning?: string;
  }> {
    await this.ensureBaseLayout();
    const repo = await this.readJson<RepoFile>(this.repoJsonPath(input.repo_id));
    const state = input.state ?? "open";
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    if (this.githubToken()) {
      const items = await this.listGitHubIssues(repo.repo_full_name, state, limit);
      await this.withRepoLock(input.repo_id, async () => {
        await this.writeJsonAtomic(this.issuesLightCachePath(input.repo_id), {
          updated_at: nowIso(),
          source: "github",
          items,
        } satisfies IssuesLightCache);
      });

      return { source: "github", items };
    }

    const cached = await this.tryReadJson<IssuesLightCache>(this.issuesLightCachePath(input.repo_id));
    if (cached) {
      return {
        source: "cache",
        items: cached.items.slice(0, limit),
        warning: "GITHUB_TOKEN is not configured. Returned cached issues.",
      };
    }

    throw new Error("GITHUB_TOKEN is not configured and no cached issues exist.");
  }

  public async createWorkItem(input: CreateWorkItemInput): Promise<StateIssueLite> {
    await this.ensureBaseLayout();
    const actor = input.actor ?? "mcp";

    return this.withRepoLock(input.repo_id, async () => {
      const repo = await this.readJson<RepoFile>(this.repoJsonPath(input.repo_id));
      const issue = await this.createGitHubIssue(repo.repo_full_name, {
        title: input.title,
        body: input.body,
        labels: input.labels ?? [],
        assignee: input.assignee,
      });

      const item: StateIssueLite = {
        provider: "github",
        number: issue.number,
        title: issue.title,
        state: issue.state,
        assignee: issue.assignee,
        labels: issue.labels,
        url: issue.url,
      };

      const cache = (await this.tryReadJson<IssuesLightCache>(this.issuesLightCachePath(input.repo_id))) ?? {
        updated_at: nowIso(),
        source: "github",
        items: [],
      };
      const deduped = [item, ...cache.items.filter((existing) => existing.number !== item.number)].slice(0, 100);
      await this.writeJsonAtomic(this.issuesLightCachePath(input.repo_id), {
        updated_at: nowIso(),
        source: "github",
        items: deduped,
      } satisfies IssuesLightCache);

      await this.appendAuditEvent("github.issue.created", {
        actor,
        repo_id: input.repo_id,
        issue_number: issue.number,
      });

      return item;
    });
  }

  public async summarizeIncident(input: SummarizeIncidentInput): Promise<{
    incident: IncidentFile;
    summary_md: string;
  }> {
    await this.ensureBaseLayout();
    const incident = input.incident_id
      ? await this.readJson<IncidentFile>(this.incidentJsonPath(input.repo_id, input.incident_id))
      : await this.readLatestIncident(input.repo_id);

    if (!incident) {
      throw new Error(`No incidents found for repo ${input.repo_id}`);
    }

    return {
      incident,
      summary_md:
        incident.summary_md && incident.summary_md.trim().length > 0
          ? incident.summary_md
          : this.formatIncidentMarkdown(incident),
    };
  }

  public resolveDbPath(...parts: string[]): string {
    return path.join(this.rootDir, ...parts);
  }

  private async readLatestIncident(repoId: string): Promise<IncidentFile | null> {
    const incidentDir = path.join(this.repoDir(repoId), "incidents");
    if (!(await this.exists(incidentDir))) {
      return null;
    }

    const files = (await readdir(incidentDir)).filter((fileName) => fileName.endsWith(".json"));
    if (files.length === 0) {
      return null;
    }

    const incidents = await Promise.all(
      files.map(async (fileName) => this.readJson<IncidentFile>(path.join(incidentDir, fileName)))
    );
    incidents.sort((a, b) => {
      const left = new Date(a.started_at).getTime();
      const right = new Date(b.started_at).getTime();
      return right - left;
    });

    return incidents[0] ?? null;
  }

  private async updateIncidentStatus(
    repoId: string,
    incidentId: string,
    status: IncidentStatus,
    actor: string
  ): Promise<IncidentFile> {
    return this.withRepoLock(repoId, async () => {
      const filePath = this.incidentJsonPath(repoId, incidentId);
      const incident = await this.readJson<IncidentFile>(filePath);
      const nextIncident: IncidentFile = {
        ...incident,
        status,
      };
      await this.writeJsonAtomic(filePath, nextIncident);

      if (status === "open") {
        await this.upsertOpenIncidentsIndex(nextIncident);
      } else {
        await this.removeOpenIncidentIndex(repoId, incidentId);
      }

      await this.appendAuditEvent("incident.status.updated", {
        actor,
        repo_id: repoId,
        incident_id: incidentId,
        status,
      });

      return nextIncident;
    });
  }

  private inferEntrypoints(repoTreePaths: string[], fallback: string[]): string[] {
    if (repoTreePaths.length === 0) {
      return fallback;
    }

    const candidates = [
      "src/index.ts",
      "src/main.ts",
      "index.ts",
      "server.ts",
      "api/src/index.ts",
      "api/src/routes",
    ];
    const found = candidates.filter((candidate) =>
      repoTreePaths.some((pathItem) => pathItem === candidate || pathItem.startsWith(`${candidate}/`))
    );
    return found.length > 0 ? found : fallback;
  }

  private defaultIncidentSummary(signalType: string): string {
    return `## Symptom\nSignal detected: \`${signalType}\`.\n\n## Next steps\n1) Validate recent deploy/logs.\n2) Triage owner and mitigation.\n`;
  }

  private formatIncidentMarkdown(incident: IncidentFile): string {
    const evidence = incident.evidence
      .map((item) => `- ${item.kind}: ${item.link}`)
      .join("\n");
    const hypotheses = incident.hypotheses
      .sort((a, b) => a.rank - b.rank)
      .map((item) => `${item.rank}. ${item.text}`)
      .join("\n");

    return [
      `# Incident ${incident.incident_id}`,
      "",
      `- Severity: \`${incident.severity}\``,
      `- Status: \`${incident.status}\``,
      `- Signal: \`${incident.signal_type}\``,
      "",
      "## Evidence",
      evidence || "- None recorded",
      "",
      "## Hypotheses",
      hypotheses || "1. No hypotheses recorded",
    ].join("\n");
  }

  private assertExpectedRev(currentRev: number, expectedRev: number | undefined, label: string): void {
    if (expectedRev === undefined) {
      return;
    }
    if (currentRev !== expectedRev) {
      throw new Error(`Optimistic concurrency check failed for ${label}. Expected rev=${expectedRev}, actual rev=${currentRev}.`);
    }
  }

  private async upsertRepoAllIndex(repoId: string, repoFullName: string): Promise<void> {
    await this.updateIndex<ReposAllIndex>("repos_all", (current) => {
      const repos = Array.isArray(current.repos) ? [...current.repos] : [];
      const idx = repos.findIndex((item) => item.repo_id === repoId);
      if (idx >= 0) {
        repos[idx] = { repo_id: repoId, repo_full_name: repoFullName };
      } else {
        repos.push({ repo_id: repoId, repo_full_name: repoFullName });
      }
      repos.sort((a, b) => a.repo_id.localeCompare(b.repo_id));
      return {
        updated_at: nowIso(),
        repos,
      };
    });
  }

  private async upsertReposByHealthIndex(
    repoId: string,
    health: StateFile["health"]
  ): Promise<void> {
    await this.updateIndex<ReposByHealthIndex>("repos_by_health", (current) => {
      const unhealthy = Array.isArray(current.unhealthy) ? [...current.unhealthy] : [];
      const filtered = unhealthy.filter((item) => item.repo_id !== repoId);
      if (isUnhealthy(health.status)) {
        filtered.push({
          repo_id: repoId,
          health: health.status,
          warnings_count: health.warnings_count,
        });
      }
      filtered.sort((a, b) => a.repo_id.localeCompare(b.repo_id));
      return {
        updated_at: nowIso(),
        unhealthy: filtered,
      };
    });
  }

  private async upsertOpenIncidentsIndex(incident: IncidentFile): Promise<void> {
    await this.updateIndex<OpenIncidentsIndex>("open_incidents", (current) => {
      const items = Array.isArray(current.items) ? [...current.items] : [];
      const filtered = items.filter(
        (item) => !(item.repo_id === incident.repo_id && item.incident_id === incident.incident_id)
      );
      filtered.push({
        repo_id: incident.repo_id,
        incident_id: incident.incident_id,
        severity: incident.severity,
        started_at: incident.started_at,
      });
      filtered.sort((a, b) => b.started_at.localeCompare(a.started_at));
      return {
        updated_at: nowIso(),
        items: filtered,
      };
    });
  }

  private async removeOpenIncidentIndex(repoId: string, incidentId: string): Promise<void> {
    await this.updateIndex<OpenIncidentsIndex>("open_incidents", (current) => {
      const items = Array.isArray(current.items) ? current.items : [];
      return {
        updated_at: nowIso(),
        items: items.filter((item) => !(item.repo_id === repoId && item.incident_id === incidentId)),
      };
    });
  }

  private async createGitHubIssue(
    repoFullName: string,
    input: {
      title: string;
      body?: string;
      labels?: string[];
      assignee?: string;
    }
  ): Promise<{
    number: number;
    title: string;
    state: string;
    assignee: string | null;
    labels: string[];
    url: string;
  }> {
    const payload: Record<string, unknown> = {
      title: input.title,
      body: input.body ?? "",
    };

    if (input.labels && input.labels.length > 0) {
      payload.labels = input.labels;
    }
    if (input.assignee) {
      payload.assignees = [input.assignee];
    }

    const response = await this.githubRequest<GitHubIssueApi>(
      `/repos/${repoFullName}/issues`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    return {
      number: response.number,
      title: response.title,
      state: response.state,
      assignee: response.assignee?.login ?? null,
      labels: response.labels.map((label) => label.name).filter(Boolean),
      url: response.html_url,
    };
  }

  private async listGitHubIssues(
    repoFullName: string,
    state: "open" | "closed" | "all",
    limit: number
  ): Promise<StateIssueLite[]> {
    const params = new URLSearchParams({
      state,
      per_page: String(limit),
    });
    const response = await this.githubRequest<GitHubIssueApi[]>(
      `/repos/${repoFullName}/issues?${params.toString()}`,
      { method: "GET" }
    );

    return response
      .filter((item) => !item.pull_request)
      .map((item) => ({
        provider: "github",
        number: item.number,
        title: item.title,
        state: item.state,
        assignee: item.assignee?.login ?? null,
        labels: item.labels.map((label) => label.name).filter(Boolean),
        url: item.html_url,
      }));
  }

  private githubToken(): string | null {
    return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
  }

  private async githubRequest<T>(endpoint: string, init: RequestInit): Promise<T> {
    const token = this.githubToken();
    if (!token) {
      throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required for GitHub issue operations.");
    }

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "unlinear-mcp",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status} ${response.statusText}: ${body}`);
    }

    return (await response.json()) as T;
  }

  private async appendAuditEvent(action: string, payload: Record<string, unknown>): Promise<void> {
    const ts = nowIso();
    await this.appendJsonl(this.auditLogPath(ts), {
      ts,
      action,
      ...payload,
    });
  }

  private async acquireLock(lockPath: string): Promise<FileHandle> {
    const start = Date.now();
    let lastError: unknown = null;

    while (Date.now() - start < LOCK_WAIT_TIMEOUT_MS) {
      try {
        const handle = await open(lockPath, "wx");
        await handle.writeFile(`${process.pid} ${nowIso()}\n`, "utf8");
        await handle.sync();
        return handle;
      } catch (err) {
        lastError = err;
        if (!this.isAlreadyExistsError(err)) {
          throw err;
        }

        const stale = await this.isStaleLock(lockPath);
        if (stale) {
          await rm(lockPath, { force: true }).catch(() => undefined);
          continue;
        }
        await sleep(LOCK_POLL_INTERVAL_MS);
      }
    }

    throw new Error(`Timed out waiting for lock ${lockPath}. Last error: ${String(lastError)}`);
  }

  private async isStaleLock(lockPath: string): Promise<boolean> {
    try {
      const fileStats = await stat(lockPath);
      return Date.now() - fileStats.mtimeMs > LOCK_STALE_MS;
    } catch {
      return false;
    }
  }

  private async fsyncDir(dirPath: string): Promise<void> {
    try {
      const dirHandle = await open(dirPath, constants.O_RDONLY);
      await dirHandle.sync();
      await dirHandle.close();
    } catch {
      // fsync on directories is best-effort across platforms.
    }
  }

  private isAlreadyExistsError(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && err.code === "EEXIST";
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async tryReadJson<T>(filePath: string): Promise<T | null> {
    try {
      return await this.readJson<T>(filePath);
    } catch (err) {
      if (this.isNoEntryError(err)) {
        return null;
      }
      throw err;
    }
  }

  private isNoEntryError(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
  }

  private metaPath(): string {
    return path.join(this.rootDir, "meta.json");
  }

  private indexesDir(): string {
    return path.join(this.rootDir, "indexes");
  }

  private reposDir(): string {
    return path.join(this.rootDir, "repos");
  }

  private auditDir(): string {
    return path.join(this.rootDir, "audit");
  }

  private locksDir(): string {
    return path.join(this.rootDir, "locks");
  }

  private indexPath(name: string): string {
    return path.join(this.indexesDir(), `${name}.json`);
  }

  private repoDir(repoId: string): string {
    return path.join(this.reposDir(), repoId);
  }

  private repoJsonPath(repoId: string): string {
    return path.join(this.repoDir(repoId), "repo.json");
  }

  private stateJsonPath(repoId: string): string {
    return path.join(this.repoDir(repoId), "state.json");
  }

  private policyJsonPath(repoId: string): string {
    return path.join(this.repoDir(repoId), "policy.json");
  }

  private linksJsonPath(repoId: string): string {
    return path.join(this.repoDir(repoId), "links.json");
  }

  private issuesLightCachePath(repoId: string): string {
    return path.join(this.repoDir(repoId), "cache", "issues_light.json");
  }

  private repoTreeLightCachePath(repoId: string): string {
    return path.join(this.repoDir(repoId), "cache", "repo_tree_light.json");
  }

  private incidentJsonPath(repoId: string, incidentId: string): string {
    return path.join(this.repoDir(repoId), "incidents", `${incidentId}.json`);
  }

  private auditLogPath(ts: string): string {
    const month = ts.slice(0, 7);
    return path.join(this.auditDir(), `audit_${month}.jsonl`);
  }

  private lockPath(repoId: string): string {
    return path.join(this.locksDir(), `${repoId}.lock`);
  }
}
