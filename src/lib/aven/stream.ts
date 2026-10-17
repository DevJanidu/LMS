export interface ResponseEvent {
  type: string;
  delta?: string;
  /** For response.output_item.added: the item that started (e.g. a function call). */
  item?: { type: string; name?: string; call_id?: string };
  response?: {
    status: string;
    incomplete_details?: { reason?: string } | null;
    output: ResponseItem[];
    usage?: { input_tokens: number; output_tokens: number };
  };
}
export interface ResponseItem {
  type: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: { type: string; text?: string; refusal?: string }[];
}
/** Parse arbitrarily split UTF-8/SSE chunks; never assume a network chunk is an event. */
export async function* responseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ResponseEvent> {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending = (pending + decoder.decode(value, { stream: !done })).replace(
        /\r\n/g,
        "\n",
      );
      let index: number;
      while ((index = pending.indexOf("\n\n")) >= 0) {
        const event = pending.slice(0, index);
        pending = pending.slice(index + 2);
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") yield JSON.parse(data) as ResponseEvent;
      }
      if (pending.length > 2000000) throw new Error("invalidAiStream");
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
