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
      const project = await getProject(projectId);
      if (!project) return error(`Project not found: ${projectId}`);
      return widget({
        props: project,
        output: text(`Project: ${project.name} (${project.members.length} members)`),
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
  },
  async ({ projectId, status }) => {
    try {
      const result = await listTasks({ projectId, status });
      return object({ tasks: result } as any);
    } catch (err) {
      return error(`Failed to list tasks: ${errMsg(err)}`);
    }
  },
);

server.tool(
  {
    name: "get-task",
    description: "Get full task detail with the current plan body",
    schema: z.object({
      taskId: z.string().uuid().describe("Task UUID"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ taskId }) => {
    try {
      const task = await getTask(taskId);
      if (!task) return error(`Task not found: ${taskId}`);
      return object(task as any);
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

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server running on port ${PORT}`);
server.listen(PORT);
