import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
const st = () => p.evaluate(() => { const i = window.__craft.S.item; return `${i.rarity} mods=${i.mods.length} [${i.mods.map(m => (m.fractured ? 'F' : '') + (m.desecrated ? 'D' : '') + (m.crafted ? 'C' : '') || '-').join(',')}] hist=${window.__craft.S.history.length}`; });
const addNth = n => p.evaluate(i => document.querySelectorAll('.fam:not(.ref) [data-add]')[i].click(), n);
const addGroup = (kind, i) => p.evaluate(({ kind, i }) => { const cols = document.querySelectorAll('#pool > .pool:first-of-type > div'); cols[kind].querySelectorAll('[data-add]')[i].click(); }, { kind, i });
const last = () => (p.innerText('#log').then(t => t.split('\n').slice(1, 4).join(' | ')));

console.log('1. normal item:', await st());
await addGroup(0, 0);          // a prefix
console.log('   add prefix ->', await st(), '|', await last());
await addGroup(1, 0);          // a suffix
console.log('   add suffix ->', await st());
await addGroup(0, 12);         // a 2nd prefix -> must become rare
console.log('   add 2nd prefix ->', await st(), '|', await last());
await addGroup(1, 20); await addGroup(0, 30);
console.log('   more mods ->', await st());

// ---- context menu ----
const rc = async i => { const m = p.locator('#itemBox .mod').nth(i); await m.scrollIntoViewIfNeeded(); await m.click({ button: 'right' }); };
await rc(0);
console.log('2. menu:', await p.$$eval('#ctxMenu .ctx-btn', bs => bs.map(x => (x.disabled ? '(x)' : '') + x.innerText)), '| head:', await p.innerText('#ctxMenu .ctx-head'));
await p.click('[data-ctx="fracture"]');
console.log('   fracture ->', await st());
await rc(1);
console.log('   2nd mod menu, fracture disabled?:', await p.$eval('[data-ctx="fracture"]', b => b.disabled), '| title:', await p.$eval('[data-ctx="fracture"]', b => b.title));
await p.click('[data-ctx="desecrate"]');
console.log('   desecrate ->', await st());
await rc(1);
console.log('   desecrated mod: fracture disabled (expect true: another mod is already fractured):', await p.$eval('[data-ctx="fracture"]', b => b.disabled), '| label:', await p.$eval('[data-ctx="desecrate"]', b => b.innerText));
await p.click('[data-ctx="crafted"]');
console.log('   crafted ->', await st());
await rc(0);
console.log('   fractured mod: desecrate disabled (expect false: a fractured mod may be desecrated):', await p.$eval('[data-ctx="desecrate"]', b => b.disabled), '| label:', await p.$eval('[data-ctx="fracture"]', b => b.innerText));
await p.keyboard.press('Escape');
console.log('   Esc closes menu:', await p.locator('#ctxMenu').count() === 0);

// ---- modify values ----
await rc(2);
const vi = await p.evaluate(() => window.__craft.S.ctx.idx);     // which mod the menu belongs to
await p.click('[data-ctx="values"]');
const before = await p.evaluate(i => window.__craft.S.item.mods[i].rolls.slice(), vi);
console.log('3. values dialog inputs:', await p.locator('[data-valinput]').count(), '| before', before);
await p.fill('[data-valinput="0"]', '99999');
await p.click('[data-modal="save"]');
const after = await p.evaluate(i => ({ rolls: window.__craft.S.item.mods[i].rolls, max: window.__craft.DB.mods.get(window.__craft.S.item.mods[i].id).stats.map(s => s.range[1]) }), vi);
console.log('   after saving 99999 ->', after, '(clamped to max)');
await rc(2); const vi2 = await p.evaluate(() => window.__craft.S.ctx.idx); await p.click('[data-ctx="values"]');
await p.fill('[data-valinput="0"]', '-5'); await p.click('[data-modal="save"]');
console.log('   after saving -5 ->', await p.evaluate(i => ({ rolls: window.__craft.S.item.mods[i].rolls, min: window.__craft.DB.mods.get(window.__craft.S.item.mods[i].id).stats.map(s => s.range[0]) }), vi2), '(clamped to min)');

// ---- details ----
await rc(3); await p.click('[data-ctx="details"]');
console.log('4. details:', (await p.innerText('.modal')).replace(/\n+/g, ' | ').slice(0, 260));
await p.click('[data-modal="cancel"] >> nth=-1');
console.log('   closed:', await p.locator('.modal').count() === 0);

// ---- remove + undo ----
const n0 = await p.evaluate(() => window.__craft.S.item.mods.length);
await rc(3); await p.click('[data-ctx="remove"]');
console.log('5. remove ->', await st(), `(was ${n0})`);
await p.click('#undo');
console.log('   undo ->', await st());

// ---- reference tier click: lich tier adds as desecrated ----
await p.click('#resetItem');
await p.evaluate(() => document.querySelector('.psec:has([data-addlich="1"]) [data-addlich="1"]').click());
console.log('6. click a Desecrated-pool tier ->', await st());

// ---- unrevealed slot menu ----
await p.evaluate(async () => { const c = window.__craft; c.S.item.unrevealed.push({ affix: 'prefix', minLevel: 0 }); c.renderCraft(); });
await p.locator('.unrevealed').click({ button: 'right' });
console.log('7. unrevealed menu:', await p.$$eval('#ctxMenu .ctx-btn', bs => bs.map(x => x.innerText)));
await p.click('[data-ctx="unrev-remove"]');
console.log('   removed ->', await p.evaluate(() => window.__craft.S.item.unrevealed.length), 'slots left');
await p.screenshot({ path: 'recon/ctxmenu.png' });
console.log(errs.length ? errs.slice(0, 4).join('\n') : 'no errors');
await b.close();
