import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { codexRuns } from "../db/schema.js";

export async function getCodexRun(runId: string) {
  const [run] = await db
    .select()
    .from(codexRuns)
    .where(eq(codexRuns.id, runId));

  return run ?? null;
}

export async function updateCodexRunStatus(input: {
  runId: string;
  status: "queued" | "running" | "completed" | "failed";
  outputUrl?: string;
  errorMessage?: string;
}) {
  const now = new Date();
  const setFields: Record<string, unknown> = { status: input.status };

  if (input.status === "running") {
    setFields.startedAt = now;
  }
  if (input.status === "completed" || input.status === "failed") {
    setFields.completedAt = now;
  }
  if (input.outputUrl) setFields.outputUrl = input.outputUrl;
  if (input.errorMessage) setFields.errorMessage = input.errorMessage;

  const [updated] = await db
    .update(codexRuns)
    .set(setFields)
    .where(eq(codexRuns.id, input.runId))
    .returning();

  return updated ?? null;
}
