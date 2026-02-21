import { MCPServer, object, text, error } from "mcp-use/server";
import { z } from "zod";
import { db } from "../db/index.js";
import { issues, projects } from "../db/schema.js";
import { eq, and, asc, isNull, sql, lte } from "drizzle-orm";

export function registerWorkTools(server: MCPServer) {
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
                const items = await db
                    .select({
                        id: issues.id,
                        projectId: issues.projectId,
                        title: issues.title,
                        status: issues.status,
                        assignee: issues.assignee,
                        priority: issues.priority,
                        updatedAt: issues.updatedAt,
                        plan: issues.plan,
                        links: issues.links,
                    })
                    .from(issues)
                    .where(eq(issues.assignee, userId))
                    .orderBy(
                        sql`case ${issues.status} when 'doing' then 0 when 'todo' then 1 when 'done' then 2 end`,
                        asc(issues.priority)
                    );

                const mapped = items.map((i) => ({
                    ...i,
                    updated_at: i.updatedAt.toISOString(),
                }));

                return object({ userId, count: mapped.length, items: mapped });
            } catch (err) {
                return error(`Failed to get work items: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );

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
                const conditions = [
                    eq(issues.projectId, projectId),
                    eq(issues.status, "todo"),
                    isNull(issues.assignee),
                ];
                if (priority_filter) {
                    conditions.push(lte(issues.priority, priority_filter));
                }

                const candidates = await db
                    .select()
                    .from(issues)
                    .where(and(...conditions))
                    .orderBy(asc(issues.priority), asc(issues.position))
                    .limit(1);

                if (candidates.length === 0) {
                    return object({ claimed: false, message: "No unassigned todo issues available" });
                }

                const issue = candidates[0]!;

                const maxPos = await db
                    .select({ max: sql<number>`coalesce(max(${issues.position}), -1)` })
                    .from(issues)
                    .where(and(eq(issues.projectId, projectId), eq(issues.status, "doing")));

                await db
                    .update(issues)
                    .set({
                        assignee: agentId,
                        status: "doing",
                        position: (maxPos[0]?.max ?? -1) + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(issues.id, issue.id));

                return object({
                    claimed: true,
                    issueId: issue.id,
                    title: issue.title,
                    priority: issue.priority,
                    assignee: agentId,
                });
            } catch (err) {
                return error(`Failed to claim issue: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        }
    );
}
