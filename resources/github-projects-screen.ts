import type { Widgets } from "@openai/chatkit";

type Repo = {
  id: string;
  name: string;
  url: string;
  stars: string | number;
  description: string;
};

export function buildGitHubProjectsWidget(repos: Repo[]): Widgets.ListView {
  return {
    type: "ListView",
    status: {
      text: "GitHub Projects",
      icon: "square-code",
    },
    children: repos.map((item) => ({
      type: "ListViewItem" as const,
      key: item.id,
      gap: 3,
      onClickAction: { type: "repo.open", payload: { url: item.url } },
      children: [
        {
          type: "Box" as const,
          background: "alpha-10",
          radius: "sm" as const,
          padding: 2,
          children: [{ type: "Icon" as const, name: "square-code" as const, size: "lg" as const }],
        },
        {
          type: "Col" as const,
          gap: 0,
          children: [
            { type: "Text" as const, value: item.name, size: "sm" as const, weight: "semibold" as const, maxLines: 1 },
            { type: "Caption" as const, value: `★ ${item.stars} • ${item.description}`, maxLines: 1 },
          ],
        },
        { type: "Spacer" as const },
        { type: "Icon" as const, name: "external-link" as const, color: "secondary" },
      ],
    })),
  };
}
