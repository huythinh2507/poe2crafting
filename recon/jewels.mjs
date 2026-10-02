// Jewels and Time-Lost jewels: radius wording, tag chips, catalyst boost. Run with the server up: node recon/jewels.mjs
import { chromium } from 'playwright';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1400, height: 1200 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);

const r = await p.evaluate(async () => {
  const C = window.__craft, { S, DB, CATALOGUE, apply } = C;
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const out = {};
  const pick = name => {
    const c = [...DB.classes.values()].find(c => DB.text(c.label) === name); S.group = c.group; S.cls = c;
    C.selectBase(D.basesOfClass(c.id)[0]); S.item.rarity = 'rare'; return c;
  };
  const byKey = k => E.fullPool(S.item).find(e => e.mod.key.startsWith(k) && e.tier === 1)?.mod;
  const lines = mod => E.modLines(mod).join(' / ');
  // --- Time-Lost: radius wording
  pick('Time-Lost Emerald');
  const small = byKey('JewelRadiusAttackDamage'), notable = byKey('JewelRadiusRage') || E.fullPool(S.item).find(e => DB.jewelRadius[e.mod.key] === 'Notable').mod;
  out.small = lines(small); out.notable = lines(notable);
  out.size = lines(byKey('JewelRadiusLargeSize') || byKey('JewelRadiusMediumSize'));
  out.effect = lines(E.fullPool(S.item).find(e => /NodeEffect$/.test(e.mod.key)).mod);
  out.template = E.modTemplate(small);
  out.radiusMods = E.fullPool(S.item).filter(e => /^JewelRadius/.test(e.mod.key) && !/Size$|NodeEffect$|NotableEffect/.test(e.mod.key));
  out.radiusUnscoped = out.radiusMods.filter(e => !DB.jewelRadius[e.mod.key]).map(e => e.mod.key);
  out.radiusCount = out.radiusMods.length;
  // --- ordinary jewel: no radius wording
  pick('Emerald'); out.plainAll = E.fullPool(S.item).every(e => !/Passive Skills in Radius also grant/.test(lines(e.mod)));
  // --- tag chips on the item and in the pool
  pick('Time-Lost Emerald');
  const atk = E.fullPool(S.item).find(e => DB.jewelRadius[e.mod.key] === 'Small' && D.tagChips(e.mod).includes('attack') && e.mod.key.startsWith('JewelRadiusAttackDamage')).mod;
  const life = E.fullPool(S.item).find(e => D.tagChips(e.mod).includes('life') && !D.tagChips(e.mod).includes('attack') && e.affix).mod;
  S.item.mods = [E.rollMod(atk), E.rollMod(life)];
  C.renderCraft();
  out.metaChips = [...document.querySelectorAll('#itemBox .mod')].map(m => [...m.querySelectorAll('.mod-tags .tagchip')].map(x => x.textContent));
  out.poolChips = document.querySelectorAll('#pool .fam-name .tagchip').length;
  // --- catalyst: refined works on jewels, scales only matching tags
  S.tab = 'Catalysts'; S.method = null; C.renderCraft();
  const enabled = [...document.querySelectorAll('#currencies .cur:not(:disabled)')].map(x => x.innerText.split('\n')[0]);
  out.enabledCats = enabled.filter(n => /Catalyst/.test(n)); out.allRefined = out.enabledCats.every(n => /^Refined/.test(n));
  const reaver = CATALOGUE.find(m => m.handler === 'poe2_refined_catalyst_reaver');
  // small radius values (1-2%) round back to themselves; pick an attack-tagged mod big enough to show the boost
  const big = E.fullPool(S.item).find(e => D.tagChips(e.mod).includes('attack') && e.mod.stats.every(s => Array.isArray(s.range) && s.range[1] >= 8)).mod;
  out.bigMod = big.key;
  S.item.mods = [{ id: big.id, rolls: big.stats.map(s => s.range[1]) }, E.rollMod(life)];
  const before = E.modLines(DB.mods.get(S.item.mods[0].id), S.item.mods[0].rolls, S.item).join();
  S.item.catalyst = { tag: 'attack', quality: 20 };
  const after = E.modLines(DB.mods.get(S.item.mods[0].id), S.item.mods[0].rolls, S.item).join();
  const lifeBefore = E.modLines(DB.mods.get(S.item.mods[1].id), S.item.mods[1].rolls, { ...S.item, catalyst: null }).join();
  const lifeAfter = E.modLines(DB.mods.get(S.item.mods[1].id), S.item.mods[1].rolls, S.item).join();
  out.scaled = { before, after, lifeSame: lifeBefore === lifeAfter };
  C.renderCraft();
  out.boost = [...document.querySelectorAll('#itemBox .mod')].map(m => !!m.querySelector('.cat-boost'));
  S.item.catalyst = { tag: 'lightning', quality: 20 }; C.renderCraft();
  out.boostLightning = [...document.querySelectorAll('#itemBox .mod')].map(m => !!m.querySelector('.cat-boost'));
  // apply through the real method: quality appears and replaces the old type
  S.item.catalyst = null; S.method = reaver; out.applied = apply(reaver, true); out.afterApply = S.item.catalyst;
  // at the quality cap the same catalyst is greyed out with a reason, other types stay usable
  S.tab = 'Catalysts'; S.method = null; S.item.catalyst = { tag: 'attack', quality: E.catalystCap(S.item) }; C.renderCraft();
  const btn = name => [...document.querySelectorAll('#currencies .cur')].find(x => x.innerText.startsWith(name));
  out.capReaver = { disabled: btn('Refined Reaver Catalyst').disabled, why: btn('Refined Reaver Catalyst').querySelector('.why')?.textContent };
  out.capFlesh = btn('Refined Flesh Catalyst').disabled;
  // plain catalyst is for jewellery only, refined for jewels only
  const ring = [...DB.classes.values()].find(c => DB.text(c.label) === 'Rings'); S.group = ring.group; S.cls = ring;
  C.selectBase(D.basesOfClass(ring.id)[0]); S.item.rarity = 'rare'; S.tab = 'Catalysts'; S.method = null; C.renderCraft();
  out.ringCats = [...document.querySelectorAll('#currencies .cur:not(:disabled)')].map(x => x.innerText.split('\n')[0]).filter(n => /Catalyst/.test(n));
  return out;
});
ok(r.small.startsWith('Small Passive Skills in Radius also grant '), 'Time-Lost Small mod reads: ' + r.small);
ok(r.notable.startsWith('Notable Passive Skills in Radius also grant '), 'Time-Lost Notable mod reads: ' + r.notable);
ok(!/also grant/.test(r.size) && !/also grant/.test(r.effect), `radius size / effect mods unchanged: "${r.size}" / "${r.effect}"`);
ok(r.template.startsWith('Small Passive Skills'), 'pool family name carries the wording too');
ok(r.radiusUnscoped.length === 0 && r.radiusCount > 50, `every radius mod has a scope (${r.radiusCount} checked; unscoped: ${r.radiusUnscoped.join(',') || 'none'})`);
ok(r.plainAll, 'ordinary jewels have no radius wording');
ok(r.metaChips[0].includes('attack') && r.metaChips[1].includes('life'), 'item mods show tag chips: ' + JSON.stringify(r.metaChips));
ok(r.poolChips > 20, 'pool rows show tag chips (' + r.poolChips + ')');
ok(r.allRefined && r.enabledCats.length === 13, `jewels can use only the 13 Refined catalysts (${r.enabledCats.length})`);
ok(r.ringCats.length === 13 && r.ringCats.every(n => !/^Refined/.test(n)), `rings can use only the 13 plain catalysts (${r.ringCats.length})`);
ok(r.scaled.after !== r.scaled.before && r.scaled.lifeSame, `attack quality scales the attack mod only: ${r.scaled.before} -> ${r.scaled.after}`);
ok(r.boost[0] && !r.boost[1], 'boost marker on the attack mod only: ' + r.boost);
ok(!r.boostLightning[0] && !r.boostLightning[1], 'a lightning catalyst does not mark the attack mod');
ok(r.applied && r.afterApply?.tag === 'attack' && r.afterApply.quality >= 1, 'Refined Reaver applies: ' + JSON.stringify(r.afterApply));
ok(r.capReaver.disabled && /maximum/.test(r.capReaver.why), 'same catalyst at the cap is disabled: ' + r.capReaver.why);
ok(r.capFlesh === false, 'a different catalyst stays usable at the cap');
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
process.exit(fails ? 1 : 0);
