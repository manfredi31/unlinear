import { MCPServer, error, object } from "mcp-use/server";
import { z } from "zod";
import {
  listProjects,
  getProjectOverview,
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

registerProjectsTools(server);
registerBoardTools(server);
registerIssueTools(server);
registerWorkTools(server);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
server.listen(PORT);
