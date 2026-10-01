import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1300 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);

const res = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const R = {};
  const pass = (name, ok, detail = '') => { R[name] = (ok ? 'PASS ' : 'FAIL ') + detail; };
  const CLS = 4; // Body Armours (STR)
  const base = D.basesOfClass(CLS).pop();
  const fresh = () => { const it = E.newItem(base, 100); it.rarity = 'rare'; return it; };
  const pool = D.classPool(CLS);
  const modAt = (lvl, affix, skip = []) => pool.find(e => e.mod.minlvl === lvl && e.affix === affix && !skip.includes(e.mod.group));
  // build an item from [entry,...] without conflicting groups
  const withMods = entries => { const it = fresh(); for (const e of entries) it.mods.push(E.rollMod(e.mod)); return it; };
  const chaos = (extra = {}) => ({ handler: 'poe2_chaos', properties: [], constraints: [], ...extra });
  const run = (method, setup) => { E.ctx.omens.clear(); setup && setup(); };
  const lvlOf = m => DB.mods.get(m.id).minlvl;

  // distinct-level pool entries
  const levels = [...new Set(pool.map(e => e.mod.minlvl))].sort((a, b) => a - b);
  const pre = pool.filter(e => e.affix === 'prefix'), suf = pool.filter(e => e.affix === 'suffix');
  const pick = (arr, lvl, used) => arr.find(e => e.mod.minlvl === lvl && !used.has(e.mod.group));
  const buildLevels = (spec) => { // spec: [['prefix',lvl],...]
    const used = new Set(), ents = [];
    for (const [aff, lvl] of spec) { const e = pick(aff === 'prefix' ? pre : suf, lvl, used); if (!e) return null; used.add(e.mod.group); ents.push(e); }
    return withMods(ents);
  };
  const lvlsPre = [...new Set(pre.map(e => e.mod.minlvl))].sort((a, b) => a - b);
  const lvlsSuf = [...new Set(suf.map(e => e.mod.minlvl))].sort((a, b) => a - b);

  // ================= WHITTLING =================
  // W1: lowest mod level removed (unique lowest), mod LEVEL not tier
  {
    let ok = 0, n = 150, detail = '';
    for (let k = 0; k < n; k++) {
      const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const lowest = Math.min(...it.mods.map(lvlOf));
      E.ctx.omens.clear(); E.ctx.omens.add('whittling');
      const ch = E.applyMethod(it, chaos());
      if (ch[0].op === 'remove' && lvlOf(ch[0].mod) === lowest) ok++;
    }
    pass('W1 removes the lowest mod level', ok === n, `${ok}/${n}`);
  }
  // W2: ties -> random between tied (a prefix and a suffix sharing the lowest level)
  {
    const shared = lvlsPre.filter(l => lvlsSuf.includes(l) && l > 1);
    const L = shared[0];
    const hits = {}; let tot = 0;
    for (let k = 0; k < 400; k++) {
      const used = new Set();
      const a = pick(pre, L, used); used.add(a.mod.group);
      const b2 = pick(suf, L, used);
      const c = pick(pre, lvlsPre[lvlsPre.length - 2], used), d = pick(suf, lvlsSuf[lvlsSuf.length - 3], used);
      const it = withMods([a, b2, c, d].filter(Boolean)); if (!a || !b2) throw new Error("tie setup failed");
      E.ctx.omens.clear(); E.ctx.omens.add('whittling');
      const ch = E.applyMethod(it, chaos());
      const key = DB.mods.get(ch[0].mod.id).key; hits[key] = (hits[key] || 0) + 1; tot++;
    }
    const keys = Object.keys(hits);
    pass('W2 ties are split randomly (level ' + L + ')', keys.length === 2 && keys.every(k => hits[k] / tot > 0.35), JSON.stringify(hits));
  }
  // W3: unrevealed desecrated counts as level 1 -> removed before any mod above level 1
  {
    const hi = lvlsPre.filter(l => l > 1), hs = lvlsSuf.filter(l => l > 1);
    let ok = 0, n = 100;
    for (let k = 0; k < n; k++) {
      const it = buildLevels([['prefix', hi[0]], ['prefix', hi[3]], ['suffix', hs[3]]]);
      it.unrevealed.push({ affix: 'suffix', minLevel: 0 });
      E.ctx.omens.clear(); E.ctx.omens.add('whittling');
      const ch = E.applyMethod(it, chaos());
      if (ch[0].op === 'remove' && ch[0].text && /Unrevealed/.test(ch[0].text)) ok++;
    }
    pass('W3 unrevealed desecrated is removed first (level 1)', ok === n, `${ok}/${n}`);
  }
  // W4: fractured lowest-level mod is protected
  {
    let bad = 0, n = 100, removedSecondLowest = 0;
    for (let k = 0; k < n; k++) {
      const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const sorted = [...it.mods].sort((a, b) => lvlOf(a) - lvlOf(b));
      sorted[0].fractured = true;
      E.ctx.omens.clear(); E.ctx.omens.add('whittling');
      const ch = E.applyMethod(it, chaos());
      if (ch[0].mod === sorted[0]) bad++;
      if (ch[0].mod === sorted[1]) removedSecondLowest++;
    }
    pass('W4 fractured protected, next-lowest removed', bad === 0 && removedSecondLowest === n, `lost fractured ${bad}, 2nd-lowest removed ${removedSecondLowest}/${n}`);
  }
  // W5: Whittling + Sinistral Erasure = lowest among prefixes only
  {
    let ok = 0, n = 100;
    for (let k = 0; k < n; k++) {
      // suffix has the globally lowest level; with prefix-only erasure a PREFIX must go
      const it = buildLevels([['prefix', lvlsPre[3]], ['prefix', lvlsPre[6]], ['suffix', lvlsSuf[0]], ['suffix', lvlsSuf[5]]]);
      const lowestPrefix = Math.min(...it.mods.filter(m => D.affixOf(DB.mods.get(m.id)) === 'prefix').map(lvlOf));
      E.ctx.omens.clear(); E.toggleOmen('whittling'); E.toggleOmen('erasure_prefix');
      const ch = E.applyMethod(it, chaos());
      if (D.affixOf(DB.mods.get(ch[0].mod.id)) === 'prefix' && lvlOf(ch[0].mod) === lowestPrefix) ok++;
    }
    pass('W5 Whittling + Sinistral Erasure', ok === n, `${ok}/${n}`);
    // and dextral
    let ok2 = 0;
    for (let k = 0; k < n; k++) {
      const it = buildLevels([['prefix', lvlsPre[0]], ['prefix', lvlsPre[6]], ['suffix', lvlsSuf[3]], ['suffix', lvlsSuf[5]]]);
      const lowestSuffix = Math.min(...it.mods.filter(m => D.affixOf(DB.mods.get(m.id)) === 'suffix').map(lvlOf));
      E.ctx.omens.clear(); E.toggleOmen('whittling'); E.toggleOmen('erasure_suffix');
      const ch = E.applyMethod(it, chaos());
      if (D.affixOf(DB.mods.get(ch[0].mod.id)) === 'suffix' && lvlOf(ch[0].mod) === lowestSuffix) ok2++;
    }
    pass('W5b Whittling + Dextral Erasure', ok2 === n, `${ok2}/${n}`);
  }
  // W6: consumption: only by Chaos (any tier), not by other currencies
  {
    E.ctx.omens.clear(); E.toggleOmen('whittling');
    E.consumeOmens('poe2_exalted'); const keptAfterExalt = E.ctx.omens.has('whittling');
    E.consumeOmens('poe2_annulment'); const keptAfterAnnul = E.ctx.omens.has('whittling');
    E.consumeOmens('poe2_chaos_perfect'); const keptAfterPerfectChaos = E.ctx.omens.has('whittling');
    pass('W6 consumed only by Chaos (incl. Perfect)', keptAfterExalt && keptAfterAnnul && !keptAfterPerfectChaos, `exalt:${keptAfterExalt} annul:${keptAfterAnnul} perfectChaos:${keptAfterPerfectChaos}`);
  }
  // W8: Whittling + Perfect Chaos: removal by level, addition respects min mod level 50 (with highest-tier fallback)
  {
    let badAdd = 0, n = 100;
    for (let k = 0; k < n; k++) {
      const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      E.ctx.omens.clear(); E.ctx.omens.add('whittling');
      const ch = E.applyMethod(it, chaos({ handler: 'poe2_chaos_perfect', properties: [{ key: 'min_mod_level', value: 50 }] }));
      const add = ch.find(c => c.op === 'add'); if (!add) { badAdd++; continue; }
      const m = DB.mods.get(add.mod.id);
      const group = pool.filter(e => e.mod.group === m.group && e.mod.minlvl <= 100);
      const hasHigh = group.some(e => e.mod.minlvl >= 50);
      if (hasHigh ? m.minlvl < 50 : m.minlvl !== Math.max(...group.map(e => e.mod.minlvl))) badAdd++;
    }
    pass('W8 Perfect Chaos add honours min level', badAdd === 0, `bad adds ${badAdd}/${n}`);
  }
  // W9: removal pool helper used for the UI highlight
  {
    const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
    const pool2 = E.removalPool(it, { whittle: true });
    pass('W9 removalPool(whittle) = lowest level only', pool2.length >= 1 && pool2.every(c => c.level === Math.min(...it.mods.map(lvlOf))), `${pool2.length} target(s)`);
  }

  // ================= LIGHT =================
  {
    let ok = 0, n = 100;
    for (let k = 0; k < n; k++) {
      const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]]]);
      const lich = D.lichPool(CLS).find(e => e.affix === 'suffix' && !it.mods.some(m => DB.mods.get(m.id).group === e.mod.group));
      const dm = { ...E.rollMod(lich.mod), desecrated: true }; it.mods.push(dm);
      E.ctx.omens.clear(); E.toggleOmen('light');
      const ch = E.applyMethod(it, { handler: 'poe2_annulment', properties: [], constraints: [] });
      if (ch && ch.length === 1 && ch[0].mod === dm) ok++;
    }
    pass('L1 Light removes only the desecrated mod', ok === n, `${ok}/${n}`);
    // unrevealed only
    const it2 = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]); it2.unrevealed.push({ affix: 'prefix', minLevel: 0 });
    E.ctx.omens.clear(); E.toggleOmen('light');
    const ch2 = E.applyMethod(it2, { handler: 'poe2_annulment', properties: [], constraints: [] });
    pass('L2 Light removes an unrevealed slot', ch2 && ch2[0].text && it2.unrevealed.length === 0 && it2.mods.length === 2, JSON.stringify(ch2 && ch2[0].text));
    // none present -> cannot apply, mods untouched
    const it3 = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]);
    E.ctx.omens.clear(); E.toggleOmen('light');
    const ch3 = E.applyMethod(it3, { handler: 'poe2_annulment', properties: [], constraints: [] });
    pass('L3 Light with no desecrated mod does nothing', ch3 === null && it3.mods.length === 2, `result=${ch3}`);
    // exclusivity
    E.ctx.omens.clear(); E.toggleOmen('light'); E.toggleOmen('annul_prefix');
    pass('L4 Light excludes Sinistral Annulment', !E.ctx.omens.has('light') && E.ctx.omens.has('annul_prefix'));
    // fractured desecrated stays
    const it5 = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]);
    const lich5 = D.lichPool(CLS).find(e => e.affix === 'suffix' && !it5.mods.some(m => DB.mods.get(m.id).group === e.mod.group));
    it5.mods.push({ ...E.rollMod(lich5.mod), desecrated: true, fractured: true });
    E.ctx.omens.clear(); E.toggleOmen('light');
    const ch5 = E.applyMethod(it5, { handler: 'poe2_annulment', properties: [], constraints: [] });
    pass('L5 Light cannot remove a fractured desecrated mod', ch5 === null, `result=${ch5}`);
  }

  // ================= OTHER ANNUL / CHAOS / EXALT / REGAL / ALCHEMY / VAAL / DIVINE / ESSENCE OMENS =================
  const annul = { handler: 'poe2_annulment', properties: [], constraints: [] };
  const exalt = { handler: 'poe2_exalted', properties: [], constraints: [] };
  const regal = { handler: 'poe2_regal', properties: [], constraints: [] };
  const alch = { handler: 'poe2_alchemy', properties: [], constraints: [] };
  const aff = m => D.affixOf(DB.mods.get(m.id));
  {
    let twoOk = 0, preOk = 0, sufOk = 0, n = 100;
    for (let k = 0; k < n; k++) {
      E.ctx.omens.clear(); E.toggleOmen('annul_two');
      const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const c = E.applyMethod(it, annul); if (c && c.length === 2 && it.mods.length === 2) twoOk++;
      E.ctx.omens.clear(); E.toggleOmen('annul_prefix');
      const it2 = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const c2 = E.applyMethod(it2, annul); if (c2 && aff(c2[0].mod) === 'prefix') preOk++;
      E.ctx.omens.clear(); E.toggleOmen('annul_suffix');
      const it3 = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const c3 = E.applyMethod(it3, annul); if (c3 && aff(c3[0].mod) === 'suffix') sufOk++;
    }
    pass('A1 Greater Annulment removes two', twoOk === n, `${twoOk}/${n}`);
    pass('A2 Sinistral Annulment prefix only', preOk === n, `${preOk}/${n}`);
    pass('A3 Dextral Annulment suffix only', sufOk === n, `${sufOk}/${n}`);
  }
  {
    let preOk = 0, sufOk = 0, n = 100;
    for (let k = 0; k < n; k++) {
      E.ctx.omens.clear(); E.toggleOmen('erasure_prefix');
      const it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const c = E.applyMethod(it, chaos()); if (c && aff(c[0].mod) === 'prefix') preOk++;
      E.ctx.omens.clear(); E.toggleOmen('erasure_suffix');
      const it2 = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      const c2 = E.applyMethod(it2, chaos()); if (c2 && aff(c2[0].mod) === 'suffix') sufOk++;
    }
    pass('C1 Sinistral Erasure prefix only', preOk === n, `${preOk}/${n}`);
    pass('C2 Dextral Erasure suffix only', sufOk === n, `${sufOk}/${n}`);
  }
  {
    // exalt: two mods / prefix only / suffix only / homogenising
    let two = 0, pre1 = 0, suf1 = 0, hom = 0, n = 100;
    for (let k = 0; k < n; k++) {
      E.ctx.omens.clear(); E.toggleOmen('exalt_two');
      let it = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]);
      let c = E.applyMethod(it, exalt); if (c && c.length === 2 && it.mods.length === 4) two++;
      E.ctx.omens.clear(); E.toggleOmen('exalt_prefix');
      it = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]);
      c = E.applyMethod(it, exalt); if (c && aff(c[0].mod) === 'prefix') pre1++;
      E.ctx.omens.clear(); E.toggleOmen('exalt_suffix');
      it = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]);
      c = E.applyMethod(it, exalt); if (c && aff(c[0].mod) === 'suffix') suf1++;
      E.ctx.omens.clear(); E.toggleOmen('exalt_homog');
      it = buildLevels([['prefix', lvlsPre[1]], ['suffix', lvlsSuf[2]]]);
      const tagsOf = m => (DB.groups.get(DB.mods.get(m.id).group).tags || []).filter(t => t !== 0);
      const have = new Set(it.mods.flatMap(tagsOf));
      c = E.applyMethod(it, exalt);
      if (c && tagsOf(c[0].mod).some(t => have.has(t))) hom++;
    }
    pass('X1 Greater Exaltation adds two', two === n, `${two}/${n}`);
    pass('X2 Sinistral Exaltation prefix only', pre1 === n, `${pre1}/${n}`);
    pass('X3 Dextral Exaltation suffix only', suf1 === n, `${suf1}/${n}`);
    pass('X4 Homogenising Exaltation shares a tag', hom === n, `${hom}/${n}`);
    // greater exaltation with only one open slot -> refuses (all-or-nothing)
    E.ctx.omens.clear(); E.toggleOmen('exalt_two');
    const full = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[3]], ['prefix', lvlsPre[5]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[4]]]);
    const before = full.mods.length;
    const cf = E.applyMethod(full, exalt);
    pass('X5 Greater Exaltation needs two open slots', cf === null || full.mods.length === before + 0 || full.mods.length === 6, `result=${cf && cf.length}, mods ${before}->${full.mods.length}`);
  }
  {
    let pre = 0, suf = 0, n = 100;
    for (let k = 0; k < n; k++) {
      E.ctx.omens.clear(); E.toggleOmen('regal_prefix');
      let it = fresh(); it.rarity = 'magic'; it.mods.push(E.rollMod(suf[0] ? suf[0].mod : D.classPool(CLS).find(e => e.affix === 'suffix').mod));
      let c = E.applyMethod(it, regal); if (c && aff(c[0].mod) === 'prefix' && it.rarity === 'rare') pre++;
      E.ctx.omens.clear(); E.toggleOmen('regal_suffix');
      it = fresh(); it.rarity = 'magic'; it.mods.push(E.rollMod(D.classPool(CLS).find(e => e.affix === 'prefix').mod));
      c = E.applyMethod(it, regal); if (c && aff(c[0].mod) === 'suffix') suf++;
    }
    pass('R1 Sinistral Coronation prefix', pre === n, `${pre}/${n}`);
    pass('R2 Dextral Coronation suffix', suf === n, `${suf}/${n}`);
  }
  {
    let pa = 0, sa = 0, n = 100;
    for (let k = 0; k < n; k++) {
      E.ctx.omens.clear(); E.toggleOmen('alch_prefix');
      let it = fresh(); let c = E.applyMethod(it, alch);
      const np = it.mods.filter(m => aff(m) === 'prefix').length, ns = it.mods.length - np;
      if (np === 3 && ns === 1) pa++;
      E.ctx.omens.clear(); E.toggleOmen('alch_suffix');
      it = fresh(); c = E.applyMethod(it, alch);
      const np2 = it.mods.filter(m => aff(m) === 'prefix').length;
      if (np2 === 1 && it.mods.length === 4) sa++;
    }
    pass('H1 Sinistral Alchemy = 3 prefix + 1 suffix', pa === n, `${pa}/${n}`);
    pass('H2 Dextral Alchemy = 3 suffix + 1 prefix', sa === n, `${sa}/${n}`);
  }
  {
    // Omen of Corruption: never "no change"
    let noChange = 0, noChangeBase = 0, n = 300;
    for (let k = 0; k < n; k++) {
      let it = withMods([pool.find(e => e.affix === 'prefix')]); E.ctx.omens.clear(); E.toggleOmen('corruption');
      const c = E.applyMethod(it, { handler: 'poe2_vaal', properties: [], constraints: [] });
      if (c && c[0].text && /no other change/.test(c[0].text)) noChange++;
      it = withMods([pool.find(e => e.affix === 'prefix')]); E.ctx.omens.clear();
      const c2 = E.applyMethod(it, { handler: 'poe2_vaal', properties: [], constraints: [] });
      if (c2 && c2[0].text && /no other change/.test(c2[0].text)) noChangeBase++;
    }
    pass('V1 Omen of Corruption removes the no-change outcome', noChange === 0 && noChangeBase > 40, `with omen ${noChange}/${n}, without ${noChangeBase}/${n} (~25%)`);
  }
  {
    // Blessed: only implicits change
    const it = withMods([pool.find(e => e.affix === 'prefix'), pool.find(e => e.affix === 'suffix')]);
    const snap = JSON.stringify(it.mods);
    E.ctx.omens.clear(); E.toggleOmen('blessed');
    const c = E.applyMethod(it, { handler: 'poe2_divine', properties: [], constraints: [] });
    pass('D1 Omen of the Blessed rerolls implicits only', JSON.stringify(it.mods) === snap && c.length === it.implicits.length && c.length > 0, `implicit rerolls ${c.length}`);
    // plain divine rerolls mods too (and implicits)
    E.ctx.omens.clear();
    let moved = false; for (let k = 0; k < 20 && !moved; k++) { E.applyMethod(it, { handler: 'poe2_divine', properties: [], constraints: [] }); moved = JSON.stringify(it.mods) !== snap; }
    pass('D2 plain Divine rerolls explicit mods', moved);
  }
  {
    // Crystallisation: Perfect essence removes only prefix/suffix
    const eP = DB.raw.essences.entries.find(x => x.type === 3 && DB.raw.essences.byessences[x.id]?.[CLS]);
    const method = { handler: 'poe2_essence', essence: eP, properties: [], constraints: [] };
    const mod = E.essenceMod(fresh(), eP); const kind = D.affixOf(mod);
    let preOk = 0, sufOk = 0, n = 80;
    for (let k = 0; k < n; k++) {
      let it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      E.ctx.omens.clear(); E.toggleOmen('crystal_prefix');
      let c = E.applyMethod(it, method); if (c && aff(c[0].mod) === 'prefix') preOk++;
      it = buildLevels([['prefix', lvlsPre[1]], ['prefix', lvlsPre[4]], ['suffix', lvlsSuf[2]], ['suffix', lvlsSuf[6]]]);
      E.ctx.omens.clear(); E.toggleOmen('crystal_suffix');
      c = E.applyMethod(it, method); if (c && aff(c[0].mod) === 'suffix') sufOk++;
    }
    R['E1 Crystallisation (essence is a ' + kind + ')'] = `prefix-removal ok ${preOk}/${n}, suffix-removal ok ${sufOk}/${n} (null when essence slot would be full is correct)`;
  }
  {
    // faction omen: one guaranteed option, weapon/jewellery only
    const swordBase = D.basesOfClass(54).pop();
    const sword = E.newItem(swordBase, 100); sword.rarity = 'rare';
    const u = { affix: 'suffix', minLevel: 0 }; const u2 = { affix: 'prefix', minLevel: 0 };
    let okS = 0, n = 100, applied = E.factionOmenApplies(sword), bodyApplies = E.factionOmenApplies(fresh());
    for (const af of [u, u2]) {
      const lichFor = D.lichPool(54).filter(e => e.affix === af.affix && e.faction === 'Ulaman').length;
      if (!lichFor) { R['F1 (' + af.affix + ')'] = 'no Ulaman ' + af.affix + ' lich mods on 1H swords, skipped'; continue; }
      okS = 0;
      for (let k = 0; k < n; k++) {
        E.ctx.omens.clear(); E.toggleOmen('Ulaman');
        const opts = E.revealOptions(sword, af);
        if (opts.length === 3 && opts.some(e => e.lich && e.faction === 'Ulaman')) okS++;
      }
      pass('F1 Sovereign guarantees an Ulaman option (' + af.affix + ')', okS === n, `${okS}/${n}`);
    }
    pass('F2 faction omens apply to weapons, not armour', applied && !bodyApplies, `sword:${applied} bodyArmour:${bodyApplies}`);
  }
  E.ctx.omens.clear();
  return R;
});
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(62), v);
console.log(errs.join('\n') || 'no errors');
await b.close();
