import { AppsSDKUIProvider } from "@openai/apps-sdk-ui/components/AppsSDKUIProvider";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import React from "react";
import "../styles.css";
import { propsSchema, type IssueDetailProps } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Issue detail view — metadata, plan checklist, full markdown body, action buttons",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Loading issue...",
    invoked: "Issue loaded",
  },
};

const statusStyles: Record<string, { cls: string; label: string }> = {
  todo: { cls: "bg-gray-400/15 text-gray-400", label: "To Do" },
  doing: { cls: "bg-amber-400/15 text-amber-400", label: "In Progress" },
  done: { cls: "bg-green-400/15 text-green-400", label: "Done" },
};

const priorityStyles: Record<string, string> = {
  P0: "bg-red-500/15 text-red-400",
  P1: "bg-amber-500/15 text-amber-400",
  P2: "bg-blue-500/15 text-blue-400",
  P3: "bg-gray-500/15 text-gray-400",
};

const IssueDetail: React.FC = () => {
  const { props, isPending, sendFollowUpMessage } = useWidget<IssueDetailProps>();
  const { callTool: setStatus } = useCallTool<{ projectId: string; issueId: string; status: "todo" | "doing" | "done" }>("issue-set-status");

  if (isPending) {
    return (
      <McpUseProvider>
        <div className="p-6 max-w-2xl">
          <div className="h-6 w-48 rounded bg-default/10 animate-pulse mb-3" />
          <div className="h-8 w-80 rounded bg-default/10 animate-pulse mb-4" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 w-full rounded bg-default/10 animate-pulse" />
            ))}
          </div>
        </div>
      </McpUseProvider>
    );
  }

  const { meta, markdown: body } = props;
  const ss = statusStyles[meta.status] ?? statusStyles.todo;
  const pc = priorityStyles[meta.priority] ?? priorityStyles.P3;

  return (
    <McpUseProvider>
      <AppsSDKUIProvider linkComponent="a">
        <div className="p-6 max-w-2xl">
          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="font-mono text-sm text-secondary">{meta.id}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ss.cls}`}>
                {ss.label}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${pc}`}>
                {meta.priority}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-default leading-tight">{meta.title}</h1>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 p-4 bg-surface-elevated rounded-xl mb-5 text-sm">
            <div>
              <span className="text-secondary text-xs">Assignee</span>
              <div className={`mt-0.5 ${meta.assignee ? "text-info" : "text-secondary/50"}`}>
                {meta.assignee ? meta.assignee.replace(/^(person|agent):/, "") : "Unassigned"}
              </div>
            </div>
            <div>
              <span className="text-secondary text-xs">Updated</span>
              <div className="mt-0.5 text-secondary">
                {meta.updated_at ? new Date(meta.updated_at).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>

          {/* Plan */}
          {meta.plan.length > 0 && (
            <div className="mb-5">
              <h3 className="text-base font-semibold text-default mb-2.5">📋 Plan</h3>
              <div className="flex flex-col gap-1.5">
                {meta.plan.map((step, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm text-secondary p-2 rounded-lg border-l-[3px] border-info/20 bg-surface"
                  >
                    <span className="text-info font-semibold shrink-0">{i + 1}.</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Markdown body */}
          <div className="mb-5">
            <h3 className="text-base font-semibold text-default mb-2.5">📝 Details</h3>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-secondary p-4 bg-surface rounded-xl border border-default">
              {body || "No description yet."}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {meta.status !== "doing" && (
              <Button
                color="secondary"
                variant="outline"
                size="md"
                onClick={() => setStatus({ projectId: "alpha", issueId: meta.id, status: "doing" })}
              >
                ▶ Start
              </Button>
            )}
            {meta.status !== "done" && (
              <Button
                color="secondary"
                variant="outline"
                size="md"
                onClick={() => setStatus({ projectId: "alpha", issueId: meta.id, status: "done" })}
              >
                ✅ Done
              </Button>
            )}
            {meta.status !== "todo" && (
              <Button
                color="secondary"
                variant="outline"
                size="md"
                onClick={() => setStatus({ projectId: "alpha", issueId: meta.id, status: "todo" })}
              >
                ↩ Reopen
              </Button>
            )}
            <Button
              color="secondary"
              variant="ghost"
              size="md"
              onClick={() => sendFollowUpMessage(`Brainstorm implementation ideas for issue ${meta.id}: ${meta.title}`)}
            >
              💡 Brainstorm
            </Button>
          </div>
        </div>
      </AppsSDKUIProvider>
    </McpUseProvider>
  );
};

export default IssueDetail;
