import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

function useColors() {
  const theme = useWidgetTheme();
  return {
    bg: theme === "dark" ? "#1e1e1e" : "#ffffff",
    cardBg: theme === "dark" ? "#262626" : "#fafafa",
    text: theme === "dark" ? "#e0e0e0" : "#1a1a1a",
    textSecondary: theme === "dark" ? "#a0a0a0" : "#666",
    border: theme === "dark" ? "#363636" : "#e5e5e5",
    infoBg: theme === "dark" ? "#1a3a5c" : "#e3f2fd",
    infoText: theme === "dark" ? "#64b5f6" : "#1565c0",
    successBg: theme === "dark" ? "#1b5e20" : "#e8f5e9",
    successIcon: theme === "dark" ? "#66bb6a" : "#2e7d32",
    iconBg: theme === "dark" ? "#333" : "#eee",
    buttonBorder: theme === "dark" ? "#555" : "#ccc",
  };
}

const propsSchema = z.object({
  projectName: z.string(),
  tasks: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      status: z.string(),
    }),
  ),
  counts: z.object({ open: z.number(), total: z.number() }),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display tasks for a project with status counts",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

const DONE_STATUSES = ["done", "approved"];

function StatusIcon({ done, colors }: { done: boolean; colors: ReturnType<typeof useColors> }) {
  if (done) {
    return (
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: colors.successBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={colors.successIcon} stroke="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.iconBg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
      </svg>
    </div>
  );
}

export default function TasksByProject() {
  const { props, isPending } = useWidget<Props>();
  const colors = useColors();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading tasks...
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Tasks by project</h2>
          <span style={{ marginLeft: "auto" }} />
          <span style={{
            padding: "3px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 12,
            backgroundColor: colors.infoBg,
            color: colors.infoText,
          }}>
            {props.counts.open}/{props.counts.total} open
          </span>
        </div>

        <div style={{
          padding: "8px 12px",
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          backgroundColor: colors.cardBg,
          fontSize: 14,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>{props.projectName}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          {props.tasks.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textSecondary, fontSize: 14 }}>
              No tasks for this project
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {props.tasks.map((task) => {
                const done = DONE_STATUSES.includes(task.status);
                return (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 0",
                    }}
                  >
                    <StatusIcon done={done} colors={colors} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>
                        {props.projectName} · {done ? "Done" : task.status.replace("_", " ")}
                      </div>
                    </div>
                    <span style={{
                      padding: "4px 14px",
                      fontSize: 13,
                      border: `1px solid ${colors.buttonBorder}`,
                      borderRadius: 20,
                      backgroundColor: colors.bg,
                      cursor: "default",
                      whiteSpace: "nowrap",
                    }}>
                      {done ? "Reopen" : "Done"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
