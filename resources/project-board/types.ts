import { z } from "zod";

export const issueSchema = z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(["todo", "doing", "done"]),
    assignee: z.string().nullable(),
    priority: z.string(),
    updated_at: z.string(),
    plan: z.array(z.string()),
    links: z.record(z.string(), z.string().nullable()),
});

export const propsSchema = z.object({
    projectId: z.string(),
    columns: z.object({
        todo: z.array(issueSchema),
        doing: z.array(issueSchema),
        done: z.array(issueSchema),
    }),
    total: z.number(),
});

export type ProjectBoardProps = z.infer<typeof propsSchema>;
export type Issue = z.infer<typeof issueSchema>;
