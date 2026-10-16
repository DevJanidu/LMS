// Read-only public smoke checks: no signup, AI generation, cron, migration or writes.
const input = process.argv[2];
let origin;
try {
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error();
  origin = url.origin;
} catch { console.error('Provide a public HTTPS origin or local HTTP origin without credentials.'); process.exit(1); }
let failed = false;
for (const path of ['/', '/login', '/api/health', '/api/auth/get-session', '/dashboard']) {
  try {
    const response = await fetch(origin + path, {redirect:'manual', signal:AbortSignal.timeout(20000)});
    let ok = response.status === 200;
    if (path === '/api/health') ok &&= (await response.json()).ok === true;
    if (path === '/dashboard') {
      const location = new URL(response.headers.get('location') || '/', origin);
      ok = [302,303,307,308].includes(response.status) && location.origin === origin && /\/(?:en\/)?login$/.test(location.pathname);
    }
    if (path === '/api/auth/get-session') ok &&= (await response.json()) === null;
    console.log(JSON.stringify({path,status:response.status,ok}));
    failed ||= !ok;
  } catch { console.log(JSON.stringify({path,ok:false})); failed = true; }
}
process.exitCode = failed ? 1 : 0;
