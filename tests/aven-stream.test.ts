import { expect, it } from "vitest";
import { responseEvents } from "@/lib/aven/stream";
it("parses OpenAI events split across arbitrary UTF-8 network boundaries", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"type":"response.output_text.delta","delta":"Hello 世界"}\n\ndata: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n',
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3)
        controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
  const events = [];
  for await (const event of responseEvents(body)) events.push(event);
  expect(events[0].delta).toBe("Hello 世界");
  expect(events[1].type).toBe("response.completed");
});
it("accepts CRLF event delimiters split between network chunks", async () => {
  const bytes = new TextEncoder().encode('data: {"type":"done"}\r\n\r\n');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const events = [];
  for await (const event of responseEvents(body)) events.push(event);
  expect(events).toHaveLength(1);
});
