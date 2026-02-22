import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  approvals,
  codexRuns,
  projectMembers,
  projects,
  taskRevisions,
  tasks,
  users,
} from "./schema.js";

type SeedProject = {
  name: string;
  description: string;
  ownerEmail: string;
  memberEmails: string[];
};

type PlannedTask = {
  key: string;
  projectId: string;
  number: number;
  title: string;
  status: "draft" | "in_review" | "approved" | "building" | "done";
  authorId: string;
  currentRevision: number;
  body: string;
};

const TASK_TOPICS = [
  "Authentication Hardening",
  "Onboarding UX Refresh",
  "API Error Mapping",
  "Deployment Rollback Plan",
  "Rate Limit Tuning",
  "Search Index Backfill",
  "Background Job Retry Rules",
  "Metrics Dashboard Pass",
  "Permission Model Audit",
  "Notification Routing",
];

function taskStatusFor(number: number): PlannedTask["status"] {
  const mod = number % 10;
  if (mod <= 2) return "draft";
  if (mod <= 4) return "in_review";
  if (mod <= 6) return "approved";
  if (mod <= 8) return "building";
  return "done";
}

function buildRevisionBody(projectName: string, title: string, revision: number) {
  return [
    `# ${title}`,
    "",
    `Project: ${projectName}`,
    `Revision: ${revision}`,
    "",
    "## Goal",
    "Ship a stable iteration with measurable impact and low regression risk.",
    "",
    "## Plan",
    `1. Prepare milestone ${revision} scope and owners.`,
    `2. Implement changes with feature flags and observability.`,
    "3. Validate behavior with integration checks and rollback criteria.",
    "",
    "## Exit Criteria",
    "- No blocker defects in smoke validation.",
    "- Monitoring and runbook links are updated.",
  ].join("\n");
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  const now = new Date();

  const seedUsers = [
    { name: "Luca Rivera", email: "luca@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=luca" },
    { name: "Maya Chen", email: "maya@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=maya" },
    { name: "Sam Patel", email: "sam@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=sam" },
    { name: "Ivy Morales", email: "ivy@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=ivy" },
    { name: "Noah Kim", email: "noah@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=noah" },
    { name: "Ada Brooks", email: "ada@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=ada" },
    { name: "Rae Johnson", email: "rae@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=rae" },
    { name: "Jules Park", email: "jules@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=jules" },
    { name: "Omar Bell", email: "omar@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=omar" },
    { name: "Nina Shah", email: "nina@unlinear.dev", avatar: "https://i.pravatar.cc/150?u=nina" },
  ];

  const seedProjects: SeedProject[] = [
    {
      name: "Core Platform",
      description: "Reliability and backend architecture improvements.",
      ownerEmail: "luca@unlinear.dev",
      memberEmails: ["maya@unlinear.dev", "sam@unlinear.dev", "ivy@unlinear.dev"],
    },
    {
      name: "Product Surface",
      description: "UX and workflow polish for daily product usage.",
      ownerEmail: "maya@unlinear.dev",
      memberEmails: ["luca@unlinear.dev", "noah@unlinear.dev", "ada@unlinear.dev"],
    },
    {
      name: "Integrations",
      description: "External connectors, webhook hardening, and sync jobs.",
      ownerEmail: "sam@unlinear.dev",
      memberEmails: ["jules@unlinear.dev", "rae@unlinear.dev", "omar@unlinear.dev"],
    },
    {
      name: "Growth Ops",
      description: "Acquisition, activation, and experimentation work.",
      ownerEmail: "nina@unlinear.dev",
      memberEmails: ["maya@unlinear.dev", "ada@unlinear.dev", "ivy@unlinear.dev"],
    },
  ];

  try {
    await db.transaction(async (tx) => {
      await tx.delete(codexRuns);
      await tx.delete(approvals);
      await tx.delete(taskRevisions);
      await tx.delete(tasks);
      await tx.delete(projectMembers);
      await tx.delete(projects);
      await tx.delete(users);

      const insertedUsers = await tx
        .insert(users)
        .values(
          seedUsers.map((u) => ({
            name: u.name,
            email: u.email,
            avatarUrl: u.avatar,
          })),
        )
        .returning();

      const userIdByEmail = new Map(insertedUsers.map((u) => [u.email, u.id]));

      const insertedProjects = await tx
        .insert(projects)
        .values(
          seedProjects.map((p) => ({
            name: p.name,
            description: p.description,
            ownerId: userIdByEmail.get(p.ownerEmail)!,
          })),
        )
        .returning();

      const projectIdByName = new Map(insertedProjects.map((p) => [p.name, p.id]));

      const memberRows: {
        projectId: string;
        userId: string;
        role: "owner" | "admin" | "member";
        joinedAt: Date;
      }[] = [];

      for (const project of seedProjects) {
        const projectId = projectIdByName.get(project.name)!;
        memberRows.push({
          projectId,
          userId: userIdByEmail.get(project.ownerEmail)!,
          role: "owner",
          joinedAt: now,
        });
        for (const email of project.memberEmails) {
          memberRows.push({
            projectId,
            userId: userIdByEmail.get(email)!,
            role: "member",
            joinedAt: now,
          });
        }
      }
      await tx.insert(projectMembers).values(memberRows);

      const plannedTasks: PlannedTask[] = [];
      const revisionBodiesByTaskKey = new Map<string, string[]>();

      for (const [projectIndex, project] of seedProjects.entries()) {
        const projectId = projectIdByName.get(project.name)!;
        const projectContributors = [project.ownerEmail, ...project.memberEmails];
        for (let n = 1; n <= 25; n += 1) {
          const status = taskStatusFor(n + projectIndex);
          const topic = TASK_TOPICS[(n + projectIndex) % TASK_TOPICS.length];
          const title = `${topic} #${n}`;
          const authorEmail = projectContributors[n % projectContributors.length];
          const authorId = userIdByEmail.get(authorEmail)!;
          const currentRevision = ((n + projectIndex) % 4) + 1;
          const key = `${projectId}:${n}`;

          const revisions: string[] = [];
          for (let rev = 1; rev <= currentRevision; rev += 1) {
            revisions.push(buildRevisionBody(project.name, title, rev));
          }
          revisionBodiesByTaskKey.set(key, revisions);

          plannedTasks.push({
            key,
            projectId,
            number: n,
            title,
            status,
            authorId,
            currentRevision,
            body: revisions[revisions.length - 1],
          });
        }
      }

      const insertedTasks = await tx
        .insert(tasks)
        .values(
          plannedTasks.map((t) => ({
            projectId: t.projectId,
            number: t.number,
            title: t.title,
            body: t.body,
            status: t.status,
            authorId: t.authorId,
            currentRevision: t.currentRevision,
            updatedAt: now,
          })),
        )
        .returning();

      const taskIdByKey = new Map(
        insertedTasks.map((t) => [`${t.projectId}:${t.number}`, t.id]),
      );

      const revisionRows: {
        taskId: string;
        revisionNumber: number;
        body: string;
        comment: string | null;
        authorId: string;
      }[] = [];

      const approvalRows: {
        taskId: string;
        userId: string;
        revisionNumber: number;
      }[] = [];

      const codexRunRows: {
        taskId: string;
        revisionNumber: number;
        triggeredBy: string;
        status: "queued" | "running" | "completed" | "failed";
        outputUrl: string | null;
        errorMessage: string | null;
        startedAt: Date | null;
        completedAt: Date | null;
      }[] = [];

      for (const task of plannedTasks) {
        const taskId = taskIdByKey.get(task.key)!;
        const revisions = revisionBodiesByTaskKey.get(task.key)!;
        for (let rev = 1; rev <= revisions.length; rev += 1) {
          revisionRows.push({
            taskId,
            revisionNumber: rev,
            body: revisions[rev - 1],
            comment:
              rev === 1
                ? null
                : `Revision ${rev}: addressed review feedback and tightened scope`,
            authorId: task.authorId,
          });
        }

        if (task.status === "approved" || task.status === "building" || task.status === "done") {
          approvalRows.push({
            taskId,
            userId: task.authorId,
            revisionNumber: task.currentRevision,
          });

          if (task.status === "approved") {
            codexRunRows.push({
              taskId,
              revisionNumber: task.currentRevision,
              triggeredBy: task.authorId,
              status: "queued",
              outputUrl: null,
              errorMessage: null,
              startedAt: null,
              completedAt: null,
            });
          } else if (task.status === "building") {
            codexRunRows.push({
              taskId,
              revisionNumber: task.currentRevision,
              triggeredBy: task.authorId,
              status: "running",
              outputUrl: null,
              errorMessage: null,
              startedAt: new Date(now.getTime() - 1000 * 60 * 15),
              completedAt: null,
            });
          } else {
            const failed = task.number % 7 === 0;
            codexRunRows.push({
              taskId,
              revisionNumber: task.currentRevision,
              triggeredBy: task.authorId,
              status: failed ? "failed" : "completed",
              outputUrl: failed ? null : `https://artifacts.unlinear.dev/runs/${taskId}`,
              errorMessage: failed ? "Integration tests failed in deploy preview" : null,
              startedAt: new Date(now.getTime() - 1000 * 60 * 40),
              completedAt: new Date(now.getTime() - 1000 * 60 * 10),
            });
          }
        }
      }

      await tx.insert(taskRevisions).values(revisionRows);
      await tx.insert(approvals).values(approvalRows);
      await tx.insert(codexRuns).values(codexRunRows);

      console.log(
        `Seed complete: ${insertedUsers.length} users, ${insertedProjects.length} projects, ${insertedTasks.length} tasks, ${revisionRows.length} revisions, ${approvalRows.length} approvals, ${codexRunRows.length} codex runs`,
      );
    });
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
