import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const baseline = process.argv.includes('--baseline');
const baseURL = 'http://localhost:3000';
const fixture = JSON.parse(readFileSync('.audit-local/fixtures.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
mkdirSync('.audit-local/font-rendering', { recursive: true });
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(fixture.users[0].email);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 60000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const routes = baseline ? ['/dashboard'] : ['/dashboard','/subjects','/study','/calendar','/analytics','/resources','/settings'];
  for (const theme of baseline ? ['light'] : ['light','dark']) {
    await context.addCookies([{ name: 'sf-theme', value: theme, url: baseURL }]);
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: 'networkidle', timeout: 60000 });
      assert(response?.ok(), `${route}: ${response?.status()}`);
      if (route === '/analytics') await page.locator('.sf-chart .apexcharts-svg').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const width of baseline ? [1280] : [1280,390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(350); // CSS sidebar/ResizeObserver settling only; no mutation delay.
        let computed, rendered, captureRetries = 0;
        for (;;) {
          try {
        computed = await page.evaluate(() => {
          document.querySelectorAll('[data-font-audit]').forEach(el => el.removeAttribute('data-font-audit'));
          const entries = [];
          for (const el of document.querySelectorAll('body *')) {
            if (!el.getClientRects().length || ['SCRIPT','STYLE'].includes(el.tagName)) continue;
            const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
            if (!hasText && !el.matches('input,textarea,select')) continue;
            const s = getComputedStyle(el);
            if (s.visibility === 'hidden') continue;
            el.setAttribute('data-font-audit', String(entries.length));
            entries.push({ tag:el.tagName,class:typeof el.className === 'string' ? el.className : 'svg',family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,tracking:s.letterSpacing,variant:s.fontVariantNumeric });
          }
          const s=getComputedStyle(document.body);
          return { entries,zoom:visualViewport.scale,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,synthesis:getComputedStyle(document.documentElement).fontSynthesis,body:{family:s.fontFamily,features:s.fontFeatureSettings,opticalSizing:s.fontOpticalSizing,color:s.color} };
        });
        const { root } = await cdp.send('DOM.getDocument');
        const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId:root.nodeId,selector:'[data-font-audit]' });
        assert.equal(nodeIds.length, computed.entries.length, 'DOM changed during font capture');
        rendered = [];
        for (let i=0;i<nodeIds.length;i+=32) {
          const batch=await Promise.all(nodeIds.slice(i,i+32).map(async nodeId => {
            const [{fonts},{attributes}] = await Promise.all([cdp.send('CSS.getPlatformFontsForNode',{nodeId}),cdp.send('DOM.getAttributes',{nodeId})]);
            const index=Number(attributes[attributes.indexOf('data-font-audit')+1]);
            return { index,fonts:fonts.filter(font=>font.glyphCount>0).map(({familyName,postScriptName,isCustomFont,glyphCount})=>({familyName,postScriptName,isCustomFont,glyphCount})) };
          })); rendered.push(...batch);
        }
            break;
          } catch (error) {
            if (!/Could not find node|DOM changed during font capture/.test(String(error)) || captureRetries++ >= 3) throw error;
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          }
        }
        const nonInter=rendered.filter(row=>row.fonts.some(font=>!/inter/i.test(font.familyName))).map(row=>({element:computed.entries[row.index],fonts:row.fonts}));
        const badWeights=computed.entries.filter(row=>!['400','500','600'].includes(row.weight));
        const badSizes=computed.entries.filter(row=>![12,13,14,15,18,24,26,32].includes(parseFloat(row.size)));
        const failures=[];
        if (nonInter.length) failures.push('rendered fallback');
        if (badWeights.length || badSizes.length) failures.push('type scale');
        if (computed.overflow) failures.push('overflow');
        if (computed.zoom !== 1 || computed.dpr !== 1) failures.push('zoom');
        if (computed.synthesis !== 'none' || computed.body.opticalSizing !== 'auto' || computed.body.features.includes('tnum')) failures.push('font configuration');
        results.push({route,theme,width,status:failures.length ? 'FAIL':'PASS',failures,captureRetries,...computed,rendered,nonInter,badWeights,badSizes});
        await page.screenshot({path:`.audit-local/font-rendering/${baseline?'before':'after'}-${route.slice(1)}-${theme}-${width}.png`,fullPage:true});
        console.info(JSON.stringify({route,theme,width,elements:computed.entries.length,nonInter:nonInter.map(row=>({tag:row.element.tag,class:row.element.class,fonts:row.fonts})),badWeights:badWeights.length}));
      }
    }
  }
} finally {
  await browser.close();
  writeFileSync(`docs/FONT_SMOOTHNESS_${baseline?'BASELINE':'RESULTS'}.json`,JSON.stringify({generatedAt:new Date().toISOString(),conditions:'Chrome on Windows, device scale factor 1, 100% visual viewport zoom. CSS.getPlatformFontsForNode is the CDP equivalent of DevTools Rendered Fonts; source fixture credentials and screenshots remain ignored.',results,errors},null,2));
}
if (!baseline) { assert(results.every(row=>row.status==='PASS'),'Rendered font audit failed'); assert.equal(errors.length,0); }
