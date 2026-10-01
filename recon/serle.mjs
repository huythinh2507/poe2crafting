import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const out = {};
  const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nameOf = e => DB.text(DB.items.get(e.item)?.label);
  const find = n => DB.raw.socketables.entries.find(e => nameOf(e) === n);
  const sock = (it, name, slot) => E.applyMethod(it, { handler: 'poe2_socketable', socket: find(name), slot, properties: [], constraints: [] });
  const S = "Serle's Triumph";
  const mk = cls => { const it = E.newItem(D.basesOfClass(cls).pop(), 100); it.sockets = 2; it.rarity = 'rare'; return it; };
  const classes = [4, 54, 33, 25, 37, 45, 59, 65, 24, 8, 57];
  const cls = classes.find(c => E.socketEffect(mk(c), find(S)));
  t('S0 Serle applies to some class', cls != null, 'class ' + cls);
  let it = mk(cls);
  const [p0, s0] = E.maxAffix(it);
  const r = sock(it, S);
  const [p1, s1] = E.maxAffix(it);
  t('S1 sockets and is flagged bound', !!r && it.socketed[0].bound === true);
  t('S2 +1 suffix, prefixes unchanged', s1 === s0 + 1 && p1 === p0, `prefix ${p0}->${p1}, suffix ${s0}->${s1}`);
  t('S3 bound: cannot be replaced', sock(it, 'Desert Rune', 0) === null && it.socketed[0].name === S && E.maxAffix(it)[1] === s0 + 1);
  t('S4 only the other socket is offered', JSON.stringify(E.socketSlots(it, find('Desert Rune'))) === '[1]');
  // limit: only one Serle (same augment limit)
  const again = sock(it, S);
  t('S5 second copy handled by limit', again === null || it.socketed.filter(s => s.name === S).length <= (DB.raw.methods.socketables.limits[find(S).limit]?.number ?? 99), `limit idx ${find(S).limit}, copies ${it.socketed.filter(s => s.name === S).length}`);
  // the extra suffix is usable: fill suffix slots beyond the normal max
  it = mk(cls); sock(it, S);
  const [, maxS] = E.maxAffix(it);
  const sufs = i => i.mods.filter(m => DB.mods.get(m.id) && D.affixOf(DB.mods.get(m.id)) === 'suffix').length;
  for (let i = 0; i < 12 && sufs(it) < maxS + 1; i++) {
    if (it.mods.length === 0) E.applyMethod(it, { handler: 'poe2_exalted', properties: [], constraints: [] });
    E.toggleOmen('exalt_suffix');
    E.applyMethod(it, { handler: 'poe2_exalted', properties: [], constraints: [] });
    E.clearOmens();
  }
  t('S6 exalts fill up to normal+1 suffixes, never beyond', sufs(it) === maxS, `suffixes ${sufs(it)}/${maxS}`);
  it = mk(cls);
  for (let i = 0; i < 12; i++) { E.toggleOmen('exalt_suffix'); E.applyMethod(it, { handler: 'poe2_exalted', properties: [], constraints: [] }); E.clearOmens(); }
  t('S7 without Serle the cap is one lower', sufs(it) === maxS - 1, `suffixes ${sufs(it)}/${maxS - 1}`);
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(50), v);
console.log(errs.join('\n') || 'no errors');
await b.close();
