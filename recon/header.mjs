import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
console.log('header text:', JSON.stringify((await p.innerText('header.top')).replace(/\n+/g, ' | ')));
console.log('tabs:', await p.$$eval('[data-tab]', ts => ts.map(t => t.innerText)));
console.log('"Generate" anywhere on the page:', (await p.innerText('body')).includes('Generate'), '| "Crafting" in header:', (await p.innerText('header.top')).includes('Crafting'));
for (const t of ['Essences', 'Desecrate', 'Socketables', 'Currencies']) { await p.click(`[data-tab="${t}"]`); }
console.log('currency buttons on the Currencies tab:', await p.locator('.currencies .cur, .currencies .cur-wrap').count() > 10);
console.log(errs.join('\n') || 'no errors');
await p.screenshot({ path: 'recon/header.png', clip: { x: 0, y: 0, width: 1400, height: 260 } });
await b.close();
