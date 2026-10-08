import { POST } from "@/app/api/assistants/threads/[threadId]/messages/route";
import { openai } from "@/app/openai";

describe("test search availabilities", () => {
  it("checks the assistant's run completed and availibilities returned", async () => {
    const conversation = await openai.conversations.create();
    const data = await POST(
      // @ts-ignore
      {
        json: () =>
          Promise.resolve({
            content: "book for today",
          }),
      },
      { params: { threadId: conversation.id } }
    );
    const events = [];
    const reader = data.body.getReader();
    let end = false;
    while (!end) {
      const part = await reader.read();
      if (part.value) {
        try {
          // @ts-ignore
          events.push(JSON.parse(part.value));
        } catch (err) {
          console.log("err parse", part.value);
        }
        console.log("part.value", part.value);
      }
      end = part.done;
    }

    expect(
      events.find((event) => event.event === "response.completed")!!
    ).toBeTruthy();
    expect(
      events.find((event) => event.event === "search_availability")!!
    ).toBeTruthy();
  }, 60000);
});
