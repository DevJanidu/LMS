import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Read-only browser audit: credentials and screenshots stay in the ignored audit directory.
const baseURL = process.argv.find(arg => arg.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000';
const fixtures = JSON.parse(readFileSync('.audit-local/fixtures.json', 'utf8'));
const inventory = JSON.parse(readFileSync('docs/CRUD_MUTATION_INVENTORY.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const roles = process.argv.find(arg => arg.startsWith('--roles='))?.slice(8).split(',') ?? ['learner', 'admin', 'public'];
const selectedRoutes = process.argv.find(arg => arg.startsWith('--routes='))?.slice(9).split(',');
assert(roles.every(role => ['learner','admin','public'].includes(role)));
const previous = roles.length < 3 || selectedRoutes ? JSON.parse(readFileSync('docs/TYPOGRAPHY_RESULTS.json', 'utf8')) : { results:[],errors:[] };
const results = previous.results.filter(row => !(roles.includes(row.role) && (!selectedRoutes || selectedRoutes.includes(row.route)))), errors = previous.errors.filter(row => !roles.includes(row.role));
mkdirSync('.audit-local/typography', { recursive: true });
try {
  for (const role of roles) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ role, message: error.message }));
    if (role !== 'public') {
      const user = fixtures.users.find(user => user.role === role || (role === 'admin' && user.role === 'super_admin'));
      assert(user, `Missing ${role} audit fixture`);
      await page.goto('/login');
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(fixtures.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL(role === 'admin' ? /\/admin$/ : /\/dashboard$/, { timeout: 60000 });
    }
    let routes = inventory.routes.filter(file => file.endsWith('/page.tsx') && file.includes(role === 'public' ? '(public)' : role === 'learner' ? '(learner)' : '/admin/'))
      .filter(file => !file.includes('/onboarding/') && !file.includes('/reset-password/'))
      .map(file => '/' + file.split(role === 'admin' ? '/[locale]/' : role === 'learner' ? '/(learner)/' : '/(public)/')[1].replace('/page.tsx', ''));
    if (role === 'learner') {
      await page.goto('/subjects');
      await page.locator('.sf-subject-title').first().waitFor();
      const detail = await page.locator('.sf-subject-title').first().getAttribute('href');
      routes = routes.map(route => route.includes('[id]') ? detail : route);
    } else if (role === 'admin') {
      routes = routes.map(route => route.replace('[id]', fixtures.users[0].id));
    }
    routes = [...new Set(routes)].filter(Boolean);
    if (selectedRoutes) routes = routes.filter(route => selectedRoutes.includes(route));
    for (const theme of ['light', 'dark']) {
      await context.addCookies([{ name: 'sf-theme', value: theme, url: baseURL }]);
      for (const route of routes) {
        const response = await page.goto(route, { waitUntil: 'networkidle', timeout: 60000 });
        assert(response?.ok(), `${role} ${route}: HTTP ${response?.status()}`);
        await page.locator('main:visible,.sf-public:visible').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        for (const width of [1280, 1920, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
          // Wait for CSS sidebar motion and chart ResizeObserver to finish before measuring.
          await page.waitForTimeout(350);
          const measured = await page.evaluate(() => {
            const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
            const ownText = el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
            const entries = [...document.querySelectorAll('body *')].filter(el => visible(el) && ownText(el) && !['SCRIPT','STYLE'].includes(el.tagName)).map(el => {
              const s = getComputedStyle(el);
              return { tag: el.tagName, class: typeof el.className === 'string' ? el.className : 'svg', size: s.fontSize, weight: s.fontWeight, family: s.fontFamily, tracking: s.letterSpacing };
            });
            const fonts = [...new Set(entries.map(e => e.family))];
            const sizes = [...new Set(entries.map(e => e.size))];
            const weights = [...new Set(entries.map(e => e.weight))];
            const bad = entries.filter(e => ![12,13,14,15,18,24,26,32].includes(parseFloat(e.size)) || !['400','500','600'].includes(e.weight) || !/inter/i.test(e.family) || (e.tracking !== 'normal' && parseFloat(e.tracking) < -0.01 * parseFloat(e.size) - 0.001));
            const links = [...document.querySelectorAll('.sf-text-link')].filter(visible).map(el => { const s=getComputedStyle(el);return { size:s.fontSize,weight:s.fontWeight,color:s.color }; });
            const cards = [...document.querySelectorAll('.sf-subject,.sf-stat,.sf-panel,.sf-today,.sf-resource-row')].filter(visible).map(el => [...new Set([...el.querySelectorAll('*')].filter(node => visible(node) && ownText(node)).map(node => getComputedStyle(node).fontSize))]);
            const nav = [...document.querySelectorAll('.sf-sidebar .sf-nav-item')].filter(visible).map(el => ({ height:el.getBoundingClientRect().height, icon:el.querySelector('svg')?.getBoundingClientRect().width }));
            const hero = document.querySelector('.sf-dashboard-greeting');
            const heading = document.querySelector('h1');
            return { overflow:document.documentElement.scrollWidth > innerWidth,fonts,sizes,weights,bad,links,cards,nav,headingSize:heading && getComputedStyle(heading).fontSize,hero:hero && { gradient:getComputedStyle(hero,'::after').backgroundImage, colors:[...hero.querySelectorAll('p,h1,.sf-greeting-badge')].map(el=>getComputedStyle(el).color) } };
          });
          const failures = [];
          if (measured.overflow) failures.push('horizontal overflow');
          if (measured.bad.length) failures.push('font/token violation');
          if (measured.links.some(link => link.size !== '14px' || link.weight !== '500')) failures.push('text-link inconsistency');
          // The current scale specifies distinct stat, title, body, secondary and label roles.
          // Retain card measurements without enforcing the previous three-size restriction.
          if (measured.nav.some(row => row.height !== 48 || row.icon !== 18)) failures.push('sidebar rhythm');
          if (route === '/dashboard' && measured.headingSize !== (width < 640 ? '26px' : '32px')) failures.push('display size');
          results.push({ role,route,theme,width,status:failures.length ? 'FAIL' : 'PASS',failures,...measured });
          await page.screenshot({ path:`.audit-local/typography/${role}-${route.replaceAll('/','-')}-${theme}-${width}.png`, fullPage:true });
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync('docs/TYPOGRAPHY_RESULTS.json', JSON.stringify({ generatedAt:new Date().toISOString(),baseURL,conditions:'Read-only Chrome audit with existing isolated fixtures. Screenshots remain ignored locally. Onboarding and reset-token flows reviewed in source; authenticated completed fixtures cannot visit those states.',results,errors },null,2));
}
const failed = results.filter(row => row.status === 'FAIL');
console.info(JSON.stringify({ checks:results.length,passed:results.length-failed.length,failed:failed.map(({role,route,theme,width,failures,bad})=>({role,route,theme,width,failures,bad})),errors }));
assert.equal(failed.length,0,'Typography browser checks failed');
assert.equal(errors.length,0,'Browser runtime errors');
