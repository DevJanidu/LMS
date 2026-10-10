import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
if (process.env.VERCEL_ENV === 'production' || !process.argv.includes('--acknowledge-current-test-database')) throw new Error('Explicit fixture-only database acknowledgement required.');
const fixture = JSON.parse(readFileSync('.audit-local/fixtures.json', 'utf8'));
const user = fixture.users.find(user => user.role === 'learner');
assert(user && user.email.startsWith('audit-'));
const baseURL = 'http://localhost:3100';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ baseURL });
context.setDefaultTimeout(20000);
const subject = { id: crypto.randomUUID(), title: `Subject audit ${crypto.randomUUID()}`, description: '', color: 'brand', status: 'active' };
const report = [];
const ownedFile = '.audit-local/subject-audit-owned.json';
const mutate = async operations => {
  const response = await context.request.post('/api/workspace', { headers: { Origin: baseURL }, data: { operations }, timeout: 60000 });
  const result = await response.json();
  assert(result.ok, `Mutation failed: ${result.error}`);
  return result;
};
try {
  const login = await context.request.post('/api/auth/sign-in/email', { headers: { Origin: baseURL }, data: { email: user.email, password: fixture.password } });
  assert(login.ok(), `Fixture login failed: ${login.status()}`);
  if (existsSync(ownedFile)) {
    const previous = JSON.parse(readFileSync(ownedFile, 'utf8'));
    assert(previous.userId === user.id && /^Subject audit [a-f0-9-]{36}$/.test(previous.title));
    const state = await (await context.request.get('/api/workspace?groups=subjects')).json();
    if (state.fields.subjects.some(row => row.id === previous.id)) await mutate([{ kind: 'delete', entity: 'subject', id: previous.id }]);
    unlinkSync(ownedFile);
  }
  writeFileSync(ownedFile, JSON.stringify({ id: subject.id, title: subject.title, userId: user.id }));
  await mutate([{ kind: 'subject', value: subject }]);
  await mutate(Array.from({ length: 50 }, (_, i) => ({ kind: 'topic', value: { id: crypto.randomUUID(), subjectId: subject.id, title: `Topic ${i + 1}`, status: 'notStarted', sortOrder: i } })));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/subjects/${subject.id}`);
  await page.getByRole('button', { name: 'Edit subject', exact: true }).click();
  const editor = page.locator('dialog[open]');
  await editor.getByLabel('Title', { exact: true }).fill(subject.title + ' renamed');
  const save = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/workspace'));
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await (await save).json();
  report.push({ check: 'subject rename from detail', ok: saved.ok, error: saved.error });
  await page.reload();
  await page.getByRole('heading', { name: subject.title + ' renamed', exact: true }).waitFor();
  const heights = await page.locator('.sf-subject-topics .sf-roadmap-step').evaluateAll(rows => rows.map(row => Math.round(row.getBoundingClientRect().height)));
  report.push({ check: '50 topic sidebar', count: heights.length, minHeight: Math.min(...heights), maxHeight: Math.max(...heights) });
  if (!process.argv.includes('--baseline')) {
    assert(Math.max(...heights) <= 44);
    await page.getByRole('tab', { name: 'Topics', exact: true }).click();
    const columns = await page.locator('.sf-roadmap').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    report.push({ check: 'wide topic panel uses three columns', ok: columns === 3 });
    assert(columns === 3);
    await page.locator('.sf-roadmap').scrollIntoViewIfNeeded();
    report.push({ check: 'topics visible within desktop viewport', count: await page.locator('.sf-roadmap-step').evaluateAll(rows => rows.filter(row => { const r = row.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }).length) });
    for (const mode of ['light', 'dark', 'rtl']) {
      await page.evaluate(mode => { document.documentElement.classList.toggle('dark', mode === 'dark'); document.documentElement.dir = mode === 'rtl' ? 'rtl' : 'ltr'; }, mode);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `.audit-local/topics-${mode}.png` });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: '.audit-local/topics-mobile.png' });
    const mobileInput = await page.getByLabel('New topic', { exact: true }).boundingBox();
    assert(mobileInput && mobileInput.width > 200);
    report.push({ check: 'mobile topic entry uses full available width', ok: true });
    report.push({ check: 'mobile width', viewport: await page.evaluate(() => innerWidth), document: await page.evaluate(() => document.documentElement.scrollWidth) });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    report.push({ check: 'mobile topic rows have no horizontal overflow', ok: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.dir = 'ltr'; });
    await page.goto('/subjects');
    const card = page.locator('article').filter({ hasText: subject.title + ' renamed' });
    await card.getByRole('button', { name: 'Edit subject', exact: true }).click();
    await page.locator('dialog[open]').getByLabel('Title', { exact: true }).fill(subject.title + ' library');
    await page.route('**/api/workspace', async route => {
      if (route.request().method() === 'POST') { await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'recordConflict' }) }); await page.unroute('**/api/workspace'); }
      else await route.continue();
    });
    await page.locator('dialog[open]').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('dialog[open]').getByRole('alert')).toBeVisible();
    report.push({ check: 'failed rename remains open with error', ok: true });
    await page.locator('dialog[open]').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.reload();
    const updated = page.locator('article').filter({ hasText: subject.title + ' library' });
    await expect(updated).toBeVisible();
    report.push({ check: 'subject rename from library persists', ok: true });
    await updated.getByRole('button', { name: 'Delete subject', exact: true }).click();
    await page.route('**/api/workspace', async route => {
      if (route.request().method() === 'POST') { await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'recordConflict' }) }); await page.unroute('**/api/workspace'); }
      else await route.continue();
    });
    await page.locator('dialog[open]').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.locator('dialog[open]').getByRole('alert')).toBeVisible();
    report.push({ check: 'failed delete remains open with error', ok: true });
  } else await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const deletion = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/workspace'));
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirm', exact: true }).click();
  const deleted = await (await deletion).json();
  report.push({ check: 'subject deletion', ok: deleted.ok, error: deleted.error });
  assert(deleted.ok);
  await page.reload();
  const state = await (await context.request.get('/api/workspace?groups=subjects')).json();
  assert(!state.fields.subjects.some(s => s.id === subject.id));
  assert(!state.fields.topics.some(t => t.subjectId === subject.id));
  report.push({ check: 'subject and topic deletion persists', ok: true });
} catch (error) { report.push({ check: 'browser audit', ok: false, message: error.message.slice(0, 180) }); process.exitCode = 1; }
finally {
  try {
    const state = await (await context.request.get('/api/workspace?groups=subjects')).json();
    if (state.fields?.subjects.some(s => s.id === subject.id)) await mutate([{ kind: 'delete', entity: 'subject', id: subject.id }]);
    if (existsSync(ownedFile) && JSON.parse(readFileSync(ownedFile, 'utf8')).id === subject.id) unlinkSync(ownedFile);
  } catch { report.push({ check: 'fixture cleanup', ok: false }); process.exitCode = 1; }
  await browser.close();
  writeFileSync(`.audit-local/subject-${process.argv.includes('--baseline') ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
