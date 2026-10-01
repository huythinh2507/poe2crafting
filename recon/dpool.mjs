import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const mk = (cls, affix, minLevel = 0) => { const it = E.newItem(D.basesOfClass(cls).pop(), 100); it.rarity = 'rare'; it.unrevealed = [{ affix, minLevel }]; return it; };
  for (const [label, cls] of [['Sapphire', 72], ['Time-Lost Sapphire', 77], ['Diamond', 74]]) for (const affix of ['suffix', 'prefix']) {
    const it = mk(cls, affix); const pool = E.desecratedPool(it, it.unrevealed[0]);
    const lich = pool.filter(e => e.lich), normal = pool.filter(e => !e.lich);
    const total = pool.reduce((s, e) => s + e.weight, 0); const lichShare = lich.reduce((s, e) => s + e.weight, 0) / total;
    // simulate 3000 reveals: how many options per reveal are normal mods
    let normalOpts = 0, N = 3000; const seen = new Set();
    for (let i = 0; i < N; i++) for (const o of E.revealOptions(it, it.unrevealed[0])) { if (!o.lich) normalOpts++; seen.add(o.mod.id); }
    t(`J ${label} ${affix}: normal mods appear (${normal.length} normal + ${lich.length} desecrated)`, normal.length > 0 && normalOpts / (N * 3) > 0.3, `desecrated share of weight ${(lichShare * 100).toFixed(1)}%, normal options ${(normalOpts / (N * 3) * 100).toFixed(0)}%, distinct mods seen ${seen.size}`);
  }
  // gear is unchanged: lich weight stays 1000 against ~1000-weight gear mods
  const body = E.newItem(D.basesOfClass(54).pop(), 100); body.rarity = 'rare'; const up = { affix: 'prefix', minLevel: 0 }; body.unrevealed = [up];
  const gp = E.desecratedPool(body, up); const lw = gp.filter(e => e.lich).map(e => e.weight);
  t('G1 weapon Lich weight untouched (1000)', lw.length > 0 && lw.every(w => w === 1000), `${lw[0]}`);
  return out; }), null, 1));
// UI: reveal on a Sapphire jewel
await p.goto('http://localhost:5173/'); await p.waitForSelector('[data-group]');
await p.locator('[data-group]').filter({ hasText: /^Jewel$/ }).click();
await p.locator('[data-class]').filter({ hasText: /^Sapphire$/ }).click();
await p.locator('[data-base]').first().click(); await p.waitForSelector('#itemBox');
await p.evaluate(() => { const c = window.__craft; const it = c.S.item; it.rarity = 'rare'; it.unrevealed = [{ affix: 'suffix', minLevel: 0 }]; c.renderCraft(); });
await p.click('[data-reveal]'); await p.waitForSelector('.reveal-opt');
console.log(await p.$$eval('.reveal-opt', o => o.map(x => x.innerText.replace(/\n/g, ' | '))));
await p.screenshot({ path: 'recon/dpool.png' });
console.log(errs.join('\n') || 'no errors'); await b.close();
