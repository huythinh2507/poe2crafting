import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const out = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  // class that rolls "Gain # Life per enemy killed" (the group in the screenshot)
  let cls = null, group = null;
  for (const [id] of DB.classes) {
    const g = D.classPool(id).find(e => /Life per enemy killed/i.test(DB.text(e.mod.stats[0].label)));
    if (g) { cls = id; group = g.mod.group; break; }
  }
  const base = D.basesOfClass(cls).pop();
  const it = E.newItem(base, 100); it.rarity = 'magic';
  const rows = D.classPool(cls).filter(e => e.mod.group === group).sort((a, b) => a.tier - b.tier);
  const show = (name, method) => {
    const ch = E.addChances(it, method);
    return name + ': ' + rows.map(e => `T${e.tier}(lvl${e.mod.minlvl})=${ch.map.has(e.mod.id) ? (ch.map.get(e.mod.id) * 100).toFixed(2) + '%' : '–'}`).join('  ');
  };
  const mk = (h, min) => ({ handler: h, properties: min ? [{ key: 'min_mod_level', value: min }] : [], constraints: [] });
  return [DB.classes.get(cls).label + ' / ' + DB.text(DB.classes.get(cls).label),
    show('Augmentation (basic)   ', mk('poe2_augmentation', 0)),
    show('Greater Augmentation 44', mk('poe2_augmentation_greater', 44)),
    show('Perfect Augmentation 70', mk('poe2_augmentation_perfect', 70))];
});
console.log(out.join('\n'));
await b.close();
