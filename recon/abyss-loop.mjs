import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nm = e => DB.text(DB.items.get(e.item)?.label);
  const abyss = DB.raw.essences.entries.find(e => nm(e) === 'Essence of the Abyss');
  const fake = { classId: 4, ilvl: 100, mods: [] };
  const byAffix = k => DB.raw.essences.entries.find(e => e.type === 3 && E.essenceMod(fake, e) && D.affixOf(E.essenceMod(fake, e)) === k);
  const perfect = byAffix('prefix'), perfectSuffix = byAffix('suffix');
  const ess = (it, e) => E.applyMethod(it, { handler: 'poe2_essence', essence: e, properties: [], constraints: [] });
  const bone = { handler: 'poe2_desecrate', properties: [{ key: 'min_mod_level', value: 40 }], constraints: [] };
  const mk = () => { const it = E.newItem(D.basesOfClass(4).pop(), 100); it.rarity = 'rare'; const seen = new Set();
    for (const e of D.classPool(4)) { if (it.mods.length >= 4) break; if (e.mod.minlvl > 80 || seen.has(e.mod.group)) continue; if (E.countAffix(it, e.affix) >= 2) continue; seen.add(e.mod.group); it.mods.push(E.rollMod(e.mod)); } return it; };
  const marks = it => it.mods.filter(E.isMark);
  t('E0 data: abyss essence + a prefix perfect essence found', !!abyss && !!perfect, `${abyss && nm(abyss)} / ${perfect && nm(perfect)}`);
  let it = mk(); const sides = new Set();
  for (let i = 0; i < 60; i++) { const x = mk(); ess(x, abyss); const m = marks(x)[0]; if (m) sides.add(DB.mods.get(m.id).key); }
  t('M1 Abyss essence adds a Mark as prefix or suffix', sides.size === 2, [...sides].join(','));
  // Mark side follows the removed mod / the Crystallisation omen; it is not a crafted mod and ignores the crafted limit
  let sideOk = true, notCrafted = true;
  for (const [om, key] of [['crystal_prefix', 'EssenceAbyssPrefix'], ['crystal_suffix', 'EssenceAbyssSuffix']]) for (let i = 0; i < 40; i++) {
    const x = mk(); E.toggleOmen(om); const r = ess(x, abyss); E.clearOmens(); const m = marks(x)[0];
    if (!r || !m || DB.mods.get(m.id).key !== key) sideOk = false; if (m?.crafted) notCrafted = false; }
  t('M1b Sinistral/Dextral Crystallisation decide the Mark side (removes + replaces on that side)', sideOk);
  t('M1c Mark is not a crafted mod', notCrafted);
  const withCrafted = mk(); withCrafted.mods[0].crafted = true;
  t('M1d Abyss essence works even when the crafted slot is used (any mod can be removed)', E.essenceApplicable(withCrafted, abyss) && !!ess(withCrafted, abyss) && marks(withCrafted).length === 1);
  const rem = (() => { let hitCrafted = 0; for (let i = 0; i < 200; i++) { const x = mk(); x.mods[0].crafted = true; const ids = x.mods.map(m => m); ess(x, abyss); if (!x.mods.includes(ids[0])) hitCrafted++; } return hitCrafted; })();
  t('M1e the removed mod is random, the crafted one can be hit but not always', rem > 0 && rem < 200, `${rem}/200`);
  // fracture-safe state: Mark -> bone -> unrevealed
  it = mk(); ess(it, abyss);
  t('M2 item has the Mark and 4 explicit mods', marks(it).length === 1 && it.mods.length === 4, `${it.mods.length} mods`);
  t('M3 perfect essence cannot take the Mark away', (() => { let ok = true; for (let i = 0; i < 80; i++) { const x = structuredClone(it); E.toggleOmen('crystal_prefix'); E.toggleOmen('crystal_suffix'); E.clearOmens(); ess(x, perfect); if (!marks(x).length) ok = false; } return ok; })());
  const r = E.applyMethod(it, bone);
  t('D1 bone turns the Mark into an unrevealed desecrated slot', marks(it).length === 0 && it.unrevealed.length === 1 && it.mods.length === 3 && it.unrevealed[0].minLevel >= 40, JSON.stringify(it.unrevealed) + ' | ' + r.map(c => c.text || '').join(''));
  t('D2 unrevealed counts for the 4-mod minimum, 3 fracture targets', E.fractureCandidates(it).length === 3);
  const opts = E.revealOptions(it, it.unrevealed[0]);
  t('D3 every reveal option is level 40+', opts.length > 0 && opts.every(o => o.mod.minlvl >= 40), opts.map(o => o.mod.minlvl).join(','));
  // reveal then remove it with a prefix perfect essence + omen of sinistral crystallisation (no Omen of Light)
  const revealed = opts.find(o => o.affix === it.unrevealed[0]?.affix) || opts[0];
  const aff = it.unrevealed[0].affix; E.revealMod(it, 0, revealed);
  t('R1 revealed mod is desecrated', it.mods.some(m => m.desecrated));
  const dm = it.mods.find(m => m.desecrated); const side = E.affixOf ? null : null;
  // make the revealed desecrated mod the only prefix (so Sinistral Crystallisation must hit it)
  const px = structuredClone(it); px.mods = px.mods.filter(m => m.desecrated || DB.mods.get(m.id) && !/prefix/.test(D.affixOf(DB.mods.get(m.id)))); 
  const dAff = D.affixOf(DB.mods.get(dm.id));
  const om = dAff === 'prefix' ? 'crystal_prefix' : 'crystal_suffix';
  const ess2 = dAff === 'prefix' ? perfect : perfectSuffix;
  const only = structuredClone(it); only.mods = only.mods.filter(m => m.desecrated || D.affixOf(DB.mods.get(m.id)) !== dAff);
  E.toggleOmen(om); const rr = ess(only, ess2); E.clearOmens();
  t('R2 perfect essence + crystallisation removes the revealed desecrated mod (no Omen of Light)', !!rr && !only.mods.some(m => m.desecrated) && only.mods.some(m => m.crafted), `${dAff}: ` + (rr || []).map(c => c.op).join(','));
  // after that the crafted slot is used by the essence mod, so the loop continues once it is removed again: new Mark needs a free crafted slot
  const again = structuredClone(only); const ok2 = E.applyMethod(again, { handler: 'poe2_essence', essence: abyss });
  t('R3 loop continues: next Abyss essence works while the perfect essence mod holds the crafted slot', !!ok2 && marks(again).length === 1, `marks ${marks(again).length}`);
  return out; }), null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
