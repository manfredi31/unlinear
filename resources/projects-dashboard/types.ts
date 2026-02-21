import { z } from "zod";

export const projectSchema = z.object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
    health: z.object({
        vercel_ok: z.boolean(),
        supabase_ok: z.boolean(),
        warnings_count: z.number(),
    }),
});

export const propsSchema = z.object({
    projects: z.array(projectSchema),
});

export type ProjectsDashboardProps = z.infer<typeof propsSchema>;
export type Project = z.infer<typeof projectSchema>;
