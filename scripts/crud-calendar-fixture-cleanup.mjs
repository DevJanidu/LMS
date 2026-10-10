import { environment } from './env-runtime.mjs';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
if(!process.argv.includes('--acknowledge-current-test-database')||process.env.VERCEL_ENV==='production')throw new Error('Fixture-only database acknowledgement required');
const fixture=JSON.parse(readFileSync('.audit-local/fixtures.json','utf8')),user=fixture.users[0];assert(user.email.startsWith('audit-'));
const sql=neon(environment.DATABASE_URL);const rows=await sql`select b.id,b.title from schedule_blocks b join users u on u.id=b.user_id where b.user_id=${user.id} and u.email=${user.email} and b.title like 'Calendar audit %'`;
let removed=0;for(const row of rows){if(!/^Calendar audit [a-f0-9]{8}(?: |$)/.test(row.title))continue;const deleted=await sql`delete from schedule_blocks where id=${row.id} and user_id=${user.id} and title=${row.title} returning id`;removed+=deleted.length;}
console.info(JSON.stringify({removedInterruptedCalendarFixtures:removed}));
