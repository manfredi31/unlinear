import type {
  users,
  projects,
  projectMembers,
  tasks,
  taskRevisions,
  approvals,
  codexRuns,
} from "./db/schema.js";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TaskRevision = typeof taskRevisions.$inferSelect;
export type NewTaskRevision = typeof taskRevisions.$inferInsert;

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;

export type CodexRun = typeof codexRuns.$inferSelect;
export type NewCodexRun = typeof codexRuns.$inferInsert;
