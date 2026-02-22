import { useState, useEffect } from "react";
import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
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
    dropdownBg: theme === "dark" ? "#2a2a2a" : "#fff",
    hoverBg: theme === "dark" ? "#333" : "#f5f5f5",
    errorBg: theme === "dark" ? "#3a1a1a" : "#ffebee",
    errorText: theme === "dark" ? "#ef5350" : "#c62828",
  };
}

const propsSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  actorUserId: z.string().nullable().optional(),
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
  description: "Display tasks for a project with status toggle and project switching",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Task = Props["tasks"][number];

const DONE_STATUSES = ["done", "approved"];

function StatusIcon({ done, colors }: { done: boolean; colors: ReturnType<typeof useColors> }) {
  if (done) {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: colors.successBg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={colors.successIcon} stroke="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: colors.iconBg,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
      </svg>
    </div>
  );
}

export default function TasksByProject() {
  const { props, isPending: isLoading } = useWidget<Props>();
  const colors = useColors();

  const { callToolAsync: setStatus } = useCallTool("set-task-status" as any);
  const { callToolAsync: fetchProjects } = useCallTool("list-project-options" as any);
  const { callToolAsync: fetchTasks } = useCallTool("list-tasks-data" as any);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState({ open: 0, total: 0 });
  const [projectName, setProjectName] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState("");

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [switchingProject, setSwitchingProject] = useState(false);

  useEffect(() => {
    if (!isLoading && props.tasks) {
      setTasks(props.tasks ?? []);
      setCounts(props.counts ?? { open: 0, total: 0 });
      setProjectName(props.projectName ?? "");
      setCurrentProjectId(props.projectId ?? "");
    }
  }, [isLoading, props]);

  const handleToggleStatus = async (task: Task) => {
    setTogglingId(task.id);
    setErrorMsg(null);
    const newStatus = DONE_STATUSES.includes(task.status) ? "draft" : "done";
    const previousTasks = tasks;
    const previousCounts = counts;

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );
    const newOpen = tasks.filter((t) => {
      const s = t.id === task.id ? newStatus : t.status;
      return !DONE_STATUSES.includes(s);
    }).length;
    setCounts({ open: newOpen, total: tasks.length });

    try {
      await setStatus({ taskId: task.id, status: newStatus });
    } catch {
      setTasks(previousTasks);
      setCounts(previousCounts);
      setErrorMsg("Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenDropdown = async () => {
    if (dropdownOpen) {
      setDropdownOpen(false);
      return;
    }
    setDropdownOpen(true);
    if (projectOptions.length > 0) return;

    setLoadingProjects(true);
    try {
      const result = await fetchProjects({});
      const content = result?.structuredContent as any;
      if (content?.options) {
        setProjectOptions(content.options);
      }
    } catch {
      setErrorMsg("Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSwitchProject = async (id: string, name: string) => {
    setDropdownOpen(false);
    if (id === currentProjectId) return;

    setSwitchingProject(true);
    setErrorMsg(null);
    try {
      const result = await fetchTasks({ projectId: id });
      const content = result?.structuredContent as any;
      if (content) {
        setTasks(content.tasks ?? []);
        setCounts(content.counts ?? { open: 0, total: 0 });
        setProjectName(content.projectName ?? name);
        setCurrentProjectId(id);
      }
    } catch {
      setErrorMsg("Failed to load tasks");
    } finally {
      setSwitchingProject(false);
    }
  };

  if (isLoading) {
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
        backgroundColor: colors.bg, color: colors.text,
        border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20,
      }}>
        {errorMsg && (
          <div style={{
            padding: "8px 12px", marginBottom: 12, borderRadius: 8,
            backgroundColor: colors.errorBg, color: colors.errorText, fontSize: 13,
          }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Tasks by project</h2>
          <span style={{ marginLeft: "auto" }} />
          <span style={{
            padding: "3px 10px", fontSize: 12, fontWeight: 600, borderRadius: 12,
            backgroundColor: colors.infoBg, color: colors.infoText,
          }}>
            {counts.open}/{counts.total} open
          </span>
        </div>

        {/* Project selector dropdown */}
        <div style={{ position: "relative", marginBottom: 14 }}>
          <div
            onClick={handleOpenDropdown}
            style={{
              padding: "8px 12px",
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              backgroundColor: colors.cardBg,
              fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer",
              opacity: switchingProject ? 0.6 : 1,
            }}
          >
            <span>{switchingProject ? "Loading..." : projectName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0,
              marginTop: 4, zIndex: 10,
              border: `1px solid ${colors.border}`, borderRadius: 8,
              backgroundColor: colors.dropdownBg,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              maxHeight: 200, overflowY: "auto",
            }}>
              {loadingProjects ? (
                <div style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary }}>
                  Loading projects...
                </div>
              ) : projectOptions.length === 0 ? (
                <div style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary }}>
                  No projects found
                </div>
              ) : (
                projectOptions.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSwitchProject(p.id, p.name)}
                    style={{
                      padding: "10px 16px", fontSize: 14, cursor: "pointer",
                      backgroundColor: p.id === currentProjectId ? colors.hoverBg : "transparent",
                      fontWeight: p.id === currentProjectId ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.hoverBg; }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        p.id === currentProjectId ? colors.hoverBg : "transparent";
                    }}
                  >
                    {p.name}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          {tasks.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textSecondary, fontSize: 14 }}>
              No tasks for this project
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks.map((task) => {
                const done = DONE_STATUSES.includes(task.status);
                const isToggling = togglingId === task.id;
                return (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
                    <StatusIcon done={done} colors={colors} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>
                        {projectName} · {done ? "Done" : task.status.replace("_", " ")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleStatus(task)}
                      disabled={isToggling}
                      style={{
                        padding: "4px 14px", fontSize: 13,
                        border: `1px solid ${colors.buttonBorder}`,
                        borderRadius: 20, backgroundColor: colors.bg,
                        cursor: isToggling ? "wait" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: isToggling ? 0.5 : 1,
                        color: colors.text,
                      }}
                    >
                      {isToggling ? "..." : done ? "Reopen" : "Done"}
                    </button>
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
