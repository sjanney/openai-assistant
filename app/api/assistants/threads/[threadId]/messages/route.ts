import { openai } from "@/app/openai";
import * as toolCallFunctions from "./toolCallFunctions";

export const runtime = "nodejs";

const PROMPT_CONFIG = {
  model: "gpt-4o",
  instructions: "You are a helpful assistant.",
  tools: [
    { type: "code_interpreter" },
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Determine weather in my location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state e.g. San Francisco, CA",
            },
            unit: {
              type: "string",
              enum: ["c", "f"],
            },
          },
          required: ["location"],
        },
      },
    },
    { type: "file_search" },
  ],
};

async function handleToolCalls(
  toolCalls: any[],
  controller: ReadableStreamDefaultController
): Promise<any[]> {
  const toolCallOutputs: any[] = [];

  for (const toolCall of toolCalls) {
    const fn = toolCallFunctions[toolCall.name];
    let result = undefined;
    if (fn) {
      result = await fn();
      controller.enqueue(
        `${JSON.stringify({
          event: toolCall.name,
          data: result,
        })}\n`
      );
    }
    toolCallOutputs.push({
      type: "function_call_output",
      call_id: toolCall.call_id,
      output: JSON.stringify(result),
    });
  }

  return toolCallOutputs;
}

export async function POST(req: Request, { params: { threadId } }) {
  const { content } = await req.json();
  const conversationId = threadId;

  return new Response(
    new ReadableStream({
      async start(controller) {
        let input: any[] = [{ role: "user", content }];
        let hasMoreToolCalls = true;

        while (hasMoreToolCalls) {
          hasMoreToolCalls = false;
          const toolCalls: any[] = [];

          try {
            const stream = await openai.responses.create({
              ...PROMPT_CONFIG,
              input,
              conversation: conversationId,
              stream: true,
            });

            for await (const event of stream) {
              controller.enqueue(`${JSON.stringify(event)}\n`);

              if (
                event.type === "response.output_item.done" &&
                event.item?.type === "function_call"
              ) {
                toolCalls.push(event.item);
              }
            }

            if (toolCalls.length > 0) {
              hasMoreToolCalls = true;
              const toolCallOutputs = await handleToolCalls(
                toolCalls,
                controller
              );
              input = toolCallOutputs;
            }
          } catch (error) {
            console.log("error", error);
            controller.enqueue(
              `${JSON.stringify({
                type: "error",
                message: String(error),
              })}\n`
            );
            break;
          }
        }

        controller.close();
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
