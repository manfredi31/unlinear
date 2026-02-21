// ---------------------------------------------------------------------------
// Supabase Adapter — DB schema introspection + health check
// ---------------------------------------------------------------------------

import { infraCache } from "./cache.js";

export interface SupabaseTableInfo {
    table_name: string;
    table_schema: string;
    columns: {
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
    }[];
}

export interface SupabaseStatus {
    ok: boolean;
    tables: SupabaseTableInfo[];
    table_count: number;
    latency_ms: number;
    warnings: { id: string; severity: string; msg: string }[];
    checked_at: string;
}

async function fetchSchemaFallback(): Promise<SupabaseTableInfo[]> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return [];

    const authHeaders = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
    };

    const tablesRes = await fetch(
        `${url}/rest/v1/information_schema.tables?table_schema=eq.public&select=table_name,table_schema`,
        { headers: authHeaders }
    );

    if (!tablesRes.ok) return [];

    const tables = (await tablesRes.json()) as {
        table_name: string;
        table_schema: string;
    }[];

    const result: SupabaseTableInfo[] = [];
    for (const table of tables) {
        const colsRes = await fetch(
            `${url}/rest/v1/information_schema.columns?table_schema=eq.public&table_name=eq.${table.table_name}&select=column_name,data_type,is_nullable,column_default`,
            { headers: authHeaders }
        );

        const columns = colsRes.ok
            ? ((await colsRes.json()) as SupabaseTableInfo["columns"])
            : [];

        result.push({
            table_name: table.table_name,
            table_schema: table.table_schema,
            columns,
        });
    }

    return result;
}

async function fetchSchema(): Promise<SupabaseTableInfo[]> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return [];

    const res = await fetch(`${url}/rest/v1/rpc/get_schema_info`, {
        method: "POST",
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
    });

    if (!res.ok) return await fetchSchemaFallback();
    return (await res.json()) as SupabaseTableInfo[];
}

async function healthPing(): Promise<{ ok: boolean; latency_ms: number }> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: false, latency_ms: -1 };

    const start = Date.now();
    try {
        const res = await fetch(`${url}/rest/v1/`, {
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
            },
        });
        const latency_ms = Date.now() - start;
        return { ok: res.ok, latency_ms };
    } catch {
        return { ok: false, latency_ms: Date.now() - start };
    }
}

export async function getSupabaseStatus(): Promise<SupabaseStatus> {
    return infraCache.get("supabase:status", async () => {
        const [health, tables] = await Promise.all([healthPing(), fetchSchema()]);

        const warnings: SupabaseStatus["warnings"] = [];

        if (!health.ok) {
            warnings.push({
                id: "supabase-unreachable",
                severity: "high",
                msg: "Supabase health check failed",
            });
        }

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            warnings.push({
                id: "supabase-no-creds",
                severity: "low",
                msg: "Supabase credentials not configured",
            });
        }

        if (health.latency_ms > 2000) {
            warnings.push({
                id: "supabase-slow",
                severity: "medium",
                msg: `Supabase latency high: ${health.latency_ms}ms`,
            });
        }

        return {
            ok: warnings.filter((w) => w.severity === "high").length === 0,
            tables,
            table_count: tables.length,
            latency_ms: health.latency_ms,
            warnings,
            checked_at: new Date().toISOString(),
        };
    });
}
