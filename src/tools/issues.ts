import { MCPServer, object, text, markdown, error, widget } from "mcp-use/server";
import { z } from "zod";
import { db } from "../db/index.js";
import { issues } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export function registerIssueTools(server: MCPServer) {
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
                const [issue] = await db
                    .select()
                    .from(issues)
                    .where(and(eq(issues.id, issueId), eq(issues.projectId, projectId)));

                if (!issue) return error(`Issue not found: ${issueId}`);

                return widget({
                    props: {
                        meta: {
                            id: issue.id,
                            title: issue.title,
                            status: issue.status,
                            assignee: issue.assignee,
                            priority: issue.priority,
                            updated_at: issue.updatedAt.toISOString(),
                            plan: issue.plan,
                            links: issue.links,
                        },
                        markdown: issue.bodyMd,
                    },
                    output: text(`${issue.id}: ${issue.title} [${issue.status}]`),
                });
            } catch (err) {
                return error(
                    `Failed to get issue ${issueId}: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

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
        async ({ projectId, issueId, plan }) => {
            try {
                const [issue] = await db
                    .select()
                    .from(issues)
                    .where(and(eq(issues.id, issueId), eq(issues.projectId, projectId)));

                if (!issue) return error(`Issue not found: ${issueId}`);

                await db
                    .update(issues)
                    .set({ plan, updatedAt: new Date() })
                    .where(eq(issues.id, issueId));

                return text(`Updated plan for ${issueId} (${plan.length} steps)`);
            } catch (err) {
                return error(`Failed to update plan: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

    server.tool(
        {
            name: "issue-add-note",
            description: "Append a timestamped note to the issue's markdown body. Append-only audit trail.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID"),
                note_md: z.string().describe("Note content in markdown"),
                author: z.string().describe("Author (e.g. 'mario' or 'agent:bot-1')"),
            }),
        },
        async ({ projectId, issueId, note_md, author }) => {
            try {
                const [issue] = await db
                    .select()
                    .from(issues)
                    .where(and(eq(issues.id, issueId), eq(issues.projectId, projectId)));

                if (!issue) return error(`Issue not found: ${issueId}`);

                const timestamp = new Date().toISOString().split("T")[0];
                const block = `\n---\n**[${timestamp} ${author}]** ${note_md}\n`;
                const newBody = issue.bodyMd + block;

                await db
                    .update(issues)
                    .set({ bodyMd: newBody, updatedAt: new Date() })
                    .where(eq(issues.id, issueId));

                return text(`Note added to ${issueId} by ${author}`);
            } catch (err) {
                return error(`Failed to add note: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

    server.tool(
        {
            name: "issue-set-status",
            description: "Update issue status (todo, doing, done). Automatically repositions in the target column.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                issueId: z.string().describe("Issue ID"),
                status: z.enum(["todo", "doing", "done"]).describe("New status"),
            }),
        },
        async ({ projectId, issueId, status }) => {
            try {
                const [issue] = await db
                    .select()
                    .from(issues)
                    .where(and(eq(issues.id, issueId), eq(issues.projectId, projectId)));

                if (!issue) return error(`Issue not found: ${issueId}`);
                const oldStatus = issue.status;

                const maxPos = await db
                    .select({ max: sql<number>`coalesce(max(${issues.position}), -1)` })
                    .from(issues)
                    .where(and(eq(issues.projectId, projectId), eq(issues.status, status)));

                await db
                    .update(issues)
                    .set({
                        status,
                        position: (maxPos[0]?.max ?? -1) + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(issues.id, issueId));

                return text(`${issueId} status: ${oldStatus} → ${status}`);
            } catch (err) {
                return error(`Failed to set status: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

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
                const [issue] = await db
                    .select()
                    .from(issues)
                    .where(and(eq(issues.id, issueId), eq(issues.projectId, projectId)));

                if (!issue) return error(`Issue not found: ${issueId}`);

                await db
                    .update(issues)
                    .set({ assignee: assignee || null, updatedAt: new Date() })
                    .where(eq(issues.id, issueId));

                return text(assignee ? `${issueId} assigned to ${assignee}` : `${issueId} unassigned`);
            } catch (err) {
                return error(`Failed to assign issue: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );
}
