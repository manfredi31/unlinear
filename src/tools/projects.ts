import { MCPServer, object, error, widget, text } from "mcp-use/server";
import { z } from "zod";
import { db } from "../db/index.js";
import { projects } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getVercelStatus } from "../adapters/vercel.js";
import { getSupabaseStatus } from "../adapters/supabase.js";

export function registerProjectsTools(server: MCPServer) {
    server.tool(
        {
            name: "projects-list",
            description:
                "List all registered projects with live health status from Vercel and Supabase",
            schema: z.object({}),
            annotations: { readOnlyHint: true },
            widget: {
                name: "projects-dashboard",
                invoking: "Loading projects...",
                invoked: "Projects loaded",
            },
        },
        async () => {
            try {
                const allProjects = await db.select().from(projects);
                const [vercel, supabase] = await Promise.all([
                    getVercelStatus(),
                    getSupabaseStatus(),
                ]);

                const mapped = allProjects.map((p) => ({
                    id: p.id,
                    name: p.name,
                    active: p.active,
                    health: {
                        vercel_ok: vercel.ok,
                        supabase_ok: supabase.ok,
                        warnings_count:
                            vercel.warnings.length + supabase.warnings.length,
                    },
                }));

                return widget({
                    props: { projects: mapped },
                    output: text(`Found ${mapped.length} project(s)`),
                });
            } catch (err) {
                return error(
                    `Failed to list projects: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

    server.tool(
        {
            name: "project-get",
            description:
                "Get full project metadata with live infrastructure snapshot (last deploy, DB schema summary)",
            schema: z.object({
                projectId: z.string().describe("Project ID (e.g. 'alpha')"),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ projectId }) => {
            try {
                const [meta] = await db
                    .select()
                    .from(projects)
                    .where(eq(projects.id, projectId));
                if (!meta) return error(`Project not found: ${projectId}`);

                const [vercel, supabase] = await Promise.all([
                    getVercelStatus(),
                    getSupabaseStatus(),
                ]);

                return object({
                    ...meta,
                    infra: {
                        vercel: {
                            ok: vercel.ok,
                            lastDeploy: vercel.lastDeploy,
                            uptime_estimate: vercel.uptime_estimate,
                            warnings: vercel.warnings,
                        },
                        supabase: {
                            ok: supabase.ok,
                            table_count: supabase.table_count,
                            tables_summary: supabase.tables.map((t) => ({
                                name: t.table_name,
                                column_count: t.columns.length,
                            })),
                            latency_ms: supabase.latency_ms,
                            warnings: supabase.warnings,
                        },
                    },
                });
            } catch (err) {
                return error(
                    `Failed to get project: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );

    server.tool(
        {
            name: "project-infra-status",
            description:
                "Deep infrastructure view: Vercel deployments list, Supabase tables with full column details, latencies.",
            schema: z.object({
                projectId: z.string().describe("Project ID"),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ projectId }) => {
            try {
                const [meta] = await db
                    .select()
                    .from(projects)
                    .where(eq(projects.id, projectId));
                if (!meta) return error(`Project not found: ${projectId}`);

                const [vercel, supabase] = await Promise.all([
                    getVercelStatus(),
                    getSupabaseStatus(),
                ]);

                return object({
                    project: { id: meta.id, name: meta.name },
                    vercel: {
                        ok: vercel.ok,
                        uptime_estimate: vercel.uptime_estimate,
                        recentDeploys: vercel.recentDeploys,
                        warnings: vercel.warnings,
                        checked_at: vercel.checked_at,
                    },
                    supabase: {
                        ok: supabase.ok,
                        latency_ms: supabase.latency_ms,
                        table_count: supabase.table_count,
                        tables: supabase.tables.map((t) => ({
                            table_name: t.table_name,
                            schema: t.table_schema,
                            columns: t.columns,
                        })),
                        warnings: supabase.warnings,
                        checked_at: supabase.checked_at,
                    },
                });
            } catch (err) {
                return error(
                    `Failed to get infra status: ${err instanceof Error ? err.message : "Unknown error"}`
                );
            }
        }
    );
}
