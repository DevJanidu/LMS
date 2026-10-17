// Deterministic stand-in for the OpenAI Responses API, for local browser tests only.
// Start: node scripts/mock-openai-provider.mjs [port]; point the dev server at it with
// AVEN_PROVIDER_URL=http://127.0.0.1:<port>/v1/responses (ignored outside development).
// Scenarios are chosen by a marker in the student's latest message:
//   [slow]  ~7 s of streamed Markdown (list, table, code) for lifecycle tests
//   [tool]  a read-only getWeeklyAnalytics tool call, then a streamed reply
//   [plan]  a real scheduleStudySessions call (Java, 3 × 60 min next week after 19:00)
//   [checklist] [quiz] [diagram] [flashcards] [targets]
//           an introduction plus the matching show* presentation call in one response
//   other   a short immediate reply
// GET /stats returns how many model requests each marker produced (duplicate detection);
// GET /requests returns the model, effort, verbosity and cache key each request carried.
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4010);
const stats = {};
/** Parameters of recent requests (no message content), for verifying model routing. */
const requests = [];
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
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 864e5).toISOString().slice(0, 10);
function nextMonday() {
  const today = new Date();
  const offset = ((8 - today.getUTCDay()) % 7) || 7;
  return addDays(today.toISOString().slice(0, 10), offset);
}
const BLOCKS = {
  checklist: {
    tool: "showChecklist",
    intro: "Here is a checklist to get you ready for studying Java.",
    args: {
      title: "Prepare to study Java",
      sections: [
        { id: "setup", title: "Set up your tools", items: [
          { id: "jdk", label: "Install the latest JDK", hint: "Check with java -version" },
          { id: "ide", label: "Install an IDE", hint: "IntelliJ IDEA or VS Code" },
        ] },
        { id: "plan", title: "Plan your learning", items: [
          { id: "goals", label: "Write down what you want to build", hint: null },
          { id: "schedule", label: "Block three study sessions this week", hint: null },
          { id: "notes", label: "Create a notes file for syntax", hint: null },
        ] },
      ],
    },
  },
  quiz: {
    tool: "showQuiz",
    intro: "Let's check your Java basics with two questions.",
    args: {
      title: "Java basics",
      questions: [
        { id: "q1", prompt: "Which keyword creates a new object?", options: ["new", "make", "create"], correctIndex: 0, explanation: "new allocates memory and calls a constructor." },
        { id: "q2", prompt: "Is Java statically typed?", options: ["Yes", "No"], correctIndex: 0, explanation: "Variable types are checked at compile time." },
      ],
    },
  },
  diagram: {
    tool: "showDiagram",
    intro: "An AI agent loops between planning, acting with tools and remembering results.",
    args: {
      title: "How an AI agent works",
      kind: "architecture",
      nodes: [
        { id: "user", label: "User goal", detail: "The task the agent is asked to complete.", group: "input" },
        { id: "planner", label: "Planner (LLM)", detail: "Decides the next step from the goal and memory.", group: "core" },
        { id: "tools", label: "Tools", detail: "APIs, search or code the agent can call.", group: "act" },
        { id: "memory", label: "Memory", detail: "Stores results so later steps can use them.", group: "core" },
        { id: "answer", label: "Answer", detail: null, group: "input" },
      ],
      edges: [
        { from: "user", to: "planner", label: "task" },
        { from: "planner", to: "tools", label: "calls" },
        { from: "tools", to: "memory", label: "results" },
        { from: "memory", to: "planner", label: "context" },
        { from: "planner", to: "answer", label: null },
      ],
    },
  },
  flashcards: {
    tool: "showFlashcards",
    intro: "Here are flashcards for Java keywords.",
    args: { title: "Java keywords", cards: [
      { id: "c1", front: "final", back: "Value or reference cannot be reassigned." },
      { id: "c2", front: "static", back: "Belongs to the class, not an instance." },
      { id: "c3", front: "abstract", back: "Declared without a full implementation." },
    ] },
  },
  targets: {
    tool: "showStudyTargets",
    intro: "Adjust these to find a weekly target that fits.",
    args: { title: "Your weekly study targets", weeklyHours: 10, sessionMinutes: 50, breakMinutes: 10, technique: "pomodoro", timeOfDay: "evening" },
  },
};
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
  if (request.method === "GET" && request.url === "/requests") {
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify(requests));
  }
  if (request.method === "POST" && request.url === "/stats/reset") {
    for (const key of Object.keys(stats)) delete stats[key];
    requests.length = 0;
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
  const block = Object.keys(BLOCKS).find((name) => text.includes(`[${name}]`));
  const marker = summary
    ? "summary"
    : text.includes("[slow]")
      ? "slow"
      : text.includes("[tool]")
        ? "tool"
        : text.includes("[plan]")
          ? "plan"
          : (block ?? "quick");
  const toolDone = Array.isArray(body.input) && body.input.some((item) => item?.type === "function_call_output");
  stats[marker] = (stats[marker] ?? 0) + 1;
  requests.push({ marker, model: body.model, effort: body.reasoning?.effort ?? null, verbosity: body.text?.verbosity ?? null, promptCacheKey: body.prompt_cache_key ?? null, tools: (body.tools ?? []).map((tool) => tool.name) });
  if (requests.length > 200) requests.shift();
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
  // A presentation block: an introduction streams, then the show* call in the same response.
  if (block && !toolDone) {
    const intro = BLOCKS[block].intro;
    for (const chunk of words(intro)) {
      send({ type: "response.output_text.delta", delta: chunk });
      await sleep(20);
    }
    const call = { type: "function_call", name: BLOCKS[block].tool, call_id: `call_${block}_1`, arguments: JSON.stringify(BLOCKS[block].args) };
    send({ type: "response.output_item.added", item: { type: "function_call", name: call.name, call_id: call.call_id } });
    await sleep(400);
    complete([{ type: "message", content: [{ type: "output_text", text: intro }] }, call], 40);
    return response.end();
  }
  // Real scheduling through the deterministic planner: Java, three evening sessions next week.
  if (marker === "plan" && !toolDone) {
    const monday = nextMonday();
    complete(
      [
        {
          type: "function_call",
          name: "scheduleStudySessions",
          call_id: "call_plan_1",
          arguments: JSON.stringify({
            subjects: [{ subjectId: null, subjectName: "Java", sessions: 3 }],
            minutes: 60,
            from: monday,
            to: addDays(monday, 6),
            earliest: "19:00",
            latest: "22:00",
            explanation: "Three one-hour Java sessions next week after 7 PM.",
          }),
        },
      ],
      30,
    );
    return response.end();
  }
  const chunks =
    marker === "slow"
      ? SLOW.flatMap(words)
      : marker === "tool"
        ? words("Here is your study time for the last seven days, from your timer records.")
        : marker === "plan"
          ? words("I prepared three evening Java sessions for next week. Adjust them in the planner and approve the card to add them to your calendar.")
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
