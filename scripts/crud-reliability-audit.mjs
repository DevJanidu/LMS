import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { environment } from './env-runtime.mjs';
import assert from 'node:assert/strict';

if (!process.argv.includes('--acknowledge-current-test-database') || process.env.VERCEL_ENV === 'production') throw new Error('Fixture-only database acknowledgement required; production refused');
// env-runtime loads .env.local, whose APP_URL may target a development server.
// Audit the explicitly selected local production server, independently of it.
const baseURL=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6)??'http://localhost:3100';
const sql=neon(environment.DATABASE_URL), browser=await chromium.launch({channel:'chrome',headless:true});
const results=[], users=['new','active','stress'].map(persona=>({persona,email:`audit-crud-${crypto.randomUUID()}@example.com`,password:`${crypto.randomUUID()}Aa!9`}));
const focus=process.argv.includes('--focus=stress'),resultPath=focus?'docs/CRUD_STRESS_RETEST_RESULTS.json':'docs/CRUD_RELIABILITY_RESULTS.json';
function persist(){writeFileSync(resultPath,JSON.stringify({generatedAt:new Date().toISOString(),baseURL,complete:false,focus:focus?'stress':undefined,conditions:'Explicit local production server; remote Neon/Redis; three UUID-scoped accounts; incremental results survive process interruption.',results},null,2));}
writeFileSync('.audit-local/crud-personas.json',JSON.stringify(users));
const tables={subject:'subjects',topic:'topics',resource:'resources',session:'study_sessions',block:'schedule_blocks'};
async function check(user,label,work){const start=performance.now();try{await work();results.push({persona:user.persona,case:label,status:'PASS',ms:Math.round(performance.now()-start)});console.info(`${user.persona}: ${label}: PASS`);}catch(error){await user.page?.screenshot({path:`.audit-local/crud-${user.persona}-failure.png`}).catch(()=>{});results.push({persona:user.persona,case:label,status:'FAIL',error:error.name,message:error.message.slice(0,300),navigation:user.lastNavigation});console.info(`${user.persona}: ${label}: FAIL (${error.name})`);throw error;}finally{persist();}}
async function send(user,operations,preconditions){const start=performance.now();const response=await user.context.request.post('/api/workspace',{headers:{Origin:baseURL},data:{operations,preconditions}});const body=await response.json();assert(body.ok,`HTTP ${response.status()}: ${body.error}, stage=${body.failureStage??'unknown'}, uncertain=${body.uncertain}`);assert(body.changes);results.push({persona:user.persona,case:'mutation timing',operations:operations.map(op=>op.kind),ms:Math.round(performance.now()-start),serverTiming:response.headers()['server-timing']});return body;}
async function dbRow(kind,id){const rows=await sql.query(`select * from ${tables[kind]} where id=$1`,[id]);return rows[0];}
async function refreshAndCheck(user,kind,id,expected){const [,row]=await Promise.all([user.page.reload(),dbRow(kind,id)]);if(expected===null)assert.equal(row,undefined);else{assert(row);for(const [field,value] of Object.entries(expected))assert.equal(row[field],value);}return row;}
async function register(user){
  user.context=await browser.newContext({baseURL});user.page=await user.context.newPage();
  user.page.on('response',response=>{if(response.request().isNavigationRequest())user.lastNavigation={status:response.status(),path:new URL(response.url()).pathname};});
  await check(user,'registration, onboarding, committed account',async()=>{
    await user.page.goto('/register');await user.page.getByLabel('Name',{exact:true}).fill(`Reliability ${user.persona}`);await user.page.getByLabel('Email',{exact:true}).fill(user.email);await user.page.getByLabel('Password',{exact:true}).fill(user.password);await user.page.getByRole('checkbox').check();await user.page.getByRole('button',{name:'Sign up',exact:true}).click();await expect(user.page).toHaveURL(/\/onboarding$/,{timeout:60000});
    for(let step=0;step<5;step++)await user.page.getByRole('button',{name:'Skip',exact:true}).click();await expect(user.page).toHaveURL(/\/dashboard$/,{timeout:60000});
    const [account]=await sql`select id,onboarding_completed_at from users where email=${user.email}`;assert(account?.onboarding_completed_at);user.id=account.id;
  });
}
async function lifecycle(user){
 const page=user.page, subject={id:crypto.randomUUID(),title:`Subject ${user.persona}`,description:'Fixture only',color:'brand',status:'active'};user.subject=subject;
 await page.goto('/subjects');
 await check(user,'subject create/update/delete confirmations survive immediate reload',async()=>{
   const created=await send(user,[{kind:'subject',value:subject}]);assert(created.changes.subjects[0].createdAt);await refreshAndCheck(user,'subject',subject.id,{title:subject.title});await expect(page.getByRole('link',{name:subject.title,exact:true})).toBeVisible();
   subject.title+=' updated';await send(user,[{kind:'subject',value:subject}]);await refreshAndCheck(user,'subject',subject.id,{title:subject.title});await expect(page.getByRole('link',{name:subject.title,exact:true})).toBeVisible();
   const disposable={...subject,id:crypto.randomUUID(),title:'Disposable subject'};await send(user,[{kind:'subject',value:disposable}]);await send(user,[{kind:'delete',entity:'subject',id:disposable.id}]);await refreshAndCheck(user,'subject',disposable.id,null);
 });
 if(user.persona==='active')await check(user,'large dataset: 200 topics, 3000 sessions, 125 resources',async()=>{
   await sql`insert into topics (subject_id,title,sort_order) select ${subject.id}::uuid,'Seed topic '||n,n-1 from generate_series(1,199) n`;
   await sql`insert into study_sessions (user_id,subject_id,started_at,ended_at,duration_seconds,source,status) select ${user.id}::uuid,${subject.id}::uuid,now()-n*interval '1 day',now()-n*interval '1 day'+interval '30 minutes',1800,'manual','valid' from generate_series(1,3000) n`;
   await sql`insert into resources (user_id,subject_id,type,title,text_content) select ${user.id}::uuid,${subject.id}::uuid,'note','Seed resource '||n,'Fixture' from generate_series(1,125) n`;
   await sql`update users set updated_at=clock_timestamp() where id=${user.id}`;
   assert.equal((await sql`select count(*)::int as count from study_sessions where user_id=${user.id}`)[0].count,3000);
 });
 const topic={id:crypto.randomUUID(),subjectId:subject.id,title:'Topic fixture',status:'notStarted',sortOrder:user.persona==='active'?199:0};
 await page.goto(`/subjects/${subject.id}`);
 await check(user,'topic create/update/delete and dependent references survive reload',async()=>{
   await send(user,[{kind:'topic',value:topic}]);await refreshAndCheck(user,'topic',topic.id,{title:topic.title});
   await send(user,[{kind:'topic',value:{...topic,status:'completed'}}]);await refreshAndCheck(user,'topic',topic.id,{status:'completed'});
   const resource={id:crypto.randomUUID(),subjectId:subject.id,topicId:topic.id,type:'note',title:'Preserved after topic delete',textContent:'Fixture'};
   await send(user,[{kind:'resource',value:resource}]);await send(user,[{kind:'delete',entity:'topic',id:topic.id}]);await refreshAndCheck(user,'topic',topic.id,null);assert.equal((await dbRow('resource',resource.id)).topic_id,null);await send(user,[{kind:'delete',entity:'resource',id:resource.id}]);
 });
 for(const type of ['note','link','video'])await check(user,`${type} create/update/delete with SQL verification and reload`,async()=>{
   const resource={id:crypto.randomUUID(),subjectId:subject.id,type,title:`${type} ${user.persona}`,...(type==='note'?{textContent:'Original content'}:{url:'https://www.youtube.com/watch?v=abcdefghijk'})};
   await page.goto(`/resources?search=${encodeURIComponent(resource.title)}`);
   await send(user,[{kind:'resource',value:resource}]);await refreshAndCheck(user,'resource',resource.id,{title:resource.title});await expect(page.locator('article').filter({hasText:resource.title})).toBeVisible();
   await send(user,[{kind:'resource',value:{...resource,title:resource.title+' edited'}}]);await refreshAndCheck(user,'resource',resource.id,{title:resource.title+' edited'});
   const response=page.waitForResponse(r=>r.url().endsWith('/api/workspace')&&r.request().method()==='POST');
   await page.locator('article').filter({hasText:resource.title+' edited'}).getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();assert((await(await response).json()).ok);
   await refreshAndCheck(user,'resource',resource.id,null);await expect(page.locator('article').filter({hasText:resource.title+' edited'})).toHaveCount(0);
 });
 await check(user,'file upload/edit/delete, immediate reload, exact download and foreign denial',async()=>{
   const title=`File ${user.persona} ${crypto.randomUUID()}`;await page.goto(`/resources?search=${encodeURIComponent(title)}`);await page.getByRole('button',{name:'Add Resource',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Title',{exact:true}).fill(title);
   for(const [label,option] of [['Subject',subject.title],['Type','File']]){await dialog.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
   const buffer=Buffer.from('UUID-scoped reliability upload\n');await dialog.locator('input[type="file"]').setInputFiles({name:'fixture.txt',mimeType:'text/plain',buffer});await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toBeHidden({timeout:90000});
   const [file]=await sql`select * from resources where user_id=${user.id} and title=${title}`;assert(file);await Promise.all([page.reload(),(async()=>{assert.equal(Number((await dbRow('resource',file.id)).size_bytes),buffer.length);})()]);
   const download=await user.context.request.get(`/api/files/${file.id}`,{maxRedirects:0});assert.equal(download.status(),302);assert.deepEqual(await(await user.context.request.get(download.headers().location)).body(),buffer);
   const foreign=users.find(other=>other!==user);assert.equal((await foreign.context.request.get(`/api/files/${file.id}`,{maxRedirects:0})).status(),404);
   await send(user,[{kind:'resource',value:{id:file.id,subjectId:subject.id,type:'file',title:title+' edited'}}]);await refreshAndCheck(user,'resource',file.id,{title:title+' edited'});await send(user,[{kind:'delete',entity:'resource',id:file.id}]);await refreshAndCheck(user,'resource',file.id,null);
 });
 await check(user,'manual sessions create/edit/delete, history and analytics',async()=>{
   const session={id:crypto.randomUUID(),subjectId:subject.id,startedAt:new Date(Date.now()-3600000).toISOString(),endedAt:new Date(Date.now()-1800000).toISOString(),note:'Original'};
   await page.goto('/study/history');await send(user,[{kind:'session',value:session}]);await refreshAndCheck(user,'session',session.id,{duration_seconds:1800});
   await send(user,[{kind:'session',value:{...session,note:'Changed'}}]);await refreshAndCheck(user,'session',session.id,{note:'Changed'});
   await send(user,[{kind:'delete',entity:'session',id:session.id}]);await refreshAndCheck(user,'session',session.id,null);
   const analytics=await(await user.context.request.get('/api/workspace?groups=analytics')).json();assert(analytics.ok);
 });
 await check(user,'timer start/pause/resume/finish confirmed server state',async()=>{
   for(const command of ['start','pause','resume','finish']){const value=command==='start'?{command,subjectId:subject.id}:{command};const result=await send(user,[{kind:'timer',value}]);assert('timer' in result.changes);const rows=await sql`select * from active_timers where user_id=${user.id}`;if(command==='finish')assert.equal(rows.length,0);else{assert.equal(rows.length,1);assert.equal(Boolean(rows[0].paused_at),command==='pause');}await page.reload();}
 });
 await check(user,'profile and notification confirmations survive reload',async()=>{
   const shell=await(await user.context.request.get('/api/workspace?groups=shell')).json();const value={...shell.fields.user,name:`Changed ${user.persona}`,weeklyTargetMinutes:125};await send(user,[{kind:'profile',value}]);await page.goto('/settings');await page.reload();assert.equal((await sql`select name from users where id=${user.id}`)[0].name,value.name);
   const id=crypto.randomUUID();await sql`insert into notifications (id,user_id,type,title,body,deduplication_key,scheduled_for) values (${id},${user.id},'block','Audit','Audit',${id},now())`;await send(user,[{kind:'readNotification',id}]);await page.reload();assert((await sql`select read_at from notifications where id=${id} and user_id=${user.id}`)[0].read_at);
 });
 await check(user,'recurring calendar create/move/replay/delete and SQL persistence',async()=>{
   const block={id:crypto.randomUUID(),subjectId:subject.id,title:'Recurring fixture',startsAt:'2026-10-12T10:00:00Z',endsAt:'2026-10-12T11:00:00Z',repeat:'weekly',weekdays:[1],timezone:'UTC',color:'brand',exceptions:[]};
   const post=async data=>{const response=await user.context.request.post('/api/calendar',{headers:{Origin:baseURL},data});const result=await response.json();assert(result.ok,`Calendar ${response.status()}: ${result.error}`);return result;};
   const create={operationId:crypto.randomUUID(),command:{kind:'create',value:block}};const created=await post(create);await post(create);await page.goto('/calendar');await refreshAndCheck(user,'block',block.id,{title:block.title});
   const moved=await post({operationId:crypto.randomUUID(),expectedUpdatedAt:created.blocks[0].updatedAt,command:{kind:'move',id:block.id,date:'2026-10-12',scope:'one',startsAt:'2026-10-12T12:00:00Z',endsAt:'2026-10-12T13:00:00Z'}});await page.reload();assert.equal((await sql`select count(*)::int as count from schedule_exceptions where block_id=${block.id}`)[0].count,1);
   await post({operationId:crypto.randomUUID(),expectedUpdatedAt:moved.blocks[0].updatedAt,command:{kind:'delete',id:block.id,date:'2026-10-12',scope:'all'}});await refreshAndCheck(user,'block',block.id,null);
 });
 await check(user,'owned export includes persisted rows and excludes authentication secrets',async()=>{const response=await user.context.request.get('/api/export');assert(response.ok());const data=await response.json();assert.equal(data.user.id,user.id);assert(data.subjects.every(row=>row.userId===user.id));for(const forbidden of ['accounts','authSessions','password','token','verifications'])assert(!(forbidden in data));});
}
async function stress(user){
 await check(user,'concurrent writes and stale note preimage rejection',async()=>{
   const make=n=>({id:crypto.randomUUID(),subjectId:user.subject.id,type:'note',title:`Concurrent ${n}`,textContent:'Original'});const a=make(1),b=make(2);
   await Promise.all([send(user,[{kind:'resource',value:a}]),send(user,[{kind:'resource',value:b}])]);assert(await dbRow('resource',a.id));assert(await dbRow('resource',b.id));
   await send(user,[{kind:'resource',value:{...a,textContent:'Newer content'}}]);
   const response=await user.context.request.post('/api/workspace',{headers:{Origin:baseURL},data:{operations:[{kind:'resource',value:{...a,title:'Stale'}}],preconditions:[{kind:'resource',id:a.id,values:{textContent:'Original'}}]}});assert.equal(response.status(),409);assert.equal((await response.json()).error,'recordConflict');assert.equal((await dbRow('resource',a.id)).text_content,'Newer content');
 });
 await check(user,'lost response: one write, uncertainty warning, navigation, reload and committed database row',async()=>{
   const page=user.page;await page.goto('/subjects');let release;const hold=new Promise(resolve=>{release=resolve;});let persisted;let intercepted,interceptionFailed;
   const reached=new Promise((resolve,reject)=>{intercepted=resolve;interceptionFailed=reject;});void reached.catch(()=>{});let writes=0;
   await page.route('**/api/workspace',async route=>{if(route.request().method()!=='POST')return route.continue();writes++;try{const response=await route.fetch();const result=await response.json();assert(result.ok,`Held request: ${response.status()} ${result.error} stage=${result.failureStage}`);persisted=route.request().postDataJSON().operations[0].value.id;intercepted();await hold;await route.abort().catch(()=>{});}catch(error){interceptionFailed(error);await route.abort().catch(()=>{});}});
   await page.getByRole('button',{name:'Add Subject',exact:true}).click();const title='Lost response fixture';await page.getByLabel('Title',{exact:true}).fill(title);const start=performance.now();await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('link',{name:title,exact:true})).toBeVisible();const optimisticMs=Math.round(performance.now()-start);await expect(page.getByRole('status').filter({hasText:'Saving changes'})).toBeVisible();
   await page.locator('a[href="/resources"]').first().click();await expect(page).toHaveURL(/\/resources$/);await reached;release();await expect(page.getByRole('alert').filter({hasText:'Some changes were not confirmed'})).toBeVisible();await page.unroute('**/api/workspace');await page.reload();await expect(page.getByRole('alert').filter({hasText:'Some changes were not confirmed'})).toBeVisible();assert(await dbRow('subject',persisted));assert.equal(writes,1);results.push({persona:user.persona,case:'optimistic feedback during held acknowledgement',ms:optimisticMs});await page.getByRole('button',{name:'I have reviewed my changes',exact:true}).click();
 });
 await check(user,'known rejection rolls back the optimistic row and reports failure',async()=>{
   const page=user.page;await page.goto('/subjects');await page.route('**/api/workspace',route=>route.request().method()==='POST'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:'recordConflict'})}):route.continue());await page.getByRole('button',{name:'Add Subject',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Rejected fixture');await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'This record changed elsewhere'})).toBeVisible();await expect(page.getByRole('link',{name:'Rejected fixture',exact:true})).toHaveCount(0);await page.unroute('**/api/workspace');assert.equal((await sql`select count(*)::int as count from subjects where user_id=${user.id} and title='Rejected fixture'`)[0].count,0);
 });
}
try {
 for(const user of users)await register(user);
 if(focus){for(const user of users){user.subject={id:crypto.randomUUID(),title:'Focused stress fixture',description:'',color:'brand',status:'active'};await send(user,[{kind:'subject',value:user.subject}]);}}
 else {
   const workflows=await Promise.allSettled(users.map(user=>lifecycle(user)));if(workflows.some(row=>row.status==='rejected'))process.exitCode=1;
   for(const user of users)try{await check(user,'cross-user read/write isolation',async()=>{const other=users.find(row=>row!==user&&row.subject);assert(other);const response=await user.context.request.post('/api/workspace',{headers:{Origin:baseURL},data:{operations:[{kind:'delete',entity:'subject',id:other.subject.id}]}});assert.equal(response.status(),409);assert(await dbRow('subject',other.subject.id));const read=await(await user.context.request.get('/api/workspace?groups=subjects')).json();assert(read.fields.subjects.every(row=>row.userId===user.id));});}catch{process.exitCode=1;}
 }
 try{await stress(users[2]);}catch{process.exitCode=1;}
 await check(users[2],'expired session returns 401 without writing',async()=>{await sql`delete from sessions where user_id=${users[2].id}`;const response=await users[2].context.request.post('/api/workspace',{headers:{Origin:baseURL},data:{operations:[{kind:'delete',entity:'subject',id:users[2].subject.id}]}});assert.equal(response.status(),401);assert(await dbRow('subject',users[2].subject.id));});
}catch(error){process.exitCode=1;results.push({case:'audit interrupted',status:'FAIL',error:error.name,message:error.message.slice(0,300)});}
finally {
 for(const user of users){if(user.id){try{await sql`delete from users where id=${user.id} and email=${user.email}`;results.push({persona:user.persona,case:'fixture cleanup',status:'PASS'});}catch{results.push({persona:user.persona,case:'fixture cleanup',status:'FAIL'});process.exitCode=1;}}}
 await browser.close();writeFileSync(resultPath,JSON.stringify({generatedAt:new Date().toISOString(),baseURL,complete:true,focus:focus?'stress':undefined,conditions:'Explicit local production server, remote configured Neon and Redis, three fresh UUID-scoped accounts. No shared settings changes. Cleanup restricted to these accounts.',results},null,2));
}
console.info(JSON.stringify({passed:results.filter(row=>row.status==='PASS').length,failed:results.filter(row=>row.status==='FAIL').length}));
