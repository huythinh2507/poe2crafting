import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
const dirty = () => p.evaluate(() => { const S = window.__craft.S, i = S.item; return i.rarity !== 'normal' || i.mods.length || i.unrevealed.length || i.socketed.length || i.quality || i.corrupted || i.lock || S.history.length || S.log.length || i.sockets !== window.__craft.S.base.sockets; });
const state = () => p.evaluate(() => { const S = window.__craft.S, i = S.item; return `${i.rarity}/${i.mods.length} unrev=${i.unrevealed.length} soc=${i.socketed.length}/${i.sockets} q=${i.quality} cor=${i.corrupted} lock=${i.lock} hist=${S.history.length} reveal=${!!S.reveal}`; });
const cur = async name => { const fam = p.locator(`[data-family]:has-text("${name}")`); await p.click('[data-tab="Currencies"]'); if (await fam.count()) { await fam.click(); await p.locator('.cur-wrap.open .cur-drop .cur').first().click(); } else await p.locator(`.cur:has-text("${name}")`).first().click(); await p.click('#itemBox'); };
const clickReset = async sel => { const l = p.locator(sel); await l.scrollIntoViewIfNeeded(); const bb = await l.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.up(); };
const scenarios = {
  'alchemy': async () => { await cur('Orb of Alchemy'); },
  'fracture': async () => { await cur('Orb of Alchemy'); await cur('Fracturing Orb'); },
  'desecrate (unrevealed)': async () => { await cur('Orb of Alchemy'); await p.click('[data-tab="Desecrate"]'); await p.locator('.cur:has-text("Preserved Jawbone")').click(); await p.click('#itemBox'); },
  'reveal panel open': async () => { await cur('Orb of Alchemy'); await p.click('[data-tab="Desecrate"]'); await p.locator('.cur:has-text("Preserved Jawbone")').click(); await p.click('#itemBox'); await p.click('[data-reveal="0"]'); },
  'Hinekora lock armed': async () => { await cur('Orb of Alchemy'); await cur("Hinekora's Lock"); },
  'vaal corrupted': async () => { await cur('Orb of Alchemy'); await cur('Vaal Orb'); },
  'sockets': async () => { await p.click('[data-tab="Socketables"]'); await p.click('[data-sub="Runes"]'); await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox'); },
  'essence': async () => { await cur('Orb of Transmutation'); await p.click('[data-tab="Essences"]'); await p.click('[data-sub="0"]'); await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox'); },
  'whittling omen + chaos': async () => { await cur('Orb of Alchemy'); await p.click('[data-tab="Currencies"]'); await p.click('[data-family]:has-text("Chaos Orb")'); await p.locator('.cur-wrap.open .cur-drop .cur').first().click(); await p.click('[data-omen="whittling"]'); await p.click('#itemBox'); },
  'quality': async () => { await p.click('[data-tab="Currencies"]'); const q = p.locator('.cur:has-text("Armourer"), .cur:has-text("Blacksmith")').first(); await q.click(); await p.click('#itemBox'); },
};
for (const [name, run] of Object.entries(scenarios)) {
  for (const sel of ['#resetItem', '#reset']) {
    await p.click('#resetItem').catch(() => {}); // clean slate
    try { await run(); } catch (e) { console.log(name.padEnd(26), 'SETUP FAILED', e.message.split('\n')[0]); break; }
    const before = await state();
    await clickReset(sel);
    const after = await state();
    const ok = !(await dirty());
    console.log(name.padEnd(26), sel.padEnd(11), ok ? 'RESET OK ' : 'NOT RESET', '\n   before:', before, '\n   after: ', after);
  }
}
console.log(errs.join('\n') || 'no errors');
await b.close();
