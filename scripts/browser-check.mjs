import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = "http://localhost:3100";
const directory = resolve(".browser-preview");
mkdirSync(directory, { recursive: true });
const browser = spawn(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=9223",
    `--user-data-dir=${directory}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
try {
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch("http://localhost:9223/json/version");
      if (response.ok) break;
    } catch {
      /* Browser starting. */
    }
    await delay(300);
  }
  const target = await (
    await fetch("http://localhost:9223/json/new?about:blank", { method: "PUT" })
  ).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let serial = 0;
  const issues = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(message.error);
      else task?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown")
      issues.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    if (
      message.method === "Runtime.consoleAPICalled" &&
      ["error", "warning"].includes(message.params.type)
    )
      issues.push(
        message.params.args
          .map((arg) => arg.value ?? arg.description)
          .join(" "),
      );
  });
  const send = (method, params = {}) =>
    new Promise((resolveTask, reject) => {
      const id = ++serial;
      pending.set(id, { resolve: resolveTask, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  };
  const navigate = async (path) => {
    await send("Page.navigate", { url: `${root}${path}` });
    await delay(700);
    for (let i = 0; i < 30; i++) {
      if (
        await evaluate(
          "document.readyState === 'complete' && !!document.querySelector('h1')",
        )
      )
        break;
      await delay(200);
    }
    await delay(250);
  };
  const snapshot = async (name, width, height) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await delay(200);
    const data = await send("Page.captureScreenshot", { format: "png" });
    mkdirSync("docs/screenshots", { recursive: true });
    writeFileSync(
      `docs/screenshots/${name}.png`,
      Buffer.from(data.data, "base64"),
    );
  };
  const click = async (text, scope = "main") => {
    await evaluate(
      `(() => { const scope = document.querySelector(${JSON.stringify(scope)}); const button = [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw Error('Missing button: '+${JSON.stringify(text)}); button.click(); })()`,
    );
    await delay(200);
  };
  const fill = async (labelText, value, scope = "dialog[open]") => {
    await evaluate(
      `(() => { const root = document.querySelector(${JSON.stringify(scope)}); const label = [...root.querySelectorAll('label')].find(item => item.textContent.trim() === ${JSON.stringify(labelText)}); if (!label) throw Error('Missing label'); const input = document.getElementById(label.htmlFor); const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
    await delay(100);
  };
  const read = () =>
    evaluate("JSON.parse(localStorage.getItem('studyflow.workspace.v1'))");
  const routes = [
    "/dashboard",
    "/subjects",
    "/subjects/aws",
    "/study",
    "/study/history",
    "/calendar",
    "/analytics",
    "/resources",
    "/settings",
    "/onboarding",
    "/onboarding/context",
    "/onboarding/subject",
    "/onboarding/topics",
    "/onboarding/goal",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/admin",
    "/admin/users",
    "/admin/users/learner-1",
    "/admin/analytics",
    "/admin/storage",
    "/admin/settings",
    "/terms",
    "/privacy",
    "/error-404",
    "/error-500",
  ];
  await send("Network.setCookie", {
    name: "NEXT_LOCALE",
    value: "en",
    domain: "localhost",
    path: "/",
  });
  await navigate("/dashboard");
  await evaluate(
    "localStorage.removeItem('studyflow.workspace.v1'); localStorage.setItem('theme-mode', 'light')",
  );
  for (const route of routes) {
    await navigate(route);
    assert.ok(
      await evaluate("!!document.querySelector('h1')"),
      `heading ${route}`,
    );
    assert.ok(
      !(await evaluate(
        "/Musharof|Revenue|Invoices|Customers/.test(document.body.innerText)",
      )),
      `demo copy ${route}`,
    );
    console.log(`PASS route ${route}`);
  }
  await navigate("/dashboard");
  await snapshot("dashboard-desktop", 1440, 1000);
  await snapshot("dashboard-mobile", 360, 900);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= 360"),
    `mobile dashboard overflow ${await evaluate("document.documentElement.scrollWidth")}`,
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate("/subjects");
  await click("Add Subject");
  await fill("Title", "Browser test subject");
  await click("Save", "dialog[open]");
  let data = await read();
  const subject = data.subjects.find(
    (item) => item.title === "Browser test subject",
  );
  assert.ok(subject, "created subject");
  await navigate(`/subjects/${subject.id}`);
  await fill("New topic", "First topic", "main");
  await click("Add Topic");
  await evaluate("document.querySelector('main input[type=checkbox]').click()");
  await delay(200);
  data = await read();
  assert.equal(
    data.topics.find((item) => item.subjectId === subject.id).status,
    "completed",
  );
  await navigate(`/study?subject=${subject.id}`);
  await click("Start");
  await delay(1100);
  assert.ok((await read()).timer, "timer started");
  await navigate("/dashboard");
  assert.ok(
    await evaluate(
      "document.body.innerText.includes('Studying Browser test subject')",
    ),
    "cross-page indicator",
  );
  await navigate("/study");
  await click("Pause");
  const paused = (await read()).timer;
  assert.ok(paused.pausedAt);
  await send("Page.reload");
  await delay(800);
  assert.equal(
    (await read()).timer.startedAt,
    paused.startedAt,
    "refresh timer persistence",
  );
  await click("Resume");
  assert.ok(!(await read()).timer.pausedAt);
  await click("Finish");
  await click("Save session", "dialog[open]");
  assert.equal((await read()).timer, null);
  assert.ok(
    await evaluate(
      "document.body.innerText.includes('Sessions under one minute')",
    ),
    "short session friendly message",
  );
  await navigate(`/study?subject=${subject.id}`);
  await click("Start");
  await evaluate(
    "(() => { const data = JSON.parse(localStorage.getItem('studyflow.workspace.v1')); data.timer.startedAt = new Date(Date.now() - 125000).toISOString(); localStorage.setItem('studyflow.workspace.v1', JSON.stringify(data)); })()",
  );
  await send("Page.reload");
  await delay(900);
  await click("Finish");
  await click("Save session", "dialog[open]");
  assert.ok(
    (await read()).sessions.some(
      (item) => item.subjectId === subject.id && item.durationSeconds >= 120,
    ),
    "valid timer session saved",
  );
  await navigate(`/study?subject=${subject.id}`);
  await click("Start");
  await evaluate(
    "(() => { const data = JSON.parse(localStorage.getItem('studyflow.workspace.v1')); data.timer.startedAt = new Date(Date.now() - 7 * 3600000).toISOString(); localStorage.setItem('studyflow.workspace.v1', JSON.stringify(data)); })()",
  );
  await send("Page.reload");
  await delay(900);
  assert.ok((await read()).timer.pausedAt, "unattended timer capped");
  assert.ok(
    await evaluate(
      "document.body.innerText.includes('Are you still studying?')",
    ),
  );
  await click("Discard");
  await click("Confirm", "dialog[open]");
  await navigate("/study/history");
  await click("Add manual session");
  await fill("Subject", subject.id);
  const manualStart = new Date(Date.now() - 7200000).toISOString().slice(0, 16);
  await fill("Start (Asia/Colombo)", manualStart);
  await fill("Minutes", "10");
  await click("Save session", "dialog[open]");
  assert.ok(
    (await read()).sessions.some(
      (item) => item.subjectId === subject.id && item.source === "manual",
    ),
    "manual session saved",
  );
  await navigate("/calendar");
  await click("Schedule Study");
  await fill("Subject", subject.id);
  await fill("Title (Class, Exam, Break…)", "Browser weekly block");
  const planDate = (await read()).blocks[0].startsAt.slice(0, 10);
  await fill("Start (Asia/Colombo)", `${planDate}T21:00`);
  await fill("End (Asia/Colombo)", `${planDate}T22:00`);
  await fill("Repeat", "weekly");
  const weekday = new Date(`${planDate}T12:00:00Z`).getUTCDay();
  await evaluate(
    `document.querySelectorAll('dialog[open] fieldset input')[${weekday}].click()`,
  );
  await click("Save", "dialog[open]");
  assert.ok(
    (await read()).blocks.some(
      (item) =>
        item.title === "Browser weekly block" && item.repeat === "weekly",
    ),
    "weekly block saved",
  );
  await evaluate(
    "[...document.querySelectorAll('main button')].find(item => item.textContent.includes('Browser weekly block')).click()",
  );
  await delay(200);
  await fill("Title (Class, Exam, Break…)", "Browser one occurrence");
  await click("Save", "dialog[open]");
  data = await read();
  assert.equal(
    data.blocks.find((item) => item.title === "Browser weekly block").exceptions
      .length,
    1,
    "one-occurrence edit preserves series",
  );
  await click("Schedule Study");
  await fill("Title (Class, Exam, Break…)", "Class without a subject");
  await fill("Start (Asia/Colombo)", `${planDate}T14:00`);
  await fill("End (Asia/Colombo)", `${planDate}T15:00`);
  await click("Save", "dialog[open]");
  assert.ok(
    (await read()).blocks.some(
      (item) => item.title === "Class without a subject" && !item.subjectId,
    ),
    "custom block needs no subject",
  );
  await navigate("/resources");
  await click("Add Resource");
  await fill("Title", "Browser test note");
  await fill("Subject", subject.id);
  await fill("Type", "note");
  await fill(
    "Your note (headings and lists welcome)",
    "Private browser test note",
  );
  await click("Save", "dialog[open]");
  assert.ok(
    (await read()).resources.some((item) => item.title === "Browser test note"),
  );
  await click("Add Resource");
  await fill("Title", "Oversized file");
  await fill("Subject", subject.id);
  await fill("Type", "file");
  await evaluate(
    "(() => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' })); const input = document.querySelector('dialog[open] input[type=file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()",
  );
  await click("Save", "dialog[open]");
  assert.ok(
    await evaluate(
      "document.querySelector('dialog[open]').innerText.includes('smaller than 10 MB')",
    ),
    "file size error",
  );
  await evaluate(
    "document.querySelector('dialog[open] button[aria-label=Close]').click()",
  );
  await navigate("/admin/users");
  await click("Deactivate");
  await click("Confirm", "dialog[open]");
  data = await read();
  assert.ok(
    data.auditLogs.some(
      (entry) => entry.action === "deactivate" && entry.id !== "audit-1",
    ),
  );
  await navigate("/admin/users/learner-1");
  assert.ok(
    await evaluate(
      "document.body.innerText.includes('Private content is hidden.')",
    ),
  );
  assert.ok(
    !(await evaluate(
      "document.body.innerText.includes('Private browser test note')",
    )),
  );
  await navigate("/calendar");
  await snapshot("calendar-mobile", 360, 900);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= 360"),
    "mobile calendar overflow",
  );
  const mobileRoutes = [
    "/subjects",
    "/subjects/aws",
    "/study",
    "/study/history",
    "/analytics",
    "/resources",
    "/settings",
    "/onboarding",
    "/register",
    "/admin",
    "/admin/users",
    "/admin/users/learner-1",
    "/admin/analytics",
    "/admin/storage",
    "/admin/settings",
  ];
  for (const route of mobileRoutes) {
    await navigate(route);
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= 360"),
      `360px overflow ${route}: ${await evaluate("document.documentElement.scrollWidth")}`,
    );
    console.log(`PASS 360px ${route}`);
  }
  await evaluate("localStorage.removeItem('studyflow.workspace.v1')");
  await navigate("/calendar");
  await snapshot("calendar-mobile", 360, 900);
  await send("Network.setCookie", {
    name: "NEXT_LOCALE",
    value: "ar",
    domain: "localhost",
    path: "/",
  });
  await navigate("/dashboard");
  assert.equal(await evaluate("document.documentElement.dir"), "rtl");
  await snapshot("dashboard-rtl", 1440, 1000);
  await send("Network.setCookie", {
    name: "NEXT_LOCALE",
    value: "en",
    domain: "localhost",
    path: "/",
  });
  await navigate("/dashboard");
  await evaluate(
    "document.querySelector('button[aria-label=\"Toggle light and dark mode\"]').click()",
  );
  await delay(300);
  assert.ok(
    await evaluate("document.documentElement.classList.contains('dark')"),
  );
  await snapshot("dashboard-dark", 1440, 1000);
  assert.deepEqual(issues, [], "browser console errors/warnings");
  console.log("PASS core interactions, mobile/RTL layout and clean console");
} finally {
  socket?.close();
  browser.kill();
}
