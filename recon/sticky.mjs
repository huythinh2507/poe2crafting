import { chromium } from 'playwright';
const b = await chromium.launch();
const errs = [];
const check = async (w, h) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
  await p.waitForSelector('#itemBox');
  // a well-used item: 6 mods + sockets + unrevealed + armed omens, the tallest realistic panel
  await p.evaluate(async () => { const c = window.__craft; const D = await import('/js/data.js'), E = await import('/js/engine.js');
    const it = c.S.item; it.rarity = 'rare'; const used = new Set();
    for (const e of D.classPool(it.classId)) { if (it.mods.length >= 5) break; if (used.has(e.mod.group)) continue; used.add(e.mod.group); it.mods.push(E.rollMod(e.mod)); }
    it.unrevealed.push({ affix: 'suffix', minLevel: 0 }); E.toggleOmen('whittling'); E.togglePin('erasure_prefix'); c.renderCraft(); });
  const rect = sel => p.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null; }, sel);
  const inView = r => r && r.top >= 0 && r.bottom <= h;
  const rows = [];
  for (const target of ['#currencies', '.main-col h2', '.psec', 'body']) {
    await p.evaluate(t => { if (t === 'body') window.scrollTo(0, document.body.scrollHeight); else document.querySelector(t)?.scrollIntoView({ block: 'start' }); }, target);
    await p.waitForTimeout(150);
    const item = await rect('#itemBox'), undo = await rect('#undo'), cur = await rect('#currencies');
    rows.push(`scroll to ${target.padEnd(14)} item top=${item?.top} bottom=${item?.bottom} | Undo visible=${inView(undo)} | item fully in view=${inView(item)}`);
  }
  console.log(`${w}x${h}`); rows.forEach(r => console.log('   ' + r));
  const col = await p.evaluate(() => { const s = document.querySelector('.sticky'); return { scrolls: s.scrollHeight > s.clientHeight, clientH: s.clientHeight }; });
  console.log('   sticky column scrolls internally:', col.scrolls, `(height ${col.clientH}px)`);
  if (w === 1500) { await p.evaluate(() => document.querySelector('#currencies').scrollIntoView({ block: 'start' })); await p.screenshot({ path: 'recon/sticky.png' }); }
  await p.close();
};
await check(1500, 900); await check(1280, 720); await check(820, 900);
console.log(errs.join('\n') || 'no errors');
await b.close();
