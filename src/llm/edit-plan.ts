import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a plan editor. You receive a project plan in markdown and a human comment describing a requested change. Return the full updated plan with the change applied. Do not add commentary — only return the updated markdown.`;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI();
  return _client;
}

export async function editPlan(
  currentBody: string,
  comment: string,
): Promise<string> {
  const model = process.env.PLAN_EDIT_MODEL ?? "gpt-4o";

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `## Current plan\n\n${currentBody}\n\n---\n\n## Requested change\n\n${comment}`,
      },
    ],
    temperature: 0.2,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) throw new Error("LLM returned empty response");
  return result;
}
