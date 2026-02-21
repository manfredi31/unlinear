import { MCPServer, error, markdown, object } from "mcp-use/server";
import { z } from "zod";
import {
  registerRepo,
  refreshRepoDevMetadata,
  updateOperationalState,
  createIncident,
  handleRecovery,
  listProjects,
  getProjectOverview,
  summarizeIncident,
} from "./src/db.js";
import { registerProjectsTools } from "./src/tools/projects.js";
import { registerBoardTools } from "./src/tools/board.js";
import { registerIssueTools } from "./src/tools/issues.js";
import { registerWorkTools } from "./src/tools/work.js";

function messageFromError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

const server = new MCPServer({
  name: "unlinear",
  title: "unlinear",
  version: "1.0.0",
  description: "Project management and repo operations backed by PostgreSQL",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

server.tool(
  {
    name: "register-repo",
    description: "Register a GitHub repository and create initial state + links entries",
    schema: z.object({
      repo_full_name: z
        .string()
        .describe("GitHub repository full name in owner/name format, for example acme/payments-api"),
      primary_owner: z
        .string()
        .optional()
        .describe("Primary human owner username for routing and incident assignment"),
      service_tier: z
        .enum(["prod", "staging", "dev"])
        .optional()
        .describe("Service tier used for triage priority"),
      notes_md: z
        .string()
        .optional()
        .describe("Optional short markdown notes"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
  },
  async ({ repo_full_name, primary_owner, service_tier, notes_md }) => {
    try {
      const result = await registerRepo({
        repo_full_name,
        primary_owner,
        service_tier,
        notes_md,
      });
      return object(asRecord(result));
    } catch (err) {
      return error(`Failed to register repo: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "refresh-repo-dev-metadata",
    description: "Refresh dev metadata fields for a repo with optimistic concurrency support",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier, e.g. acme__payments-api"),
      expected_rev: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Expected rev for optimistic concurrency. If omitted, no rev check is enforced."),
      primary_language: z.string().optional().describe("Primary programming language"),
      stack: z.array(z.string()).optional().describe("Technology stack list"),
      package_manager: z.string().optional().describe("Package manager, such as pnpm or npm"),
      entrypoints: z
        .array(z.string())
        .optional()
        .describe("Entrypoint paths for the repository"),
      install_command: z.string().optional().describe("Command used to install dependencies"),
      dev_command: z.string().optional().describe("Command used for local development"),
      test_command: z.string().optional().describe("Command used to run tests"),
      build_command: z.string().optional().describe("Command used to run builds"),
      has_env_example: z.boolean().optional().describe("Whether the repository has a committed env example file"),
      env_example_path: z.string().optional().describe("Path to env example file"),
      notes_md: z.string().optional().describe("Optional markdown notes patch"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
  },
  async ({
    repo_id,
    expected_rev,
    primary_language,
    stack,
    package_manager,
    entrypoints,
    install_command,
    dev_command,
    test_command,
    build_command,
    has_env_example,
    env_example_path,
    notes_md,
  }) => {
    try {
      const runCommandsPatch: Record<string, string> = {};
      if (install_command !== undefined) runCommandsPatch.install = install_command;
      if (dev_command !== undefined) runCommandsPatch.dev = dev_command;
      if (test_command !== undefined) runCommandsPatch.test = test_command;
      if (build_command !== undefined) runCommandsPatch.build = build_command;

      const envPatch: Record<string, unknown> = {};
      if (has_env_example !== undefined) envPatch.has_env_example = has_env_example;
      if (env_example_path !== undefined) envPatch.env_example_path = env_example_path;

      const devPatch: Record<string, unknown> = {};
      if (primary_language !== undefined) devPatch.primary_language = primary_language;
      if (stack !== undefined) devPatch.stack = stack;
      if (package_manager !== undefined) devPatch.package_manager = package_manager;
      if (entrypoints !== undefined) devPatch.entrypoints = entrypoints;
      if (Object.keys(runCommandsPatch).length > 0) devPatch.run_commands = runCommandsPatch;
      if (Object.keys(envPatch).length > 0) devPatch.env = envPatch;

      const repo = await refreshRepoDevMetadata({
        repo_id,
        expected_rev,
        notes_md,
        dev_patch: devPatch,
      });
      return object(asRecord(repo));
    } catch (err) {
      return error(`Failed to refresh repo metadata: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "update-operational-state",
    description: "Overwrite operational state snapshot for a repo",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier, e.g. acme__payments-api"),
      expected_rev: z.number().int().positive().optional().describe("Expected rev for optimistic concurrency"),
      health_status: z.enum(["healthy", "degraded", "down", "unknown"]).optional().describe("Current health status"),
      warnings_count: z.number().int().min(0).optional().describe("Number of warnings"),
      deploy_provider: z.string().optional().describe("Deployment provider name"),
      deploy_branch: z.string().optional().describe("Deployment branch"),
      deploy_status: z.enum(["succeeded", "failed", "running", "queued", "unknown"]).optional().describe("Deployment status"),
      deploy_id: z.string().optional().describe("Provider deploy identifier"),
      deploy_link: z.string().optional().describe("Deployment URL"),
      signals: z
        .array(
          z.object({
            signal_id: z.string(),
            type: z.string(),
            severity: z.enum(["p0", "p1", "p2", "p3"]),
            summary: z.string(),
            link: z.string().optional(),
          })
        )
        .optional()
        .describe("Operational signals"),
      open_issues_count: z.number().int().min(0).optional().describe("Total open issue count"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
  },
  async ({
    repo_id,
    expected_rev,
    health_status,
    warnings_count,
    deploy_provider,
    deploy_branch,
    deploy_status,
    deploy_id,
    deploy_link,
    signals,
    open_issues_count,
  }) => {
    try {
      const deploy: Record<string, unknown> | undefined =
        deploy_provider !== undefined ||
        deploy_branch !== undefined ||
        deploy_status !== undefined ||
        deploy_id !== undefined ||
        deploy_link !== undefined
          ? {
              ...(deploy_provider !== undefined ? { provider: deploy_provider } : {}),
              ...(deploy_branch !== undefined ? { branch: deploy_branch } : {}),
              ...(deploy_status !== undefined ? { status: deploy_status } : {}),
              ...(deploy_id !== undefined ? { last_deploy_id: deploy_id } : {}),
              ...(deploy_link !== undefined ? { link: deploy_link } : {}),
            }
          : undefined;

      const nextState = await updateOperationalState({
        repo_id,
        expected_rev,
        health:
          health_status !== undefined || warnings_count !== undefined
            ? {
                ...(health_status !== undefined ? { status: health_status } : {}),
                ...(warnings_count !== undefined ? { warnings_count } : {}),
              }
            : undefined,
        deploy,
        signals,
        work: open_issues_count !== undefined ? { open_issues_count } : undefined,
      });
      return object(asRecord(nextState));
    } catch (err) {
      return error(`Failed to update operational state: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "create-incident",
    description: "Create an incident record and optionally create a GitHub issue",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier"),
      incident_id: z.string().optional().describe("Optional incident ID override"),
      started_at: z.string().optional().describe("Incident start timestamp in ISO 8601 format"),
      severity: z.enum(["p0", "p1", "p2", "p3"]).describe("Incident severity"),
      signal_type: z.string().describe("Signal type, for example deploy_failed"),
      summary_md: z.string().optional().describe("Markdown summary"),
      evidence: z
        .array(z.object({ kind: z.string(), link: z.string() }))
        .optional()
        .describe("Evidence links"),
      hypotheses: z
        .array(z.object({ rank: z.number().int().positive(), text: z.string() }))
        .optional()
        .describe("Hypotheses list"),
      create_github_issue: z.boolean().optional().describe("If true, also create a GitHub issue"),
      issue_title: z.string().optional().describe("Title for GitHub issue"),
      issue_body: z.string().optional().describe("Body for GitHub issue"),
      labels: z.array(z.string()).optional().describe("Issue labels"),
      assignee: z.string().nullable().optional().describe("GitHub assignee username"),
      status: z.enum(["open", "monitoring", "resolved"]).optional().describe("Initial incident status"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: true,
    },
  },
  async ({
    repo_id,
    incident_id,
    started_at,
    severity,
    signal_type,
    summary_md,
    evidence,
    hypotheses,
    create_github_issue,
    issue_title,
    issue_body,
    labels,
    assignee,
    status,
  }) => {
    try {
      const incident = await createIncident({
        repo_id,
        incident_id,
        started_at,
        severity,
        signal_type,
        summary_md,
        evidence,
        hypotheses,
        create_github_issue: create_github_issue ?? false,
        issue_title,
        issue_body,
        labels,
        assignee,
        status,
      });
      return object(asRecord(incident));
    } catch (err) {
      return error(`Failed to create incident: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "handle-recovery",
    description: "Apply recovery state updates and optionally resolve a linked incident",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier"),
      expected_state_rev: z.number().int().positive().optional().describe("Expected state rev"),
      health_status: z.enum(["healthy", "degraded", "down", "unknown"]).optional(),
      warnings_count: z.number().int().min(0).optional(),
      deploy_provider: z.string().optional(),
      deploy_branch: z.string().optional(),
      deploy_status: z.enum(["succeeded", "failed", "running", "queued", "unknown"]).optional(),
      deploy_id: z.string().optional(),
      deploy_link: z.string().optional(),
      clear_signals: z.boolean().optional().describe("If true, clear all signals"),
      incident_id: z.string().optional().describe("Incident ID to resolve"),
      update_incident_status: z.boolean().optional().describe("If true, set incident to resolved"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
  },
  async ({
    repo_id,
    expected_state_rev,
    health_status,
    warnings_count,
    deploy_provider,
    deploy_branch,
    deploy_status,
    deploy_id,
    deploy_link,
    clear_signals,
    incident_id,
    update_incident_status,
  }) => {
    try {
      const deploy: Record<string, unknown> | undefined =
        deploy_provider !== undefined ||
        deploy_branch !== undefined ||
        deploy_status !== undefined ||
        deploy_id !== undefined ||
        deploy_link !== undefined
          ? {
              ...(deploy_provider !== undefined ? { provider: deploy_provider } : {}),
              ...(deploy_branch !== undefined ? { branch: deploy_branch } : {}),
              ...(deploy_status !== undefined ? { status: deploy_status } : {}),
              ...(deploy_id !== undefined ? { last_deploy_id: deploy_id } : {}),
              ...(deploy_link !== undefined ? { link: deploy_link } : {}),
            }
          : undefined;

      const result = await handleRecovery({
        repo_id,
        expected_state_rev,
        incident_id,
        update_incident_status,
        state_patch: {
          health:
            health_status !== undefined || warnings_count !== undefined
              ? {
                  ...(health_status !== undefined ? { status: health_status } : {}),
                  ...(warnings_count !== undefined ? { warnings_count } : {}),
                }
              : undefined,
          deploy,
          ...(clear_signals ? { signals: [] } : {}),
        },
      });
      return object(asRecord(result));
    } catch (err) {
      return error(`Failed to handle recovery: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "list-projects",
    description: "List registered repos with optional unhealthy-only filtering",
    schema: z.object({
      unhealthy_only: z.boolean().optional().describe("If true, return only unhealthy repos"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  async ({ unhealthy_only }) => {
    try {
      const indexes = await listProjects();
      if (!unhealthy_only) {
        return object(asRecord(indexes));
      }

      const unhealthyRepoIds = new Set(indexes.repos_by_health.unhealthy.map((item) => item.repo_id));
      return object(asRecord({
        repos_all: {
          updated_at: indexes.repos_all.updated_at,
          repos: indexes.repos_all.repos.filter((repo) => unhealthyRepoIds.has(repo.repo_id)),
        },
        repos_by_health: indexes.repos_by_health,
      }));
    } catch (err) {
      return error(`Failed to list projects: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "get-project-overview",
    description: "Read repo, state, links, signals, and latest incident for a project",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier, e.g. acme__payments-api"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  async ({ repo_id }) => {
    try {
      const overview = await getProjectOverview(repo_id);
      return object(asRecord(overview));
    } catch (err) {
      return error(`Failed to get project overview: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "summarize-incident",
    description: "Return incident summary markdown from stored incident data",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier"),
      incident_id: z.string().optional().describe("Incident ID. If omitted, latest incident is used"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  async ({ repo_id, incident_id }) => {
    try {
      const result = await summarizeIncident({ repo_id, incident_id });
      return markdown(result.summary_md);
    } catch (err) {
      return error(`Failed to summarize incident: ${messageFromError(err)}`);
    }
  }
);

registerProjectsTools(server);
registerBoardTools(server);
registerIssueTools(server);
registerWorkTools(server);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
server.listen(PORT);
