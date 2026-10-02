// Test for the cost estimator (public/js/estimate.js + dialog). Run with the server up: node recon/estimate.mjs
import { chromium } from 'playwright';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const setup = () => p.evaluate(async () => {
  const C = window.__craft, { S, DB, CATALOGUE } = C;
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const c = [...DB.classes.values()].find(c => DB.text(c.label) === 'Bows'); S.group = c.group; S.cls = c;
  C.selectBase([...DB.items.values()].filter(i => i.class === c.id && i.domain === 1 && i.drop).pop());
  const it = S.item; it.rarity = 'rare';
  const crit = D.classPool(57).find(e => e.mod.group === 33 && e.tier === 1).mod;
  it.mods = [{ ...E.rollMod(crit), fractured: true }, E.rollMod(D.classPool(57).find(e => e.mod.group === 24 && e.tier === 8).mod)];
  S.tab = 'Currencies'; S.method = CATALOGUE.find(m => m.handler === 'poe2_chaos_perfect');
  C.renderCraft();
});
await setup();

// 1. no currency held
await p.evaluate(() => { window.__craft.S.method = null; window.__craft.renderCraft(); });
await p.click('#openEstimate');
ok((await p.locator('#estBox').innerText()).includes('First pick the currency'), 'no currency: asks to pick one');
await p.keyboard.press('Escape');
ok((await p.locator('#estBox').count()) === 0, 'Escape closes the dialog');

// 2. unsupported currency
await p.evaluate(() => { const C = window.__craft; C.S.method = C.CATALOGUE.find(m => m.handler.startsWith('poe2_desecrate')); C.renderCraft(); });
await p.click('#openEstimate');
ok((await p.locator('#estBox').innerText()).includes('cannot be repeated automatically'), 'desecrate: explained as unsupported');
await p.click('.modal-actions [data-est-close]');
ok((await p.locator('#estBox').count()) === 0, 'Close button closes');

// 3. the bow case from real play: Perfect Chaos until T1 increased Physical Damage
await setup();
await p.click('#openEstimate');
await p.fill('#estSearch', 'increased Physical Damage');
const opts = await p.locator('#estTarget option').allInnerTexts();
ok(opts.length >= 1 && opts.every(o => /physical damage/i.test(o)), 'search narrows the list: ' + opts.join(' | '));
const plain = await p.locator('#estTarget option', { hasText: /^#% increased Physical Damage \(prefix\)$/ }).getAttribute('value');
await p.selectOption('#estTarget', plain);
ok((await p.locator('#estTier option').first().innerText()).includes('Tier 1'), 'tier list offers Tier 1 first');
const t0 = Date.now();
await p.click('#estRun');
ok(await p.locator('#estRun').isDisabled(), 'Run is disabled while running');
await p.waitForSelector('.est-table', { timeout: 40000 });
const secs = (Date.now() - t0) / 1000;
const cells = await p.locator('.est-table tr:nth-child(2) td').allInnerTexts();
const avg = +cells[1].replace(/,/g, '');
ok(avg > 500 && avg < 2500, `average uses ${cells[1]} is near the expected ~1,150 (ran ${secs.toFixed(1)}s)`);
const note = await p.locator('.est-note').last().innerText();
ok(/per use/.test(note) && /simulated crafts/.test(note), 'note: ' + note.slice(0, 90));
const costRow = await p.locator('.est-table tr:nth-child(3) td').allInnerTexts();
ok(parseFloat(costRow[1].replace(/[^0-9.]/g, '')) > 100, 'cost in divine shown: ' + costRow[1].replace(/\s+/g, ' '));
// the live item and omens must be untouched
const after = await p.evaluate(() => ({ mods: window.__craft.S.item.mods.length, uses: window.__craft.uses(window.__craft.S.spend) }));
ok(after.mods === 2 && after.uses === 0, 'estimate did not touch the item or the spend');
await p.screenshot({ path: (process.env.SHOTS || 'recon/') + 'estimate.png' });

// 4. already-there target
await p.click('.modal-actions [data-est-close]');
await p.click('#openEstimate');
await p.fill('#estSearch', 'Critical Hit Chance');
await p.selectOption('#estTarget', { index: 0 });
await p.selectOption('#estTier', { index: 5 });   // any tier of crit chance: the fractured crit mod is already there
await p.click('#estRun');
await p.waitForSelector('.est-note');
ok((await p.locator('#estBox').innerText()).includes('already has that modifier'), 'already-present target is reported');
await p.click('.modal-actions [data-est-close]');

// 5. omens are used up by the first use and restored afterwards
await setup();
await p.evaluate(() => { const C = window.__craft; C.S.method = C.CATALOGUE.find(m => m.handler === 'poe2_chaos_perfect'); import('/js/engine.js').then(E => { E.ctx.omens.add('whittling'); C.renderCraft(); }); });
await p.waitForTimeout(200);
await p.click('#openEstimate');
await p.fill('#estSearch', 'Attack Speed');
await p.selectOption('#estTarget', { index: 0 });
await p.selectOption('#estTier', { index: await p.locator('#estTier option').count() - 1 });   // any tier: quick
await p.click('#estRun');
await p.waitForSelector('.est-table', { timeout: 40000 });
ok((await p.locator('.est-note').last().innerText()).includes('Omen of Whittling'), 'armed omen mentioned in the result');
const omensAfter = await p.evaluate(async () => (await import('/js/engine.js')).ctx.omens.has('whittling'));
ok(omensAfter, 'armed omens are restored after the run');
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
process.exit(fails ? 1 : 0);
