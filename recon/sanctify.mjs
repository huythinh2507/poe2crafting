import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const find = els => { for (const e of els || []) { if (e.handler === 'poe2_divine') return e; const r = find(e.elements); if (r) return r; } };
  let div; for (const c of DB.raw.methods.crafting) { div = find(c.elements); if (div) break; }
  const mk = () => { const it = E.newItem(D.basesOfClass(4).pop(), 100); it.rarity = 'rare';
    const pool = D.classPool(4).filter(e => e.mod.minlvl <= 100); const seen = new Set();
    for (const e of pool) { if (it.mods.length >= 4) break; if (seen.has(e.mod.group)) continue; seen.add(e.mod.group); it.mods.push(E.rollMod(e.mod)); }
    return it; };
  // 1. plain divine unchanged: no sanctify
  let it = mk(); E.applyMethod(it, div); t('D1 plain Divine does not sanctify', !it.sanctified);
  // 2. statistics of the multiplier
  let bad2 = 0, lo = 9, hi = 0, bad = 0, above = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    it = mk(); const before = it.mods.map(m => m.rolls.slice());
    E.toggleOmen('sanctification'); const r = E.applyMethod(it, div); E.clearOmens();
    if (!r || !it.sanctified) { bad++; continue; }
    it.mods.forEach((m, k) => m.rolls.forEach((v, j) => { const f = v / before[k][j]; const o = before[k][j]; if (v < o * 0.78 - 1e-6 || v > o * 1.22 + (Number.isInteger(o) ? 1 : 0.01) + 1e-6) bad2++; lo = Math.min(lo, f); hi = Math.max(hi, f); n++;
      const mod = DB.mods.get(m.id); if (v > mod.stats[j].range[1]) above++; }));
  }
  t('S1 every attempt sanctifies a rare', bad === 0, `${bad} failures`);
  t('S2 every value within 0.78x-1.22x (rounded up)', bad2 === 0, `${bad2} outside; observed factor ${lo.toFixed(2)} - ${hi.toFixed(2)} over ${n} values`);
  t('S3 some rolls exceed the printed max', above > 0, `${above}/${n} values above max`);
  // 3. exact rounding
  it = mk(); it.mods = [{ id: it.mods[0].id, rolls: it.mods[0].rolls.map(() => 90) }]; const origRandom = Math.random; Math.random = () => 44.99 / 45; // factor 1.22
  E.toggleOmen('sanctification'); E.applyMethod(it, div); E.clearOmens(); Math.random = origRandom;
  t('S4 90 x 1.22 = 109.8 rounds up to 110', it.mods[0].rolls.every(v => v === 110), it.mods[0].rolls.join(','));
  // 4. locked afterwards
  it = mk(); E.toggleOmen('sanctification'); E.applyMethod(it, div); E.clearOmens();
  const cons = ['is_modifiable'];
  t('L1 sanctified item is not modifiable', !E.checkConstraints(it, cons));
  E.toggleOmen('sanctification'); t('L2 cannot sanctify twice', E.applyMethod(it, div) === null); E.clearOmens();
  const sc = it.mods.map(m => m.rolls.join());
  t('L3 manual add refused', E.addModManually(it, D.classPool(4)[0].mod.id) === null);
  // 5. non-rare & fractured
  const mag = E.newItem(D.basesOfClass(4).pop(), 100); mag.rarity = 'magic'; E.toggleOmen('sanctification');
  t('R1 magic item refuses sanctify', E.applyMethod(mag, div) === null && !mag.sanctified); E.clearOmens();
  it = mk(); it.mods[0].fractured = true; const f0 = it.mods[0].rolls.join(); E.toggleOmen('sanctification'); E.applyMethod(it, div); E.clearOmens();
  t('F1 fractured mod untouched', it.mods[0].rolls.join() === f0 && it.sanctified);
  return out; }), null, 1));
// UI
await p.evaluate(() => { const it = window.__craft.S.item; it.rarity = 'rare'; });
await p.click('[data-tab="Currencies"]');
await p.locator('.cur:not([disabled])').filter({ hasText: /Divine/ }).first().click();
await p.waitForSelector('[data-omen="sanctification"]');
console.log('omen enabled:', await p.$eval('[data-omen="sanctification"]', e => !e.disabled));
console.log(errs.join('\n') || 'no errors');
await b.close();
