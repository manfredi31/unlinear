import { useState } from "react";
import { McpUseProvider, useCallTool, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
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
  description: "Display a list of all projects",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function ProjectsList() {
  const { props, isPending } = useWidget<Props>();
  const { callTool: getProjectRaw, isPending: isOpeningProject } = useCallTool("get-project");
  const getProject = getProjectRaw as (
    input: { projectId: string },
    options?: { onSettled?: () => void },
  ) => void;
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const colors = useColors();

  const handleOpenProject = (projectId: string) => {
    setOpeningProjectId(projectId);
    getProject(
      { projectId },
      {
        onSettled: () => setOpeningProjectId(null),
      },
    );
  };

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading projects...
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 20, backgroundColor: colors.bg, color: colors.text }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Projects</h2>
          <span style={{
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 12,
            backgroundColor: colors.accent,
            color: colors.accentText,
          }}>
            {props.projects.length}
          </span>
        </div>

        {props.projects.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: colors.textSecondary }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>
              {"{ }"}
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>No projects yet</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {props.projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => handleOpenProject(project.id)}
                disabled={isOpeningProject}
                style={{
                  width: "100%",
                  textAlign: "left",
                  font: "inherit",
                  padding: 14,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  backgroundColor: colors.cardBg,
                  cursor: isOpeningProject ? "wait" : "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{project.name}</h3>
                  <span style={{ fontSize: 11, color: colors.textSecondary, fontFamily: "monospace" }}>
                    {openingProjectId === project.id ? "Opening..." : project.id.slice(0, 8)}
                  </span>
                </div>
                {project.description && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textSecondary, lineHeight: 1.4 }}>
                    {project.description}
                  </p>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: colors.textSecondary }}>
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
