import { MCPServer, object, text, error, widget } from "mcp-use/server";
import { z } from "zod";
import { db } from "../db/index.js";
import { issues, projects } from "../db/schema.js";
import { eq, and, sql, asc } from "drizzle-orm";

export function registerBoardTools(server: MCPServer) {
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
                const allIssues = await db
                    .select()
                    .from(issues)
                    .where(eq(issues.projectId, projectId))
                    .orderBy(asc(issues.position));

                const todo = allIssues.filter((i) => i.status === "todo");
                const doing = allIssues.filter((i) => i.status === "doing");
                const done = allIssues.filter((i) => i.status === "done");
                const total = allIssues.length;

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
                const [issue] = await db
                    .select()
                    .from(issues)
                    .where(and(eq(issues.id, issueId), eq(issues.projectId, projectId)));

                if (!issue) return error(`Issue ${issueId} not found`);
                if (issue.status !== from) return error(`Issue ${issueId} not in column '${from}'`);

                const maxPos = await db
                    .select({ max: sql<number>`coalesce(max(${issues.position}), -1)` })
                    .from(issues)
                    .where(and(eq(issues.projectId, projectId), eq(issues.status, to)));

                await db
                    .update(issues)
                    .set({
                        status: to,
                        position: (maxPos[0]?.max ?? -1) + 1,
                        updatedAt: new Date(),
                    })
                    .where(eq(issues.id, issueId));

                return text(`Moved ${issueId} from '${from}' to '${to}'`);
            } catch (err) {
                return error(
                    `Failed to move issue: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

    server.tool(
        {
            name: "issue-create",
            description: "Create a new issue. Generates an ID, adds to 'todo'.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
                title: z.string().describe("Issue title"),
                description_md: z.string().optional().describe("Markdown description"),
                priority: z.enum(["P0", "P1", "P2", "P3"]).optional().describe("Priority (default: P2)"),
            }),
        },
        async ({ projectId, title, description_md, priority }) => {
            try {
                const [project] = await db
                    .select()
                    .from(projects)
                    .where(eq(projects.id, projectId));
                if (!project) return error(`Project not found: ${projectId}`);

                const num = project.nextIssueNum;
                const issueId = `ISS-${num}`;

                await db
                    .update(projects)
                    .set({ nextIssueNum: num + 1, updatedAt: new Date() })
                    .where(eq(projects.id, projectId));

                const maxPos = await db
                    .select({ max: sql<number>`coalesce(max(${issues.position}), -1)` })
                    .from(issues)
                    .where(and(eq(issues.projectId, projectId), eq(issues.status, "todo")));

                const bodyMd = description_md
                    ? `# ${issueId}: ${title}\n\n${description_md}\n`
                    : `# ${issueId}: ${title}\n\n## Context\n\n_No description yet._\n`;

                await db.insert(issues).values({
                    id: issueId,
                    projectId,
                    title,
                    status: "todo",
                    assignee: null,
                    priority: priority ?? "P2",
                    position: (maxPos[0]?.max ?? -1) + 1,
                    plan: [],
                    links: {},
                    bodyMd,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                return object({ issueId, title, status: "todo", priority: priority ?? "P2" });
            } catch (err) {
                return error(
                    `Failed to create issue: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );
}
