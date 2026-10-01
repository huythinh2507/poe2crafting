import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const find = (els) => { for (const e of els || []) { if (e.handler === 'artificer') return e; const r = find(e.elements); if (r) return r; } };
  let m; for (const c of D.DB.raw.methods.crafting) { m = find(c.elements); if (m) break; }
  const out = {};
  for (const [name, cls] of [['1H sword', 54], ['1H spear', 43], ['sceptre', 56], ['wand', 45], ['2H bow', 57], ['quarterstaff', 65], ['2H mace', 68], ['body armour STR', 4], ['body armour DEX', 1], ['boots', 9], ['gloves', 17], ['helmet', 25], ['shield', 37], ['ring', 33]]) {
    const it = E.newItem(D.basesOfClass(cls).pop(), 100); const start = it.sockets; const log = [start];
    for (let i = 0; i < 4; i++) { const ok = E.checkConstraints(it, m.constraints || [], m.handler) && E.applyMethod(it, m); log.push(ok ? it.sockets : 'x'); }
    out[name] = { start, max: E.maxSockets(it), log: log.join(' ') };
  }
  return out; }), null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
