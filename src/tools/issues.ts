import { MCPServer, text, error, widget } from "mcp-use/server";
import { z } from "zod";
import { db } from "../db/index.js";
import { issues } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

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
