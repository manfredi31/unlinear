import { db, closeDbConnection } from "./index.js";
import {
  users,
  projects,
  projectMembers,
  tasks,
  taskRevisions,
  approvals,
  codexRuns,
} from "./schema.js";

type UserSeed = typeof users.$inferInsert;
type ProjectSeed = typeof projects.$inferInsert;
type ProjectMemberSeed = typeof projectMembers.$inferInsert;
type TaskSeed = typeof tasks.$inferInsert;
type TaskRevisionSeed = typeof taskRevisions.$inferInsert;
type ApprovalSeed = typeof approvals.$inferInsert;
type CodexRunSeed = typeof codexRuns.$inferInsert;

const DEMO_IDS = {
  users: {
    eva: "00000000-0000-4000-8000-000000000001",
    marc: "00000000-0000-4000-8000-000000000002",
    priya: "00000000-0000-4000-8000-000000000003",
    theo: "00000000-0000-4000-8000-000000000004",
  },
  projects: {
    webPlatform: "00000000-0000-4000-8000-000000000101",
    mobileGrowth: "00000000-0000-4000-8000-000000000102",
  },
  tasks: {
    web_1: "00000000-0000-4000-8000-000000001001",
    web_2: "00000000-0000-4000-8000-000000001002",
    web_3: "00000000-0000-4000-8000-000000001003",
    web_4: "00000000-0000-4000-8000-000000001004",
    web_5: "00000000-0000-4000-8000-000000001005",
    mobile_1: "00000000-0000-4000-8000-000000001006",
    mobile_2: "00000000-0000-4000-8000-000000001007",
    mobile_3: "00000000-0000-4000-8000-000000001008",
  },
} as const;

const now = Date.now();
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

const seededUsers: UserSeed[] = [
  {
    id: DEMO_IDS.users.eva,
    name: "Eva Rossi",
    email: "eva@demo.unlinear.app",
    avatarUrl: "https://api.dicebear.com/9.x/personas/svg?seed=Eva",
    createdAt: hoursAgo(400),
  },
  {
    id: DEMO_IDS.users.marc,
    name: "Marc Dubois",
    email: "marc@demo.unlinear.app",
    avatarUrl: "https://api.dicebear.com/9.x/personas/svg?seed=Marc",
    createdAt: hoursAgo(380),
  },
  {
    id: DEMO_IDS.users.priya,
    name: "Priya Singh",
    email: "priya@demo.unlinear.app",
    avatarUrl: "https://api.dicebear.com/9.x/personas/svg?seed=Priya",
    createdAt: hoursAgo(360),
  },
  {
    id: DEMO_IDS.users.theo,
    name: "Theo Keller",
    email: "theo@demo.unlinear.app",
    avatarUrl: "https://api.dicebear.com/9.x/personas/svg?seed=Theo",
    createdAt: hoursAgo(340),
  },
];

const seededProjects: ProjectSeed[] = [
  {
    id: DEMO_IDS.projects.webPlatform,
    name: "demo/web-platform",
    description: "Main web product: onboarding, billing, and analytics surfaces.",
    ownerId: DEMO_IDS.users.eva,
    createdAt: hoursAgo(240),
    updatedAt: hoursAgo(8),
  },
  {
    id: DEMO_IDS.projects.mobileGrowth,
    name: "demo/mobile-growth",
    description: "Acquisition and conversion work for the iOS/Android funnel.",
    ownerId: DEMO_IDS.users.marc,
    createdAt: hoursAgo(220),
    updatedAt: hoursAgo(10),
  },
];

const seededProjectMembers: ProjectMemberSeed[] = [
  {
    projectId: DEMO_IDS.projects.webPlatform,
    userId: DEMO_IDS.users.eva,
    role: "owner",
    joinedAt: hoursAgo(238),
  },
  {
    projectId: DEMO_IDS.projects.webPlatform,
    userId: DEMO_IDS.users.marc,
    role: "admin",
    joinedAt: hoursAgo(237),
  },
  {
    projectId: DEMO_IDS.projects.webPlatform,
    userId: DEMO_IDS.users.priya,
    role: "member",
    joinedAt: hoursAgo(236),
  },
  {
    projectId: DEMO_IDS.projects.webPlatform,
    userId: DEMO_IDS.users.theo,
    role: "member",
    joinedAt: hoursAgo(235),
  },
  {
    projectId: DEMO_IDS.projects.mobileGrowth,
    userId: DEMO_IDS.users.marc,
    role: "owner",
    joinedAt: hoursAgo(218),
  },
  {
    projectId: DEMO_IDS.projects.mobileGrowth,
    userId: DEMO_IDS.users.eva,
    role: "admin",
    joinedAt: hoursAgo(217),
  },
  {
    projectId: DEMO_IDS.projects.mobileGrowth,
    userId: DEMO_IDS.users.priya,
    role: "member",
    joinedAt: hoursAgo(216),
  },
];

const seededTasks: TaskSeed[] = [
  {
    id: DEMO_IDS.tasks.web_1,
    projectId: DEMO_IDS.projects.webPlatform,
    number: 1,
    title: "Rework signup onboarding for activation",
    body: `## Goal
Increase first-session activation by reducing setup friction.

## Plan
- Remove mandatory workspace naming on first screen.
- Add "skip for now" to integration step.
- Track drop-off events for each onboarding step.

## Rollout
- Ship to 20% traffic, monitor activation and support tickets.`,
    status: "done",
    authorId: DEMO_IDS.users.eva,
    currentRevision: 3,
    createdAt: hoursAgo(200),
    updatedAt: hoursAgo(36),
  },
  {
    id: DEMO_IDS.tasks.web_2,
    projectId: DEMO_IDS.projects.webPlatform,
    number: 2,
    title: "Ship billing alerts before trial expiration",
    body: `## Goal
Reduce failed conversions at the trial-to-paid boundary.

## Plan
- Trigger in-app banner at day 10 of trial.
- Send reminder emails on days 12 and 13.
- Include direct CTA to payment page.

## Success metric
- Improve trial conversion by at least 8%.`,
    status: "building",
    authorId: DEMO_IDS.users.priya,
    currentRevision: 2,
    createdAt: hoursAgo(180),
    updatedAt: hoursAgo(14),
  },
  {
    id: DEMO_IDS.tasks.web_3,
    projectId: DEMO_IDS.projects.webPlatform,
    number: 3,
    title: "Audit analytics events for dashboard usage",
    body: `## Goal
Guarantee event consistency across dashboard views.

## Plan
- Enumerate events emitted by current dashboard routes.
- Add missing event payload fields for team and plan IDs.
- Write QA checklist for event validation in staging.`,
    status: "in_review",
    authorId: DEMO_IDS.users.theo,
    currentRevision: 2,
    createdAt: hoursAgo(120),
    updatedAt: hoursAgo(18),
  },
  {
    id: DEMO_IDS.tasks.web_4,
    projectId: DEMO_IDS.projects.webPlatform,
    number: 4,
    title: "Consolidate auth copy and empty-state messaging",
    body: `## Goal
Improve clarity in auth states and first-run empty screens.

## Plan
- Standardize terminology across sign in and invite flows.
- Add contextual hints for empty dashboards.
- Validate copy with support and design.`,
    status: "approved",
    authorId: DEMO_IDS.users.marc,
    currentRevision: 1,
    createdAt: hoursAgo(90),
    updatedAt: hoursAgo(12),
  },
  {
    id: DEMO_IDS.tasks.web_5,
    projectId: DEMO_IDS.projects.webPlatform,
    number: 5,
    title: "Draft migration guide for legacy dashboard widgets",
    body: `## Goal
Provide a migration path for deprecated widget APIs.

## Draft notes
- Capture all deprecated components in one checklist.
- Map old props to new widget contract.
- Add examples for top 3 integrations.`,
    status: "draft",
    authorId: DEMO_IDS.users.eva,
    currentRevision: 1,
    createdAt: hoursAgo(40),
    updatedAt: hoursAgo(9),
  },
  {
    id: DEMO_IDS.tasks.mobile_1,
    projectId: DEMO_IDS.projects.mobileGrowth,
    number: 1,
    title: "Launch mobile paywall copy experiment",
    body: `## Goal
Raise paid conversion from new mobile users.

## Plan
- Test urgency-focused vs outcome-focused headline variants.
- Keep pricing and benefits sections unchanged.
- Evaluate conversion after 5k exposures.`,
    status: "done",
    authorId: DEMO_IDS.users.marc,
    currentRevision: 2,
    createdAt: hoursAgo(160),
    updatedAt: hoursAgo(28),
  },
  {
    id: DEMO_IDS.tasks.mobile_2,
    projectId: DEMO_IDS.projects.mobileGrowth,
    number: 2,
    title: "Review referral landing funnel metrics",
    body: `## Goal
Understand where referral traffic stalls in the funnel.

## Plan
- Segment by source campaign and platform.
- Compare conversion against baseline paid traffic.
- Propose top two fixes for underperforming steps.`,
    status: "in_review",
    authorId: DEMO_IDS.users.priya,
    currentRevision: 1,
    createdAt: hoursAgo(70),
    updatedAt: hoursAgo(16),
  },
  {
    id: DEMO_IDS.tasks.mobile_3,
    projectId: DEMO_IDS.projects.mobileGrowth,
    number: 3,
    title: "Outline CRM sync strategy for lifecycle emails",
    body: `## Goal
Prepare implementation plan for CRM-triggered lifecycle campaigns.

## Draft scope
- Define event contract for signup, activation, and churn risk.
- Align ownership between growth and platform teams.
- Sequence rollout behind a feature flag.`,
    status: "draft",
    authorId: DEMO_IDS.users.eva,
    currentRevision: 1,
    createdAt: hoursAgo(30),
    updatedAt: hoursAgo(8),
  },
];

const seededTaskRevisions: TaskRevisionSeed[] = [
  {
    id: "00000000-0000-4000-8000-000000002001",
    taskId: DEMO_IDS.tasks.web_1,
    revisionNumber: 1,
    body: `## Goal
Increase first-session activation by reducing setup friction.

## Plan
- Remove mandatory workspace naming on first screen.
- Add "skip for now" to integration step.
- Track drop-off events for each onboarding step.`,
    comment: null,
    authorId: DEMO_IDS.users.eva,
    createdAt: hoursAgo(200),
  },
  {
    id: "00000000-0000-4000-8000-000000002002",
    taskId: DEMO_IDS.tasks.web_1,
    revisionNumber: 2,
    body: `## Goal
Increase first-session activation by reducing setup friction.

## Plan
- Remove mandatory workspace naming on first screen.
- Add "skip for now" to integration and import steps.
- Track drop-off and completion events for each onboarding step.`,
    comment: "Please include import step in the skip path and update telemetry details.",
    authorId: DEMO_IDS.users.marc,
    createdAt: hoursAgo(80),
  },
  {
    id: "00000000-0000-4000-8000-000000002003",
    taskId: DEMO_IDS.tasks.web_1,
    revisionNumber: 3,
    body: `## Goal
Increase first-session activation by reducing setup friction.

## Plan
- Remove mandatory workspace naming on first screen.
- Add "skip for now" to integration step.
- Track drop-off events for each onboarding step.

## Rollout
- Ship to 20% traffic, monitor activation and support tickets.`,
    comment: "Add rollout guardrails and launch percentage before approval.",
    authorId: DEMO_IDS.users.priya,
    createdAt: hoursAgo(50),
  },
  {
    id: "00000000-0000-4000-8000-000000002004",
    taskId: DEMO_IDS.tasks.web_2,
    revisionNumber: 1,
    body: `## Goal
Reduce failed conversions at the trial-to-paid boundary.

## Plan
- Trigger in-app banner at day 10 of trial.
- Send reminder emails on days 12 and 13.`,
    comment: null,
    authorId: DEMO_IDS.users.priya,
    createdAt: hoursAgo(180),
  },
  {
    id: "00000000-0000-4000-8000-000000002005",
    taskId: DEMO_IDS.tasks.web_2,
    revisionNumber: 2,
    body: `## Goal
Reduce failed conversions at the trial-to-paid boundary.

## Plan
- Trigger in-app banner at day 10 of trial.
- Send reminder emails on days 12 and 13.
- Include direct CTA to payment page.

## Success metric
- Improve trial conversion by at least 8%.`,
    comment: "Add explicit CTA details and measurable success criteria.",
    authorId: DEMO_IDS.users.eva,
    createdAt: hoursAgo(32),
  },
  {
    id: "00000000-0000-4000-8000-000000002006",
    taskId: DEMO_IDS.tasks.web_3,
    revisionNumber: 1,
    body: `## Goal
Guarantee event consistency across dashboard views.

## Plan
- Enumerate events emitted by current dashboard routes.
- Add missing payload fields.`,
    comment: null,
    authorId: DEMO_IDS.users.theo,
    createdAt: hoursAgo(120),
  },
  {
    id: "00000000-0000-4000-8000-000000002007",
    taskId: DEMO_IDS.tasks.web_3,
    revisionNumber: 2,
    body: `## Goal
Guarantee event consistency across dashboard views.

## Plan
- Enumerate events emitted by current dashboard routes.
- Add missing event payload fields for team and plan IDs.
- Write QA checklist for event validation in staging.`,
    comment: "Please include QA checklist and ensure IDs are in every payload.",
    authorId: DEMO_IDS.users.marc,
    createdAt: hoursAgo(45),
  },
  {
    id: "00000000-0000-4000-8000-000000002008",
    taskId: DEMO_IDS.tasks.web_4,
    revisionNumber: 1,
    body: `## Goal
Improve clarity in auth states and first-run empty screens.

## Plan
- Standardize terminology across sign in and invite flows.
- Add contextual hints for empty dashboards.
- Validate copy with support and design.`,
    comment: null,
    authorId: DEMO_IDS.users.marc,
    createdAt: hoursAgo(90),
  },
  {
    id: "00000000-0000-4000-8000-000000002009",
    taskId: DEMO_IDS.tasks.web_5,
    revisionNumber: 1,
    body: `## Goal
Provide a migration path for deprecated widget APIs.

## Draft notes
- Capture all deprecated components in one checklist.
- Map old props to new widget contract.
- Add examples for top 3 integrations.`,
    comment: null,
    authorId: DEMO_IDS.users.eva,
    createdAt: hoursAgo(40),
  },
  {
    id: "00000000-0000-4000-8000-000000002010",
    taskId: DEMO_IDS.tasks.mobile_1,
    revisionNumber: 1,
    body: `## Goal
Raise paid conversion from new mobile users.

## Plan
- Test urgency-focused vs outcome-focused headline variants.
- Keep pricing and benefits sections unchanged.`,
    comment: null,
    authorId: DEMO_IDS.users.marc,
    createdAt: hoursAgo(160),
  },
  {
    id: "00000000-0000-4000-8000-000000002011",
    taskId: DEMO_IDS.tasks.mobile_1,
    revisionNumber: 2,
    body: `## Goal
Raise paid conversion from new mobile users.

## Plan
- Test urgency-focused vs outcome-focused headline variants.
- Keep pricing and benefits sections unchanged.
- Evaluate conversion after 5k exposures.`,
    comment: "Add sample size and evaluation threshold before launch.",
    authorId: DEMO_IDS.users.priya,
    createdAt: hoursAgo(44),
  },
  {
    id: "00000000-0000-4000-8000-000000002012",
    taskId: DEMO_IDS.tasks.mobile_2,
    revisionNumber: 1,
    body: `## Goal
Understand where referral traffic stalls in the funnel.

## Plan
- Segment by source campaign and platform.
- Compare conversion against baseline paid traffic.
- Propose top two fixes for underperforming steps.`,
    comment: null,
    authorId: DEMO_IDS.users.priya,
    createdAt: hoursAgo(70),
  },
  {
    id: "00000000-0000-4000-8000-000000002013",
    taskId: DEMO_IDS.tasks.mobile_3,
    revisionNumber: 1,
    body: `## Goal
Prepare implementation plan for CRM-triggered lifecycle campaigns.

## Draft scope
- Define event contract for signup, activation, and churn risk.
- Align ownership between growth and platform teams.
- Sequence rollout behind a feature flag.`,
    comment: null,
    authorId: DEMO_IDS.users.eva,
    createdAt: hoursAgo(30),
  },
];

const seededApprovals: ApprovalSeed[] = [
  {
    id: "00000000-0000-4000-8000-000000003001",
    taskId: DEMO_IDS.tasks.web_1,
    userId: DEMO_IDS.users.marc,
    revisionNumber: 3,
    createdAt: hoursAgo(34),
  },
  {
    id: "00000000-0000-4000-8000-000000003002",
    taskId: DEMO_IDS.tasks.web_2,
    userId: DEMO_IDS.users.eva,
    revisionNumber: 2,
    createdAt: hoursAgo(13),
  },
  {
    id: "00000000-0000-4000-8000-000000003003",
    taskId: DEMO_IDS.tasks.web_4,
    userId: DEMO_IDS.users.theo,
    revisionNumber: 1,
    createdAt: hoursAgo(11),
  },
  {
    id: "00000000-0000-4000-8000-000000003004",
    taskId: DEMO_IDS.tasks.mobile_1,
    userId: DEMO_IDS.users.eva,
    revisionNumber: 2,
    createdAt: hoursAgo(27),
  },
];

const seededCodexRuns: CodexRunSeed[] = [
  {
    id: "00000000-0000-4000-8000-000000004001",
    taskId: DEMO_IDS.tasks.web_1,
    revisionNumber: 3,
    triggeredBy: DEMO_IDS.users.marc,
    status: "completed",
    outputUrl: "https://github.com/demo/web-platform/pull/42",
    errorMessage: null,
    startedAt: hoursAgo(34),
    completedAt: hoursAgo(33),
    createdAt: hoursAgo(34),
  },
  {
    id: "00000000-0000-4000-8000-000000004002",
    taskId: DEMO_IDS.tasks.web_2,
    revisionNumber: 2,
    triggeredBy: DEMO_IDS.users.eva,
    status: "running",
    outputUrl: null,
    errorMessage: null,
    startedAt: hoursAgo(13),
    completedAt: null,
    createdAt: hoursAgo(13),
  },
  {
    id: "00000000-0000-4000-8000-000000004003",
    taskId: DEMO_IDS.tasks.web_4,
    revisionNumber: 1,
    triggeredBy: DEMO_IDS.users.theo,
    status: "failed",
    outputUrl: null,
    errorMessage: "Lint failed in generated branch. Awaiting retry.",
    startedAt: hoursAgo(11),
    completedAt: hoursAgo(10),
    createdAt: hoursAgo(11),
  },
  {
    id: "00000000-0000-4000-8000-000000004004",
    taskId: DEMO_IDS.tasks.mobile_1,
    revisionNumber: 2,
    triggeredBy: DEMO_IDS.users.eva,
    status: "completed",
    outputUrl: "https://github.com/demo/mobile-growth/pull/19",
    errorMessage: null,
    startedAt: hoursAgo(27),
    completedAt: hoursAgo(26),
    createdAt: hoursAgo(27),
  },
];

async function seedDemoData() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Set it in your environment before seeding.",
    );
  }

  await db.transaction(async (tx) => {
    for (const user of seededUsers) {
      await tx
        .insert(users)
        .values(user)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt,
          },
        });
    }

    for (const project of seededProjects) {
      await tx
        .insert(projects)
        .values(project)
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            name: project.name,
            description: project.description,
            ownerId: project.ownerId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          },
        });
    }

    for (const member of seededProjectMembers) {
      await tx
        .insert(projectMembers)
        .values(member)
        .onConflictDoUpdate({
          target: [projectMembers.projectId, projectMembers.userId],
          set: {
            role: member.role,
            joinedAt: member.joinedAt,
          },
        });
    }

    for (const task of seededTasks) {
      await tx
        .insert(tasks)
        .values(task)
        .onConflictDoUpdate({
          target: tasks.id,
          set: {
            projectId: task.projectId,
            number: task.number,
            title: task.title,
            body: task.body,
            status: task.status,
            authorId: task.authorId,
            currentRevision: task.currentRevision,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          },
        });
    }

    for (const revision of seededTaskRevisions) {
      await tx
        .insert(taskRevisions)
        .values(revision)
        .onConflictDoUpdate({
          target: [taskRevisions.taskId, taskRevisions.revisionNumber],
          set: {
            body: revision.body,
            comment: revision.comment,
            authorId: revision.authorId,
            createdAt: revision.createdAt,
          },
        });
    }

    for (const approval of seededApprovals) {
      await tx
        .insert(approvals)
        .values(approval)
        .onConflictDoUpdate({
          target: approvals.id,
          set: {
            taskId: approval.taskId,
            userId: approval.userId,
            revisionNumber: approval.revisionNumber,
            createdAt: approval.createdAt,
          },
        });
    }

    for (const run of seededCodexRuns) {
      await tx
        .insert(codexRuns)
        .values(run)
        .onConflictDoUpdate({
          target: codexRuns.id,
          set: {
            taskId: run.taskId,
            revisionNumber: run.revisionNumber,
            triggeredBy: run.triggeredBy,
            status: run.status,
            outputUrl: run.outputUrl,
            errorMessage: run.errorMessage,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            createdAt: run.createdAt,
          },
        });
    }
  });
}

async function main() {
  await seedDemoData();
  console.log(
    `Seeded demo data: ${seededUsers.length} users, ${seededProjects.length} projects, ${seededTasks.length} tasks.`,
  );
}

main()
  .catch((err) => {
    process.exitCode = 1;
    console.error("Failed to seed demo data:", err);
  })
  .finally(async () => {
    await closeDbConnection();
  });
