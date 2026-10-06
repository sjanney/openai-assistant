import { openai } from "@/app/openai";

export const runtime = "nodejs";

// Create a new conversation
export async function POST() {
  const conversation = await openai.conversations.create();
  return Response.json({ conversationId: conversation.id });
}
