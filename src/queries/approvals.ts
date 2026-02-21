import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { approvals, tasks, codexRuns } from "../db/schema.js";

export async function approveTask(input: {
  taskId: string;
  userId: string;
}) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, input.taskId));

  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const [approval] = await db
    .insert(approvals)
    .values({
      taskId: task.id,
      userId: input.userId,
      revisionNumber: task.currentRevision,
    })
    .returning();

  await db
    .update(tasks)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(tasks.id, input.taskId));

  const [codexRun] = await db
    .insert(codexRuns)
    .values({
      taskId: task.id,
      revisionNumber: task.currentRevision,
      triggeredBy: input.userId,
      status: "queued",
    })
    .returning();

  return { approval, codexRun };
}
