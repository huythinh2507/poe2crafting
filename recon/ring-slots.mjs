import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D; const out = {};
  const ring = n => DB.raw.items.entries.find(i => i.domain === 1 && DB.text(i.label) === n);
  const mk = n => { const it = E.newItem(ring(n), 100); it.rarity = 'rare'; return it; };
  const expect = { 'Dusk Amulet': [4, 2], 'Gloam Amulet': [2, 4], 'Penumbra Amulet': [5, 1], 'Tenebrous Amulet': [1, 5], 'Lament Amulet': [2, 3], 'Portent Amulet': [3, 2], 'Absent Amulet': [2, 2], 'Twisted Amulet': [2, 3], 'Distorted Amulet': [3, 2], 'Gold Amulet': [3, 3], 'Dusk Ring': [4, 2], 'Gloam Ring': [2, 4], 'Penumbra Ring': [5, 1], 'Tenebrous Ring': [1, 5], 'Iron Ring': [3, 3] };
  for (const [n, [p, s]] of Object.entries(expect)) { const m = E.maxAffix(mk(n)); out[n] = (m[0] === p && m[1] === s ? 'PASS ' : 'FAIL ') + m; }
  // filling with exalts never exceeds the limits
  for (const n of ['Dusk Ring', 'Penumbra Ring', 'Tenebrous Ring', 'Absent Amulet', 'Penumbra Amulet', 'Twisted Amulet']) {
    let bad = 0;
    for (let t = 0; t < 40; t++) {
      const it = mk(n); const [mp, ms] = E.maxAffix(it);
      for (let k = 0; k < 8; k++) E.applyMethod(it, { handler: 'poe2_exalted', properties: [], constraints: [] });
      const pc = E.countAffix(it, 'prefix'), sc = E.countAffix(it, 'suffix');
      if (pc > mp || sc > ms || pc + sc !== mp + ms) bad++;
    }
    out[n + ' exalt fill'] = (bad === 0 ? 'PASS ' : 'FAIL ') + bad + ' bad';
  }
  const mg = E.newItem(ring('Dusk Ring'), 100); mg.rarity = 'magic'; out['magic unaffected'] = (E.maxAffix(mg).join() === '1,1' ? 'PASS' : 'FAIL');
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(28), v);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
