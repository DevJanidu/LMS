import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export default async function audit(
  { evaluate, navigate, viewport, screenshot, send },
  baseline = false,
  interactionsOnly = false,
) {
  if (baseline) {
    await viewport(1440);
    await navigate("/dashboard");
    console.log(
      JSON.stringify(
        await evaluate(
          `({icons:[...document.querySelectorAll('.sf-nav-item svg')].map(e=>({viewBox:e.getAttribute('viewBox'),width:e.getAttribute('width'),height:e.getAttribute('height'),rect:e.getBoundingClientRect().toJSON(),bbox:e.getBBox(),html:e.outerHTML.slice(0,250)})),header:document.querySelector('.sf-topbar').getBoundingClientRect().toJSON(),search:document.querySelector('.sf-search').getBoundingClientRect().toJSON()})`,
        ),
        null,
        2,
      ),
    );
    await screenshot("polish-before");
    return;
  }
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
    "/admin",
    "/admin/users",
    "/admin/users/learner-1",
    "/admin/analytics",
    "/admin/storage",
    "/admin/settings",
  ];
  if (!interactionsOnly)
    for (const theme of ["light", "dark"]) {
      await evaluate(
        `localStorage.setItem('theme-mode',${JSON.stringify(theme)})`,
      );
      for (const width of [1920, 1440, 1280, 1024, 768, 360]) {
        await viewport(width);
        for (const route of routes) {
          await navigate(route);
          const metric = await evaluate(
            `(()=>{const h=document.querySelector('.sf-topbar').getBoundingClientRect(),s=document.querySelector('.sf-search').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth,headerHeight:h.height,searchOffset:Math.abs((s.x+s.width/2)-(h.x+h.width/2)),icons:[...document.querySelectorAll('.sf-nav-item svg')].map(e=>({viewBox:e.getAttribute('viewBox'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),main:document.querySelector('main').getBoundingClientRect().toJSON(),calendar:document.querySelector('.planner-timetable')?.getBoundingClientRect().toJSON()}})()`,
          );
          assert.ok(
            metric.overflow <= width,
            `overflow ${route} ${width}: ${metric.overflow}`,
          );
          assert.equal(
            metric.headerHeight,
            72,
            `header height ${route} ${width}`,
          );
          if (width >= 640)
            assert.ok(
              metric.searchOffset < 1,
              `centered search ${width} ${route}: ${metric.searchOffset}`,
            );
          const gap = await evaluate(
            "(()=>{const s=document.querySelector('.sf-search').getBoundingClientRect(),a=document.querySelector('.sf-header-actions').getBoundingClientRect();return document.documentElement.dir==='rtl'?s.left-a.right:a.left-s.right})()",
          );
          assert.ok(gap >= 7, `search/action gap ${route} ${width}: ${gap}`);
          if (width >= 1024)
            assert.ok(
              metric.icons.every(
                (e) =>
                  e.viewBox === "0 0 24 24" &&
                  e.width === 20 &&
                  e.height === 20,
              ),
              "icon viewBox and dimensions",
            );
          assert.equal(
            await evaluate(
              "[...document.querySelectorAll('.sf-desktop-menu,.sf-mobile-menu')].filter(e=>getComputedStyle(e).display!=='none').length",
            ),
            1,
            "one responsive menu control",
          );
          if (route === "/calendar")
            assert.ok(
              Math.abs(metric.calendar.x - metric.main.x) < 1 &&
                Math.abs(metric.calendar.width - metric.main.width) < 1,
              "full width planner",
            );
          await screenshot(
            `polish-${route.slice(1).replaceAll("/", "-")}-${theme}-${width}`,
          );
        }
        console.log(
          `PASS ${theme} ${width}: all major routes, page width, header and icons`,
        );
        const panels = routes
          .map((route) => {
            const name = `polish-${route.slice(1).replaceAll("/", "-")}-${theme}-${width}`;
            const data = readFileSync(
              `docs/screenshots/redesign/${name}.png`,
            ).toString("base64");
            return `<figure style="margin:0;background:white;padding:8px;border-radius:4px"><figcaption style="font:13px Arial;color:#20283d;margin-bottom:6px">${route} · ${theme} · ${width}</figcaption><img src="data:image/png;base64,${data}" style="width:100%;height:330px;object-fit:contain;object-position:top"></figure>`;
          })
          .join("");
        await viewport(1920, 1200);
        await evaluate(
          `(()=>{const el=document.createElement('div');el.id='polish-review';el.style='position:fixed;inset:0;z-index:9999999;background:#edf0f5;padding:12px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px;overflow:hidden';el.innerHTML=${JSON.stringify(panels)};document.body.append(el)})()`,
        );
        await screenshot(`polish-review-${theme}-${width}`);
        await evaluate("document.getElementById('polish-review').remove()");
      }
    }
  await viewport(1440);
  await evaluate("localStorage.setItem('theme-mode','light')");
  await navigate("/dashboard");
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))",
  );
  assert.ok(
    await evaluate("!!document.querySelector('dialog[open]')"),
    "command shortcut",
  );
  await evaluate(
    "document.querySelector('dialog[open] button[aria-label=Close]').click()",
  );
  await evaluate(
    "document.querySelector('.sf-notification-menu summary').click()",
  );
  assert.ok(
    await evaluate("document.querySelector('.sf-notification-menu').open"),
  );
  await evaluate(
    "document.querySelector('.sf-notification-menu summary').click()",
  );
  await evaluate("document.querySelector('.sf-profile-menu summary').click()");
  assert.ok(
    await evaluate(
      "!!document.querySelector('.sf-account-popover a[href=\"/settings\"]')",
    ),
  );
  await evaluate(
    "document.querySelector('.sf-account-popover button:not(.sf-mobile-notification-action)').click()",
  );
  assert.ok(
    await evaluate("document.documentElement.classList.contains('dark')"),
    "profile theme action",
  );
  await evaluate("document.querySelector('.sf-profile-menu summary').click()");
  await evaluate("document.querySelector('.sf-desktop-menu').click()");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    await evaluate(
      "document.querySelector('.sf-sidebar').getBoundingClientRect().width",
    ),
    80,
  );
  await screenshot("polish-collapsed");
  await evaluate("document.querySelector('.sf-desktop-menu').click()");
  await viewport(360);
  await navigate("/dashboard");
  await evaluate("document.querySelector('.sf-mobile-menu').click()");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(
    await evaluate(
      "document.querySelector('.sf-sidebar').getBoundingClientRect().x>=0",
    ),
    "mobile drawer",
  );
  await screenshot("polish-mobile-navigation");
  await evaluate(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
  );
  await evaluate("document.querySelector('.sf-mobile-focus').click()");
  assert.ok(
    await evaluate("!!document.querySelector('dialog[open]')"),
    "mobile focus launcher",
  );
  await screenshot("polish-mobile-focus");
  await evaluate(
    "document.querySelector('dialog[open] button[aria-label=Close]').click()",
  );
  await evaluate(
    "document.querySelector('.sf-profile-menu summary').click();document.querySelector('.sf-mobile-notification-action').click()",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.sf-notification-menu').open && getComputedStyle(document.querySelector('.sf-notification-menu .sf-header-popover')).display!=='none'",
    ),
    "mobile notifications",
  );
  await screenshot("polish-mobile-notifications");
  await evaluate("document.querySelector('.sf-notification-menu').open=false");
  console.log(
    "PASS command shortcut, notifications, profile, theme, sidebar collapse, mobile drawer and focus launcher",
  );
  await send("Network.setCookie", {
    name: "NEXT_LOCALE",
    value: "ar",
    domain: "localhost",
    path: "/",
  });
  for (const width of [1440, 768, 360]) {
    await viewport(width);
    await navigate("/dashboard");
    assert.equal(await evaluate("document.documentElement.dir"), "rtl");
    assert.ok(await evaluate(`document.documentElement.scrollWidth<=${width}`));
    await screenshot(`polish-rtl-${width}`);
  }
  console.log("PASS polish responsive and RTL audit");
  await send('Network.setCookie',{name:'NEXT_LOCALE',value:'en',domain:'localhost',path:'/'});
  for(const theme of ['light','dark']) {
    await evaluate(`localStorage.setItem('theme-mode',${JSON.stringify(theme)})`);
    for(const width of [1440,768,360]) {await viewport(width);for(const route of ['/login','/register','/forgot-password','/reset-password','/onboarding']){await navigate(route);assert.ok(await evaluate(`document.documentElement.scrollWidth<=${width}`),`auth overflow ${route} ${width}`);await screenshot(`polish-${route.slice(1)}-${theme}-${width}`);}}
  }
  console.log('PASS authentication and onboarding shared-control layouts');
}
