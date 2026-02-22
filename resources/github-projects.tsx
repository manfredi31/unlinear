import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

function useColors() {
  const theme = useWidgetTheme();
  return {
    bg: theme === "dark" ? "#1e1e1e" : "#ffffff",
    cardBg: theme === "dark" ? "#2a2a2a" : "#f5f5f5",
    text: theme === "dark" ? "#e0e0e0" : "#1a1a1a",
    textSecondary: theme === "dark" ? "#a0a0a0" : "#666",
    border: theme === "dark" ? "#363636" : "#e5e5e5",
    iconBg: theme === "dark" ? "#333" : "#eee",
  };
}

const propsSchema = z.object({
  repos: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      stars: z.union([z.string(), z.number()]),
      description: z.string(),
    }),
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display a list of GitHub repositories",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function CodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default function GitHubProjects() {
  const { props, isPending } = useWidget<Props>();
  const colors = useColors();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading repositories...
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 20, backgroundColor: colors.bg, color: colors.text }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ color: colors.textSecondary }}><CodeIcon /></span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: colors.textSecondary }}>
            GitHub Projects
          </h2>
        </div>

        {props.repos.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: colors.textSecondary }}>
            <p style={{ margin: 0, fontSize: 14 }}>No repositories found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {props.repos.map((repo) => (
              <a
                key={repo.id}
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 4px",
                  textDecoration: "none",
                  color: "inherit",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  backgroundColor: colors.iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: colors.textSecondary,
                }}>
                  <CodeIcon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {repo.name}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    ★ {repo.stars} · {repo.description}
                  </div>
                </div>
                <span style={{ color: colors.textSecondary, flexShrink: 0 }}>
                  <ExternalLinkIcon />
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </McpUseProvider>
  );
}
