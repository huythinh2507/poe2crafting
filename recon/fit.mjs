import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1870, height: 920 } });
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const id = await p.evaluate(() => { const c = window.__craft; return [...c.DB.items.values()].find(i => c.DB.text(i.label) === 'Maji Talisman').id; });
await p.goto(`http://localhost:5173/?group=8&class=90&item=${id}`);
await p.waitForSelector('#itemBox');
// 6 mods rare
await p.evaluate(async () => {
  const c = window.__craft, E = await import('/js/engine.js');
  c.S.item.rarity = 'rare';
  for (let k = 0; k < 8; k++) E.applyMethod(c.S.item, { handler: 'poe2_exalted', properties: [], constraints: [] });
  c.renderCraft();
});
const m = () => p.evaluate(() => { const s = document.querySelector('.sticky'); const r = s.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), scroll: s.scrollHeight, client: s.clientHeight, vh: innerHeight }; });
console.log('initial', await m());
await p.evaluate(() => window.scrollTo(0, 400));
await p.waitForTimeout(200);
const r = await m(); console.log('scrolled', r, r.scroll <= r.client ? 'FITS' : 'OVERFLOW');
await p.screenshot({ path: 'recon/fit.png' });
await b.close();
