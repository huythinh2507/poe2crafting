import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nm = id => DB.text(DB.items.get(id)?.label);
  const emo = name => +Object.keys(DB.raw.emotions.items).find(id => nm(+id) === name);
  const EM = name => ({ handler: 'poe2_distilled_emotions', emotion: { item: emo(name) }, constraints: ['is_modifiable', 'rarity_rare', 'distilled_emotions_base'], properties: [] });
  const kind = m => D.affixOf(DB.mods.get(m.id));
  const key = m => DB.mods.get(m.id).key;
  const chaos = { handler: 'poe2_chaos', constraints: [], properties: [] };
  const bone = { handler: 'poe2_desecrate', properties: [{ key: 'min_mod_level', value: 40 }], constraints: [] };
  const pickMod = (cls, affix, used, n = 0) => D.classPool(cls).filter(e => e.affix === affix && !used.some(m => DB.mods.get(m.id).group === e.mod.group))[n].mod;

  // ---- stage 1-2: fractured suffix + a 2nd suffix, then Contempt until we get the "+1 suffix allowed" variant
  const base = () => { const it = E.newItem(D.basesOfClass(71)[0], 100); it.rarity = 'rare'; it.mods = [];
    const s1 = E.rollMod(pickMod(71, 'suffix', it.mods)); s1.fractured = true; it.mods.push(s1);
    it.mods.push(E.rollMod(pickMod(71, 'suffix', it.mods, 1))); it.mods.push(E.rollMod(pickMod(71, 'prefix', it.mods))); return it; };   // exalted prefix as in the guide
  let outcomes = {};
  for (let i = 0; i < 400; i++) { const it = base(); const r = E.applyMethod(it, EM('Potent Liquid Contempt')); const c = it.mods.find(m => m.crafted);
    const lost = r && r.find(x => x.op === 'remove'); const o = !r ? 'failed' : `${key(c).replace('CraftedJewelAdditional', '')} removed ${lost.mod ? kind(lost.mod) : '?'}${lost.mod?.fractured ? '(fractured!)' : ''}`; outcomes[o] = (outcomes[o] || 0) + 1; }
  out.contemptOutcomes = outcomes;
  t('V1 fractured mod is never removed by Contempt', !Object.keys(outcomes).some(k => /fractured!/.test(k)));

  // ---- stage 3: cranium + Dextral on the jewel holding 2 suffixes + the crafted "+1 suffix" mod
  let jewel;
  for (let i = 0; i < 500; i++) { const it = base(); E.applyMethod(it, EM('Potent Liquid Contempt')); const c = it.mods.find(m => m.crafted);
    if (c && key(c) === 'CraftedJewelAdditionalSuffixAllowed' && it.mods.filter(m => kind(m) === 'suffix').length === 2 && it.mods.some(m => m.fractured)) { jewel = it; break; } }
  t('V2 reached: fractured suffix + 2nd suffix + crafted +1 suffix (prefix slot)', !!jewel, jewel ? `${jewel.mods.length} mods, caps ${E.maxAffix(jewel)}` : '');
  E.toggleOmen('dextral'); const dr = E.applyMethod(jewel, bone); E.clearOmens();
  t('V3 Dextral cranium adds the unrevealed 3rd suffix', !!dr && jewel.unrevealed.length === 1 && jewel.unrevealed[0].affix === 'suffix', `${jewel.mods.length} mods + ${jewel.unrevealed.length} unrevealed`);
  // Abyssal Echoes reveal
  const opts = E.revealOptions(jewel, jewel.unrevealed[0]);
  t('V4 reveal offers options (jewel suffix desecrated pool)', opts.length > 0, opts.map(o => `${DB.mods.get(o.mod.id).key}${o.lich ? '*' : ''}`).join(', '));
  E.revealMod(jewel, 0, opts[0]);
  t('V5 revealed mod is a desecrated suffix, jewel now has 3 suffixes', E.countAffix(jewel, 'suffix') === 3 && jewel.mods.some(m => m.desecrated));

  // ---- stage 4: Sinistral Erasure + Chaos removes the crafted +1 mod (the only prefix) and leaves 3 suffixes
  const cj = structuredClone(jewel); E.toggleOmen('erasure_prefix');
  const before = cj.mods.filter(m => kind(m) === 'suffix').map(m => m.id).sort().join();
  const r4 = E.applyMethod(cj, chaos); E.clearOmens();
  t('V6 Sinistral Erasure Chaos removed the crafted +1 mod', !!r4 && !cj.mods.some(m => m.crafted && /Allowed/.test(key(m))), (r4 || []).map(x => x.op + ':' + (x.mod ? key(x.mod) : '')).join(' '));
  t('V7 all three suffixes survive and the suffix cap is still 3', cj.mods.filter(m => kind(m) === 'suffix').map(m => m.id).sort().join() === before && E.maxAffix(cj)[1] === 3);
  // chaos spam: suffixes (incl. fractured + desecrated) never change
  let lost = 0;
  for (let i = 0; i < 400; i++) { const x = structuredClone(cj); E.applyMethod(x, chaos); if (x.mods.filter(m => kind(m) === 'suffix').map(m => m.id).sort().join() !== before) lost++; }
  t('V8 Chaos spam only rerolls prefixes (0 suffix losses in 400)', lost === 0, `${lost}`);

  // ---- stage 5: Ferocity as the 5th modifier
  const feros = {}; let fail = 0, fiveMods = 0, suffixLost = 0;
  for (let i = 0; i < 400; i++) {
    const x = structuredClone(cj); while (E.countAffix(x, 'prefix') < 2) { const pm = pickMod(71, 'prefix', x.mods, Math.floor(Math.random() * 20)); x.mods.push(E.rollMod(pm)); }   // exalted 2nd prefix: 3 suffixes + 2 prefixes
    const sb = x.mods.filter(m => kind(m) === 'suffix').map(m => m.id).sort().join();
    const r = E.applyMethod(x, EM('Potent Liquid Ferocity'));
    if (!r) { fail++; continue; }
    const c = x.mods.find(m => m.crafted); feros[key(c)] = (feros[key(c)] || 0) + 1;
    if (x.mods.filter(m => kind(m) === 'suffix').map(m => m.id).sort().join() !== sb) suffixLost++;
    if (x.mods.length === 5) fiveMods++;
  }
  out.ferocityOutcomes = { ...feros, failed: fail, suffixLost, fiveMods };
  t('V9 Ferocity never removes a locked suffix', suffixLost === 0, `${suffixLost}/400`);
  t('V10 Ferocity always lands as increased Effect of Suffixes and the jewel stays at 5 mods', fail === 0 && !feros.CraftedJewelPrefixEffect && fiveMods === 400, JSON.stringify(out.ferocityOutcomes));
  return out; }), null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
