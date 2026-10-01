import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const base = DB.items.get(3644); const it = E.newItem(base, 100); it.sockets = 2;
  const before = E.fullPool(it).length;
  const thrud = DB.raw.socketables.entries.find(e => DB.text(DB.items.get(e.item)?.label) === "Thrud's Might");
  E.applyMethod(it, { handler: 'poe2_socketable', socket: thrud, properties: [], constraints: [] });
  return `Talisman pool before Thrud's Might: ${before}, after: ${E.fullPool(it).length} (Destruction mods now rollable: ${E.fullPool(it).filter(e => e.influence === 1007).length})`;
}));
console.log(errs.join('\n') || 'no errors');
await b.close();
