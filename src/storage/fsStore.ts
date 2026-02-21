// ---------------------------------------------------------------------------
// File-system storage layer — atomic JSON / Markdown I/O with mutex locking
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export const WORKSPACE_ROOT =
    process.env.WORKSPACE_ROOT || join(process.cwd(), "workspace");

export function projectDir(projectId: string): string {
    return join(WORKSPACE_ROOT, "projects", projectId);
}

export function issuesDir(projectId: string): string {
    return join(projectDir(projectId), "issues");
}

// ---- Mutex ----------------------------------------------------------------
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (locks.has(key)) {
        await locks.get(key);
    }
    let resolve!: () => void;
    const p = new Promise<void>((r) => (resolve = r));
    locks.set(key, p);
    try {
        return await fn();
    } finally {
        locks.delete(key);
        resolve();
    }
}

// ---- Directory helpers ----------------------------------------------------
export async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

export async function listFiles(dir: string): Promise<string[]> {
    try {
        return await readdir(dir);
    } catch {
        return [];
    }
}

// ---- JSON read / write ----------------------------------------------------
export async function readJSON<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
}

export async function writeJSON<T>(filePath: string, data: T): Promise<void> {
    await withLock(filePath, async () => {
        await ensureDir(dirname(filePath));
        const tmp = `${filePath}.${randomUUID()}.tmp`;
        await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
        const { rename } = await import("node:fs/promises");
        await rename(tmp, filePath);
    });
}

// ---- Markdown read / append -----------------------------------------------
export async function readMarkdown(filePath: string): Promise<string> {
    try {
        return await readFile(filePath, "utf-8");
    } catch {
        return "";
    }
}

export async function appendMarkdown(
    filePath: string,
    content: string
): Promise<void> {
    await withLock(filePath, async () => {
        await ensureDir(dirname(filePath));
        const existing = await readMarkdown(filePath);
        await writeFile(filePath, existing + content, "utf-8");
    });
}
