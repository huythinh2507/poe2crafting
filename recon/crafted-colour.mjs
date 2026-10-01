import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
await p.evaluate(() => { for (const i of [0, 1, 2, 8, 9, 10]) document.querySelectorAll('.fam:not(.ref)')[i].querySelector('[data-add]').click(); });
const act = async (i, a) => { const m = p.locator('#itemBox .mod').nth(i); await m.scrollIntoViewIfNeeded(); await m.click({ button: 'right' }); await p.click(`[data-ctx="${a}"]`); };
await act(0, 'crafted');            // crafted only
await act(1, 'desecrate');          // desecrated only
await act(2, 'fracture');           // fractured only
await act(3, 'crafted'); await act(3, 'desecrate');   // crafted + desecrated (desecrated should win the bar)
const info = await p.$$eval('#itemBox .mod', ms => ms.map(m => { const c = getComputedStyle(m); return { classes: [...m.classList].filter(x => /crafted|desecrated|fractured/.test(x)).join('+') || '(none)', bar: c.boxShadow.split(' ').slice(0, 3).join(' '), bg: c.backgroundColor, label: [...m.querySelectorAll('.meta b')].map(x => x.innerText).join(',') }; }));
for (const i of info) console.log(JSON.stringify(i));
await p.locator('#tooltip').screenshot({ path: 'recon/crafted-colour.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
