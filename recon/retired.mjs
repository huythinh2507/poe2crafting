import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const omens = () => p.$$eval('[data-omen]', os => os.map(o => o.innerText.replace(/\n/g, ' ')));
const note = () => p.locator('.omens-note').allInnerTexts();
const show = async handler => {
  await p.evaluate(h => { const c = window.__craft; c.S.method = c.CATALOGUE.find(m => m.handler === h); c.renderCraft(); }, handler);
};
for (const h of ['poe2_annulment', 'poe2_alchemy', 'poe2_regal', 'poe2_exalted', 'poe2_chaos', 'poe2_divine', 'poe2_vaal']) {
  await show(h);
  console.log(h.padEnd(16), await omens(), await note());
}
console.log(errs.join('\n') || 'no errors');
await b.close();
