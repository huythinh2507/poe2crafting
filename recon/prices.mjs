// Regression test for public/js/prices.js. Run with the server up: node recon/prices.mjs
import { chromium } from 'playwright';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);

const r = await p.evaluate(async () => {
  const { PRICES, priceOf, setOverride, fmtDivine, DB, allMethods, S } = window.__craft;
  const E = await import('/js/engine.js');
  const out = { fmt: [0, 2.4712, 0.012345, 0.0000194, 153.7, 12.34].map(fmtDivine) };
  out.live = !!PRICES.live; out.coeSize = PRICES.coe.size;
  out.divine = priceOf('Divine Orb');
  out.unknown = priceOf('Definitely Not An Item');
  const liveName = Object.keys(PRICES.live?.byName || {}).find(n => n !== 'Divine Orb');
  const before = priceOf(liveName); setOverride(liveName, 123.5);
  out.override = priceOf(liveName); setOverride(liveName, null); out.cleared = priceOf(liveName);
  out.layerLive = before?.source;
  // a name only the CoE snapshot has
  const coeOnly = [...PRICES.coe.keys()].find(n => !(n in (PRICES.live?.byName || {})));
  out.coeOnly = coeOnly && priceOf(coeOnly);
  // coverage on a rare bow
  const c = [...DB.classes.values()].find(c => DB.text(c.label) === 'Bows');
  S.group = c.group; S.cls = c;
  window.__craft.selectBase([...DB.items.values()].filter(i => i.class === c.id && i.domain === 1 && i.drop).pop());
  S.item.rarity = 'rare';
  const name = m => m.name || (m.item != null && DB.items.get(m.item) ? DB.text(DB.items.get(m.item).label) : m.handler);
  const names = [...new Set([...allMethods().map(name), ...E.OMENS.filter(o => !o.retired).map(o => o.name)])];
  out.total = names.length; out.unpriced = names.filter(n => !priceOf(n));
  return out;
});
ok(r.fmt.join(',') === '0,2.47,0.012,0.00002,154,12.3', 'fmtDivine ' + r.fmt.join(','));
ok(r.live, 'prices-live.json loaded'); ok(r.coeSize > 100, 'CoE fallback loaded (' + r.coeSize + ')');
ok(r.divine?.value === 1, 'Divine Orb = 1 (' + r.divine?.source + ')');
ok(r.unknown === null, 'unknown name is unpriced');
ok(r.layerLive === 'live', 'live layer used first'); ok(r.override?.value === 123.5 && r.override.source === 'override', 'override wins');
ok(r.cleared?.source === 'live', 'override can be cleared');
ok(!r.coeOnly || r.coeOnly.source === 'coe', 'CoE-only item falls back to CoE');
console.log(`coverage: ${r.total - r.unpriced.length}/${r.total} priced; unpriced (${r.unpriced.length}): ${r.unpriced.slice(0, 40).join(' | ')}`);

ok(errs.length === 0, 'no page errors ' + errs.join('; '));
await b.close();
process.exit(fails ? 1 : 0);
