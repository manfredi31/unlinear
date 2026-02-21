import { AppsSDKUIProvider } from "@openai/apps-sdk-ui/components/AppsSDKUIProvider";
import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import React from "react";
import "../styles.css";
import { propsSchema, type ProjectsDashboardProps, type Project } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Dashboard showing all projects with live Vercel + Supabase health status",
  props: propsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Loading projects...",
    invoked: "Projects loaded",
  },
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${
        ok ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
      }`}
    />
  );
}

function ProjectCard({ project }: { project: Project }) {
  const { callTool } = useCallTool<{ projectId: string }>("project-board-get");

  return (
    <div
      onClick={() => callTool({ projectId: project.id })}
      className="bg-surface-elevated border border-default rounded-2xl p-5 cursor-pointer transition-all duration-150 hover:border-info hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-default">{project.name}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            project.active
              ? "bg-green-500/10 text-green-500"
              : "bg-secondary/10 text-secondary"
          }`}
        >
          {project.active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-secondary">
        <div className="flex items-center">
          <StatusDot ok={project.health.vercel_ok} />
          Vercel {project.health.vercel_ok ? "Healthy" : "Issue"}
        </div>
        <div className="flex items-center">
          <StatusDot ok={project.health.supabase_ok} />
          Supabase {project.health.supabase_ok ? "Healthy" : "Issue"}
        </div>
      </div>

      {project.health.warnings_count > 0 && (
        <div className="mt-3 px-2.5 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium">
          ⚠ {project.health.warnings_count} warning{project.health.warnings_count > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

const ProjectsDashboard: React.FC = () => {
  const { props, isPending } = useWidget<ProjectsDashboardProps>();

  if (isPending) {
    return (
      <McpUseProvider>
        <div className="p-6">
          <h2 className="text-xl font-bold text-default mb-4">📋 Projects</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-surface-elevated border border-default rounded-2xl p-5 animate-pulse">
                <div className="h-5 w-32 rounded bg-default/10 mb-3" />
                <div className="h-4 w-48 rounded bg-default/10 mb-2" />
                <div className="h-4 w-44 rounded bg-default/10" />
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
          <h2 className="text-xl font-bold text-default mb-5">📋 Projects</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {props.projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      </AppsSDKUIProvider>
    </McpUseProvider>
  );
};

export default ProjectsDashboard;
