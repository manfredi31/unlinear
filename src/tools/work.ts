// ---------------------------------------------------------------------------
// Work queue tools — my items + agent claim
// ---------------------------------------------------------------------------

import { MCPServer, object, text, error } from "mcp-use/server";
import { z } from "zod";
import {
    readJSON,
    writeJSON,
    listFiles,
    WORKSPACE_ROOT,
    projectDir,
    issuesDir,
} from "../storage/fsStore.js";
import type { ProjectRegistry, IssueMeta, Board } from "../types.js";
import { join } from "path";

export function registerWorkTools(server: MCPServer) {
    // work-my-items
    server.tool(
        {
            name: "work-my-items",
            description: "Get all issues assigned to a user or agent across all projects.",
            schema: z.object({
                userId: z.string().describe("User/agent ID (e.g. 'person:mario' or 'agent:bot-1')"),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ userId }) => {
            try {
                const registry = await readJSON<ProjectRegistry>(
                    join(WORKSPACE_ROOT, "projects.json")
                );

                const items: Array<IssueMeta & { projectId: string }> = [];

                for (const project of registry.projects) {
                    const dir = issuesDir(project.id);
                    const files = await listFiles(dir);
                    const jsonFiles = files.filter((f) => f.endsWith(".json"));

                    for (const file of jsonFiles) {
                        try {
                            const issue = await readJSON<IssueMeta>(join(dir, file));
                            if (issue.assignee === userId) {
                                items.push({ ...issue, projectId: project.id });
                            }
                        } catch { /* skip */ }
                    }
                }

                const statusOrder = { doing: 0, todo: 1, done: 2 };
                items.sort((a, b) => {
                    const s = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
                    if (s !== 0) return s;
                    return a.priority.localeCompare(b.priority);
                });

                return object({ userId, count: items.length, items });
            } catch (err) {
                return error(`Failed to get work items: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

    // agent-claim-next
    server.tool(
        {
            name: "agent-claim-next",
            description: "Claim the next unassigned 'todo' issue for an agent. Assigns and moves to 'doing'.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                agentId: z.string().describe("Agent identifier (e.g. 'agent:builder-1')"),
                priority_filter: z.enum(["P0", "P1", "P2", "P3"]).optional().describe("Only claim at this priority or higher"),
            }),
        },
        async ({ projectId, agentId, priority_filter }) => {
            try {
                const boardPath = join(projectDir(projectId), "board.json");
                const board = await readJSON<Board>(boardPath);

                for (const issueId of board.columns.todo) {
                    const issuePath = join(issuesDir(projectId), `${issueId}.json`);
                    try {
                        const issue = await readJSON<IssueMeta>(issuePath);
                        if (issue.assignee) continue;
                        if (priority_filter && issue.priority > priority_filter) continue;

                        issue.assignee = agentId;
                        issue.status = "doing";
                        issue.updated_at = new Date().toISOString();
                        await writeJSON(issuePath, issue);

                        const idx = board.columns.todo.indexOf(issueId);
                        if (idx !== -1) board.columns.todo.splice(idx, 1);
                        board.columns.doing.push(issueId);
                        await writeJSON(boardPath, board);

                        return object({
                            claimed: true,
                            issueId: issue.id,
                            title: issue.title,
                            priority: issue.priority,
                            assignee: agentId,
                        });
                    } catch { continue; }
                }

                return object({ claimed: false, message: "No unassigned todo issues available" });
            } catch (err) {
                return error(`Failed to claim issue: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );
}
