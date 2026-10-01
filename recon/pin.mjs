import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);

// ---- engine level ----
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {};
  const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const item = () => { const it = E.newItem(D.basesOfClass(4).pop(), 100); it.rarity = 'rare'; const p = D.classPool(4); const used = new Set(); for (const e of p) { if (it.mods.length >= 4) break; if (!used.has(e.mod.group) && e.mod.minlvl > 1) { used.add(e.mod.group); it.mods.push(E.rollMod(e.mod)); } } return it; };
  E.clearOmens();
  // unpinned: used up by the first Chaos
  E.toggleOmen('whittling'); E.consumeOmens('poe2_chaos');
  t('P1 unpinned omen is consumed by one Chaos', !E.ctx.omens.has('whittling'));
  // pinned: survives repeated use
  E.togglePin('whittling');
  t('P2 pinning arms the omen', E.ctx.omens.has('whittling') && E.ctx.pinned.has('whittling'));
  for (let k = 0; k < 5; k++) E.consumeOmens('poe2_chaos');
  t('P3 pinned omen survives 5 Chaos Orbs', E.ctx.omens.has('whittling'));
  // and it keeps doing its job every time
  let ok = 0;
  for (let k = 0; k < 40; k++) {
    const it = item(); const lowest = Math.min(...it.mods.map(m => DB.mods.get(m.id).minlvl));
    const ch = E.applyMethod(it, { handler: 'poe2_chaos', properties: [], constraints: [] }); E.consumeOmens('poe2_chaos');
    if (E.ctx.omens.has('whittling') && DB.mods.get(ch[0].mod.id).minlvl === lowest) ok++;
  }
  t('P4 Whittling still targets the lowest level on all 40 repeats', ok === 40, `${ok}/40`);
  // other omens of the same currency are still consumed normally
  E.toggleOmen('erasure_prefix'); E.consumeOmens('poe2_chaos');
  t('P5 an unpinned omen alongside a pinned one is still consumed', !E.ctx.omens.has('erasure_prefix') && E.ctx.omens.has('whittling'));
  // exclusivity: arming the other Erasure side unpins nothing else
  // clearing
  E.clearOmens({ keepPinned: true });
  t('P6 Reset item keeps pinned omens', E.ctx.omens.has('whittling') && E.ctx.pinned.has('whittling'));
  E.clearOmens();
  t('P7 Reset all / new base clears pins too', !E.ctx.omens.has('whittling') && E.ctx.pinned.size === 0);
  // unpin and switching off
  E.togglePin('light'); E.togglePin('light');
  t('P8 unpinning leaves it armed once, then it is consumed', E.ctx.omens.has('light') && !E.ctx.pinned.has('light') && (E.consumeOmens('poe2_annulment'), !E.ctx.omens.has('light')));
  E.togglePin('whittling'); E.toggleOmen('whittling');
  t('P9 switching an omen off also unpins it', !E.ctx.omens.has('whittling') && !E.ctx.pinned.has('whittling'));
  // exclusive pair: pinning one drops the other and its pin
  E.togglePin('erasure_prefix'); E.togglePin('erasure_suffix');
  t('P10 exclusive omens: the newer pin replaces the old one', E.ctx.omens.has('erasure_suffix') && !E.ctx.omens.has('erasure_prefix') && !E.ctx.pinned.has('erasure_prefix'));
  // reveal-phase omen (Abyssal Echoes) is spendable but pin keeps it
  E.clearOmens(); E.toggleOmen('echoes'); E.spendOmen('echoes');
  E.togglePin('echoes'); E.spendOmen('echoes');
  t('P11 reveal-phase omens honour the pin', E.ctx.omens.has('echoes'));
  E.clearOmens();
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(70), v);

// ---- UI: the combo, repeated ----
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await p.click('[data-family]:has-text("Chaos Orb")'); await p.locator('.cur-wrap.open .cur-drop .cur').first().click();
await p.click('[data-pin="whittling"]');
console.log('\nUI: Whittling pinned ->', await p.$$eval('[data-omen].active', os => os.map(o => o.innerText)), '| pin button on:', await p.locator('[data-pin="whittling"].on').count());
const lowestOf = () => p.evaluate(() => Math.min(...window.__craft.S.item.mods.map(m => window.__craft.DB.mods.get(m.id).minlvl)));
let hit = 0;
for (let k = 0; k < 8; k++) {
  const low = await lowestOf();
  await p.click('#itemBox');
  const removed = await p.evaluate(() => { const l = window.__craft.S.log[0].changes.find(c => c.op === 'remove'); return l && window.__craft.DB.mods.get(l.mod.id).minlvl; });
  if (removed === low) hit++;
}
console.log('UI: 8 Chaos Orbs with the pinned Whittling -> removed the lowest level each time:', hit + '/8', '| still armed:', await p.$$eval('[data-omen].active', os => os.map(o => o.innerText)));
await p.click('#resetItem');
console.log('UI: after "Reset item" armed bar:', await p.$$eval('.armed-chip', cs => cs.map(c => c.textContent.replace('×', '').trim())), '| pinned class:', await p.locator('.armed-chip.pinned').count());
await p.click('[data-omen-off="whittling"]');
console.log('UI: disarm with x ->', await p.locator('.armed').count() === 0 ? 'bar gone, omen off + unpinned' : 'STILL THERE', await p.evaluate(async () => [...(await import('/js/engine.js')).ctx.pinned]));
await p.click('#reset');
console.log('UI: after top Reset (start over) armed omens:', await p.evaluate(async () => [...(await import('/js/engine.js')).ctx.omens]), 'pinned:', await p.evaluate(async () => [...(await import('/js/engine.js')).ctx.pinned]));
console.log(errs.join('\n') || 'no errors');
await b.close();
