import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const c = window.__craft, E = await import('/js/engine.js'); const { DB } = c; const out = {};
  const ok = (n, v, d = '') => { out[n] = (v ? 'PASS ' : 'FAIL ') + d; };
  const base = n => DB.raw.items.entries.find(i => i.domain === 1 && DB.text(i.label) === n);
  const m = c.allMethods().find(x => x.handler === 'poe2_essence' && DB.text(x.essence.label) === 'Essence of the Breach');
  const mk = n => { const it = E.newItem(base(n), 100); it.rarity = 'rare'; for (let k = 0; k < 3; k++) E.applyMethod(it, { handler: 'poe2_exalted', properties: [], constraints: [] }); return it; };
  for (const n of ['Iron Ring', 'Breach Ring', 'Lunar Amulet']) {
    const it = mk(n); const before = E.catalystCap(it);
    const ch = E.applyMethod(it, m || { handler: 'poe2_essence', essence: DB.raw.essences.entries.find(x => DB.text(x.label) === 'Essence of the Breach'), properties: [], constraints: [] });
    const has = it.mods.some(x => DB.mods.get(x.id).stats.some(s => DB.raw.stats[s.index]?.id === 'local_maximum_quality_+'));
    ok(n + ': essence adds +20% max quality mod', !!ch && has, `cap ${before} -> ${E.catalystCap(it)}`);
    if (n === 'Breach Ring') ok('Breach Ring + essence = 60%', E.catalystCap(it) === 60, E.catalystCap(it));
  }
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(44), v);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
