import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { taskReviewers, users } from "../db/schema.js";

export async function getTaskReviewers(taskId: string) {
  return db
    .select({
      userId: taskReviewers.userId,
      addedAt: taskReviewers.addedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
    })
    .from(taskReviewers)
    .innerJoin(users, eq(taskReviewers.userId, users.id))
    .where(eq(taskReviewers.taskId, taskId));
}

export async function addTaskReviewer(input: {
  taskId: string;
  userId: string;
}) {
  const [reviewer] = await db
    .insert(taskReviewers)
    .values({ taskId: input.taskId, userId: input.userId })
    .onConflictDoNothing()
    .returning();

  return reviewer ?? null;
}

export async function removeTaskReviewer(input: {
  taskId: string;
  userId: string;
}) {
  const [removed] = await db
    .delete(taskReviewers)
    .where(
      and(
        eq(taskReviewers.taskId, input.taskId),
        eq(taskReviewers.userId, input.userId),
      ),
    )
    .returning();

  return removed ?? null;
}
