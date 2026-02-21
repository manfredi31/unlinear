import { AppsSDKUIProvider } from "@openai/apps-sdk-ui/components/AppsSDKUIProvider";
import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import React from "react";
import "../styles.css";
import { propsSchema, type ProjectBoardProps, type Issue } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Kanban board showing todo/doing/done columns with issue cards",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Loading board...",
    invoked: "Board loaded",
  },
};

const priorityStyles: Record<string, string> = {
  P0: "bg-red-500/15 text-red-400",
  P1: "bg-amber-500/15 text-amber-400",
  P2: "bg-blue-500/15 text-blue-400",
  P3: "bg-gray-500/15 text-gray-400",
};

const columnConfig = {
  todo: { label: "📋 To Do", accent: "border-gray-400/30" },
  doing: { label: "🔨 Doing", accent: "border-amber-400/30" },
  done: { label: "✅ Done", accent: "border-green-400/30" },
} as const;

function IssueCard({ issue, projectId }: { issue: Issue; projectId: string }) {
  const { callTool } = useCallTool<{ projectId: string; issueId: string }>("issue-get");
  const pc = priorityStyles[issue.priority] ?? priorityStyles.P3;

  return (
    <div
      onClick={() => callTool({ projectId, issueId: issue.id })}
      className="bg-surface border border-default rounded-xl p-3 cursor-pointer transition-all duration-150 hover:border-info"
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-sm font-semibold text-default leading-tight">
          {issue.title}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pc} shrink-0`}>
          {issue.priority}
        </span>
      </div>
      <div className="flex justify-between mt-2 text-xs text-secondary">
        <span className="font-mono">{issue.id}</span>
        {issue.assignee && (
          <span className="text-info">
            {issue.assignee.replace(/^(person|agent):/, "")}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({
  name,
  issues,
  projectId,
}: {
  name: keyof typeof columnConfig;
  issues: Issue[];
  projectId: string;
}) {
  const config = columnConfig[name];

  return (
    <div className="flex-1 min-w-[200px]">
      <div className={`flex justify-between items-center mb-3 pb-2 border-b-2 ${config.accent}`}>
        <span className="text-sm font-semibold text-default">{config.label}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-elevated text-secondary">
          {issues.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} projectId={projectId} />
        ))}
        {issues.length === 0 && (
          <div className="py-4 text-center text-xs text-secondary border border-dashed border-default rounded-xl">
            No issues
          </div>
        )}
      </div>
    </div>
  );
}

const ProjectBoard: React.FC = () => {
  const { props, isPending } = useWidget<ProjectBoardProps>();

  if (isPending) {
    return (
      <McpUseProvider>
        <div className="p-6">
          <h2 className="text-xl font-bold text-default mb-4">🗂️ Board</h2>
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 min-w-[200px]">
                <div className="h-5 w-20 rounded bg-default/10 mb-3 animate-pulse" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div key={j} className="h-16 rounded-xl bg-surface border border-default animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider>
      <AppsSDKUIProvider linkComponent="a">
        <div className="p-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-bold text-default">
              🗂️ Board — {props.projectId}
            </h2>
            <span className="text-sm text-secondary">
              {props.total} issue{props.total !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex gap-4">
            <Column name="todo" issues={props.columns.todo} projectId={props.projectId} />
            <Column name="doing" issues={props.columns.doing} projectId={props.projectId} />
            <Column name="done" issues={props.columns.done} projectId={props.projectId} />
          </div>
        </div>
      </AppsSDKUIProvider>
    </McpUseProvider>
  );
};

export default ProjectBoard;
