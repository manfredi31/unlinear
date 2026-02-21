// ---------------------------------------------------------------------------
// Board tools — kanban CRUD
// ---------------------------------------------------------------------------

import { MCPServer, object, text, error, widget } from "mcp-use/server";
import { z } from "zod";
import {
    readJSON,
    writeJSON,
    projectDir,
    issuesDir,
    ensureDir,
} from "../storage/fsStore.js";
import type { Board, IssueMeta, ProjectMeta } from "../types.js";
import { join } from "path";

export function registerBoardTools(server: MCPServer) {
    // project-board-get
    server.tool(
        {
            name: "project-board-get",
            description:
                "Get kanban board for a project: columns (todo/doing/done) with expanded issue headers",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
            }),
            annotations: { readOnlyHint: true },
            widget: {
                name: "project-board",
                invoking: "Loading board...",
                invoked: "Board loaded",
            },
        },
        async ({ projectId }) => {
            try {
                const board = await readJSON<Board>(
                    join(projectDir(projectId), "board.json")
                );

                const expandColumn = async (ids: string[]) => {
                    const issues: IssueMeta[] = [];
                    for (const id of ids) {
                        try {
                            const issue = await readJSON<IssueMeta>(
                                join(issuesDir(projectId), `${id}.json`)
                            );
                            issues.push(issue);
                        } catch {
                            issues.push({
                                id,
                                title: `[missing: ${id}]`,
                                status: "todo",
                                assignee: null,
                                priority: "P3",
                                updated_at: "",
                                plan: [],
                                links: {},
                            });
                        }
                    }
                    return issues;
                };

                const [todo, doing, done] = await Promise.all([
                    expandColumn(board.columns.todo),
                    expandColumn(board.columns.doing),
                    expandColumn(board.columns.done),
                ]);

                const total = todo.length + doing.length + done.length;
                return widget({
                    props: { projectId, columns: { todo, doing, done }, total },
                    output: text(`Board for ${projectId}: ${total} issues`),
                });
            } catch (err) {
                return error(
                    `Failed to get board: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

    // project-board-move
    server.tool(
        {
            name: "project-board-move",
            description: "Move an issue between kanban columns.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID (e.g. 'ISS-1')"),
                from: z.enum(["todo", "doing", "done"]).describe("Source column"),
                to: z.enum(["todo", "doing", "done"]).describe("Target column"),
            }),
        },
        async ({ projectId, issueId, from, to }) => {
            try {
                const boardPath = join(projectDir(projectId), "board.json");
                const board = await readJSON<Board>(boardPath);

                const idx = board.columns[from].indexOf(issueId);
                if (idx === -1) {
                    return error(`Issue ${issueId} not found in column '${from}'`);
                }
                board.columns[from].splice(idx, 1);
                board.columns[to].push(issueId);
                await writeJSON(boardPath, board);

                const issuePath = join(issuesDir(projectId), `${issueId}.json`);
                try {
                    const issue = await readJSON<IssueMeta>(issuePath);
                    issue.status = to;
                    issue.updated_at = new Date().toISOString();
                    await writeJSON(issuePath, issue);
                } catch { /* issue file might not exist */ }

                return text(`Moved ${issueId} from '${from}' to '${to}'`);
            } catch (err) {
                return error(
                    `Failed to move issue: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

    // issue-create
    server.tool(
        {
            name: "issue-create",
            description: "Create a new issue. Generates an ID, creates JSON + MD, adds to 'todo'.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                title: z.string().describe("Issue title"),
                description_md: z.string().optional().describe("Markdown description"),
                priority: z.enum(["P0", "P1", "P2", "P3"]).optional().describe("Priority (default: P2)"),
            }),
        },
        async ({ projectId, title, description_md, priority }) => {
            try {
                const metaPath = join(projectDir(projectId), "project.json");
                const meta = await readJSON<ProjectMeta>(metaPath);
                const num = meta.next_issue_num;
                const issueId = `ISS-${num}`;
                meta.next_issue_num = num + 1;
                await writeJSON(metaPath, meta);

                const issueMeta: IssueMeta = {
                    id: issueId,
                    title,
                    status: "todo",
                    assignee: null,
                    priority: priority ?? "P2",
                    updated_at: new Date().toISOString(),
                    plan: [],
                    links: {},
                };

                const dir = issuesDir(projectId);
                await ensureDir(dir);
                await writeJSON(join(dir, `${issueId}.json`), issueMeta);

                const md =
                    `# ${issueId}: ${title}\n\n` +
                    (description_md ? `${description_md}\n` : "## Context\n\n_No description yet._\n");
                const { appendMarkdown } = await import("../storage/fsStore.js");
                await appendMarkdown(join(dir, `${issueId}.md`), md);

                const boardPath = join(projectDir(projectId), "board.json");
                const board = await readJSON<Board>(boardPath);
                board.columns.todo.push(issueId);
                await writeJSON(boardPath, board);

                return object({ issueId, title, status: "todo", priority: priority ?? "P2" });
            } catch (err) {
                return error(
                    `Failed to create issue: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );
}
