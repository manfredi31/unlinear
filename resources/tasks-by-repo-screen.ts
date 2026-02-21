import type { Widgets } from "@openai/chatkit";

type Task = {
  id: string;
  title: string;
  repo: string;
  done: boolean;
};

type TasksByRepoProps = {
  selectedProject?: string;
  projectOptions?: { value: string; label: string }[];
  tasks?: Task[];
  counts?: { open: number; total: number };
  repoName?: string;
};

export function buildTasksByRepoWidget({
  selectedProject,
  projectOptions = [],
  tasks = [],
  counts = { open: 0, total: 0 },
}: TasksByRepoProps): Widgets.Card {
  const taskItems: Widgets.ListViewItem[] = tasks.map((item) => ({
    type: "ListViewItem",
    key: item.id,
    gap: 3,
    onClickAction: { type: "task.open", payload: { id: item.id } },
    children: [
      {
        type: "Box" as const,
        background: item.done ? "green-400" : "alpha-10",
        radius: "sm" as const,
        padding: 2,
        children: [
          {
            type: "Icon" as const,
            name: item.done ? ("check-circle-filled" as const) : ("empty-circle" as const),
            size: "lg" as const,
            color: item.done ? "success" : "secondary",
          },
        ],
      },
      {
        type: "Col" as const,
        gap: 0,
        children: [
          { type: "Text" as const, value: item.title, size: "sm" as const, weight: "semibold" as const },
          { type: "Caption" as const, value: `${item.repo} • ${item.done ? "Done" : "Open"}`, color: "secondary" },
        ],
      },
      { type: "Spacer" as const },
      {
        type: "Button" as const,
        label: item.done ? "Reopen" : "Done",
        size: "sm" as const,
        variant: "outline" as const,
        onClickAction: { type: "task.toggle", payload: { id: item.id } },
      },
    ],
  }));

  const contentChildren: Widgets.WidgetComponent[] =
    tasks.length === 0
      ? [{ type: "Col", align: "center" as const, padding: 4, children: [{ type: "Text" as const, value: "No tasks for this repo", color: "secondary" }] }]
      : [{ type: "ListView" as unknown as "Col", children: taskItems } as unknown as Widgets.WidgetComponent];

  return {
    type: "Card",
    size: "md",
    children: [
      {
        type: "Col",
        gap: 3,
        children: [
          {
            type: "Row",
            align: "center",
            children: [
              { type: "Icon", name: "square-code", size: "lg" },
              { type: "Title", value: "Tasks by repo", size: "sm" },
              { type: "Spacer" },
              { type: "Badge", label: `${counts.open}/${counts.total} open`, color: "info" },
            ],
          },
          {
            type: "Select",
            name: "project.id",
            options: projectOptions,
            defaultValue: selectedProject,
            placeholder: "Select a repo",
            variant: "outline",
            onChangeAction: { type: "project.select" },
          },
          { type: "Divider" },
          ...contentChildren,
        ],
      },
    ],
  };
}
