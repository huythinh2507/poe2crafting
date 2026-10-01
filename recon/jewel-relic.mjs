import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const cats = DB.raw.methods.crafting; const flat = []; (function w(els) { for (const e of els || []) { if (e.handler) flat.push(e); w(e.elements); } })(cats.flatMap(c => c.elements));
  const H = h => flat.find(m => m.handler === h);
  const apply = (it, h) => { const m = H(h); return m && E.checkConstraints(it, m.constraints || [], m.handler) ? E.applyMethod(it, m) : null; };
  const names = {};
  for (const [g, cs] of [['jewel', [71, 72, 73, 74, 76, 77, 78, 79]], ['relic', [80, 81, 82]]]) for (const c of cs) {
    const bases = D.basesOfClass(c); names[`${g} ${c} ${DB.text(DB.classes.get(c).label)}`] = bases.map(x => DB.text(x.label)).join('/');
  }
  out.bases = names;
  // jewels: rare limits
  for (const c of [71, 72, 73, 74, 76, 77, 78, 79]) {
    const base = D.basesOfClass(c)[0]; if (!base) { t(`jewel ${c} has a base`, false); continue; }
    const it = E.newItem(base, 100);
    const steps = ['poe2_transmutation', 'poe2_augmentation', 'poe2_regal'];
    for (const h of steps) apply(it, h);
    for (let i = 0; i < 12; i++) apply(it, 'poe2_exalted');
    const px = E.countAffix(it, 'prefix'), sx = E.countAffix(it, 'suffix'); const [mp, ms] = E.maxAffix(it);
    t(`jewel ${c} ${DB.text(DB.classes.get(c).label)}: rare, ${px}p/${sx}s within max ${mp}/${ms}`, it.rarity === 'rare' && px <= mp && sx <= ms && px + sx === mp + ms, `${it.mods.length} mods`);
    const ok = apply(it, 'poe2_chaos'); const an = apply(it, 'poe2_annulment'); const dv = apply(it, 'poe2_divine');
    t(`jewel ${c}: chaos/annul/divine run`, !!ok && !!an && !!dv);
  }
  // relics: magic only
  for (const c of [80, 81, 82]) {
    const base = D.basesOfClass(c)[0]; if (!base) { t(`relic ${c} has a base`, false); continue; }
    const it = E.newItem(base, 100);
    apply(it, 'poe2_transmutation'); apply(it, 'poe2_augmentation');
    const rg = apply(it, 'poe2_regal'); const al = apply(E.newItem(base, 100), 'poe2_alchemy');
    t(`relic ${c}: magic with 2 mods, Regal/Alchemy blocked`, it.rarity === 'magic' && it.mods.length === 2 && !rg && !al, `${it.rarity} ${it.mods.length}`);
  }
  return out; }), null, 1));
console.log(errs.join('\n') || 'no errors');
await b.close();
