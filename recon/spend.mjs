// Regression test for spend tracking (public/js/spend.js + apply/undo/reset in app.js). Run with the server up: node recon/spend.mjs
import { chromium } from 'playwright';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);

const r = await p.evaluate(async () => {
  const C = window.__craft, { S, DB, ctx, CATALOGUE, allMethods, apply, priceOf, costOf, uses } = C;
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const out = {};
  const bow = () => {
    const c = [...DB.classes.values()].find(c => DB.text(c.label) === 'Bows');
    S.group = c.group; S.cls = c;
    C.selectBase([...DB.items.values()].filter(i => i.class === c.id && i.domain === 1 && i.drop).pop());
  };
  const method = h => CATALOGUE.find(m => m.handler === h);
  const name = m => m.name || DB.text(DB.items.get(m.item).label);
  const snap = () => ({ ...S.spend.counts });
  bow();
  // 1. a plain currency
  const trans = method('poe2_transmutation');
  out.t_ok = apply(trans, true); out.t_counts = snap();
  out.t_cost = costOf(S.spend).total; out.t_price = priceOf(name(trans))?.value;
  // 2. failed apply costs nothing (Chaos needs a Rare; item is Magic)
  const before = uses(S.spend);
  out.chaos_on_magic = apply(method('poe2_chaos'), true); out.fail_unchanged = uses(S.spend) === before;
  // 3. omen is charged once, then gone; pinned omen is charged every use
  S.item.rarity = 'rare';
  while (S.item.mods.length < 4) S.item.mods.push(E.rollMod(DB.mods.get(E.fullPool(S.item).find(e => !S.item.mods.some(m => DB.mods.get(m.id).group === e.mod.group) && e.affix === (S.item.mods.length % 2 ? 'suffix' : 'prefix')).mod.id)));
  const chaos = method('poe2_chaos'), whit = 'Omen of Whittling';
  ctx.omens.add('whittling');
  const c0 = snap(); apply(chaos, true); const c1 = snap();
  out.omen_charged = (c1[whit] || 0) - (c0[whit] || 0); out.omen_gone = !ctx.omens.has('whittling');
  apply(chaos, true); const c2 = snap(); out.omen_not_again = (c2[whit] || 0) === (c1[whit] || 0);
  E.togglePin && E.togglePin('whittling'); ctx.omens.add('whittling'); ctx.pinned.add('whittling');
  apply(chaos, true); apply(chaos, true); const c3 = snap();
  out.pinned_twice = (c3[whit] || 0) - (c2[whit] || 0);
  ctx.omens.delete('whittling'); ctx.pinned.clear();
  // 4. undo restores the spend exactly
  const preUndo = snap(); const pre = JSON.stringify(preUndo);
  apply(chaos, true); out.after_chaos = snap()[name(chaos)];
  C.undo ? C.undo() : document.querySelector('#undo').click();
  out.undo_restored = JSON.stringify(snap()) === pre;
  // 5. unpriced item counts as 0 and is listed
  C.charge('Stone Rune'); const cost = costOf(S.spend);
  out.unpriced = cost.unpriced; out.unpriced_zero = cost.rows.find(x => x.name === 'Stone Rune')?.total === 0;
  // 6. Reset item banks the spend into the session total
  const itemTotal = costOf(S.spend).total; const itemUses = uses(S.spend);
  document.querySelector('#resetItem').click();
  out.reset_item_zero = uses(S.spend) === 0; out.session_has = uses(S.prior) === itemUses;
  out.session_cost = costOf(S.prior).total; out.itemTotal = itemTotal;
  // 6b. a catalyst at its quality cap does nothing, so it is refused and costs nothing; a different catalyst still works
  const ring = [...DB.classes.values()].find(c => DB.text(c.label) === 'Rings'); S.group = ring.group; S.cls = ring;
  C.selectBase(D.basesOfClass(ring.id)[0]); S.item.rarity = 'rare';
  const cat = h => CATALOGUE.find(m => m.handler === h);
  S.item.catalyst = { tag: 'attack', quality: E.catalystCap(S.item) };
  const spentBefore = uses(S.spend);
  out.cap_refused = apply(cat('poe2_catalyst_reaver'), true) === false && uses(S.spend) === spentBefore && S.item.catalyst.quality === E.catalystCap(S.item);
  out.cap_other = apply(cat('poe2_catalyst_flesh'), true) && S.item.catalyst.tag === 'life' && uses(S.spend) === spentBefore + 1;
  out.cap_reason = (E.catalystMaxed(S.item, 'poe2_catalyst_flesh') === false);
  bow();   // back to the bow for the desecration check
  // 7. desecration: bone + Abyssal Echoes reroll + faction omen at the reveal
  C.selectBase(S.base); S.item.rarity = 'rare';
  const bone = CATALOGUE.find(m => m.handler.startsWith('poe2_desecrate') && E.checkConstraints(S.item, m.constraints, m.handler));
  out.bone = bone && name(bone); out.bone_ok = !!bone && apply(bone, true);
  S.tab = 'Desecrate'; ctx.omens.add('echoes'); ctx.omens.add('Kurgal');
  C.openReveal(0); document.querySelector('#revealReroll')?.click(); C.pickReveal(0);
  out.reveal_counts = snap();
  return out;
});
ok(r.t_ok && r.t_counts['Orb of Transmutation'] === 1, 'transmutation charged once: ' + JSON.stringify(r.t_counts));
ok(near(r.t_cost, r.t_price), `cost matches price (${r.t_cost})`);
ok(r.chaos_on_magic === false && r.fail_unchanged, 'failed apply charges nothing');
ok(r.omen_charged === 1 && r.omen_gone, 'armed omen charged once and consumed');
ok(r.omen_not_again, 'consumed omen not charged on the next use');
ok(r.pinned_twice === 2, 'pinned omen charged on every use (' + r.pinned_twice + ')');
ok(r.undo_restored, 'undo restores the spend');
ok(r.unpriced.includes('Stone Rune') && r.unpriced_zero, 'unpriced item costs 0 and is listed');
ok(r.reset_item_zero && r.session_has && near(r.session_cost, r.itemTotal), 'Reset item banks spend into session total (' + r.session_cost + ')');
ok(r.cap_refused, 'catalyst at the quality cap is refused and not charged');
ok(r.cap_other && r.cap_reason, 'a different catalyst still replaces it and is charged');
ok(r.bone_ok && r.reveal_counts[r.bone] === 1, 'bone charged: ' + r.bone);
ok(r.reveal_counts['Omen of Abyssal Echoes'] === 1 && r.reveal_counts['Omen of the Blackblooded'] === 1, 'reveal omens charged: ' + JSON.stringify(r.reveal_counts));
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
process.exit(fails ? 1 : 0);
