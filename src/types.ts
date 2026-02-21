// ---------------------------------------------------------------------------
// Shared types used across tools
// ---------------------------------------------------------------------------

export interface ProjectRegistry {
    projects: ProjectEntry[];
}

export interface ProjectEntry {
    id: string;
    name: string;
    repo: string;
    owner: string;
    active: boolean;
}

export interface ProjectMeta {
    id: string;
    name: string;
    next_issue_num: number;
    integrations: {
        vercel: { projectId: string };
        supabase: { ref: string };
    };
}

export interface Board {
    columns: {
        todo: string[];
        doing: string[];
        done: string[];
    };
}

export interface IssueMeta {
    id: string;
    title: string;
    status: "todo" | "doing" | "done";
    assignee: string | null;
    priority: string;
    updated_at: string;
    plan: string[];
    links: Record<string, string | null>;
}
