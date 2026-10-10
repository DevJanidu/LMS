import { environment } from './env-runtime.mjs';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
if(!process.argv.includes('--acknowledge-current-test-database')||process.env.VERCEL_ENV==='production')throw new Error('Fixture-only database acknowledgement required');
const sql=neon(environment.DATABASE_URL),users=JSON.parse(readFileSync('.audit-local/crud-personas.json','utf8'));
for(const user of users){assert(/^audit-crud-[a-f0-9-]{36}@example\.com$/.test(user.email));const rows=await sql`select id from users where email=${user.email}`;for(const row of rows)await sql`delete from users where id=${row.id} and email=${user.email}`;console.info(JSON.stringify({persona:user.persona,remainingFixtureAccounts:(await sql`select id from users where email=${user.email}`).length}));}
