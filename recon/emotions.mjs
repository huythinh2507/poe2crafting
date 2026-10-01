import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nm = id => DB.text(DB.items.get(id)?.label);
  const emo = name => +Object.keys(DB.raw.emotions.items).find(id => nm(+id) === name);
  const M = name => ({ handler: 'poe2_distilled_emotions', emotion: { item: emo(name) }, constraints: ['is_modifiable', 'rarity_rare', 'distilled_emotions_base'], properties: [] });
  const apply = (it, m) => (E.checkConstraints(it, m.constraints, m.handler) && E.emotionApplicable(it, m.emotion.item)) ? E.applyMethod(it, m) : null;
  const kind = m => D.affixOf(DB.mods.get(m.id));
  const mk = (cls, nP, nS) => {
    const it = E.newItem(D.basesOfClass(cls)[0], 100); it.rarity = 'rare'; const seen = new Set();
    for (const e of D.classPool(cls)) {
      if (it.mods.length >= nP + nS) break;
      if (seen.has(e.mod.group)) continue;
      if (E.countAffix(it, e.affix) >= (e.affix === 'prefix' ? nP : nS)) continue;
      seen.add(e.mod.group); it.mods.push(E.rollMod(e.mod));
    }
    return it;
  };
  const crafted = it => it.mods.filter(m => m.crafted);
  const sufIds = x => x.mods.filter(m => kind(m) === 'suffix').map(m => m.id).sort().join();
  const preIds = x => x.mods.filter(m => kind(m) === 'prefix').map(m => m.id).sort().join();

  // availability: normal vs Ancient
  const avail = cls => Object.keys(DB.raw.emotions.items).filter(id => DB.raw.emotions.items[id][cls]).map(id => nm(+id));
  t('A1 normal jewel (Emerald 71): normal emotions only', avail(71).length >= 12 && avail(71).every(n => !/Ancient/.test(n)), `${avail(71).length}`);
  t('A2 Time-Lost jewel (78): Ancient emotions only', avail(78).length >= 10 && avail(78).every(n => /Ancient/.test(n)), `${avail(78).length}`);

  // Contempt on both jewel kinds
  for (const [label, cls, name] of [['Emerald', 71, 'Potent Liquid Contempt'], ['Time-Lost Ruby', 78, 'Ancient Potent Liquid Contempt']]) {
    const seen = {}; let allOk = true;
    for (let i = 0; i < 300; i++) {
      const it = mk(cls, 1, 2); const r = apply(it, M(name)); if (!r) { allOk = false; continue; }
      if (!crafted(it)[0]) { out.dbg = JSON.stringify({ r, mods: it.mods.length, label, cls }); allOk = false; continue; } const key = DB.mods.get(crafted(it)[0].id).key; seen[key] = (seen[key] || 0) + 1;
      const [mp, ms] = E.maxAffix(it);
      if (key === 'CraftedJewelAdditionalSuffixAllowed' && it.extraSlots.suffix !== 1) allOk = false;
      if (key === 'CraftedJewelAdditionalPrefixAllowed' && it.extraSlots.prefix !== 1) allOk = false;
      if (E.countAffix(it, 'prefix') > mp || E.countAffix(it, 'suffix') > ms) allOk = false;
    }
    t(`C1 ${label}: ${name} is a 50/50 and sets the extra slot`, allOk && Object.keys(seen).length === 2 && Math.min(...Object.values(seen)) > 90, JSON.stringify(seen));
  }
  t('C2 normal Contempt is not usable on a Time-Lost jewel', !apply(mk(78, 1, 2), M('Potent Liquid Contempt')));

  // retained capacity
  let it = mk(71, 1, 2);
  const cm = M('Potent Liquid Contempt');
  for (let i = 0; i < 200; i++) { it = mk(71, 1, 2); apply(it, cm); if (crafted(it)[0] && DB.mods.get(crafted(it)[0].id).key === 'CraftedJewelAdditionalSuffixAllowed') break; }
  t('R1 +1 suffix allowed gives 3 suffix slots', E.maxAffix(it)[1] === 3, `suffix cap ${E.maxAffix(it)[1]}`);
  it.mods = it.mods.filter(m => !m.crafted);
  t('R2 capacity kept after the crafted mod is removed', E.maxAffix(it)[1] === 3 && it.extraSlots.suffix === 1);

  // Chaos lock
  const lockItem = () => {
    const x = mk(71, 1, 2); x.extraSlots.suffix = 1;
    const s = D.classPool(71).find(e => e.affix === 'suffix' && !x.mods.some(m => DB.mods.get(m.id).group === e.mod.group));
    x.mods.push(E.rollMod(s.mod)); return x;
  };
  const chaos = { handler: 'poe2_chaos', constraints: [], properties: [] };
  let removedSuffix = 0, prefixChanged = 0;
  for (let i = 0; i < 300; i++) {
    const x = lockItem(); const sb = sufIds(x), pb = preIds(x);
    E.applyMethod(x, chaos); if (sufIds(x) !== sb) removedSuffix++; if (preIds(x) !== pb) prefixChanged++;
  }
  t('L1 Chaos never touches the over-cap suffix side, only prefixes', removedSuffix === 0 && prefixChanged > 250, `suffix changed ${removedSuffix}/300, prefix changed ${prefixChanged}/300`);
  let ctl = 0;
  for (let i = 0; i < 300; i++) { const x = mk(71, 1, 2); const sb = sufIds(x); E.applyMethod(x, chaos); if (sufIds(x) !== sb) ctl++; }
  t('L2 control: a normal 1p/2s jewel does lose suffixes to Chaos', ctl > 50, `${ctl}/300`);

  // 5th mod
  const five = lockItem();
  five.mods = five.mods.filter(m => kind(m) === 'suffix').slice(0, 2).concat(five.mods.filter(m => kind(m) === 'prefix'));
  E.toggleOmen('dextral');
  const dr = E.applyMethod(five, { handler: 'poe2_desecrate', properties: [{ key: 'min_mod_level', value: 40 }], constraints: [] });
  E.clearOmens();
  t('F1 cranium + Dextral adds the 3rd suffix without removing anything', !!dr && five.unrevealed.length === 1 && five.unrevealed[0].affix === 'suffix' && five.mods.length === 3, `${five.mods.length} mods + ${five.unrevealed.length} unrevealed`);
  const px = D.classPool(71).find(e => e.affix === 'prefix' && !five.mods.some(m => DB.mods.get(m.id).group === e.mod.group));
  five.mods.push(E.rollMod(px.mod));
  t('F2 jewel reaches 5 modifiers (2 prefixes + 3 suffixes)', E.countAffix(five, 'prefix') === 2 && E.countAffix(five, 'suffix') === 3);

  // Ferocity
  const fm = M('Potent Liquid Ferocity'); let hit = false;
  for (let i = 0; i < 200 && !hit; i++) {
    const y = mk(71, 2, 2); apply(y, fm); const c = crafted(y)[0];
    if (c && DB.mods.get(c.id).key === 'CraftedJewelSuffixEffect') {
      hit = true;
      const s = y.mods.find(m => kind(m) === 'suffix' && !m.crafted); if (!s) { hit = false; continue; }
      const plain = E.modLines(DB.mods.get(s.id), s.rolls, { ...y, mods: y.mods.filter(m => !m.crafted) })[0];
      const scaled = E.modLines(DB.mods.get(s.id), s.rolls, y)[0];
      t('E1 Ferocity (suffix effect) scales the suffix text', plain !== scaled, `${plain}  ->  ${scaled}  (+${c.rolls[0]}%)`);
      const pre = y.mods.find(m => kind(m) === 'prefix' && !m.crafted);
      if (pre) t('E2 and leaves the prefix alone', E.modLines(DB.mods.get(pre.id), pre.rolls, y)[0] === E.modLines(DB.mods.get(pre.id), pre.rolls, { ...y, mods: y.mods.filter(m => !m.crafted) })[0]);
    }
  }
  t('E0 saw the suffix-effect outcome', hit);
  return out;
}), null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
