import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
const bases = [['group=8&class=90&item=3644', 'Talisman'], ['group=1&class=4&item=3408', 'Body armour'], ['group=7&class=54', 'Sword']];
let bad = 0, runs = 0;
for (const [qs, label] of bases) {
  await p.goto(`http://localhost:5173/?${qs}`);
  await p.waitForFunction(() => window.__craft);
  if (!qs.includes('item=')) { await p.locator('.base').nth(2).click(); }
  await p.waitForSelector('#itemBox');
  for (let run = 0; run < 14; run++) {
    // random crafting sequence, mixing methods, omens and sockets; some may fail harmlessly
    await p.evaluate(async seed => {
      const c = window.__craft, E = await import('/js/engine.js');
      let r = seed; const rnd = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
      const n = 6 + Math.floor(rnd() * 7);
      for (let k = 0; k < n; k++) {
        const ms = c.allMethods().filter(m => !['reveal'].includes(m.handler));
        const m = ms[Math.floor(rnd() * ms.length)];
        if (rnd() < 0.3) { const o = E.OMENS.filter(x => !x.todo && !x.retired); E.toggleOmen(o[Math.floor(rnd() * o.length)].id); }
        if (m.handler === 'poe2_socketable') { c.apply({ ...m, slot: Math.floor(rnd() * 2) }, true); continue; }
        c.apply(m, true);
        if (c.S.item.unrevealed.length && rnd() < 0.5) c.openReveal(0), c.S.reveal && c.S.reveal.options.length && c.pickReveal(0);
      }
      c.S.method = rnd() < 0.5 ? c.CATALOGUE.find(x => x.handler === 'poe2_chaos') : null;
      c.renderCraft();
    }, 1234 + run * 77 + bases.indexOf(bases.find(x => x[1] === label)) * 1000);
    const before = await p.evaluate(() => { const i = window.__craft.S.item; return `${i.rarity}/${i.mods.length}+${i.unrevealed.length} soc=${i.socketed.length} cor=${i.corrupted}`; });
    for (const sel of ['#resetItem', '#reset']) {
      if (sel === '#reset') { /* need dirty again for the second button */ }
      const l = p.locator(sel); await l.scrollIntoViewIfNeeded();
      const bb = await l.boundingBox();
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.up();
      const clean = await p.evaluate(() => { const S = window.__craft.S, i = S.item; return i.rarity === 'normal' && !i.mods.length && !i.unrevealed.length && !i.socketed.length && !i.quality && !i.corrupted && !i.lock && !S.history.length && !S.log.length && i.sockets === S.base.sockets && !S.reveal; });
      runs++;
      if (!clean) { bad++; console.log(label, sel, 'NOT CLEAN after reset; before:', before, '| after:', await p.evaluate(() => JSON.stringify({ r: window.__craft.S.item.rarity, m: window.__craft.S.item.mods.length, u: window.__craft.S.item.unrevealed.length, s: window.__craft.S.item.socketed.length, sockets: window.__craft.S.item.sockets, hist: window.__craft.S.history.length, log: window.__craft.S.log.length, reveal: !!window.__craft.S.reveal }))); }
      // dirty it again so the second button is tested on a non-empty item
      if (sel === '#resetItem') await p.evaluate(() => { const c = window.__craft; c.apply(c.CATALOGUE.find(m => m.handler === 'poe2_alchemy'), true); c.renderCraft(); });
    }
    await p.evaluate(async () => (await import('/js/engine.js')).ctx.omens.clear());
  }
}
console.log(`reset clicks: ${runs}, not clean: ${bad}`);
console.log(errs.length ? errs.slice(0, 5).join('\n') : 'no page errors');
await b.close();
