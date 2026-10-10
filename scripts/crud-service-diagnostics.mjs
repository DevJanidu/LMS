import { environment } from './env-runtime.mjs';
import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { readFileSync,writeFileSync } from 'node:fs';
import { request } from '@playwright/test';
const sql=neon(environment.DATABASE_URL), redis=new Redis({url:environment.UPSTASH_REDIS_REST_URL,token:environment.UPSTASH_REDIS_REST_TOKEN,retry:false,signal:()=>AbortSignal.timeout(1500)});
const results=[];
function category(error){for(let depth=0;depth<5&&error;depth++,error=error.cause){if(['AbortError','TimeoutError'].includes(error.name))return 'timeout';if(['ENOTFOUND','ECONNRESET','ETIMEDOUT','ECONNREFUSED'].includes(error.code))return error.code;if(/^[0-9A-Z]{5}$/.test(error.code??''))return `postgres:${error.code}`;}return 'service_error';}
async function probe(service,run){const start=performance.now();try{const value=await run();results.push({service,ms:Math.round(performance.now()-start),...value});}catch(error){results.push({service,ms:Math.round(performance.now()-start),failure:category(error)});}}
for(let index=0;index<10;index++)await Promise.all([probe('neon-http',async()=>{await sql`select 1`;return {ok:true};}),probe('redis-1500ms',async()=>{await redis.ping();return {ok:true};})]);
const context=await request.newContext({baseURL:'http://localhost:3100'});
const fixture=JSON.parse(readFileSync('.audit-local/fixtures.json','utf8'));
await probe('sign-in',async()=>{const response=await context.post('/api/auth/sign-in/email',{headers:{Origin:'http://localhost:3100'},data:{email:fixture.users[1].email,password:fixture.password}});return {status:response.status()};});
for(let index=0;index<10;index++)await probe('authenticated-read',async()=>{const response=await context.get('/api/workspace?groups=subjects');const body=await response.json();return {status:response.status(),ok:body.ok,error:body.error};});
await context.dispose();writeFileSync('docs/CRUD_SERVICE_DIAGNOSTICS.json',JSON.stringify({generatedAt:new Date().toISOString(),results},null,2));console.info(JSON.stringify(results));
