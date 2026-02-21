import { MCPServer, object, error } from "mcp-use/server";
import { z } from "zod";
import { db } from "../db/index.js";
import { issues } from "../db/schema.js";
import { eq, asc, sql } from "drizzle-orm";

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
}
