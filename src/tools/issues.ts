// ---------------------------------------------------------------------------
// Issue tools — get, update plan, add note, set status, assign
// ---------------------------------------------------------------------------

import { MCPServer, object, text, markdown, error, widget } from "mcp-use/server";
import { z } from "zod";
import {
    readJSON,
    writeJSON,
    readMarkdown,
    appendMarkdown,
    issuesDir,
    projectDir,
} from "../storage/fsStore.js";
import type { IssueMeta, Board } from "../types.js";
import { join } from "path";

export function registerIssueTools(server: MCPServer) {
    // issue-get
    server.tool(
        {
            name: "issue-get",
            description: "Get full issue detail: metadata + markdown body",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID (e.g. 'ISS-3')"),
            }),
            annotations: { readOnlyHint: true },
            widget: {
                name: "issue-detail",
                invoking: "Loading issue...",
                invoked: "Issue loaded",
            },
        },
        async ({ projectId, issueId }) => {
            try {
                const dir = issuesDir(projectId);
                const meta = await readJSON<IssueMeta>(join(dir, `${issueId}.json`));
                const body = await readMarkdown(join(dir, `${issueId}.md`));

                return widget({
                    props: { meta, markdown: body },
                    output: text(`${meta.id}: ${meta.title} [${meta.status}]`),
                });
            } catch (err) {
                return error(
                    `Failed to get issue ${issueId}: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

    // issue-update-plan
    server.tool(
        {
            name: "issue-update-plan",
            description: "Update the structured plan for an issue.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID"),
                plan: z.array(z.string()).describe("Ordered plan steps"),
                acceptance: z.array(z.string()).optional().describe("Acceptance criteria"),
                risks: z.array(z.string()).optional().describe("Known risks"),
            }),
        },
        async ({ projectId, issueId, plan, acceptance, risks }) => {
            try {
                const issuePath = join(issuesDir(projectId), `${issueId}.json`);
                const issue = await readJSON<IssueMeta>(issuePath);
                issue.plan = plan;
                issue.updated_at = new Date().toISOString();
                const extended = issue as any;
                if (acceptance) extended.acceptance = acceptance;
                if (risks) extended.risks = risks;
                await writeJSON(issuePath, extended);
                return text(`Updated plan for ${issueId} (${plan.length} steps)`);
            } catch (err) {
                return error(`Failed to update plan: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

    // issue-add-note
    server.tool(
        {
            name: "issue-add-note",
            description: "Append a timestamped note to the issue's markdown. Append-only audit trail.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID"),
                note_md: z.string().describe("Note content in markdown"),
                author: z.string().describe("Author (e.g. 'mario' or 'agent:bot-1')"),
            }),
        },
        async ({ projectId, issueId, note_md, author }) => {
            try {
                const mdPath = join(issuesDir(projectId), `${issueId}.md`);
                const timestamp = new Date().toISOString().split("T")[0];
                const block = `\n---\n**[${timestamp} ${author}]** ${note_md}\n`;
                await appendMarkdown(mdPath, block);

                const jsonPath = join(issuesDir(projectId), `${issueId}.json`);
                try {
                    const issue = await readJSON<IssueMeta>(jsonPath);
                    issue.updated_at = new Date().toISOString();
                    await writeJSON(jsonPath, issue);
                } catch { /* JSON might not exist */ }

                return text(`Note added to ${issueId} by ${author}`);
            } catch (err) {
                return error(`Failed to add note: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

    // issue-set-status
    server.tool(
        {
            name: "issue-set-status",
            description: "Update issue status (todo, doing, done). Syncs board column.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID"),
                status: z.enum(["todo", "doing", "done"]).describe("New status"),
            }),
        },
        async ({ projectId, issueId, status }) => {
            try {
                const issuePath = join(issuesDir(projectId), `${issueId}.json`);
                const issue = await readJSON<IssueMeta>(issuePath);
                const oldStatus = issue.status;
                issue.status = status;
                issue.updated_at = new Date().toISOString();
                await writeJSON(issuePath, issue);

                const boardPath = join(projectDir(projectId), "board.json");
                const board = await readJSON<Board>(boardPath);
                for (const col of Object.keys(board.columns) as Array<keyof Board["columns"]>) {
                    const idx = board.columns[col].indexOf(issueId);
                    if (idx !== -1) board.columns[col].splice(idx, 1);
                }
                board.columns[status].push(issueId);
                await writeJSON(boardPath, board);

                return text(`${issueId} status: ${oldStatus} → ${status}`);
            } catch (err) {
                return error(`Failed to set status: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

    // issue-assign
    server.tool(
        {
            name: "issue-assign",
            description: "Assign an issue to a person or agent.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID"),
                assignee: z.string().describe("Assignee ('person:mario' or 'agent:bot-1'). Empty to unassign."),
            }),
        },
        async ({ projectId, issueId, assignee }) => {
            try {
                const issuePath = join(issuesDir(projectId), `${issueId}.json`);
                const issue = await readJSON<IssueMeta>(issuePath);
                issue.assignee = assignee || null;
                issue.updated_at = new Date().toISOString();
                await writeJSON(issuePath, issue);
                return text(assignee ? `${issueId} assigned to ${assignee}` : `${issueId} unassigned`);
            } catch (err) {
                return error(`Failed to assign issue: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );
}
