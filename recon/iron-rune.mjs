import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D, out = {};
  const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nameOf = e => DB.text(DB.items.get(e.item)?.label);
  const find = n => DB.raw.socketables.entries.find(e => nameOf(e) === n);
  const sock = (it, n, slot) => E.applyMethod(it, { handler: 'poe2_socketable', socket: find(n), slot, properties: [], constraints: [] });
  const mk = (cls, n = 2) => { const it = E.newItem(D.basesOfClass(cls).pop(), 100); it.sockets = n; return it; };
  const phys = it => Math.round(E.itemStats(it).damage.physical.final[1]);
  // every martial weapon class + Talisman (class 90 maps to bows' pools, check by actual class list)
  for (const cls of [43, 44, 51, 52, 53, 54, 55, 57, 58, 65, 66, 67, 68, 90, 103]) {
    const it = mk(cls); const st = E.itemStats(it); if (!st?.damage?.physical) continue;
    const before = phys(it); sock(it, 'Perfect Iron Rune'); const after = phys(it);
    const base = st.damage.physical.final[1];
    t(`W class ${cls} ${DB.text(DB.classes.get(cls)?.label)}`, Math.abs(E.itemStats(it).damage.physical.final[1] - base * 1.2) < 0.01, `phys max ${before} -> ${after}`);
  }
  // armour: armour / evasion / ES bases
  for (const cls of [1, 2, 3, 4]) {
    const bases = D.basesOfClass(cls);
    for (const b of bases) {
      const it = E.newItem(b, 100); it.sockets = 2;
      const st = E.itemStats(it); if (!st?.defences?.length) continue;
      const before = st.defences.map(d => d.final);
      sock(it, 'Perfect Iron Rune');
      const after = E.itemStats(it).defences.map(d => d.final);
      const ok = st.defences.every((d, i) => d.key === 'ward' || Math.abs(after[i] - before[i] * 1.2) < 0.01);
      t(`A class ${cls} ${st.defences.map(d => d.key).join('+')}`, ok, before.map((v, i) => `${Math.round(v)}->${Math.round(after[i])}`).join(' '));
      break;
    }
  }
  // two Iron Runes stack
  const it = mk(4, 2); const b0 = E.itemStats(it).damage?.physical?.final?.[1];
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(60), v);
console.log(errs.join('\n') || 'no errors');
await b.close();
