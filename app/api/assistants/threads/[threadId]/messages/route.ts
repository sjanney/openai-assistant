import { openai } from "@/app/openai";
import * as toolCallFunctions from "./toolCallFunctions";

export const runtime = "nodejs";

// Assistant configuration previously lived on a server-side Assistant object
// (referenced by assistantId from @/app/assistant-config). Reusable prompt
// objects are also deprecated (shutting down 2026-11-30), so instructions and
// tools are inlined here. Update @/app/assistant-config to export these
// instead of an assistant_id, or keep them in sync with the dashboard prompt.
const instructions = "You are a helpful assistant.";
const model = "gpt-4o";
const tools = [
  {
    type: "function",
    name: "search_availability",
    description: "Search availability for the requested date.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The date to check availability for, e.g. 'today'.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export async function POST(req: Request, { params: { threadId } }) {
  const { content } = await req.json();

  return new Response(
    new ReadableStream({
      async start(controller) {
        // First turn sends the user's message; later turns send only tool
        // outputs. The conversation (threadId) persists messages and tool calls.
        let input: any[] = [{ role: "user", content }];
        try {
          for (let iterations = 0; iterations < 10; iterations++) {
            const stream = await openai.responses.create({
              model,
              instructions,
              tools,
              input,
              conversation: threadId,
              stream: true,
            });

            let finalResponse: any;
            for await (const event of stream) {
              const e = event as any;
              if (e.type === "response.output_text.delta") {
                controller.enqueue(
                  `${JSON.stringify({
                    event: "response.output_text.delta",
                    delta: e.delta,
                  })}\n`
                );
              } else if (e.type === "response.completed") {
                finalResponse = e.response;
              }
            }

            const outputItems: any[] = finalResponse?.output ?? [];
            const toolCalls = outputItems.filter(
              (item: any) => item.type === "function_call"
            );

            if (toolCalls.length === 0) {
              controller.enqueue(
                `${JSON.stringify({ event: "response.completed" })}\n`
              );
              controller.close();
              return;
            }

            // Execute each tool and send its output back as the next input.
            input = [];
            for (const call of toolCalls) {
              const fn = toolCallFunctions[call.name];
              let result: any;
              if (fn) {
                // Arguments are intentionally ignored, matching the original
                // integration which called the tool functions without them.
                result = await fn();
                controller.enqueue(
                  `${JSON.stringify({
                    event: call.name,
                    data: result,
                  })}\n`
                );
              }
              input.push({
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify(result),
              });
            }
          }
          controller.enqueue(
            `${JSON.stringify({ event: "response.completed" })}\n`
          );
          controller.close();
        } catch (error) {
          console.log("error", error);
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    }
  );
}
