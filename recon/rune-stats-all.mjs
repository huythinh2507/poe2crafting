import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const nameOf = e => DB.text(DB.items.get(e.item)?.label);
  const shown = /^local_(minimum_added_(physical|fire|cold|lightning|chaos)_damage|physical_damage_\+%|attack_speed_\+%|critical_strike_chance|base_physical_damage_reduction_rating|armour.*_\+%|evasion.*_\+%|energy_shield.*_\+%|block_chance_\+%|ward(_\+%)?|spirit_\+%)$/;
  const snap = it => JSON.stringify(E.itemStats(it));
  const classes = [...new Set([...DB.classes.keys()])];
  let checked = 0; const bad = [], seenIds = new Set(); const okByStat = {};
  for (const e of DB.raw.socketables.entries) {
    for (const cls of classes) {
      const bases = D.basesOfClass(cls); if (!bases.length) continue;
      const it = E.newItem(bases[bases.length - 1], 100); it.sockets = 1;
      if (!E.socketEffect(it, e)) continue;
      const st = E.socketStat(it, e);
      if (!st?.local) continue;
      const id = DB.raw.stats[st.index]?.id;
      if (!shown.test(id)) continue;
      const before = snap(it);
      if (!E.applyMethod(it, { handler: 'poe2_socketable', socket: e, properties: [], constraints: [] })) continue;
      checked++;
      const changed = snap(it) !== before;
      (okByStat[id] ??= { ok: 0, bad: 0 })[changed ? 'ok' : 'bad']++;
      if (!changed) bad.push(`${nameOf(e)} on class ${cls} (${DB.text(DB.classes.get(cls)?.label)}): ${id}`);
    }
  }
  return { checked, okByStat, bad: bad.slice(0, 25), nbad: bad.length };
});
console.log(JSON.stringify(R, null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
