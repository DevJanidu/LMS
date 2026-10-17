// Deterministic stand-in for the OpenAI Responses API, for local browser tests only.
// Start: node scripts/mock-openai-provider.mjs [port]; point the dev server at it with
// AVEN_PROVIDER_URL=http://127.0.0.1:<port>/v1/responses (ignored outside development).
// Scenarios are chosen by a marker in the student's latest message:
//   [slow]  ~7 s of streamed Markdown (list, table, code) for lifecycle tests
//   [tool]  a read-only getWeeklyAnalytics tool call, then a streamed reply
//   other   a short immediate reply
// GET /stats returns how many model requests each marker produced (duplicate detection).
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4010);
const stats = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SLOW = [
  "## Your Advanced Java week\n\n",
  "Here is a **realistic plan** built around your evenings. ",
  "Each session keeps a short break so it stays sustainable.\n\n",
  "- Monday: Streams basics\n  - map and filter\n  - [x] collectors overview\n",
  "- Wednesday: Concurrency\n- [ ] Friday: Review\n\n",
  "| Day | Focus | Minutes |\n",
  "| --- | --- | ---: |\n",
  "| Mon | Streams | 60 |\n",
  "| Wed | Concurrency | 60 |\n",
  "| Fri | Review | 45 |\n\n",
  "```java\nlist.stream().filter(x -> x > 2).toList();\n```\n\n",
  "> Tip: stop while it still feels easy, so tomorrow starts well.\n\n",
  "That keeps the week balanced. Tell me if any evening does not work and I will adjust it.",
];
const words = (text) => text.match(/\S+\s*|\s+/g) ?? [];
function lastUserText(input) {
  if (!Array.isArray(input)) return "";
  for (let index = input.length - 1; index >= 0; index--) {
    const item = input[index];
    if (item?.role === "user") return typeof item.content === "string" ? item.content : JSON.stringify(item.content);
  }
  return "";
}
createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/stats") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(stats));
  }
  if (request.method === "POST" && request.url === "/stats/reset") {
    for (const key of Object.keys(stats)) delete stats[key];
    response.writeHead(204);
    return response.end();
  }
  if (request.method !== "POST" || !request.url?.startsWith("/v1/responses")) {
    response.writeHead(404);
    return response.end();
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw || "{}");
  const summary = String(body.instructions ?? "").startsWith("Summarize");
  const text = lastUserText(body.input);
  const marker = summary ? "summary" : text.includes("[slow]") ? "slow" : text.includes("[tool]") ? "tool" : "quick";
  const toolDone = Array.isArray(body.input) && body.input.some((item) => item?.type === "function_call_output");
  stats[marker] = (stats[marker] ?? 0) + 1;
  let closed = false;
  response.on("close", () => {
    closed = true;
  });
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
  const send = (event) => !closed && response.write(`data: ${JSON.stringify(event)}\n\n`);
  const complete = (output, outputTokens) =>
    send({ type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 100, output_tokens: outputTokens } } });
  if (marker === "tool" && !toolDone) {
    await sleep(300);
    complete([{ type: "function_call", name: "getWeeklyAnalytics", arguments: "{}", call_id: "call_mock_1" }], 10);
    return response.end();
  }
  const chunks =
    marker === "slow"
      ? SLOW.flatMap(words)
      : marker === "tool"
        ? words("Here is your study time for the last seven days, from your timer records.")
        : marker === "summary"
          ? ["Summary of the conversation."]
          : words("Hello! I am ready to help you plan your study week.");
  const delay = marker === "slow" ? 55 : 15;
  let full = "";
  for (const chunk of chunks) {
    if (closed) return;
    full += chunk;
    send({ type: "response.output_text.delta", delta: chunk });
    await sleep(delay);
  }
  complete([{ type: "message", content: [{ type: "output_text", text: full }] }], chunks.length);
  response.end();
}).listen(port, "127.0.0.1", () => console.log(JSON.stringify({ mockProvider: `http://127.0.0.1:${port}/v1/responses` })));
