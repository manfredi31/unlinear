import type { Widgets } from "@openai/chatkit";

type Comment = {
  id: string;
  author: string;
  color: string;
  text: string;
  time: string;
};

type Contributor = {
  id: string;
  name: string;
  color: string;
  inserts: string[];
  deletes: string[];
};

type TaskDetailsProps = {
  taskTitle: string;
  tldr: string;
  planMd: string;
  contributors: Contributor[];
  comments?: Comment[];
};

export function buildTaskDetailsWidget({
  taskTitle,
  tldr,
  planMd,
  contributors,
  comments = [],
}: TaskDetailsProps): Widgets.Card {
  const contributorRows: Widgets.WidgetComponent[] = contributors.map((user) => {
    const insertRows: Widgets.WidgetComponent[] = user.inserts.slice(0, 3).map((line, idx) => ({
      type: "Row" as const,
      key: `ins-${user.id}-${idx}`,
      gap: 2,
      align: "start" as const,
      children: [
        { type: "Icon" as const, name: "plus" as const, color: user.color, size: "sm" as const },
        { type: "Text" as const, value: line, size: "sm" as const, color: user.color },
      ],
    }));

    const deleteRows: Widgets.WidgetComponent[] = user.deletes.slice(0, 3).map((line, idx) => ({
      type: "Row" as const,
      key: `del-${user.id}-${idx}`,
      gap: 2,
      align: "start" as const,
      children: [
        { type: "Icon" as const, name: "empty-circle" as const, color: user.color, size: "sm" as const },
        { type: "Text" as const, value: line, size: "sm" as const, color: user.color, lineThrough: true },
      ],
    }));

    return {
      type: "Col" as const,
      key: user.id,
      gap: 2,
      border: { bottom: { size: 1 } },
      padding: { bottom: 2 },
      children: [
        {
          type: "Row" as const,
          gap: 3,
          children: [
            { type: "Box" as const, width: 4, height: "28px", radius: "full" as const, background: user.color },
            { type: "Text" as const, value: user.name, size: "sm" as const, weight: "semibold" as const },
            { type: "Spacer" as const },
            {
              type: "Row" as const,
              gap: 2,
              children: [
                { type: "Badge" as const, label: `+${user.inserts.length}`, color: "success" as const },
                { type: "Badge" as const, label: `-${user.deletes.length}`, color: "danger" as const },
              ],
            },
          ],
        },
        ...insertRows,
        ...deleteRows,
      ],
    };
  });

  const commentRows: Widgets.WidgetComponent[] = comments.map((item) => ({
    type: "Row" as const,
    key: item.id,
    align: "start" as const,
    gap: 2,
    children: [
      { type: "Box" as const, width: 3, height: "24px", radius: "full" as const, background: item.color },
      {
        type: "Col" as const,
        children: [
          {
            type: "Row" as const,
            gap: 2,
            children: [
              { type: "Text" as const, value: item.author, size: "sm" as const, weight: "semibold" as const },
              { type: "Caption" as const, value: item.time },
            ],
          },
          { type: "Text" as const, value: item.text, size: "sm" as const },
        ],
      },
    ],
  }));

  return {
    type: "Card",
    size: "md",
    children: [
      {
        type: "Col",
        gap: 3,
        children: [
          { type: "Title", value: taskTitle, size: "sm" },
          {
            type: "Row",
            gap: 2,
            align: "center",
            children: [
              { type: "Badge", label: "TL;DR", color: "discovery" },
              { type: "Text", value: tldr, size: "sm", color: "secondary" },
            ],
          },
          { type: "Divider", flush: true },
          { type: "Markdown", value: planMd },
          { type: "Divider" },
          {
            type: "Row",
            align: "center",
            gap: 2,
            children: [
              { type: "Icon", name: "square-text", size: "md" },
              { type: "Title", value: "Comments", size: "sm" },
              { type: "Spacer" },
              { type: "Badge", label: String(comments.length) },
            ],
          },
          {
            type: "Form",
            onSubmitAction: { type: "comment.add" },
            children: [
              {
                type: "Col",
                gap: 2,
                children: [
                  {
                    type: "Textarea",
                    name: "comment.body",
                    placeholder: "Write a comment…",
                    rows: 3,
                    variant: "soft",
                    required: true,
                    defaultValue: "",
                  },
                  {
                    type: "Row",
                    children: [
                      { type: "Spacer" },
                      { type: "Button", submit: true, label: "Send", style: "primary", iconStart: "write-alt", size: "md" },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "Col",
            gap: 2,
            children: [
              ...contributorRows,
              ...commentRows,
            ],
          },
        ],
      },
    ],
  };
}
