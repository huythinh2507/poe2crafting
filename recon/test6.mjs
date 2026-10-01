import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1300 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const tab = t => p.click(`[data-tab="${t}"]`);
const btns = () => p.$$eval('.cur', bs => bs.map(x => (x.disabled ? '(x)' : '') + x.innerText.replace(/\n/g, ' :: ')));
const st = () => p.evaluate(() => { const i = window.__craft.S.item; return `${i.rarity} mods=${i.mods.length} unrevealed=${JSON.stringify(i.unrevealed)} corrupted=${i.corrupted}`; });

// pools sanity: no desecrated / meta mods leak into the normal pool
const leak = await p.evaluate(async () => {
  const d = await import('/js/data.js');
  const keys = d.classPool(4).map(e => e.mod.key);
  return { total: keys.length, abyss: keys.filter(k => /^AbyssMod/.test(k)).length, influence: keys.filter(k => /Influence/.test(k)).length, lich: d.lichPool(4).length };
});
console.log('normal pool for class 4:', leak);

await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await tab('Desecrate');
console.log('bones:', await btns());
await p.locator('.cur:has-text("Preserved Rib")').click(); await p.click('#itemBox');
console.log('after bone:', await st());
console.log('bone again blocked:', (await btns()).filter(x => /Rib/.test(x)));
await p.screenshot({ path: 'recon/mine6a.png' });

await p.click('[data-reveal="0"]');
const opts = await p.$$eval('.reveal-opt', os => os.map(o => o.innerText.replace(/\n/g, ' | ')));
console.log('reveal options:', opts);
// echoes reroll
await p.click('[data-omen="echoes"]');
await p.click('[data-reveal="0"]');
await p.click('#revealReroll');
console.log('after reroll:', await p.$$eval('.reveal-opt', os => os.map(o => o.innerText.replace(/\n/g, ' | '))));
await p.screenshot({ path: 'recon/mine6b.png' });
await p.locator('.reveal-opt').first().click();
console.log('revealed:', await p.evaluate(() => JSON.stringify(window.__craft.S.item.mods.filter(m => m.desecrated).map(m => window.__craft.DB.mods.get(m.id).key))), await st());

// faction omen: Sovereign -> Ulaman only (reset, rare, bone, reveal x20)
await p.click('#resetItem');
await p.locator('[data-tab="Currencies"]').click();
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await tab('Desecrate');
await p.locator('.cur:has-text("Ancient Rib")').click(); await p.click('#itemBox');
await p.click('[data-omen="Ulaman"]');
const factions = new Set();
for (let k = 0; k < 15; k++) {
  await p.click('[data-reveal="0"]');
  for (const t of await p.$$eval('.reveal-opt .meta', os => os.map(o => o.innerText))) factions.add(t.split('·')[0].trim());
  await p.click('#revealCancel');
}
console.log('Sovereign omen factions seen:', [...factions]);

// Putrefaction on a fresh 4-mod rare
await p.click('#resetItem');
await p.locator('[data-tab="Currencies"]').click();
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await tab('Desecrate'); await p.click('[data-omen="putrefaction"]');
await p.locator('.cur:has-text("Preserved Rib")').click(); await p.click('#itemBox');
console.log('putrefaction:', await st());

// Gnawed bone on ilvl 60 item -> normal mods only
await p.click('#resetItem');
await p.fill('#ilvl', '60'); await p.press('#ilvl', 'Tab');
await p.locator('[data-tab="Currencies"]').click();
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await tab('Desecrate');
await p.locator('.cur:has-text("Gnawed Rib")').click(); await p.click('#itemBox');
await p.click('[data-reveal="0"]');
console.log('gnawed @ilvl60:', await p.$$eval('.reveal-opt .meta', os => os.map(o => o.innerText)));
console.log('desecrated pool panel:'); await p.click('#revealCancel'); await p.click('#toggleDesec');
console.log((await p.innerText('#pool')).split('Desecrated pool')[1]?.slice(0, 500).replace(/\n/g, ' / '));

// Meta rune: Soul (Medved's Tending) on body armour widens the pool
await p.fill('#ilvl', '100'); await p.press('#ilvl', 'Tab');
await p.click('#resetItem');
await tab('Socketables'); await p.click('[data-sub="Special runes"]'); await p.fill('#socketSearch', 'Soul modifiers');
console.log('soul rune buttons:', await btns());
const before = await p.evaluate(async () => (await import('/js/engine.js')).fullPool(window.__craft.S.item).length);
await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
const after = await p.evaluate(async () => (await import('/js/engine.js')).fullPool(window.__craft.S.item).length);
console.log('pool size before/after soul rune:', before, after);
console.log(errs.join('\n') || 'no errors');
await b.close();
