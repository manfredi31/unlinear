import { useState } from "react";
import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

function useColors() {
  const theme = useWidgetTheme();
  return {
    bg: theme === "dark" ? "#1e1e1e" : "#ffffff",
    cardBg: theme === "dark" ? "#262626" : "#fafafa",
    cardHoverBg: theme === "dark" ? "#2e2e2e" : "#f0f4ff",
    text: theme === "dark" ? "#e0e0e0" : "#1a1a1a",
    textSecondary: theme === "dark" ? "#a0a0a0" : "#666",
    border: theme === "dark" ? "#363636" : "#e5e5e5",
    borderHover: theme === "dark" ? "#4a9eff" : "#0066cc",
    primary: theme === "dark" ? "#4a9eff" : "#0066cc",
    accent: theme === "dark" ? "#2a4a6a" : "#e3f2fd",
    accentText: theme === "dark" ? "#4a9eff" : "#0066cc",
  };
}

const propsSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      ownerId: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a list of all projects — click to view tasks",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function ProjectsList() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const { callTool: viewTasks } = useCallTool("list-tasks" as any);
  const colors = useColors();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading projects...
        </div>
      </McpUseProvider>
    );
  }

  const handleProjectClick = (project: Props["projects"][number]) => {
    setLoadingId(project.id);
    sendFollowUpMessage(`Show me the tasks for project "${project.name}" (ID: ${project.id})`);
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 20, backgroundColor: colors.bg, color: colors.text }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Projects</h2>
          <span style={{
            padding: "4px 10px", fontSize: 12, fontWeight: 500, borderRadius: 12,
            backgroundColor: colors.accent, color: colors.accentText,
          }}>
            {(props.projects ?? []).length}
          </span>
        </div>

        {(props.projects ?? []).length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: colors.textSecondary }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>{"{ }"}</div>
            <p style={{ margin: 0, fontSize: 14 }}>No projects yet</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {props.projects.map((project) => {
              const isHovered = hoveredId === project.id;
              const isLoading = loadingId === project.id;
              return (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project)}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    padding: 14,
                    border: `1px solid ${isHovered ? colors.borderHover : colors.border}`,
                    borderRadius: 8,
                    backgroundColor: isHovered ? colors.cardHoverBg : colors.cardBg,
                    cursor: isLoading ? "wait" : "pointer",
                    transition: "border-color 0.15s, background-color 0.15s",
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{project.name}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isLoading && (
                        <span style={{ fontSize: 11, color: colors.primary }}>Loading...</span>
                      )}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isHovered ? colors.primary : colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                  {project.description && (
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary, lineHeight: 1.4 }}>
                      {project.description}
                    </p>
                  )}
                  <div style={{ marginTop: 8, fontSize: 11, color: colors.textSecondary }}>
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
