import { MCPServer, object, text, error, widget } from "mcp-use/server";
import { z } from "zod";
import {
  createProject,
  listProjects,
  getProject,
} from "./src/queries/projects.js";
import {
  createTask,
  getTask,
  listTasks,
  commentOnTask,
  getTaskTimeline,
  updateTaskStatus,
} from "./src/queries/tasks.js";
import { approveTask } from "./src/queries/approvals.js";
import { getCodexRun } from "./src/queries/codex.js";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const server = new MCPServer({
  name: "unlinear",
  title: "unlinear",
  version: "1.0.0",
  description: "Plan-first project management backed by PostgreSQL",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

// ---- Project tools ----

server.tool(
  {
    name: "create-project",
    description: "Create a new project",
    schema: z.object({
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Project description"),
      ownerId: z.string().uuid().describe("UUID of the project owner (user)"),
    }),
  },
  async ({ name, description, ownerId }) => {
    try {
      const project = await createProject({ name, description, ownerId });
      return object(project as any);
    } catch (err) {
      return error(`Failed to create project: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "list-projects",
    description: "List all projects",
    schema: z.object({}),
    annotations: { readOnlyHint: true },
    widget: {
      name: "projects-list",
      invoking: "Loading projects...",
      invoked: "Projects loaded",
    },
  },
  async () => {
    try {
      const projects = await listProjects();
      return widget({
        props: { projects },
        output: text(`Found ${projects.length} project(s)`),
      });
    } catch (err) {
      return error(`Failed to list projects: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "get-project",
    description: "Get project details including members",
    schema: z.object({
      projectId: z.string().uuid().describe("Project UUID"),
    }),
    annotations: { readOnlyHint: true },
    widget: {
      name: "project-detail",
      invoking: "Loading project...",
      invoked: "Project loaded",
    },
  },
  async ({ projectId }) => {
    try {
      const [project, tasks] = await Promise.all([
        getProject(projectId),
        listTasks({ projectId }),
      ]);
      if (!project) return error(`Project not found: ${projectId}`);
      return widget({
        props: {
          ...project,
          tasks: tasks.map((task) => ({
            id: task.id,
            number: task.number,
            title: task.title,
            status: task.status,
            updatedAt: task.updatedAt.toISOString(),
          })),
        },
        output: text(
          `Project: ${project.name} (${tasks.length} tasks, ${project.members.length} members)`,
        ),
      });
    } catch (err) {
      return error(`Failed to get project: ${errMsg(err)}`);
    }
  },
);

// ---- Task tools ----

server.tool(
  {
    name: "create-task",
    description:
      "Create a new task (plan) in a project. The body is the initial plan markdown.",
    schema: z.object({
      projectId: z.string().uuid().describe("Project UUID"),
      title: z.string().describe("Task title"),
      body: z.string().optional().describe("Initial plan markdown"),
      authorId: z.string().uuid().describe("UUID of the task author (user)"),
    }),
  },
  async ({ projectId, title, body, authorId }) => {
    try {
      const task = await createTask({ projectId, title, body, authorId });
      return object(task as any);
    } catch (err) {
      return error(`Failed to create task: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "list-tasks",
    description: "List tasks in a project, optionally filtered by status",
    schema: z.object({
      projectId: z.string().uuid().describe("Project UUID"),
      status: z
        .enum(["draft", "in_review", "approved", "building", "done"])
        .optional()
        .describe("Filter by task status"),
    }),
    annotations: { readOnlyHint: true },
    widget: {
      name: "tasks-by-project",
      invoking: "Loading tasks...",
      invoked: "Tasks loaded",
    },
  },
  async ({ projectId, status }) => {
    try {
      const [project, result] = await Promise.all([
        getProject(projectId),
        listTasks({ projectId, status }),
      ]);
      const projectName = project?.name ?? projectId;
      const openCount = result.filter(
        (t) => !["done", "approved"].includes(t.status),
      ).length;
      return widget({
        props: {
          projectId,
          projectName,
          actorUserId: project?.ownerId ?? null,
          tasks: result.map((t) => ({
            id: t.id,
            number: t.number,
            title: t.title,
            status: t.status,
          })),
          counts: { open: openCount, total: result.length },
        },
        output: text(
          `${projectName}: ${result.length} task(s), ${openCount} open`,
        ),
      });
    } catch (err) {
      return error(`Failed to list tasks: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "get-task",
    description: "Get full task detail with the current plan body and revision history",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
    }),
    annotations: { readOnlyHint: true },
    widget: {
      name: "task-detail",
      invoking: "Loading task...",
      invoked: "Task loaded",
    },
  },
  async ({ taskId }) => {
    try {
      const [task, revisions] = await Promise.all([
        getTask(taskId),
        getTaskTimeline(taskId),
      ]);
      if (!task) return error(`Task not found: ${taskId}`);
      return widget({
        props: {
          taskId: task.id,
          title: task.title,
          status: task.status,
          body: task.body,
          actorUserId: task.authorId,
          revisions: revisions.map((r) => ({
            revisionNumber: r.revisionNumber,
            comment: r.comment,
            authorId: r.authorId,
            authorName: r.authorName,
            authorAvatarUrl: r.authorAvatarUrl,
            createdAt: r.createdAt.toISOString(),
          })),
        },
        output: text(`Task: ${task.title} [${task.status}] (rev ${task.currentRevision})`),
      });
    } catch (err) {
      return error(`Failed to get task: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "comment-on-task",
    description:
      "Add a comment to a task. The LLM rewrites the plan based on the comment and stores a new revision.",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
      comment: z.string().describe("Natural-language comment describing the requested change"),
      authorId: z.string().uuid().describe("UUID of the comment author (user)"),
    }),
  },
  async ({ taskId, comment, authorId }) => {
    try {
      const result = await commentOnTask({ taskId, comment, authorId });
      return object(result as any);
    } catch (err) {
      return error(`Failed to comment on task: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "approve-task",
    description:
      "Approve the current revision of a task. Sets status to approved and queues a Codex run.",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
      userId: z.string().uuid().describe("UUID of the approving user"),
    }),
  },
  async ({ taskId, userId }) => {
    try {
      const result = await approveTask({ taskId, userId });
      return object(result as any);
    } catch (err) {
      return error(`Failed to approve task: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "get-task-timeline",
    description:
      "Get all revisions of a task ordered by revision number (the collaboration history)",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ taskId }) => {
    try {
      const revisions = await getTaskTimeline(taskId);
      return object({ taskId, revisions } as any);
    } catch (err) {
      return error(`Failed to get timeline: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "get-codex-run",
    description: "Check the status of a Codex code generation run",
    schema: z.object({
      runId: z.string().uuid().describe("Codex run UUID"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ runId }) => {
    try {
      const run = await getCodexRun(runId);
      if (!run) return error(`Codex run not found: ${runId}`);
      return object(run as any);
    } catch (err) {
      return error(`Failed to get codex run: ${errMsg(err)}`);
    }
  },
);

// ---- Widget interactivity tools ----

server.tool(
  {
    name: "set-task-status",
    description: "Toggle a task's status (e.g. mark done or reopen)",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
      status: z
        .enum(["draft", "in_review", "approved", "building", "done"])
        .describe("New status"),
    }),
  },
  async ({ taskId, status }) => {
    try {
      const updated = await updateTaskStatus({ taskId, status });
      return object({
        id: updated.id,
        status: updated.status,
      } as any);
    } catch (err) {
      return error(`Failed to update task status: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "list-project-options",
    description: "Return a lightweight list of projects for a selector dropdown",
    schema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const projects = await listProjects();
      return object({
        options: projects.map((p) => ({ id: p.id, name: p.name })),
      } as any);
    } catch (err) {
      return error(`Failed to list project options: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "list-tasks-data",
    description:
      "Return tasks data for a project (used by widgets to refresh after mutations)",
    schema: z.object({
      projectId: z.string().uuid().describe("Project UUID"),
      status: z
        .enum(["draft", "in_review", "approved", "building", "done"])
        .optional()
        .describe("Filter by task status"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ projectId, status }) => {
    try {
      const [project, result] = await Promise.all([
        getProject(projectId),
        listTasks({ projectId, status }),
      ]);
      const projectName = project?.name ?? projectId;
      const openCount = result.filter(
        (t) => !["done", "approved"].includes(t.status),
      ).length;
      return object({
        projectId,
        projectName,
        tasks: result.map((t) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          status: t.status,
        })),
        counts: { open: openCount, total: result.length },
      } as any);
    } catch (err) {
      return error(`Failed to list tasks data: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "get-task-data",
    description:
      "Return full task detail data (used by widgets to refresh after comment/mutation)",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ taskId }) => {
    try {
      const [task, revisions] = await Promise.all([
        getTask(taskId),
        getTaskTimeline(taskId),
      ]);
      if (!task) return error(`Task not found: ${taskId}`);
      return object({
        id: task.id,
        title: task.title,
        status: task.status,
        body: task.body,
        revisions: revisions.map((r) => ({
          revisionNumber: r.revisionNumber,
          comment: r.comment,
          authorId: r.authorId,
          authorName: r.authorName,
          authorAvatarUrl: r.authorAvatarUrl,
          createdAt: r.createdAt.toISOString(),
        })),
      } as any);
    } catch (err) {
      return error(`Failed to get task data: ${errMsg(err)}`);
    }
  },
);

// ---- GitHub tools (stub) ----

server.tool(
  {
    name: "list-github-projects",
    description: "List GitHub repositories (stub — wire to GitHub API later)",
    schema: z.object({
      query: z.string().optional().describe("Search query to filter repos"),
    }),
    annotations: { readOnlyHint: true },
    widget: {
      name: "github-projects",
      invoking: "Loading repositories...",
      invoked: "Repositories loaded",
    },
  },
  async ({ query }) => {
    const repos = [
      { id: "1", name: "vercel/next.js", url: "https://github.com/vercel/next.js", stars: "122k", description: "React framework for the web" },
      { id: "2", name: "torvalds/linux", url: "https://github.com/torvalds/linux", stars: "171k", description: "Linux kernel source tree" },
      { id: "3", name: "tensorflow/tensorflow", url: "https://github.com/tensorflow/tensorflow", stars: "181k", description: "Machine learning for everyone" },
    ];
    const filtered = query
      ? repos.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()))
      : repos;
    return widget({
      props: { repos: filtered },
      output: text(`Found ${filtered.length} repository(ies)`),
    });
  },
);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
server.listen(PORT);
