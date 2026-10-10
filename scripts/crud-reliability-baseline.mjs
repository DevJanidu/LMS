import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { environment } from './env-runtime.mjs';
import assert from 'node:assert/strict';

if (!process.argv.includes('--acknowledge-current-test-database') || process.env.VERCEL_ENV === 'production') throw new Error('Fixture-only database acknowledgement required');
const baseURL = process.argv.find(arg=>arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3100';
const fixture = JSON.parse(readFileSync('.audit-local/fixtures.json', 'utf8'));
const user = fixture.users[0];
assert(user.email.startsWith('audit-'));
const sql = neon(environment.DATABASE_URL);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ baseURL });
const subject = { id: crypto.randomUUID(), title: `Reliability ${crypto.randomUUID()}`, description: '', color: 'brand', status: 'active' };
const resource = { id: crypto.randomUUID(), subjectId: subject.id, title: `Reliability note ${crypto.randomUUID()}`, type: 'note', textContent: 'Scoped audit fixture' };
const results = [];
let owner;
try {
  assert((await context.request.post('/api/auth/sign-in/email', { headers: { Origin: baseURL }, data: { email: user.email, password: fixture.password } })).ok());
  [owner] = await sql`select id from users where email=${user.email}`;
  for (const [kind, value] of [['subject', subject], ['resource', resource]]) {
    const started = performance.now();
    const response = await context.request.post('/api/workspace', { headers: { Origin: baseURL }, data: { operations: [{ kind, value }] } });
    const body = await response.json(); assert(body.ok);
    const rows = kind === 'subject' ? await sql`select id from subjects where id=${value.id} and user_id=${owner.id}` : await sql`select id from resources where id=${value.id} and user_id=${owner.id}`;
    assert.equal(rows.length, 1);
    results.push({ case: `${kind}: confirmation then direct database read`, status: 'PASS', ms: Math.round(performance.now()-started), authoritativeRows: Boolean(body.changes) });
  }
  const page = await context.newPage();
  await page.goto(`/resources?search=${encodeURIComponent(resource.title)}`);
  const card = page.locator('article').filter({ hasText: resource.title });
  await expect(card).toBeVisible();
  let requests = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/workspace')) requests++; });
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = process.argv.includes('--after') ? page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/workspace')) : undefined;
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  if (confirmation) assert((await (await confirmation).json()).ok);
  await page.reload();
  const remains = await card.count();
  const rows = await sql`select id from resources where id=${resource.id} and user_id=${owner.id}`;
  results.push({ case: 'Library persisted row delete then reload', status: rows.length ? 'REPRODUCED' : 'PASS', mutationRequests: requests, visibleAfterReload: remains > 0, databaseRows: rows.length });
} catch (error) { results.push({ status: 'FAIL', error: error.name, message: error.message.slice(0,200) }); process.exitCode=1; }
finally {
  if (owner) await sql`delete from subjects where id=${subject.id} and user_id=${owner.id}`;
  await browser.close();
  writeFileSync(`docs/CRUD_RELIABILITY_${process.argv.includes('--after') ? 'AFTER' : 'BASELINE'}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), baseURL, results }, null, 2));
}
console.info(JSON.stringify(results));
