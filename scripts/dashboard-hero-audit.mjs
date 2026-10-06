import assert from "node:assert/strict";
export default async function audit({evaluate,navigate,viewport,screenshot,send}) {
  for(const theme of ['light','dark']) {
    await evaluate(`localStorage.setItem('theme-mode',${JSON.stringify(theme)})`);
    for(const width of [1920,1440,1280,1024,768,360,320]) {
      await viewport(width);await navigate('/dashboard');
      const layout=await evaluate(`(()=>{const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();return {greeting:rect('.sf-dashboard-greeting'),week:rect('.sf-dashboard-hero .sf-week'),today:rect('.sf-today'),main:rect('main'),count:document.querySelectorAll('.sf-week').length,days:document.querySelectorAll('.sf-week-day').length,oldWeek:!!document.querySelector('.sf-home-grid .sf-week'),overflow:document.documentElement.scrollWidth,progress:document.querySelector('.sf-week [role=progressbar]').getAttribute('aria-valuenow')}})()`);
      assert.equal(layout.count,1,'one weekly visualization');assert.equal(layout.days,7);assert.equal(layout.oldWeek,false);assert.ok(layout.overflow<=width,`overflow ${width}`);
      if(width>=1280){assert.ok(layout.week.x>layout.greeting.right);assert.ok(Math.abs(layout.week.y-layout.greeting.y)<1,'aligned eyebrows');}else{assert.ok(layout.week.y>=layout.greeting.bottom,'stacked week');}
      assert.ok(layout.today.y>=layout.week.bottom,'Today follows hero');
      await screenshot(`dashboard-hero-${theme}-${width}`);console.log(`PASS ${theme} ${width}: single reused week, hero alignment, responsive order, no overflow`);
    }
  }
  await send('Network.setCookie',{name:'NEXT_LOCALE',value:'ar',domain:'localhost',path:'/'});
  for(const width of [1440,360]) {await viewport(width);await navigate('/dashboard');assert.equal(await evaluate('document.documentElement.dir'),'rtl');assert.equal(await evaluate("document.querySelectorAll('.sf-week').length"),1);assert.ok(await evaluate(`document.documentElement.scrollWidth<=${width}`));await screenshot(`dashboard-hero-rtl-${width}`);}
}
