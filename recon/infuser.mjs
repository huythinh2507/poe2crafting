import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const find = (cls) => { let r; (function w(els) { for (const e of els || []) { if (e.handler === 'poe2_vaal_infuser' && e.constraints?.includes(cls)) r = r || e; w(e.elements); } })(DB.raw.methods.crafting.flatMap(c => c.elements)); return r; };
  const att = (() => { let r; (function w(els) { for (const e of els || []) { if (e.handler === 'poe2_catalyst_reaver') r = r || e; w(e.elements); } })(DB.raw.methods.crafting.flatMap(c => c.elements)); return r; })();
  const kinds = { armour: [find('armour_quality_base'), 4], weapon: [find('weapon_quality_base'), 54], caster: [find('caster_quality_base'), 45], jewellery: [find('ring_or_amulet_base'), 33] };
  const mk = (cls, q, jew) => { const it = E.newItem(D.basesOfClass(cls).pop(), 100); it.rarity = 'rare'; if (jew) it.catalyst = { tag: 'attack', quality: q }; else it.quality = q; return it; };
  const qOf = (it, jew) => jew ? it.catalyst.quality : it.quality;
  for (const [k, [m, cls]] of Object.entries(kinds)) {
    const jew = k === 'jewellery', ok = it => E.checkConstraints(it, m.constraints, m.handler);
    t(`${k}: needs 20% quality`, !ok(mk(cls, 19, jew)) && ok(mk(cls, 20, jew)) && ok(mk(cls, 29, jew)) && !ok(mk(cls, 30, jew)));
    // 20% never corrupts
    let c20 = 0; for (let i = 0; i < 500; i++) { const it = mk(cls, 20, jew); E.applyMethod(it, m); if (it.corrupted) c20++; }
    t(`${k}: 0 corruptions at 20% in 500 uses`, c20 === 0, `${c20}`);
    // rates at 21 / 25 / 29
    const rates = {}; let gains = new Set(), corruptGain = 0;
    for (const q of [21, 25, 29]) { let c = 0; const N = 4000; for (let i = 0; i < N; i++) { const it = mk(cls, q, jew); E.applyMethod(it, m); if (it.corrupted) { c++; if (qOf(it, jew) !== q) corruptGain++; } else gains.add(qOf(it, jew) - q); } rates[q] = +(c / N * 100).toFixed(1); }
    t(`${k}: corrupt rate ~5/25/45%`, Math.abs(rates[21] - 5) < 1.5 && Math.abs(rates[25] - 25) < 2.5 && Math.abs(rates[29] - 45) < 2.5, JSON.stringify(rates));
    t(`${k}: gains only 1-2 (capped at 30), corrupt gains nothing`, [...gains].every(g => g === 1 || g === 2) && gains.has(1) && corruptGain === 0, `gains ${[...gains]}`);
  }
  return out; }), null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
