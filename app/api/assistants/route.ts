export const runtime = "nodejs";

// The Assistants API is shut down and prompts can only be created in the
// dashboard. Reusable prompt objects are also deprecated (shutting down
// 2026-11-30), so inline instructions and tools in application code instead.
// Configure the prompt id (if still using a dashboard prompt) via the
// OPENAI_PROMPT_ID environment variable, or remove this endpoint if nothing
// calls it.
export async function POST() {
  return Response.json({ promptId: process.env.OPENAI_PROMPT_ID ?? null });
}
