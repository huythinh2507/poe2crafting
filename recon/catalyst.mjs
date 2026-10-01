import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D; const out = {};
  const ok = (n, c, d = '') => { out[n] = (c ? 'PASS ' : 'FAIL ') + d; };
  const base = n => DB.raw.items.entries.find(i => i.domain === 1 && DB.text(i.label) === n);
  const mk = (n, ilvl = 100) => { const it = E.newItem(base(n), ilvl); it.rarity = 'rare'; return it; };
  const cat = (name, pre = 'poe2_catalyst_') => ({ handler: pre + name, properties: [], constraints: [] });
  // handlers exist and methods are listed
  ok('handlers implemented', Object.keys(E.CATALYSTS).every(n => E.handlerImplemented('poe2_catalyst_' + n) && E.handlerImplemented('poe2_refined_catalyst_' + n)));
  // gain per use by item level
  const g = ilvl => { const s = []; for (let k = 0; k < 2000; k++) s.push(E.catalystGain(ilvl)); return s; };
  const low = g(1), high = g(100);
  ok('ilvl 1 gains more', Math.min(...low) >= 18, `min ${Math.min(...low)} max ${Math.max(...low)}`);
  ok('ilvl 100 gains 1 (20% 2)', high.every(v => v === 1 || v === 2) && Math.abs(high.filter(v => v === 2).length / 2000 - 0.2) < 0.04, `p2=${high.filter(v => v === 2).length / 2000}`);
  // stacking, cap, replacement
  const ring = mk('Iron Ring');
  for (let k = 0; k < 40; k++) E.applyMethod(ring, cat('flesh'));
  ok('caps at 20', ring.catalyst.quality === 20 && ring.catalyst.tag === 'life', JSON.stringify(ring.catalyst));
  E.applyMethod(ring, cat('tul'));
  ok('different catalyst replaces', ring.catalyst.tag === 'cold' && ring.catalyst.quality <= 2, JSON.stringify(ring.catalyst));
  // breach ring cap 40
  const br = mk('Breach Ring');
  for (let k = 0; k < 100; k++) E.applyMethod(br, cat('flesh'));
  ok('breach ring cap = 20 + implicit', br.catalyst.quality === E.catalystCap(br) && E.catalystCap(br) > 20, `cap ${E.catalystCap(br)}`);
  // constraints: rings and amulets only
  const sword = E.newItem(base('Shortsword'), 100);
  const meth = DB.raw.methods.crafting;
  ok('constraint: rings/amulets yes, weapons/belts no', E.checkConstraints(mk('Iron Ring'), ['catalyst_base']) && E.checkConstraints(mk('Lunar Amulet'), ['catalyst_base']) && !E.checkConstraints(sword, ['catalyst_base']) && !E.checkConstraints(mk('Utility Belt'), ['catalyst_base']) === true);
  ok('applies to amulet', E.applyMethod(mk('Lunar Amulet'), cat('neural')) !== null);
  // value scaling: life mod on a ring
  const life = DB.raw.mods.entries.find(m => (DB.groups.get(m.group)?.tags || []).includes(E.catalystTagId('life')) && m.stats.length === 1 && m.stats[0].range[1] >= 30);
  const withLife = mk('Iron Ring'); withLife.catalyst = { tag: 'life', quality: 20 };
  const plain = E.modLines(life, [30]).join(); const scaled = E.modLines(life, [30], withLife).join();
  ok('life mod scaled +20%', scaled.startsWith(String(Math.round(30 * 1.2))) || /36/.test(scaled), `${plain} -> ${scaled}`);
  const cold = DB.raw.mods.entries.find(m => (DB.groups.get(m.group)?.tags || []).includes(E.catalystTagId('cold')) && !(DB.groups.get(m.group)?.tags || []).includes(E.catalystTagId('life')));
  ok('non-matching mod untouched', E.modLines(cold, [10]).join() === E.modLines(cold, [10], withLife).join());
  // omen: factor + distribution
  ok('factor 20% = x5, 5% = x2, 40% = x5+2.4', E.catalystFactor(20) === 5 && E.catalystFactor(5) === 2 && Math.abs(E.catalystFactor(40) - 7.4) < 1e-9, [E.catalystFactor(20), E.catalystFactor(5), E.catalystFactor(40)].join());
  const trial = (withOmen, n = 3000) => {
    let hit = 0;
    for (let k = 0; k < n; k++) {
      const it = E.newItem(base('Iron Ring'), 100); it.rarity = 'rare'; it.catalyst = { tag: 'life', quality: 20 };
      E.ctx.omens.clear(); if (withOmen) E.ctx.omens.add('exalt_catalyst');
      const ch = E.applyMethod(it, { handler: 'poe2_exalted', properties: [], constraints: [] });
      if (ch[0].mod && E.groupTagIds && true) {}
      const tags = DB.groups.get(DB.mods.get(ch[0].mod.id).group).tags || [];
      if (tags.includes(E.catalystTagId('life'))) hit++;
      if (withOmen && it.catalyst !== null) return -1;
    }
    E.ctx.omens.clear();
    return hit / n;
  };
  const without = trial(false), withO = trial(true);
  const itemChance = E.newItem(base('Iron Ring'), 100); itemChance.rarity = 'rare'; itemChance.catalyst = { tag: 'life', quality: 20 };
  E.ctx.omens.add('exalt_catalyst');
  const ch = E.addChances(itemChance, { handler: 'poe2_exalted' });
  const exp = [...ch.map.entries()].reduce((s, [id, pr]) => s + ((DB.groups.get(DB.mods.get(id).group).tags || []).includes(E.catalystTagId('life')) ? pr : 0), 0);
  E.ctx.omens.clear();
  ok('omen raises life-tag chance as predicted', withO > without * 2 && Math.abs(withO - exp) < 0.04, `without ${without.toFixed(3)} with ${withO.toFixed(3)} predicted ${exp.toFixed(3)}`);
  // omen with no catalyst quality: nothing changes; quality consumed
  const none = mk('Iron Ring'); E.ctx.omens.add('exalt_catalyst');
  const c2 = E.addChances(none, { handler: 'poe2_exalted' }); const c3 = (E.ctx.omens.clear(), E.addChances(none, { handler: 'poe2_exalted' }));
  ok('no quality: no effect', [...c2.map].every(([id, v]) => Math.abs(v - c3.map.get(id)) < 1e-12));
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(48), v);
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
