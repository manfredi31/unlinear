// ---------------------------------------------------------------------------
// Vercel Adapter — connect to Vercel REST API for deployment status
// ---------------------------------------------------------------------------

import { infraCache } from "./cache.js";

export interface VercelDeployment {
    uid: string;
    url: string;
    state: string;
    created: number;
    readyState?: string;
}

export interface VercelStatus {
    ok: boolean;
    lastDeploy: {
        state: string;
        url: string;
        createdAt: string;
    } | null;
    recentDeploys: {
        state: string;
        url: string;
        createdAt: string;
    }[];
    uptime_estimate: number;
    warnings: { id: string; severity: string; msg: string }[];
    checked_at: string;
}

const VERCEL_API = "https://api.vercel.com";

async function fetchVercelDeployments(): Promise<VercelDeployment[]> {
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;

    if (!token || !projectId) {
        return [];
    }

    const teamParam = process.env.VERCEL_TEAM_ID
        ? `&teamId=${process.env.VERCEL_TEAM_ID}`
        : "";

    const res = await fetch(
        `${VERCEL_API}/v6/deployments?projectId=${projectId}&limit=10${teamParam}`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    if (!res.ok) {
        console.error(`Vercel API error: ${res.status} ${res.statusText}`);
        return [];
    }

    const body = (await res.json()) as { deployments: VercelDeployment[] };
    return body.deployments ?? [];
}

export async function getVercelStatus(): Promise<VercelStatus> {
    return infraCache.get("vercel:status", async () => {
        const deploys = await fetchVercelDeployments();

        if (deploys.length === 0) {
            return {
                ok: true,
                lastDeploy: null,
                recentDeploys: [],
                uptime_estimate: 1,
                warnings: [
                    {
                        id: "vercel-no-data",
                        severity: "low",
                        msg: "No Vercel credentials or no deployments found",
                    },
                ],
                checked_at: new Date().toISOString(),
            };
        }

        const recentDeploys = deploys.map((d) => ({
            state: d.state || d.readyState || "UNKNOWN",
            url: d.url ? `https://${d.url}` : "",
            createdAt: new Date(d.created).toISOString(),
        }));

        const lastDeploy = recentDeploys[0] ?? null;
        const readyCount = recentDeploys.filter((d) => d.state === "READY").length;
        const uptime_estimate = recentDeploys.length > 0 ? readyCount / recentDeploys.length : 1;

        const warnings: VercelStatus["warnings"] = [];
        if (lastDeploy && lastDeploy.state === "ERROR") {
            warnings.push({
                id: "vercel-deploy-failed",
                severity: "high",
                msg: `Last deploy failed (${lastDeploy.createdAt})`,
            });
        }
        if (lastDeploy && lastDeploy.state === "BUILDING") {
            warnings.push({
                id: "vercel-deploy-building",
                severity: "low",
                msg: "Deploy currently building",
            });
        }

        return {
            ok: warnings.filter((w) => w.severity === "high").length === 0,
            lastDeploy,
            recentDeploys,
            uptime_estimate,
            warnings,
            checked_at: new Date().toISOString(),
        };
    });
}
