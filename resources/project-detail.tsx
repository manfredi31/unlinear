import { useState } from "react";
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
    primary: theme === "dark" ? "#4a9eff" : "#0066cc",
    accent: theme === "dark" ? "#2a4a6a" : "#e3f2fd",
    accentText: theme === "dark" ? "#4a9eff" : "#0066cc",
    ownerBg: theme === "dark" ? "#2a3a2a" : "#e8f5e9",
    ownerText: theme === "dark" ? "#66bb6a" : "#2e7d32",
    adminBg: theme === "dark" ? "#3a3a2a" : "#fff8e1",
    adminText: theme === "dark" ? "#ffca28" : "#f57f17",
    memberBg: theme === "dark" ? "#2a2a3a" : "#e8eaf6",
    memberText: theme === "dark" ? "#7986cb" : "#3949ab",
    buttonBg: theme === "dark" ? "#4a9eff" : "#0066cc",
    buttonText: "#fff",
    buttonSecondaryBg: theme === "dark" ? "#333" : "#f5f5f5",
    buttonSecondaryText: theme === "dark" ? "#e0e0e0" : "#333",
    buttonSecondaryBorder: theme === "dark" ? "#555" : "#ccc",
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
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display project details with members and actions",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function RoleBadge({ role, colors }: { role: string; colors: ReturnType<typeof useColors> }) {
  const badgeColors = {
    owner: { bg: colors.ownerBg, text: colors.ownerText },
    admin: { bg: colors.adminBg, text: colors.adminText },
    member: { bg: colors.memberBg, text: colors.memberText },
  };
  const c = badgeColors[role as keyof typeof badgeColors] ?? badgeColors.member;
  return (
    <span style={{
      padding: "2px 8px", fontSize: 11, fontWeight: 600, borderRadius: 10,
      backgroundColor: c.bg, color: c.text, textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {role}
    </span>
  );
}

export default function ProjectDetail() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const colors = useColors();
  const [viewingTasks, setViewingTasks] = useState(false);

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading project...
        </div>
      </McpUseProvider>
    );
  }

  const handleViewTasks = () => {
    setViewingTasks(true);
    sendFollowUpMessage(
      `Show me the tasks for project "${props.name}" (ID: ${props.id})`,
    );
  };

  const handleAskAI = () => {
    sendFollowUpMessage(
      `Summarize project "${props.name}" — it has ${(props.members ?? []).length} member(s). What should we focus on next?`,
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

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={handleViewTasks}
            disabled={viewingTasks}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 600,
              border: "none", borderRadius: 8,
              backgroundColor: colors.buttonBg, color: colors.buttonText,
              cursor: viewingTasks ? "wait" : "pointer",
              opacity: viewingTasks ? 0.6 : 1,
            }}
          >
            {viewingTasks ? "Loading..." : "View Tasks"}
          </button>
          <button
            onClick={handleAskAI}
            style={{
              padding: "8px 18px", fontSize: 13, fontWeight: 500,
              border: `1px solid ${colors.buttonSecondaryBorder}`, borderRadius: 8,
              backgroundColor: colors.buttonSecondaryBg, color: colors.buttonSecondaryText,
              cursor: "pointer",
            }}
          >
            Ask AI
          </button>
        </div>

        <div style={{
          padding: 14, border: `1px solid ${colors.border}`, borderRadius: 8,
          backgroundColor: colors.cardBg, marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: colors.textSecondary, marginBottom: 6 }}>
            Project ID
          </div>
          <code style={{ fontSize: 13, fontFamily: "monospace", color: colors.primary }}>{props.id}</code>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Members</h3>
            <span style={{
              padding: "2px 8px", fontSize: 11, fontWeight: 500, borderRadius: 10,
              backgroundColor: colors.accent, color: colors.accentText,
            }}>
              {(props.members ?? []).length}
            </span>
          </div>

          {(props.members ?? []).length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: colors.textSecondary, fontSize: 13 }}>
              No members
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {props.members.map((member) => (
                <div
                  key={member.userId}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", border: `1px solid ${colors.border}`,
                    borderRadius: 8, backgroundColor: colors.cardBg,
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
