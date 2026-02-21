import path from "node:path";
import { MCPServer, error, markdown, object } from "mcp-use/server";
import { z } from "zod";
import { JsonFsDb } from "./src/db";
import { registerProjectsTools } from "./src/tools/projects.js";
import { registerBoardTools } from "./src/tools/board.js";
import { registerIssueTools } from "./src/tools/issues.js";
import { registerWorkTools } from "./src/tools/work.js";

const dbRoot = process.env.UNLINEAR_DB_DIR || path.join(process.cwd(), "db");
const db = new JsonFsDb(dbRoot);
await db.ensureBaseLayout();

function messageFromError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

// Create MCP server instance
const server = new MCPServer({
  name: "unlinear",
  title: "unlinear",
  version: "1.0.0",
  description: "GitHub-centric JSON filesystem database for repo operations and incidents",
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
    description: "Register a GitHub repository in the local JSON DB and create initial state/policy/index entries",
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
        .describe("Optional short markdown notes stored in repo.json notes_md"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: false,
    },
  },
  async ({ repo_full_name, primary_owner, service_tier, notes_md }) => {
    try {
      const result = await db.registerRepo({
        repo_full_name,
        primary_owner,
        service_tier,
        notes_md,
        actor: "mcp",
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
    description: "Refresh cached repo-tree and dev metadata fields in repo.json with optimistic concurrency support",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier, e.g. acme__payments-api"),
      expected_rev: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Expected repo.json rev for optimistic concurrency. If omitted, no rev check is enforced."),
      primary_language: z.string().optional().describe("Primary programming language"),
      stack: z.array(z.string().describe("Stack component value")).optional().describe("Technology stack list"),
      package_manager: z.string().optional().describe("Package manager, such as pnpm or npm"),
      entrypoints: z
        .array(z.string().describe("Entrypoint file or directory path"))
        .optional()
        .describe("Entrypoint paths for the repository"),
      install_command: z.string().optional().describe("Command used to install dependencies"),
      dev_command: z.string().optional().describe("Command used for local development"),
      test_command: z.string().optional().describe("Command used to run tests"),
      build_command: z.string().optional().describe("Command used to run builds"),
      has_env_example: z
        .boolean()
        .optional()
        .describe("Whether the repository has a committed env example file"),
      env_example_path: z
        .string()
        .optional()
        .describe("Path to env example file, for example .env.example"),
      repo_tree_paths: z
        .array(z.string().describe("Repository path entry from a lightweight tree scan"))
        .optional()
        .describe("Optional lightweight repo tree paths to persist in cache/repo_tree_light.json"),
      notes_md: z.string().optional().describe("Optional markdown notes patch for repo.json notes_md"),
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
    repo_tree_paths,
    notes_md,
  }) => {
    try {
      const runCommandsPatch = {
        ...(install_command !== undefined ? { install: install_command } : {}),
        ...(dev_command !== undefined ? { dev: dev_command } : {}),
        ...(test_command !== undefined ? { test: test_command } : {}),
        ...(build_command !== undefined ? { build: build_command } : {}),
      };
      const envPatch = {
        ...(has_env_example !== undefined ? { has_env_example } : {}),
        ...(env_example_path !== undefined ? { env_example_path } : {}),
      };
      const devPatch = {
        ...(primary_language !== undefined ? { primary_language } : {}),
        ...(stack !== undefined ? { stack } : {}),
        ...(package_manager !== undefined ? { package_manager } : {}),
        ...(entrypoints !== undefined ? { entrypoints } : {}),
        ...(Object.keys(runCommandsPatch).length > 0 ? { run_commands: runCommandsPatch } : {}),
        ...(Object.keys(envPatch).length > 0 ? { env: envPatch } : {}),
      };
      const repo = await db.refreshRepoDevMetadata({
        repo_id,
        expected_rev,
        notes_md,
        repo_tree_paths,
        dev_patch: devPatch,
        actor: "mcp",
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
    description: "Overwrite operational state snapshot for a repo and update health indexes",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier, e.g. acme__payments-api"),
      expected_rev: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Expected state.json rev for optimistic concurrency"),
      health_status: z
        .enum(["healthy", "degraded", "down", "unknown"])
        .optional()
        .describe("Current health status"),
      warnings_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of warnings included in the current health status"),
      deploy_provider: z.string().optional().describe("Deployment provider name, for example vercel"),
      deploy_branch: z.string().optional().describe("Deployment branch, for example main"),
      deploy_status: z
        .enum(["succeeded", "failed", "running", "queued", "unknown"])
        .optional()
        .describe("Current deployment status"),
      deploy_id: z.string().optional().describe("Provider deploy identifier"),
      deploy_link: z.string().optional().describe("Deployment URL for logs/details"),
      signals: z
        .array(
          z.object({
            signal_id: z.string().describe("Unique signal identifier"),
            type: z.string().describe("Signal type, for example deploy_failed"),
            severity: z.enum(["p0", "p1", "p2", "p3"]).describe("Signal severity"),
            summary: z.string().describe("Short signal summary"),
            link: z.string().optional().describe("Optional evidence link"),
          })
        )
        .optional()
        .describe("Operational signals to persist on state.json"),
      open_issues_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Total open issue count for state.work"),
      top_issues: z
        .array(
          z.object({
            number: z.number().int().positive().describe("GitHub issue number"),
            title: z.string().describe("Issue title"),
            state: z.string().describe("Issue state"),
            assignee: z.string().nullable().optional().describe("Assigned GitHub username or null"),
            labels: z.array(z.string().describe("Issue label")).optional().describe("Issue labels"),
            url: z.string().optional().describe("Issue URL"),
            provider: z.literal("github").optional().describe("Issue provider literal"),
          })
        )
        .optional()
        .describe("Top issue list written to state.work.top"),
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
    top_issues,
  }) => {
    try {
      const nextState = await db.updateOperationalState({
        repo_id,
        expected_rev,
        actor: "mcp",
        health:
          health_status !== undefined || warnings_count !== undefined
            ? {
              ...(health_status !== undefined ? { status: health_status } : {}),
              ...(warnings_count !== undefined ? { warnings_count } : {}),
            }
            : undefined,
        deploy:
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
            : undefined,
        signals,
        work:
          open_issues_count !== undefined || top_issues !== undefined
            ? {
              ...(open_issues_count !== undefined ? { open_issues_count } : {}),
              ...(top_issues !== undefined
                ? {
                  top: top_issues.map((issue) => ({
                    provider: issue.provider ?? "github",
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    assignee: issue.assignee ?? null,
                    labels: issue.labels ?? [],
                    url: issue.url,
                  })),
                }
                : {}),
            }
            : undefined,
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
    description:
      "Create an append-only incident record and optionally create a canonical GitHub issue",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier, e.g. acme__payments-api"),
      incident_id: z.string().optional().describe("Optional incident ID override"),
      started_at: z.string().optional().describe("Incident start timestamp in ISO 8601 format"),
      severity: z.enum(["p0", "p1", "p2", "p3"]).describe("Incident severity"),
      signal_type: z.string().describe("Signal type, for example deploy_failed"),
      summary_md: z.string().optional().describe("Markdown summary for incident file"),
      evidence: z
        .array(
          z.object({
            kind: z.string().describe("Evidence kind, for example deploy or logs"),
            link: z.string().describe("Evidence URL"),
          })
        )
        .optional()
        .describe("Evidence links attached to the incident"),
      hypotheses: z
        .array(
          z.object({
            rank: z.number().int().positive().describe("Hypothesis ordering rank"),
            text: z.string().describe("Hypothesis text"),
          })
        )
        .optional()
        .describe("Hypotheses list for incident triage"),
      create_github_issue: z
        .boolean()
        .optional()
        .describe("If true, also create a GitHub issue and link it as the canonical work item"),
      issue_title: z.string().optional().describe("Title used when creating GitHub issue"),
      issue_body: z.string().optional().describe("Body used when creating GitHub issue"),
      labels: z.array(z.string().describe("GitHub label value")).optional().describe("Issue labels"),
      assignee: z
        .string()
        .nullable()
        .optional()
        .describe("GitHub assignee username, or null to leave unassigned"),
      status: z
        .enum(["open", "monitoring", "resolved"])
        .optional()
        .describe("Initial incident status"),
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
      const incident = await db.createIncident({
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
        actor: "mcp",
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
      expected_state_rev: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Expected state.json rev for optimistic concurrency"),
      health_status: z
        .enum(["healthy", "degraded", "down", "unknown"])
        .optional()
        .describe("Updated health status after recovery"),
      warnings_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Updated warning count after recovery"),
      deploy_provider: z.string().optional().describe("Deployment provider"),
      deploy_branch: z.string().optional().describe("Deployment branch"),
      deploy_status: z
        .enum(["succeeded", "failed", "running", "queued", "unknown"])
        .optional()
        .describe("Deployment status after recovery"),
      deploy_id: z.string().optional().describe("Deployment ID after recovery"),
      deploy_link: z.string().optional().describe("Deployment link after recovery"),
      clear_signals: z
        .boolean()
        .optional()
        .describe("If true, clear state.signals to an empty array"),
      incident_id: z
        .string()
        .optional()
        .describe("Optional incident ID for adding recovery event or resolution"),
      update_incident_status: z
        .boolean()
        .optional()
        .describe("If true and incident_id is provided, set incident status to resolved"),
      recovery_note: z.string().optional().describe("Recovery note written to audit trail"),
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
    recovery_note,
  }) => {
    try {
      const result = await db.handleRecovery({
        repo_id,
        expected_state_rev,
        incident_id,
        update_incident_status,
        recovery_note,
        actor: "mcp",
        state_patch: {
          health:
            health_status !== undefined || warnings_count !== undefined
              ? {
                ...(health_status !== undefined ? { status: health_status } : {}),
                ...(warnings_count !== undefined ? { warnings_count } : {}),
              }
              : undefined,
          deploy:
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
              : undefined,
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
    description: "List projects from derived indexes with optional unhealthy-only filtering",
    schema: z.object({
      unhealthy_only: z
        .boolean()
        .optional()
        .describe("If true, return only projects currently flagged as unhealthy"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  async ({ unhealthy_only }) => {
    try {
      const indexes = await db.listProjects();
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
    description: "Read repo.json, state.json, policy.json, links.json, and latest incident for a project",
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
      const overview = await db.getProjectOverview(repo_id);
      return object(asRecord(overview));
    } catch (err) {
      return error(`Failed to get project overview: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "list-work-items",
    description:
      "List canonical work items from GitHub Issues for a repo, with cache fallback when GitHub auth is missing",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier"),
      state: z
        .enum(["open", "closed", "all"])
        .optional()
        .describe("Issue state filter for GitHub issues query"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum issue count to return"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ repo_id, state, limit }) => {
    try {
      const result = await db.listWorkItems({
        repo_id,
        state,
        limit,
      });
      return object(asRecord(result));
    } catch (err) {
      return error(`Failed to list work items: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "create-work-item",
    description: "Create a canonical GitHub issue for a repo and append audit trail",
    schema: z.object({
      repo_id: z.string().describe("Repository identifier"),
      title: z.string().describe("Issue title"),
      body: z.string().optional().describe("Issue body markdown"),
      labels: z.array(z.string().describe("GitHub label value")).optional().describe("Issue labels"),
      assignee: z.string().optional().describe("GitHub assignee username"),
    }),
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
      openWorldHint: true,
    },
  },
  async ({ repo_id, title, body, labels, assignee }) => {
    try {
      const issue = await db.createWorkItem({
        repo_id,
        title,
        body,
        labels,
        assignee,
        actor: "mcp",
      });
      return object(asRecord(issue));
    } catch (err) {
      return error(`Failed to create work item: ${messageFromError(err)}`);
    }
  }
);

server.tool(
  {
    name: "summarize-incident",
    description: "Return incident summary markdown from stored incident JSON data",
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
      const result = await db.summarizeIncident({ repo_id, incident_id });
      return markdown(result.summary_md);
    } catch (err) {
      return error(`Failed to summarize incident: ${messageFromError(err)}`);
    }
  }
);

// Register our project management tools (widgets, kanban, work queue)
registerProjectsTools(server);
registerBoardTools(server);
registerIssueTools(server);
registerWorkTools(server);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
// Start the server
server.listen(PORT);
