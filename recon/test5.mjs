import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
await p.click('[data-tab="Socketables"]'); await p.click('[data-sub="Runes"]');
for (const n of [0, 1]) { await p.locator('.cur:not([disabled])').nth(n).click(); await p.click('#itemBox'); }
console.log(await p.evaluate(() => JSON.stringify(window.__craft.S.item.socketed.map(s => s.name))));
console.log('enabled after full:', await p.$$eval('.cur:not([disabled])', b => b.length));
await p.screenshot({ path: 'recon/mine5.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
