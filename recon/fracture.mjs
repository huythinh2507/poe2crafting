import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1300 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const out = {};
  const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const CLS = 90; // Talismans, the item in the report
  const base = D.basesOfClass(CLS).pop();
  const pool = D.classPool(CLS);
  const frac = { handler: 'poe2_fracture', properties: [], constraints: ['rarity_rare', 'can_be_rare', 'minimum_4_explicits', 'not_strongbox'] };
  const usable = it => E.checkConstraints(it, frac.constraints, frac.handler);
  const normal = n => { const used = new Set(), res = []; for (const e of pool) { if (res.length >= n) break; if (used.has(e.mod.group)) continue; used.add(e.mod.group); res.push(e); } return res; };
  const mk = (n, { unrevealed = 0, desecrated = 0 } = {}) => {
    const it = E.newItem(base, 100); it.rarity = 'rare';
    const ents = normal(n + desecrated);
    ents.slice(0, n).forEach(e => it.mods.push(E.rollMod(e.mod)));
    for (let k = 0; k < desecrated; k++) it.mods.push({ ...E.rollMod(ents[n + k].mod), desecrated: true });
    for (let k = 0; k < unrevealed; k++) it.unrevealed.push({ affix: 'prefix', minLevel: 0 });
    return it;
  };

  t('F1 3 mods alone: orb unusable', !usable(mk(3)));
  t('F2 3 mods + 1 unrevealed desecrated: orb usable (the reported case)', usable(mk(3, { unrevealed: 1 })));
  t('F3 4 normal mods: usable', usable(mk(4)));
  t('F4 2 mods + 2 unrevealed: usable (counts 4)', usable(mk(2, { unrevealed: 2 })));
  t('F5 1 mod + 3 unrevealed: usable (counts 4)', usable(mk(1, { unrevealed: 3 })));

  // odds: 3 normal + unrevealed -> 1/3 each; never the unrevealed
  {
    const hits = new Map(); const N = 3000; let nullCount = 0;
    for (let k = 0; k < N; k++) {
      const it = mk(3, { unrevealed: 1 });
      const keeper = it.mods[0];
      const ch = E.applyMethod(it, frac);
      if (!ch) { nullCount++; continue; }
      const i = it.mods.indexOf(ch[0].mod);
      hits.set(i, (hits.get(i) || 0) + 1);
      if (it.unrevealed.length !== 1) nullCount++;
    }
    const share = [...hits.values()].map(v => v / N);
    t('F6 3 mods + unrevealed: each normal mod ~33%', hits.size === 3 && share.every(s => s > 0.30 && s < 0.37) && !nullCount, share.map(s => (s * 100).toFixed(1) + '%').join(' / '));
  }
  // 4 normal mods -> 25% each
  {
    const hits = new Map(); const N = 3000;
    for (let k = 0; k < N; k++) { const it = mk(4); const ch = E.applyMethod(it, frac); const i = it.mods.indexOf(ch[0].mod); hits.set(i, (hits.get(i) || 0) + 1); }
    const share = [...hits.values()].map(v => v / N);
    t('F7 4 normal mods: each ~25%', hits.size === 4 && share.every(s => s > 0.22 && s < 0.28), share.map(s => (s * 100).toFixed(1) + '%').join(' / '));
  }
  // revealed desecrated mod: it is a normal fracture candidate (only the UNREVEALED slot is excluded)
  {
    let hitDesecrated = 0; const hits = new Map(); const N = 2000;
    for (let k = 0; k < N; k++) {
      const it = mk(3, { desecrated: 1 });
      const ch = E.applyMethod(it, frac);
      if (ch[0].mod.desecrated) hitDesecrated++;
      const i = it.mods.indexOf(ch[0].mod); hits.set(i, (hits.get(i) || 0) + 1);
    }
    const share = hitDesecrated / N;
    t('F8 3 mods + 1 REVEALED desecrated: 4 candidates, desecrated one ~25%', hits.size === 4 && share > 0.21 && share < 0.29, `desecrated hit ${(share * 100).toFixed(1)}%, split ${[...hits.values()].map(v => (v / N * 100).toFixed(0) + '%').join('/')}`);
  }
  // nothing fracturable -> refuse
  {
    const it = mk(0, { unrevealed: 4 });
    t('F9 only unrevealed desecrated slots: usable by count but nothing to lock -> refused', E.applyMethod(it, frac) === null);
    const it2 = mk(3, { desecrated: 1 }); it2.mods.forEach(m => { if (!m.desecrated) m.fractured = true; });
    t('F10 one fractured already: orb unusable', !E.checkConstraints(it2, frac.constraints, frac.handler));
  }
  // fracturing does not touch the unrevealed slot, and it survives later
  {
    const it = mk(3, { unrevealed: 1 }); E.applyMethod(it, frac);
    t('F11 unrevealed slot untouched and fractured mod protected afterwards', it.unrevealed.length === 1 && it.mods.filter(m => m.fractured).length === 1);
    const kept = it.mods.find(m => m.fractured);
    let lost = 0;
    for (let k = 0; k < 200; k++) { const c = structuredClone(it); E.applyMethod(c, { handler: 'poe2_chaos', properties: [], constraints: [] }); if (!c.mods.some(m => m.fractured && m.id === kept.id)) lost++; }
    t('F12 fractured mod survives Chaos on that item', lost === 0, `lost ${lost}/200`);
  }
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(84), v);

// ---- UI: reproduce the screenshot (Maji Talisman, 3 mods + unrevealed) ----
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const c = window.__craft, it = c.S.item;
  it.rarity = 'rare'; it.mods = [];
  const used = new Set();
  for (const e of D.classPool(it.classId)) { if (it.mods.length >= 3) break; if (used.has(e.mod.group) || e.affix !== (it.mods.length < 2 ? 'prefix' : 'suffix')) continue; used.add(e.mod.group); it.mods.push(E.rollMod(e.mod)); }
  it.unrevealed = [{ affix: 'prefix', minLevel: 0 }];
  c.renderCraft();
});
const fb = p.locator('.cur:has-text("Fracturing Orb")');
console.log('UI Fracturing Orb enabled:', !(await fb.isDisabled()));
await fb.click();
console.log('panel:', (await p.innerText('.targets')).replace(/\n/g, ' / '));
console.log('highlighted mods:', await p.locator('.mod.target').count(), '| unrevealed highlighted:', await p.locator('.unrevealed.target').count());
await p.locator('#itemBox').scrollIntoViewIfNeeded();
await p.click('#itemBox');
console.log('after fracture -> fractured:', await p.evaluate(() => window.__craft.S.item.mods.filter(m => m.fractured).length), '| unrevealed kept:', await p.evaluate(() => window.__craft.S.item.unrevealed.length));
await p.locator('#tooltip').screenshot({ path: 'recon/fracture.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
