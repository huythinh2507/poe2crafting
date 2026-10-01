import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const out = {};
  const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const byName = n => [...DB.items.values()].find(i => DB.text(i.label) === n && i.domain === 1 && i.drop);
  const mk = (name, ilvl = 100) => E.newItem(byName(name), ilvl);
  const fmt = a => a.map(v => Math.round(v * 100) / 100).join('-');
  const close = (a, b, e = 0.06) => Math.abs(a - b) <= e;

  // ---- elemental base damage (the reported gap): values as listed on poe2db ----
  const cases = [
    ['Cinderbark Talisman', { physical: [12.6, 25.2], fire: [5.4, 10.8] }],
    ['Voltfang Talisman', { physical: [16.1, 91], lightning: [6.9, 39] }],
    ['Ashbark Talisman', { physical: [50.4, 105], fire: [21.6, 45] }],
    ['Thunder Talisman', { physical: [23.1, 130.9], lightning: [9.9, 56.1] }],
    ['Icicle Flail', { cold: [24, 55] }],
  ];
  for (const [name, expect] of cases) {
    const st = E.itemStats(mk(name));
    const ok = Object.keys(expect).every(el => st.damage[el] && close(st.damage[el].final[0], expect[el][0]) && close(st.damage[el].final[1], expect[el][1]))
      && Object.keys(st.damage).length === Object.keys(expect).length;
    t('S1 ' + name, ok, Object.entries(st.damage).map(([el, d]) => el + ' ' + fmt(d.final)).join(' + '));
  }
  const sw = E.itemStats(mk('Shortsword'));
  t('S2 Shortsword: physical only, crit and speed from the data', Object.keys(sw.damage).join() === 'physical' && close(sw.crit.final, 5) && close(sw.aps.final, 1.55, 0.01),
    `${fmt(sw.damage.physical.final)} crit ${sw.crit.final} aps ${sw.aps.final.toFixed(2)}`);

  // ---- quality: 1% MORE physical damage per 1% on martial weapons; elemental untouched ----
  {
    const it = mk('Cinderbark Talisman'); it.quality = 20;
    const st = E.itemStats(it);
    t('S3 quality 20%: physical x1.2, fire unchanged', close(st.damage.physical.final[0], 12.6 * 1.2) && close(st.damage.physical.final[1], 25.2 * 1.2) && close(st.damage.fire.final[0], 5.4),
      `phys ${fmt(st.damage.physical.final)} fire ${fmt(st.damage.fire.final)}`);
  }

  // ---- local mods: added damage, % increased physical, attack speed, crit ----
  {
    const it = mk('Shortsword');
    const find = id => [...DB.mods.values()].find(x => x.stats.some(s => DB.raw.stats[s.index]?.id === id) && DB.groups.get(x.group).influence === 6);
    const addPhys = find('local_minimum_added_physical_damage'), incPhys = find('local_physical_damage_+%'), spd = find('local_attack_speed_+%'), crit = find('local_critical_strike_chance');
    const put = (mod, rolls) => it.mods.push({ id: mod.id, rolls });
    put(addPhys, addPhys.stats.map(s => s.range[1]));
    put(incPhys, incPhys.stats.map(s => s.range[1]));
    put(spd, spd.stats.map(s => s.range[1]));
    put(crit, crit.stats.map(s => s.range[1]));
    it.quality = 10;
    const st = E.itemStats(it);
    const inc = E.localStat(it, 'local_physical_damage_+%');
    const expectMin = (6 + E.localStat(it, 'local_minimum_added_physical_damage')) * (1 + inc / 100) * 1.1;
    const expectMax = (9 + E.localStat(it, 'local_maximum_added_physical_damage')) * (1 + inc / 100) * 1.1;
    t('S4 shortsword: added phys, increased phys, 10 pct quality', close(st.damage.physical.final[0], expectMin, 0.05) && close(st.damage.physical.final[1], expectMax, 0.05),
      `final ${fmt(st.damage.physical.final)} expected ${expectMin.toFixed(2)}-${expectMax.toFixed(2)} (increased ${inc} pct)`);
    t('S5 attack speed and crit follow the local mods',
      close(st.aps.final, 1.55 * (1 + E.localStat(it, 'local_attack_speed_+%') / 100), 0.02) && close(st.crit.final, 5 + E.localStat(it, 'local_critical_strike_chance'), 0.02),
      `aps ${st.aps.final.toFixed(2)} crit ${st.crit.final.toFixed(2)}`);
    t('S6 DPS = average damage x attack speed', close(st.dps.total, ((st.damage.physical.final[0] + st.damage.physical.final[1]) / 2) * st.aps.final, 0.2), st.dps.total.toFixed(1));
  }

  // ---- armour ----
  {
    const it = mk('Runeforged Warlord Cuirass');
    const base = E.itemStats(it).defences.find(d => d.key === 'armour').base;
    it.quality = 20;
    const q = E.itemStats(it).defences.find(d => d.key === 'armour');
    t('S7 body armour quality 20%: armour x1.2', close(q.final, base * 1.2, 0.5), `${base} -> ${q.final.toFixed(1)}`);
  }

  // ---- caster weapons: no damage, a granted skill ----
  {
    const w = E.itemStats(mk('Withered Wand')), sc = E.itemStats(mk('Rattling Sceptre'));
    t('S8 wand grants a skill, no damage, no DPS', w.kind === 'caster' && w.skills.some(s => s.name === 'Chaos Bolt') && !w.dps && !w.damage, JSON.stringify(w.skills));
    t('S9 sceptre shows spirit and its skill', sc.spirit.base === 100 && sc.skills.length > 0, `spirit ${sc.spirit.final} ${sc.skills.map(s => s.name)}`);
  }

  // ---- two bases share a name: no guessing, keep the data values ----
  {
    const st = E.itemStats(mk('Golden Blade'));
    t('S10 ambiguous base name keeps the data values', Object.keys(st.damage).join() === 'physical', fmt(st.damage.physical.final));
  }

  // ---- every weapon base: stats compute and the elemental split adds up to the data total ----
  {
    let n = 0; const bad = [];
    const classes = [...DB.groupClasses[7], ...DB.groupClasses[8]];
    for (const i of DB.items.values()) {
      if (!classes.includes(i.class) || i.domain !== 1 || !i.drop) continue;
      const st = E.itemStats(E.newItem(i, 100)); n++;
      if (st?.kind === 'weapon' && i.props?.physical_damage_min != null) {
        const sum = [0, 1].map(k => Object.values(st.damage).reduce((s, d) => s + d.final[k], 0));
        if (!close(sum[0], i.props.physical_damage_min, 0.7) || !close(sum[1], i.props.physical_damage_max, 0.7)) bad.push(DB.text(i.label));
      }
    }
    t('S11 all ' + n + ' weapon bases: damage totals match the data', bad.length === 0, bad.slice(0, 4).join(', '));
  }
  // ---- DPS exactly as the official trade site (Honour Gnarl, Spiny Talisman) ----
  {
    const d = E.weaponDps({ physical: { final: [507, 837] }, lightning: { final: [7, 349] } }, 1.56);
    t('S12 trade example: pDPS 1048.32, eDPS 277.68, DPS 1326', d.physical === 1048.32 && d.elemental === 277.68 && Math.round(d.total) === 1326, JSON.stringify(d));
    const d2 = E.weaponDps({ physical: { final: [506.6, 837.4] } }, 1.5625);   // rounds damage and attack speed first, like the displayed values
    t('S13 DPS uses the rounded values', d2.physical === 1048.32 && d2.elemental === 0, JSON.stringify(d2));
  }
  // ---- caster weapons: quality improves the granted skill only, never the weapon ----
  {
    const wand = mk('Dueling Wand'); wand.quality = 20;
    const st = E.itemStats(wand);
    t('S14 wand quality is skill quality, no damage and no DPS', st.kind === 'caster' && st.skillQuality === 20 && st.damage === undefined && st.dps === undefined && st.skills[0].name === 'Spellslinger', `skill quality ${st.skillQuality}, ${st.skills[0].name} level ${st.skills[0].level}`);
    const lv = ilvl => E.grantedSkillLevel(ilvl);
    t('S15 granted skill level follows item level', lv(1) === 1 && lv(78) === 18 && lv(84) === 19 && lv(90) === 20 && lv(100) === 20, [1, 78, 81, 84, 100].map(l => l + ':' + lv(l)).join(' '));
    const sc = mk('Rattling Sceptre'); sc.quality = 20;
    const ss = E.itemStats(sc);
    t('S16 sceptre quality leaves spirit alone, shows no skill quality', ss.spirit.final === 100 && ss.skillQuality === 0, `spirit ${ss.spirit.base} -> ${ss.spirit.final}`);
    // martial weapon quality only touches physical damage and DPS follows
    const tal = mk('Cinderbark Talisman'); const before = E.itemStats(tal).dps.physical; tal.quality = 20; const after = E.itemStats(tal).dps.physical;
    t('S17 martial quality raises physical DPS', after > before * 1.15, `${before} -> ${after}`);
  }
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(78), v);

// ---- UI: the Cinderbark Talisman tooltip with 20% quality ----
const id = await p.evaluate(() => [...window.__craft.DB.items.values()].find(i => window.__craft.DB.text(i.label) === 'Cinderbark Talisman').id);
await p.goto(`http://localhost:5173/?group=8&class=90&item=${id}`);
await p.waitForSelector('#itemBox');
await p.evaluate(() => { const c = window.__craft; c.S.item.quality = 20; c.renderCraft(); });
console.log('\nUI tooltip:', (await p.locator('#itemBox .item-body').innerText()).replace(/\n+/g, ' | ').slice(0, 330));
await p.locator('#itemBox').scrollIntoViewIfNeeded();
await p.locator('#tooltip').screenshot({ path: 'recon/itemstats.png' });
console.log(errs.length ? errs.slice(0, 4).join('\n') : 'no errors');
await b.close();
