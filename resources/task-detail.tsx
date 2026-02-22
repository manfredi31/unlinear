import React from "react";
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
    badgeBg: theme === "dark" ? "#3a2a5a" : "#f3e8ff",
    badgeText: theme === "dark" ? "#c084fc" : "#7c3aed",
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
    commentBarColors: ["#7c3aed", "#059669", "#d97706", "#2563eb", "#e11d48"],
  };
}

const propsSchema = z.object({
  title: z.string(),
  status: z.string(),
  body: z.string(),
  revisions: z.array(
    z.object({
      revisionNumber: z.number(),
      comment: z.string().nullable(),
      authorId: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display task detail with plan and revision history",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const statusMap: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: colors.statusDraftBg, text: colors.statusDraftText, label: "Draft" },
    in_review: { bg: colors.statusReviewBg, text: colors.statusReviewText, label: "In Review" },
    approved: { bg: colors.statusApprovedBg, text: colors.statusApprovedText, label: "Approved" },
    building: { bg: colors.statusBuildingBg, text: colors.statusBuildingText, label: "Building" },
    done: { bg: colors.statusDoneBg, text: colors.statusDoneText, label: "Done" },
  };
  const s = statusMap[status] ?? statusMap.draft;
  return (
    <span style={{
      padding: "2px 10px",
      fontSize: 11,
      fontWeight: 600,
      borderRadius: 10,
      backgroundColor: s.bg,
      color: s.text,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    }}>
      {s.label}
    </span>
  );
}

function SimpleMarkdown({ content, colors }: { content: string; colors: ReturnType<typeof useColors> }) {
  const lines = content.split("\n");
  const elements: React.ReactElement[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    if (listType === "ol") {
      elements.push(
        <ol key={key++} style={{ margin: "8px 0", paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
          {listItems.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      );
    } else {
      elements.push(
        <ul key={key++} style={{ margin: "8px 0", paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
          {listItems.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    }
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={key++} style={{ margin: "16px 0 8px", fontSize: 18, fontWeight: 700 }}>{trimmed.slice(2)}</h2>);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={key++} style={{ margin: "14px 0 6px", fontSize: 16, fontWeight: 600 }}>{trimmed.slice(3)}</h3>);
    } else if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={key++} style={{ margin: "12px 0 4px", fontSize: 14, fontWeight: 600 }}>{trimmed.slice(4)}</h4>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+\.\s/, ""));
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(trimmed.slice(2));
    } else {
      flushList();
      elements.push(<p key={key++} style={{ margin: "6px 0", fontSize: 14, lineHeight: 1.6, color: colors.text }}>{trimmed}</p>);
    }
  }
  flushList();

  return <div>{elements}</div>;
}

export default function TaskDetail() {
  const { props, isPending } = useWidget<Props>();
  const colors = useColors();

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading task...
        </div>
      </McpUseProvider>
    );
  }

  const comments = props.revisions.filter((r) => r.comment);

  return (
    <McpUseProvider autoSize>
      <div style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, flex: 1 }}>{props.title}</h2>
          <StatusBadge status={props.status} colors={colors} />
        </div>

        <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: 16, marginBottom: 16 }}>
          <SimpleMarkdown content={props.body} colors={colors} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Revisions</h3>
            <span style={{ marginLeft: "auto" }} />
            <span style={{
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 10,
              backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
            }}>
              {comments.length}
            </span>
          </div>

          {comments.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: colors.textSecondary, fontSize: 13 }}>
              No revision comments yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {comments.map((rev, i) => {
                const barColor = colors.commentBarColors[i % colors.commentBarColors.length];
                return (
                  <div key={rev.revisionNumber} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                    <div style={{
                      width: 3,
                      borderRadius: 2,
                      backgroundColor: barColor,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          Revision {rev.revisionNumber}
                        </span>
                        <span style={{ fontSize: 11, color: colors.textSecondary }}>
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.5 }}>
                        {rev.comment}
                      </div>
                    </div>
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
