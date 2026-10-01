import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const res = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const out = {};
  const mkItem = (cls, rarity = 'rare', ilvl = 100) => {
    const base = D.basesOfClass(cls).pop();
    const it = E.newItem(base, ilvl); it.rarity = rarity; return it;
  };
  const key = id => DB.mods.get(id).key;
  const method = h => ({ handler: h, properties: [], constraints: [] });

  // ---- BUG 1: Minimum Modifier Level must keep the highest tier of a group with no tier >= min ----
  {
    const MIN = 50;
    let checked = 0, wrongDrop = [], wrongKeep = [];
    for (const cls of [4, 19, 26, 25, 45, 33, 34, 35, 54]) {
      const it = mkItem(cls);
      const pool = D.classPool(cls);
      const elig = new Set(E.eligibleMods(it, { minLevel: MIN }).map(e => e.mod.id));
      const groups = new Map();
      for (const e of pool) { if (e.mod.minlvl <= it.ilvl) { if (!groups.has(e.mod.group)) groups.set(e.mod.group, []); groups.get(e.mod.group).push(e); } }
      for (const [g, arr] of groups) {
        const hi = arr.filter(e => e.mod.minlvl >= MIN);
        const expect = hi.length ? hi : [arr.slice().sort((a, b) => b.mod.minlvl - a.mod.minlvl)[0]];
        for (const e of expect) { checked++; if (!elig.has(e.mod.id)) wrongDrop.push(`${cls}:${e.mod.key}(${e.mod.minlvl})`); }
        for (const e of arr) if (!expect.includes(e) && elig.has(e.mod.id)) wrongKeep.push(e.mod.key);
      }
    }
    out.bug1 = { checked, shouldBeInPoolButMissing: wrongDrop.length, examples: wrongDrop.slice(0, 4), shouldBeExcludedButPresent: wrongKeep.length };
  }

  // ---- BUG 2: Chaos Orb can remove a desecrated mod (only fractured is protected) ----
  {
    let removedDesecrated = 0;
    for (let n = 0; n < 200; n++) {
      const it = mkItem(4); it.mods = [];
      for (let k = 0; k < 5; k++) { const e = E.eligibleMods(it)[0]; it.mods.push(E.rollMod(e.mod)); }
      const lich = D.lichPool(4).find(e => e.affix === 'suffix' && !it.mods.some(m => DB.mods.get(m.id).group === e.mod.group));
      if (!lich) continue;
      const m = { ...E.rollMod(lich.mod), desecrated: true }; it.mods.push(m);
      const ch = E.applyMethod(it, method('poe2_chaos'));
      if (ch && ch[0].op === 'remove' && ch[0].mod === m) removedDesecrated++;
    }
    out.bug2 = { chaosRemovedDesecratedIn200: removedDesecrated, expect: 'about 200/6 = 33' };
  }

  // ---- BUG 3: fractured mod untouched by every removal path ----
  {
    const tryPath = (name, setup, run) => {
      let lost = 0, runs = 0;
      for (let n = 0; n < 150; n++) {
        const it = mkItem(4);
        for (let k = 0; k < 6; k++) { const e = E.eligibleMods(it)[0]; if (e) it.mods.push(E.rollMod(e.mod)); }
        if (setup) setup(it);
        it.mods[0].fractured = true; const fid = it.mods[0];
        const r = run(it);
        if (r === null) continue; runs++;
        if (!it.mods.includes(fid) && !(name.startsWith('divine') && it.mods.length)) lost++;
      }
      return `${name}: lost fractured ${lost}/${runs}`;
    };
    const ess = (type) => { const e = DB.raw.essences.entries.find(x => x.type === type && DB.raw.essences.byessences[x.id]?.[DB.classes.get(4).class]); return e && { handler: 'poe2_essence', essence: e, properties: [], constraints: [] }; };
    out.bug3 = [
      tryPath('chaos', null, it => E.applyMethod(it, method('poe2_chaos'))),
      tryPath('annulment', null, it => E.applyMethod(it, method('poe2_annulment'))),
      tryPath('perfect essence', null, it => ess(3) && E.applyMethod(it, ess(3))),
      tryPath('alloy', null, it => ess(5) && E.applyMethod(it, ess(5))),
      tryPath('bone on full item', null, it => E.applyMethod(it, method('poe2_desecrate_mid'))),
      tryPath('vaal reroll', null, it => { for (let k = 0; k < 6; k++) { it.corrupted = false; E.applyMethod(it, method('poe2_vaal')); } return []; }),
      tryPath('putrefaction', null, it => { E.ctx.omens.add('putrefaction'); const r = E.applyMethod(it, method('poe2_desecrate_mid')); E.ctx.omens.delete('putrefaction'); return r; }),
      tryPath('divine leaves a fractured mod alone', null, it => { const id = it.mods[0].id; const rolls = it.mods[0].rolls.join(); E.applyMethod(it, method('poe2_divine')); if (!it.mods.some(m => m.fractured && m.id === id && m.rolls.join() === rolls)) it.mods.length = 0; return []; }),
    ];
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
