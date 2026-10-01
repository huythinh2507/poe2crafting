import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const out = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const find = n => DB.raw.socketables.entries.find(e => DB.text(DB.items.get(e.item)?.label) === n);
  const res = {};
  const mk = cls => { const base = D.basesOfClass(cls).filter(b => b.sockets >= 2).pop() || D.basesOfClass(cls).pop(); return { base, it: E.newItem(base, 100) }; };
  const sock = (it, name) => E.applyMethod(it, { handler: 'poe2_socketable', socket: find(name) });
  // Serle's Triumph: +1 suffix
  for (const cls of [4, 54, 33, 37]) {
    const { it } = mk(cls); it.sockets = 3; it.rarity = 'rare';
    const eff = E.socketEffect(it, find("Serle's Triumph"));
    if (eff) { sock(it, "Serle's Triumph"); res.serle = { cls, slots: E.maxAffix(it), eff }; break; }
  }
  // Astrid's Creativity: crafted limit 2
  for (const cls of [4, 54, 33, 37, 8, 45]) {
    const { it } = mk(cls); it.sockets = 3; it.rarity = 'rare';
    if (E.socketEffect(it, find("Astrid's Creativity"))) { sock(it, "Astrid's Creativity"); res.astrid = { cls, crafted: E.bonus(it).crafted }; break; }
  }
  // Transform runes on a weapon with resist mods? use gloves/armour: find class where Passion applies
  for (const cls of [54, 4, 45, 57]) {
    const { it } = mk(cls); it.sockets = 3; it.rarity = 'rare';
    if (!E.socketEffect(it, find('Passion of Aldur'))) continue;
    // give it a cold + lightning resistance
    const cold = D.classPool(cls).find(e => /ColdResist/.test(e.mod.key)), lit = D.classPool(cls).find(e => /LightningResist/.test(e.mod.key));
    if (cold) it.mods.push(E.rollMod(cold.mod)); if (lit) it.mods.push(E.rollMod(lit.mod));
    const before = it.mods.map(m => DB.mods.get(m.id).key);
    const r = sock(it, 'Passion of Aldur');
    res.passion = { cls, before, after: it.mods.map(m => DB.mods.get(m.id).key), note: r && r[0].text };
    break;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
