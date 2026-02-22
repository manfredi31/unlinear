import { useState } from "react";
import {
  McpUseProvider,
  useCallTool,
  useWidget,
  useWidgetTheme,
  type WidgetMetadata,
} from "mcp-use/react";
import { z } from "zod";

function useColors() {
  const theme = useWidgetTheme();
  return {
    bg: theme === "dark" ? "#1e1e1e" : "#ffffff",
    cardBg: theme === "dark" ? "#262626" : "#fafafa",
    text: theme === "dark" ? "#e0e0e0" : "#1a1a1a",
    textSecondary: theme === "dark" ? "#a0a0a0" : "#666",
    border: theme === "dark" ? "#363636" : "#e5e5e5",
    primary: theme === "dark" ? "#4a9eff" : "#0066cc",
    accent: theme === "dark" ? "#2a4a6a" : "#e3f2fd",
    accentText: theme === "dark" ? "#4a9eff" : "#0066cc",
    ownerBg: theme === "dark" ? "#2a3a2a" : "#e8f5e9",
    ownerText: theme === "dark" ? "#66bb6a" : "#2e7d32",
    adminBg: theme === "dark" ? "#3a3a2a" : "#fff8e1",
    adminText: theme === "dark" ? "#ffca28" : "#f57f17",
    memberBg: theme === "dark" ? "#2a2a3a" : "#e8eaf6",
    memberText: theme === "dark" ? "#7986cb" : "#3949ab",
    statusDraftBg: theme === "dark" ? "#333" : "#f0f0f0",
    statusDraftText: theme === "dark" ? "#aaa" : "#666",
    statusReviewBg: theme === "dark" ? "#3a3a1a" : "#fffbeb",
    statusReviewText: theme === "dark" ? "#fbbf24" : "#d97706",
    statusApprovedBg: theme === "dark" ? "#1a3a1a" : "#ecfdf5",
    statusApprovedText: theme === "dark" ? "#4ade80" : "#059669",
    statusBuildingBg: theme === "dark" ? "#1a2a3a" : "#eff6ff",
    statusBuildingText: theme === "dark" ? "#60a5fa" : "#2563eb",
    statusDoneBg: theme === "dark" ? "#1b3a1b" : "#e8f5e9",
    statusDoneText: theme === "dark" ? "#66bb6a" : "#2e7d32",
    errorBg: theme === "dark" ? "#3a1a1a" : "#fef2f2",
    errorText: theme === "dark" ? "#f87171" : "#b91c1c",
  };
}

const propsSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  ownerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(
    z.object({
      userId: z.string(),
      role: z.string(),
      joinedAt: z.string(),
      userName: z.string(),
      userEmail: z.string(),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      status: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display project details with members",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type TaskStatus = "draft" | "in_review" | "approved" | "building" | "done";

const STATUS_COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "building", label: "Building" },
  { key: "done", label: "Done" },
];

function RoleBadge({ role, colors }: { role: string; colors: ReturnType<typeof useColors> }) {
  const badgeColors = {
    owner: { bg: colors.ownerBg, text: colors.ownerText },
    admin: { bg: colors.adminBg, text: colors.adminText },
    member: { bg: colors.memberBg, text: colors.memberText },
  };
  const c = badgeColors[role as keyof typeof badgeColors] ?? badgeColors.member;
  return (
    <span style={{
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
      borderRadius: 10,
      backgroundColor: c.bg,
      color: c.text,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    }}>
      {role}
    </span>
  );
}

function TaskStatusBadge({ status, colors }: { status: TaskStatus; colors: ReturnType<typeof useColors> }) {
  const statusMap: Record<TaskStatus, { bg: string; text: string; label: string }> = {
    draft: { bg: colors.statusDraftBg, text: colors.statusDraftText, label: "Draft" },
    in_review: { bg: colors.statusReviewBg, text: colors.statusReviewText, label: "In review" },
    approved: { bg: colors.statusApprovedBg, text: colors.statusApprovedText, label: "Approved" },
    building: { bg: colors.statusBuildingBg, text: colors.statusBuildingText, label: "Building" },
    done: { bg: colors.statusDoneBg, text: colors.statusDoneText, label: "Done" },
  };
  const badge = statusMap[status];
  return (
    <span
      style={{
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 10,
        backgroundColor: badge.bg,
        color: badge.text,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {badge.label}
    </span>
  );
}

export default function ProjectDetail() {
  const { props, isPending } = useWidget<Props>();
  const { callTool: openTaskRaw, isPending: isOpeningTask, isError, error: openTaskError } =
    useCallTool("get-task");
  const openTask = openTaskRaw as (
    input: { taskId: string },
    options?: { onSettled?: () => void },
  ) => void;
  const [openingTaskId, setOpeningTaskId] = useState<string | null>(null);
  const colors = useColors();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading project...
        </div>
      </McpUseProvider>
    );
  }

  const groupedTasks = STATUS_COLUMNS.reduce<Record<TaskStatus, Props["tasks"]>>(
    (acc, column) => {
      acc[column.key] = props.tasks
        .filter((task) => task.status === column.key)
        .sort((a, b) => a.number - b.number);
      return acc;
    },
    {
      draft: [],
      in_review: [],
      approved: [],
      building: [],
      done: [],
    },
  );

  const openTaskErrorMessage =
    openTaskError instanceof Error ? openTaskError.message : "Unable to open task.";

  const handleOpenTask = (taskId: string) => {
    setOpeningTaskId(taskId);
    openTask(
      { taskId },
      {
        onSettled: () => setOpeningTaskId(null),
      },
    );
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 20, backgroundColor: colors.bg, color: colors.text }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{props.name}</h2>
          {props.description && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
              {props.description}
            </p>
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: colors.textSecondary }}>
            <span>Created {new Date(props.createdAt).toLocaleDateString()}</span>
            <span>Updated {new Date(props.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tasks</h3>
            <span
              style={{
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 10,
                backgroundColor: colors.accent,
                color: colors.accentText,
              }}
            >
              {props.tasks.length}
            </span>
          </div>

          {isError && (
            <div
              style={{
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 8,
                backgroundColor: colors.errorBg,
                color: colors.errorText,
                fontSize: 12,
              }}
            >
              {openTaskErrorMessage}
            </div>
          )}

          {props.tasks.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: colors.textSecondary,
                fontSize: 13,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                backgroundColor: colors.cardBg,
              }}
            >
              No tasks in this project
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(200px, 1fr))",
                gap: 10,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              {STATUS_COLUMNS.map((column) => {
                const tasks = groupedTasks[column.key];
                return (
                  <div
                    key={column.key}
                    style={{
                      minWidth: 200,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      backgroundColor: colors.cardBg,
                      padding: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                      <TaskStatusBadge status={column.key} colors={colors} />
                      <span style={{ marginLeft: "auto", fontSize: 12, color: colors.textSecondary }}>
                        {tasks.length}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {tasks.map((task) => {
                        const opening = isOpeningTask && openingTaskId === task.id;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => handleOpenTask(task.id)}
                            disabled={isOpeningTask}
                            style={{
                              textAlign: "left",
                              padding: 10,
                              borderRadius: 8,
                              border: `1px solid ${colors.border}`,
                              backgroundColor: colors.bg,
                              cursor: isOpeningTask ? "wait" : "pointer",
                              color: colors.text,
                            }}
                          >
                            <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>
                              #{task.number}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                              {task.title}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 11, color: colors.textSecondary }}>
                              {opening
                                ? "Opening task..."
                                : `Updated ${new Date(task.updatedAt).toLocaleDateString()}`}
                            </div>
                          </button>
                        );
                      })}

                      {tasks.length === 0 && (
                        <div style={{ fontSize: 12, color: colors.textSecondary, padding: "8px 4px" }}>
                          No tasks
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Members</h3>
            <span style={{
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 10,
              backgroundColor: colors.accent,
              color: colors.accentText,
            }}>
              {props.members.length}
            </span>
          </div>

          {props.members.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textSecondary, fontSize: 13 }}>
              No members
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {props.members.map((member) => (
                <div
                  key={member.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    backgroundColor: colors.cardBg,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{member.userName}</div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>{member.userEmail}</div>
                  </div>
                  <RoleBadge role={member.role} colors={colors} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
