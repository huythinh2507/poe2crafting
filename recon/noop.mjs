// Finds currencies that "succeed" without changing the item (they would be charged for nothing). Run with the server up: node recon/noop.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
const res = await p.evaluate(async () => {
  const C = window.__craft, { S, DB, allMethods } = C;
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const noops = {}; let tried = 0;
  const classes = ['Bows', 'Rings', 'Amulets', 'Ruby', 'Time-Lost Diamond', 'Body Armours (STR)', 'Wands', 'One Hand Swords', 'Helmets (INT)'];
  for (const cname of classes) {
    const c = [...DB.classes.values()].find(c => DB.text(c.label) === cname); if (!c) continue;
    S.group = c.group; S.cls = c;
    C.selectBase(D.basesOfClass(c.id).pop());
    const states = [];
    const mk = f => { C.selectBase(S.base); f(S.item); states.push(structuredClone(S.item)); };
    mk(() => {});
    mk(i => { i.rarity = 'magic'; i.mods = [E.rollMod(E.fullPool(i)[0].mod)]; });
    mk(i => { i.rarity = 'rare'; const pool = E.fullPool(i); const used = new Set(); i.mods = []; for (const e of pool) { if (i.mods.length >= 4) break; if (used.has(e.mod.group)) continue; used.add(e.mod.group); i.mods.push(E.rollMod(e.mod)); } });
    mk(i => { i.rarity = 'rare'; i.quality = 20; i.mods = [E.rollMod(E.fullPool(i)[0].mod)]; });
    mk(i => { i.rarity = 'rare'; i.catalyst = { tag: 'attack', quality: E.catalystCap(i) }; i.mods = [E.rollMod(E.fullPool(i)[0].mod)]; });
    mk(i => { i.rarity = 'rare'; i.catalyst = { tag: 'life', quality: 7 }; i.mods = [E.rollMod(E.fullPool(i)[0].mod)]; });
    mk(i => { i.rarity = 'rare'; i.sockets = E.maxSockets ? E.maxSockets(i) : i.sockets; i.mods = [E.rollMod(E.fullPool(i)[0].mod)]; });
    for (const st of states) {
      S.item = structuredClone(st);
      for (const m of allMethods()) {
        if (/desecrate|hinekora|socketable/.test(m.handler)) continue;
        if (!E.checkConstraints(st, m.constraints, m.handler)) continue;
        for (let k = 0; k < 6; k++) {
          const it = structuredClone(st); const before = JSON.stringify(it);
          let ch; try { ch = E.applyMethod(it, m); } catch (e) { noops['THROW ' + m.handler + ' ' + e.message] = (noops['THROW ' + m.handler + ' ' + e.message] || 0) + 1; continue; }
          tried++;
          if (ch && JSON.stringify(it) === before) { const key = `${m.handler} on ${cname} [${st.rarity} q${st.quality} cat=${st.catalyst ? st.catalyst.tag + st.catalyst.quality : '-'}]`; noops[key] = (noops[key] || 0) + 1; }
        }
      }
    }
  }
  return { tried, noops };
});
console.log('applications tried:', res.tried);
// A random result can legitimately equal the old one now and then (Chaos re-adding the same roll, Divine on tiny ranges); only flag uses that never change anything.
const keys = Object.keys(res.noops).filter(k => res.noops[k] >= 6 && !k.startsWith('poe2_divine'));
console.log(keys.length ? 'NO-OP "successes":\n' + keys.map(k => `  ${res.noops[k]}x ${k}`).join('\n') : 'none: every successful use changed the item');
await b.close();
process.exit(keys.length ? 1 : 0);
