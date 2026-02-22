import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { tasks, taskRevisions } from "../db/schema.js";
import { editPlan } from "../llm/edit-plan.js";

export async function createTask(input: {
  projectId: string;
  title: string;
  body?: string;
  authorId: string;
}) {
  const body = input.body ?? "";

  const [{ nextNum }] = await db
    .select({
      nextNum: sql<number>`coalesce(max(${tasks.number}), 0) + 1`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, input.projectId));

  const [task] = await db
    .insert(tasks)
    .values({
      projectId: input.projectId,
      number: nextNum,
      title: input.title,
      body,
      authorId: input.authorId,
      currentRevision: 1,
    })
    .returning();

  await db.insert(taskRevisions).values({
    taskId: task.id,
    revisionNumber: 1,
    body,
    comment: null,
    authorId: input.authorId,
  });

  return task;
}

export async function getTask(taskId: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId));

  return task ?? null;
}

export async function listTasks(input: {
  projectId: string;
  status?: string;
}) {
  if (input.status) {
    return db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, input.projectId),
          eq(tasks.status, input.status as any),
        ),
      )
      .orderBy(asc(tasks.number));
  }

  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, input.projectId))
    .orderBy(asc(tasks.number));
}

export async function commentOnTask(input: {
  taskId: string;
  comment: string;
  authorId: string;
}) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, input.taskId));

  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const updatedBody = await editPlan(task.body, input.comment);
  const newRevision = task.currentRevision + 1;

  await db.insert(taskRevisions).values({
    taskId: task.id,
    revisionNumber: newRevision,
    body: updatedBody,
    comment: input.comment,
    authorId: input.authorId,
  });

  const [updated] = await db
    .update(tasks)
    .set({
      body: updatedBody,
      currentRevision: newRevision,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, input.taskId))
    .returning();

  return {
    task: updated,
    revisionNumber: newRevision,
    comment: input.comment,
    body: updatedBody,
  };
}

export async function updateTaskStatus(input: {
  taskId: string;
  status: "draft" | "in_review" | "approved" | "building" | "done";
}) {
  const [updated] = await db
    .update(tasks)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(tasks.id, input.taskId))
    .returning();

  if (!updated) throw new Error(`Task not found: ${input.taskId}`);
  return updated;
}

export async function getTaskTimeline(taskId: string) {
  return db
    .select()
    .from(taskRevisions)
    .where(eq(taskRevisions.taskId, taskId))
    .orderBy(asc(taskRevisions.revisionNumber));
}
