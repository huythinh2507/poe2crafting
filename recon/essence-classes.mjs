import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
// every item class must offer essences + their mods must be valid for that class's slot types
const res = await p.evaluate(async () => {
  const D = await import('/js/data.js'), E = await import('/js/engine.js');
  const { DB } = D;
  const rows = [], empty = [];
  for (const [id, cl] of DB.classes) {
    if (!D.basesOfClass(id).length) continue;
    const n = DB.raw.essences.entries.filter(e => D.essenceModIds(e.id, id).length).length;
    if (!n) empty.push(DB.text(cl.label)); else if ([4, 90, 54, 57, 45, 65, 33, 37].includes(id)) rows.push(DB.text(cl.label) + ': ' + n);
  }
  return { rows, noEssences: empty.join(', ') };
});
console.log(res.rows.join('\n')); console.log('classes without essences:', res.noEssences);

// UI: Talismans -> Perfect + Alloy lists
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
await p.click('[data-tab="Essences"]');
for (const t of [0, 3, 4, 5]) {
  await p.click(`[data-sub="${t}"]`);
  const names = await p.$$eval('.cur', bs => bs.map(x => x.innerText.replace(/\n/g, ' :: ')));
  console.log(['Lesser', '', '', 'Perfect', 'Corrupted', 'Alloy'][t].padEnd(10), names.length, names.slice(0, 2));
}
// apply a Lesser essence on a magic talisman, an Alloy on a rare one
await p.click('[data-tab="Currencies"]');
await p.click('[data-family]:has-text("Transmutation")'); await p.click('.cur-wrap.open .cur-drop .cur >> nth=0'); await p.click('#itemBox');
await p.click('[data-tab="Essences"]'); await p.click('[data-sub="0"]');
await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
console.log('lesser essence ->', await p.evaluate(() => { const S = window.__craft.S, i = S.item; return i.rarity + ': ' + i.mods.map(m => window.__craft.DB.mods.get(m.id).key).join(', '); }));
await p.click('[data-sub="5"]');
console.log('alloys for talisman:', await p.$$eval('.cur', bs => bs.map(x => (x.disabled ? '(x)' : '') + x.innerText.replace(/\n/g, ' :: '))));
console.log(errs.join('\n') || 'no errors');
await b.close();
