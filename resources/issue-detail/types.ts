import { z } from "zod";

export const metaSchema = z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(["todo", "doing", "done"]),
    assignee: z.string().nullable(),
    priority: z.string(),
    updated_at: z.string(),
    plan: z.array(z.string()),
    links: z.record(z.string().nullable()),
});

export const propsSchema = z.object({
    meta: metaSchema,
    markdown: z.string(),
});

export type IssueDetailProps = z.infer<typeof propsSchema>;
export type IssueMeta = z.infer<typeof metaSchema>;
