import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, projectMembers, users } from "../db/schema.js";

export async function createProject(input: {
  name: string;
  description?: string;
  ownerId: string;
}) {
  const [project] = await db
    .insert(projects)
    .values({
      name: input.name,
      description: input.description ?? "",
      ownerId: input.ownerId,
    })
    .returning();

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: input.ownerId,
    role: "owner",
  });

  return project;
}

export async function listProjects() {
  return db.select().from(projects);
}

export async function getProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) return null;

  const members = await db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));

  return { ...project, members };
}

export async function addMember(input: {
  projectId: string;
  userId: string;
  role?: "owner" | "admin" | "member";
}) {
  const [member] = await db
    .insert(projectMembers)
    .values({
      projectId: input.projectId,
      userId: input.userId,
      role: input.role ?? "member",
    })
    .returning();

  return member;
}
