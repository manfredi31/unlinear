import React, { useState, useEffect } from "react";
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
    buttonPrimaryBg: theme === "dark" ? "#6d28d9" : "#7c3aed",
    buttonPrimaryText: "#fff",
    buttonSecondaryBg: theme === "dark" ? "#333" : "#f5f5f5",
    buttonSecondaryText: theme === "dark" ? "#e0e0e0" : "#333",
    inputBg: theme === "dark" ? "#2a2a2a" : "#fff",
    errorBg: theme === "dark" ? "#3a1a1a" : "#ffebee",
    errorText: theme === "dark" ? "#ef5350" : "#c62828",
    successBg: theme === "dark" ? "#1b3a1b" : "#e8f5e9",
    successText: theme === "dark" ? "#66bb6a" : "#2e7d32",
    diffAddBg: theme === "dark" ? "#1a2e1a" : "#e6ffec",
    diffAddText: theme === "dark" ? "#4ade80" : "#116329",
    diffRemoveBg: theme === "dark" ? "#2e1a1a" : "#ffebe9",
    diffRemoveText: theme === "dark" ? "#f87171" : "#82071e",
    diffLineBg: theme === "dark" ? "#1a1a2e" : "#f0f0ff",
    diffLineText: theme === "dark" ? "#60a5fa" : "#2563eb",
    tabActiveBg: theme === "dark" ? "#333" : "#fff",
    tabInactiveBg: theme === "dark" ? "#1e1e1e" : "#f5f5f5",
    dropdownBg: theme === "dark" ? "#2a2a2a" : "#fff",
    hoverBg: theme === "dark" ? "#333" : "#f5f5f5",
  };
}

const propsSchema = z.object({
  taskId: z.string(),
  projectId: z.string().optional(),
  title: z.string(),
  status: z.string(),
  body: z.string(),
  actorUserId: z.string().nullable().optional(),
  reviewers: z.array(
    z.object({
      userId: z.string(),
      userName: z.string(),
      userAvatarUrl: z.string().nullable().optional(),
    }),
  ).optional(),
  revisions: z.array(
    z.object({
      revisionNumber: z.number(),
      body: z.string().optional(),
      comment: z.string().nullable(),
      authorId: z.string(),
      authorName: z.string().optional(),
      authorAvatarUrl: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Display task detail with plan, revision diffs, reviewers, status control, and comment form",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Revision = Props["revisions"][number];
type Reviewer = NonNullable<Props["reviewers"]>[number];

const STATUSES = ["draft", "in_review", "approved", "building", "done"] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  building: "Building",
  done: "Done",
};

function statusStyle(status: string, colors: ReturnType<typeof useColors>) {
  const map: Record<string, { bg: string; text: string }> = {
    draft: { bg: colors.statusDraftBg, text: colors.statusDraftText },
    in_review: { bg: colors.statusReviewBg, text: colors.statusReviewText },
    approved: { bg: colors.statusApprovedBg, text: colors.statusApprovedText },
    building: { bg: colors.statusBuildingBg, text: colors.statusBuildingText },
    done: { bg: colors.statusDoneBg, text: colors.statusDoneText },
  };
  return map[status] ?? map.draft;
}

// ---- Simple inline diff ----

interface DiffLine {
  type: "add" | "remove" | "context" | "hunk";
  content: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  const lcs = longestCommonSubsequence(oldLines, newLines);
  let oi = 0, ni = 0, li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && ni < newLines.length && oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
      result.push({ type: "context", content: oldLines[oi] });
      oi++; ni++; li++;
    } else if (li < lcs.length && oi < oldLines.length && oldLines[oi] !== lcs[li]) {
      result.push({ type: "remove", content: oldLines[oi] });
      oi++;
    } else if (li < lcs.length && ni < newLines.length && newLines[ni] !== lcs[li]) {
      result.push({ type: "add", content: newLines[ni] });
      ni++;
    } else if (li >= lcs.length && oi < oldLines.length) {
      result.push({ type: "remove", content: oldLines[oi] });
      oi++;
    } else if (li >= lcs.length && ni < newLines.length) {
      result.push({ type: "add", content: newLines[ni] });
      ni++;
    } else {
      break;
    }
  }

  return collapseDiff(result);
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return [];

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

function collapseDiff(lines: DiffLine[]): DiffLine[] {
  const CONTEXT = 3;
  const result: DiffLine[] = [];
  const changeIndices = lines.map((l, i) => l.type !== "context" ? i : -1).filter((i) => i >= 0);
  if (changeIndices.length === 0) return [{ type: "hunk", content: "No changes" }];

  const shown = new Set<number>();
  for (const idx of changeIndices) {
    for (let i = Math.max(0, idx - CONTEXT); i <= Math.min(lines.length - 1, idx + CONTEXT); i++) {
      shown.add(i);
    }
  }

  let lastShown = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!shown.has(i)) continue;
    if (lastShown >= 0 && i - lastShown > 1) {
      const skipped = i - lastShown - 1;
      result.push({ type: "hunk", content: `@@ ${skipped} unchanged line${skipped > 1 ? "s" : ""} @@` });
    }
    result.push(lines[i]);
    lastShown = i;
  }

  return result;
}

// ---- Markdown renderer ----

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
        </ol>,
      );
    } else {
      elements.push(
        <ul key={key++} style={{ margin: "8px 0", paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
          {listItems.map((item, i) => <li key={i}>{item}</li>)}
        </ul>,
      );
    }
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); continue; }
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

// ---- Components ----

function StatusDropdown({
  status,
  colors,
  onChangeStatus,
  isUpdating,
}: {
  status: string;
  colors: ReturnType<typeof useColors>;
  onChangeStatus: (s: string) => void;
  isUpdating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = statusStyle(status, colors);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isUpdating}
        style={{
          padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 10,
          backgroundColor: s.bg, color: s.text, border: `1px solid ${s.text}33`,
          cursor: isUpdating ? "wait" : "pointer",
          textTransform: "uppercase", letterSpacing: 0.5,
          display: "flex", alignItems: "center", gap: 6,
          opacity: isUpdating ? 0.6 : 1,
        }}
      >
        {isUpdating ? "..." : STATUS_LABELS[status] ?? status}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 20,
          border: `1px solid ${colors.border}`, borderRadius: 8,
          backgroundColor: colors.dropdownBg,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          minWidth: 140, overflow: "hidden",
        }}>
          {STATUSES.map((st) => {
            const stStyle = statusStyle(st, colors);
            const isCurrent = st === status;
            return (
              <div
                key={st}
                onClick={() => { if (!isCurrent) { onChangeStatus(st); setOpen(false); } }}
                style={{
                  padding: "8px 14px", fontSize: 13, cursor: isCurrent ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  backgroundColor: isCurrent ? colors.hoverBg : "transparent",
                  fontWeight: isCurrent ? 600 : 400,
                  color: colors.text,
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = colors.hoverBg; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: stStyle.text, flexShrink: 0,
                }} />
                {STATUS_LABELS[st]}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewersList({
  reviewers,
  colors,
  onAddReviewer,
  onRemoveReviewer,
  projectId,
}: {
  reviewers: Reviewer[];
  colors: ReturnType<typeof useColors>;
  onAddReviewer: (userId: string) => void;
  onRemoveReviewer: (userId: string) => void;
  projectId?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [members, setMembers] = useState<{ userId: string; userName: string; role: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const { callToolAsync: fetchMembers } = useCallTool("list-project-members" as any);

  const handleOpenPicker = async () => {
    if (showPicker) { setShowPicker(false); return; }
    setShowPicker(true);
    if (members.length > 0 || !projectId) return;
    setLoadingMembers(true);
    try {
      const result = await fetchMembers({ projectId } as any);
      const content = result?.structuredContent as any;
      if (content?.members) setMembers(content.members);
    } catch { /* ignore */ }
    finally { setLoadingMembers(false); }
  };

  const reviewerIds = new Set(reviewers.map((r) => r.userId));

  return (
    <div style={{
      borderTop: `1px solid ${colors.border}`, paddingTop: 14, marginTop: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Reviewers</span>
        <span style={{ marginLeft: "auto" }} />
        <button
          onClick={handleOpenPicker}
          style={{
            padding: "2px 8px", fontSize: 11, fontWeight: 500,
            border: `1px solid ${colors.border}`, borderRadius: 6,
            backgroundColor: colors.buttonSecondaryBg, color: colors.buttonSecondaryText,
            cursor: "pointer",
          }}
        >
          {showPicker ? "Close" : "+ Add"}
        </button>
      </div>

      {reviewers.length === 0 && !showPicker && (
        <div style={{ fontSize: 12, color: colors.textSecondary, padding: "4px 0" }}>
          No reviewers yet
        </div>
      )}

      {reviewers.map((r) => (
        <div key={r.userId} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
        }}>
          {r.userAvatarUrl ? (
            <img src={r.userAvatarUrl} alt={r.userName} style={{
              width: 22, height: 22, borderRadius: "50%", objectFit: "cover",
            }} />
          ) : (
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              backgroundColor: colors.badgeBg, color: colors.badgeText,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700,
            }}>
              {r.userName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
            </div>
          )}
          <span style={{ fontSize: 13, flex: 1 }}>{r.userName}</span>
          <button
            onClick={() => onRemoveReviewer(r.userId)}
            style={{
              padding: 0, border: "none", background: "none",
              color: colors.textSecondary, cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}
            title="Remove reviewer"
          >
            ×
          </button>
        </div>
      ))}

      {showPicker && (
        <div style={{
          marginTop: 8, border: `1px solid ${colors.border}`, borderRadius: 8,
          backgroundColor: colors.dropdownBg, maxHeight: 160, overflowY: "auto",
        }}>
          {loadingMembers ? (
            <div style={{ padding: 10, fontSize: 12, color: colors.textSecondary }}>Loading members...</div>
          ) : members.filter((m) => !reviewerIds.has(m.userId)).length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: colors.textSecondary }}>
              {members.length === 0 ? "No project members found" : "All members are reviewers"}
            </div>
          ) : (
            members.filter((m) => !reviewerIds.has(m.userId)).map((m) => (
              <div
                key={m.userId}
                onClick={() => { onAddReviewer(m.userId); }}
                style={{
                  padding: "8px 12px", fontSize: 13, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  color: colors.text,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.hoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <span>{m.userName}</span>
                <span style={{ fontSize: 11, color: colors.textSecondary, marginLeft: "auto" }}>{m.role}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DiffView({ oldBody, newBody, colors }: {
  oldBody: string;
  newBody: string;
  colors: ReturnType<typeof useColors>;
}) {
  const diff = computeDiff(oldBody, newBody);

  return (
    <div style={{
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      fontSize: 12, lineHeight: 1.6,
      border: `1px solid ${colors.border}`, borderRadius: 8,
      overflow: "hidden",
    }}>
      {diff.map((line, i) => {
        let bg = "transparent";
        let color = colors.text;
        let prefix = " ";

        if (line.type === "add") {
          bg = colors.diffAddBg; color = colors.diffAddText; prefix = "+";
        } else if (line.type === "remove") {
          bg = colors.diffRemoveBg; color = colors.diffRemoveText; prefix = "-";
        } else if (line.type === "hunk") {
          bg = colors.diffLineBg; color = colors.diffLineText; prefix = "";
        }

        return (
          <div key={i} style={{
            padding: "1px 12px", backgroundColor: bg, color,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            borderBottom: line.type === "hunk" ? `1px solid ${colors.border}` : undefined,
          }}>
            {line.type === "hunk" ? (
              <span style={{ fontStyle: "italic", fontSize: 11 }}>{line.content}</span>
            ) : (
              <>{prefix} {line.content}</>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Tab = "spec" | "revisions" | "activity";

export default function TaskDetail() {
  const { props, isPending: isLoading } = useWidget<Props>();
  const colors = useColors();

  const { callToolAsync: submitComment, isPending: isSubmitting } = useCallTool("comment-on-task" as any);
  const { callToolAsync: refreshTask } = useCallTool("get-task-data" as any);
  const { callToolAsync: setStatusTool } = useCallTool("set-task-status" as any);
  const { callToolAsync: addReviewerTool } = useCallTool("add-task-reviewer" as any);
  const { callToolAsync: removeReviewerTool } = useCallTool("remove-task-reviewer" as any);

  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [commentText, setCommentText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("spec");
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!isLoading && props.revisions) {
      setBody(props.body ?? "");
      setStatus(props.status ?? "draft");
      setRevisions(props.revisions ?? []);
      setReviewers(props.reviewers ?? []);
    }
  }, [isLoading, props]);

  const handleChangeStatus = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    setErrorMsg(null);
    const prevStatus = status;
    setStatus(newStatus);
    try {
      await setStatusTool({ taskId: props.taskId, status: newStatus } as any);
    } catch {
      setStatus(prevStatus);
      setErrorMsg("Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAddReviewer = async (userId: string) => {
    setErrorMsg(null);
    try {
      const result = await addReviewerTool({ taskId: props.taskId, userId } as any);
      const content = result?.structuredContent as any;
      if (content?.reviewers) setReviewers(content.reviewers);
    } catch {
      setErrorMsg("Failed to add reviewer");
    }
  };

  const handleRemoveReviewer = async (userId: string) => {
    setErrorMsg(null);
    const prev = reviewers;
    setReviewers((r) => r.filter((rv) => rv.userId !== userId));
    try {
      const result = await removeReviewerTool({ taskId: props.taskId, userId } as any);
      const content = result?.structuredContent as any;
      if (content?.reviewers) setReviewers(content.reviewers);
    } catch {
      setReviewers(prev);
      setErrorMsg("Failed to remove reviewer");
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmitting) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const actorId = props.actorUserId ?? (props.revisions ?? [])[0]?.authorId;
    if (!actorId) { setErrorMsg("No actor user ID available"); return; }
    if (!props.taskId) { setErrorMsg("No task ID available"); return; }

    try {
      await submitComment({ taskId: props.taskId, comment: commentText, authorId: actorId } as any);
      setCommentText("");
      setSuccessMsg("Comment added — refreshing...");

      const result = await refreshTask({ taskId: props.taskId } as any);
      const content = result?.structuredContent as any;
      if (content) {
        setBody(content.body ?? body);
        setStatus(content.status ?? status);
        setRevisions(content.revisions ?? revisions);
        setReviewers(content.reviewers ?? reviewers);
      }
      setSuccessMsg(null);
    } catch {
      setErrorMsg("Failed to submit comment");
    }
  };

  if (isLoading) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 32, textAlign: "center", color: colors.textSecondary }}>
          Loading task...
        </div>
      </McpUseProvider>
    );
  }

  const comments = revisions.filter((r) => r.comment);
  const revisionsWithBodies = revisions.filter((r) => r.body);
  const baseRevisionNumber = revisionsWithBodies[0]?.revisionNumber ?? 0;
  const revisionsAfterInitialPlan = revisionsWithBodies.slice(1);
  const displayRevisionNumber = (revisionNumber: number) =>
    Math.max(1, revisionNumber - baseRevisionNumber);

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "8px 16px", fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
    border: `1px solid ${colors.border}`,
    borderBottom: activeTab === tab ? `2px solid ${colors.buttonPrimaryBg}` : "1px solid transparent",
    backgroundColor: activeTab === tab ? colors.tabActiveBg : colors.tabInactiveBg,
    color: activeTab === tab ? colors.text : colors.textSecondary,
    cursor: "pointer", borderRadius: "8px 8px 0 0",
    marginBottom: -1,
  });

  return (
    <McpUseProvider autoSize>
      <div style={{
        backgroundColor: colors.bg, color: colors.text,
        border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20,
      }}>
        {/* Header with title and status dropdown */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, flex: 1 }}>{props.title}</h2>
          <StatusDropdown
            status={status}
            colors={colors}
            onChangeStatus={handleChangeStatus}
            isUpdating={isUpdatingStatus}
          />
        </div>

        {/* Reviewers */}
        <ReviewersList
          reviewers={reviewers}
          colors={colors}
          onAddReviewer={handleAddReviewer}
          onRemoveReviewer={handleRemoveReviewer}
          projectId={props.projectId}
        />

        {/* Feedback messages */}
        {errorMsg && (
          <div style={{
            padding: "8px 12px", marginTop: 12, borderRadius: 8,
            backgroundColor: colors.errorBg, color: colors.errorText, fontSize: 13,
          }}>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{
            padding: "8px 12px", marginTop: 12, borderRadius: 8,
            backgroundColor: colors.successBg, color: colors.successText, fontSize: 13,
          }}>
            {successMsg}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 0, marginTop: 16,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={tabStyle("spec")} onClick={() => setActiveTab("spec")}>Specification</div>
          <div style={tabStyle("revisions")} onClick={() => { setActiveTab("revisions"); if (selectedRevision === null && revisionsAfterInitialPlan.length > 0) setSelectedRevision(revisionsAfterInitialPlan[revisionsAfterInitialPlan.length - 1].revisionNumber); }}>
            Revisions
            <span style={{
              marginLeft: 6, padding: "1px 6px", fontSize: 10, fontWeight: 500,
              borderRadius: 8, backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
            }}>
              {revisionsAfterInitialPlan.length}
            </span>
          </div>
          <div style={tabStyle("activity")} onClick={() => setActiveTab("activity")}>
            Activity
            <span style={{
              marginLeft: 6, padding: "1px 6px", fontSize: 10, fontWeight: 500,
              borderRadius: 8, backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
            }}>
              {comments.length}
            </span>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ paddingTop: 16, minHeight: 120 }}>
          {activeTab === "spec" && (
            <SimpleMarkdown content={body} colors={colors} />
          )}

          {activeTab === "revisions" && (
            <div>
              {revisionsAfterInitialPlan.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: colors.textSecondary, fontSize: 13 }}>
                  No revision diffs available yet. Revisions are created when comments are submitted.
                </div>
              ) : (
                <>
                  {/* Revision selector */}
                  <div style={{
                    display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap",
                  }}>
                    {revisionsAfterInitialPlan.map((rev) => {
                      const isSelected = selectedRevision === rev.revisionNumber;
                      return (
                        <button
                          key={rev.revisionNumber}
                          onClick={() => setSelectedRevision(rev.revisionNumber)}
                          style={{
                            padding: "4px 12px", fontSize: 12, fontWeight: isSelected ? 600 : 400,
                            border: `1px solid ${isSelected ? colors.buttonPrimaryBg : colors.border}`,
                            borderRadius: 6,
                            backgroundColor: isSelected ? colors.buttonPrimaryBg : colors.buttonSecondaryBg,
                            color: isSelected ? colors.buttonPrimaryText : colors.buttonSecondaryText,
                            cursor: "pointer",
                          }}
                        >
                          Rev {displayRevisionNumber(rev.revisionNumber)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Diff display */}
                  {selectedRevision !== null && (() => {
                    const revIdx = revisionsWithBodies.findIndex((r) => r.revisionNumber === selectedRevision);
                    if (revIdx < 1) return null;
                    const prevRev = revisionsWithBodies[revIdx - 1];
                    const curRev = revisionsWithBodies[revIdx];
                    const prevLabel =
                      prevRev.revisionNumber === baseRevisionNumber
                        ? "Initial plan"
                        : `Rev ${displayRevisionNumber(prevRev.revisionNumber)}`;
                    return (
                      <div>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                          fontSize: 12, color: colors.textSecondary,
                        }}>
                          <span>{prevLabel}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                          <span style={{ fontWeight: 600, color: colors.text }}>
                            Rev {displayRevisionNumber(curRev.revisionNumber)}
                          </span>
                          {curRev.authorName && (
                            <span style={{ marginLeft: 8 }}>by {curRev.authorName}</span>
                          )}
                          <span style={{ marginLeft: "auto" }}>
                            {new Date(curRev.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {curRev.comment && (
                          <div style={{
                            padding: "8px 12px", marginBottom: 10, borderRadius: 6,
                            backgroundColor: colors.cardBg, fontSize: 13,
                            borderLeft: `3px solid ${colors.buttonPrimaryBg}`,
                          }}>
                            {curRev.comment}
                          </div>
                        )}
                        <DiffView
                          oldBody={prevRev.body ?? ""}
                          newBody={curRev.body ?? ""}
                          colors={colors}
                        />
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {activeTab === "activity" && (
            <div>
              {comments.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: colors.textSecondary, fontSize: 13 }}>
                  No revision comments yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {comments.map((rev, i) => {
                    const barColor = colors.commentBarColors[i % colors.commentBarColors.length];
                    const name = rev.authorName ?? "Unknown";
                    const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={rev.revisionNumber} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                        <div style={{ width: 3, borderRadius: 2, backgroundColor: barColor, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            {rev.authorAvatarUrl ? (
                              <img src={rev.authorAvatarUrl} alt={name} style={{
                                width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                              }} />
                            ) : (
                              <div style={{
                                width: 24, height: 24, borderRadius: "50%",
                                backgroundColor: barColor, color: "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 10, fontWeight: 700, flexShrink: 0, lineHeight: 1,
                              }}>
                                {initials}
                              </div>
                            )}
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
                            <span style={{
                              fontSize: 11, color: colors.textSecondary,
                              padding: "1px 6px", borderRadius: 4,
                              backgroundColor: colors.cardBg,
                            }}>
                              Rev {displayRevisionNumber(rev.revisionNumber)}
                            </span>
                            <span style={{ fontSize: 11, color: colors.textSecondary }}>
                              {new Date(rev.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.5, paddingLeft: 32 }}>
                            {rev.comment}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comment form */}
        <form onSubmit={handleSubmitComment} style={{
          borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginTop: 16,
        }}>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Describe a change to the plan..."
            disabled={isSubmitting}
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", fontSize: 13, lineHeight: 1.5,
              border: `1px solid ${colors.border}`, borderRadius: 8,
              backgroundColor: colors.inputBg, color: colors.text,
              resize: "vertical", fontFamily: "inherit",
              opacity: isSubmitting ? 0.6 : 1,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isSubmitting || !commentText.trim()}
              style={{
                padding: "6px 16px", fontSize: 13, fontWeight: 600,
                border: "none", borderRadius: 8,
                backgroundColor: colors.buttonPrimaryBg, color: colors.buttonPrimaryText,
                cursor: isSubmitting || !commentText.trim() ? "not-allowed" : "pointer",
                opacity: isSubmitting || !commentText.trim() ? 0.5 : 1,
              }}
            >
              {isSubmitting ? "Submitting..." : "Submit Comment"}
            </button>
          </div>
        </form>
      </div>
    </McpUseProvider>
  );
}
