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
    dropdownBg: theme === "dark" ? "#2a2a2a" : "#fff",
    hoverBg: theme === "dark" ? "#333" : "#f5f5f5",
    errorBg: theme === "dark" ? "#3a1a1a" : "#ffebee",
    errorText: theme === "dark" ? "#ef5350" : "#c62828",
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
  };
}

const STATUS_CONFIG: Record<string, { label: string; icon: string }> = {
  draft: { label: "Draft", icon: "circle" },
  in_review: { label: "In Review", icon: "eye" },
  approved: { label: "Approved", icon: "check" },
  building: { label: "Building", icon: "hammer" },
  done: { label: "Done", icon: "check-circle" },
};

function statusColors(status: string, colors: ReturnType<typeof useColors>) {
  const map: Record<string, { bg: string; text: string }> = {
    draft: { bg: colors.statusDraftBg, text: colors.statusDraftText },
    in_review: { bg: colors.statusReviewBg, text: colors.statusReviewText },
    approved: { bg: colors.statusApprovedBg, text: colors.statusApprovedText },
    building: { bg: colors.statusBuildingBg, text: colors.statusBuildingText },
    done: { bg: colors.statusDoneBg, text: colors.statusDoneText },
  };
  return map[status] ?? map.draft;
}

function StatusIcon({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const sc = statusColors(status, colors);

  if (status === "done" || status === "approved") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sc.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  }

  if (status === "in_review") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sc.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (status === "building") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sc.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sc.text} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
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
  description: "Display tasks for a project with status badges and navigation",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Task = Props["tasks"][number];

export default function TasksByProject() {
  const { props, isPending: isLoading, sendFollowUpMessage } = useWidget<Props>();
  const colors = useColors();

  const { callToolAsync: fetchProjects } = useCallTool("list-project-options" as any);
  const { callToolAsync: fetchTasks } = useCallTool("list-tasks-data" as any);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState({ open: 0, total: 0 });
  const [projectName, setProjectName] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState("");
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

  const handleOpenDropdown = async () => {
    if (dropdownOpen) { setDropdownOpen(false); return; }
    setDropdownOpen(true);
    if (projectOptions.length > 0) return;

    setLoadingProjects(true);
    try {
      const result = await fetchProjects({});
      const content = result?.structuredContent as any;
      if (content?.options) setProjectOptions(content.options);
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

  const handleOpenTask = (task: Task) => {
    sendFollowUpMessage(`Open task "${task.title}" (id: ${task.id})`);
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Tasks</h2>
          <span style={{ marginLeft: "auto" }} />
          <span style={{
            padding: "3px 10px", fontSize: 12, fontWeight: 600, borderRadius: 12,
            backgroundColor: colors.infoBg, color: colors.infoText,
          }}>
            {counts.open}/{counts.total} open
          </span>
        </div>

        {/* Project selector */}
        <div style={{ position: "relative", marginBottom: 14 }}>
          <div
            onClick={handleOpenDropdown}
            style={{
              padding: "8px 12px",
              border: `1px solid ${colors.border}`, borderRadius: 8,
              backgroundColor: colors.cardBg, fontSize: 14,
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
                <div style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary }}>Loading projects...</div>
              ) : projectOptions.length === 0 ? (
                <div style={{ padding: "12px 16px", fontSize: 13, color: colors.textSecondary }}>No projects found</div>
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
                      e.currentTarget.style.backgroundColor = p.id === currentProjectId ? colors.hoverBg : "transparent";
                    }}
                  >
                    {p.name}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Task list */}
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 4 }}>
          {tasks.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textSecondary, fontSize: 14 }}>
              No tasks for this project
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {tasks.map((task) => {
                const sc = statusColors(task.status, colors);
                const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.draft;
                return (
                  <div
                    key={task.id}
                    onClick={() => handleOpenTask(task)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 8px",
                      borderBottom: `1px solid ${colors.border}`,
                      cursor: "pointer",
                      borderRadius: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.hoverBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <StatusIcon status={task.status} colors={colors} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>
                        #{task.number} · {projectName}
                      </div>
                    </div>
                    <span style={{
                      padding: "2px 10px", fontSize: 11, fontWeight: 600,
                      borderRadius: 10, whiteSpace: "nowrap",
                      backgroundColor: sc.bg, color: sc.text,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      {cfg.label}
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
