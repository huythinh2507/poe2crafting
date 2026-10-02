// UI test for the "Estimated cost" panel. Run with the server up: node recon/spend-ui.mjs
import { chromium } from 'playwright';
const OUT = process.env.SHOTS || '';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
await p.evaluate(async () => {
  const C = window.__craft, { S, DB, CATALOGUE, apply } = C;
  const c = [...DB.classes.values()].find(c => DB.text(c.label) === 'Bows');
  S.group = c.group; S.cls = c;
  C.selectBase([...DB.items.values()].filter(i => i.class === c.id && i.domain === 1 && i.drop).pop());
  const m = h => CATALOGUE.find(x => x.handler === h);
  apply(m('poe2_transmutation'), true); apply(m('poe2_regal'), true); apply(m('poe2_exalted'), true); apply(m('poe2_exalted'), true);
  C.charge('Stone Rune');          // an unpriced name
  C.renderCraft();
});
const total0 = await p.locator('.spend-head .div').innerText();
ok(/\d/.test(total0), 'total shown: ' + total0.replace(/\s+/g, ' '));
ok((await p.locator('.spend-sub').innerText()).includes('5 uses'), 'use count: ' + (await p.locator('.spend-sub').innerText()));
ok((await p.locator('.spend-warn').count()) === 1 && (await p.locator('.spend-warn').innerText()).includes('Stone Rune'), 'unpriced warning names Stone Rune');
ok((await p.locator('.spend-rows').count()) === 0, 'breakdown collapsed by default');
await p.click('[data-spend-toggle]');
const rows = await p.locator('.spend-row').count();
ok(rows === 4, 'breakdown has one row per distinct item (' + rows + ')');
// override a price: total changes, unpriced warning goes away
await p.locator('.spend-row.unpriced .price-input').fill('0.5'); await p.locator('.spend-row.unpriced .price-input').dispatchEvent('change');
const total1 = await p.locator('.spend-head .div').innerText();
ok(total1 !== total0, 'override changed the total: ' + total0.replace(/\s+/g, ' ') + ' -> ' + total1.replace(/\s+/g, ' '));
ok((await p.locator('.spend-warn').count()) === 0, 'warning gone once priced');
// layout: panel does not overlap its neighbours
const boxes = await p.evaluate(() => ['#tooltip', '#spend', '#log'].map(s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { s, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
const shown = boxes.filter(Boolean);
let overlap = false; for (let i = 1; i < shown.length; i++) if (shown[i].top < shown[i - 1].bottom - 0.5) overlap = true;
ok(!overlap, 'tooltip / spend / log do not overlap: ' + shown.map(x => `${x.s}[${Math.round(x.top)}-${Math.round(x.bottom)}]`).join(' '));
// refresh: not on a static host -> readable message, no crash
await p.route('**/api/refresh-prices*', r => r.fulfill({ status: 404, body: 'not found' }));
await p.click('#refreshPrices');
await p.waitForFunction(() => document.querySelector('.spend-msg'));
ok((await p.locator('.spend-msg').innerText()).includes('local server'), 'static-host refresh message: ' + await p.locator('.spend-msg').innerText());
await p.unroute('**/api/refresh-prices*');
// refresh against the real server (may be rate limited)
await p.waitForTimeout(100);
await p.click('#refreshPrices');
await p.waitForFunction(() => !document.querySelector('#refreshPrices').disabled, null, { timeout: 60000 });
ok(/Updated \d+ prices|less than a minute/.test(await p.locator('.spend-msg').innerText()), 'server refresh: ' + await p.locator('.spend-msg').innerText());
// Clear
await p.click('#clearSpend');
ok((await p.locator('.spend-sub').innerText()).includes('0 uses'), 'Clear sets spend back to 0');
await p.screenshot({ path: OUT + 'spend-ui.png' });
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
process.exit(fails ? 1 : 0);
