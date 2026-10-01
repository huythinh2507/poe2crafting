import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1300 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=7&class=54');
await p.waitForSelector('#bases .base');
// pick a weapon base with 2+ sockets
const pick = await p.evaluate(() => { const D = window.__craft.DB; const cls = [...D.groupClasses[7], ...D.groupClasses[8]]; const i = [...D.items.values()].filter(i => cls.includes(i.class) && i.domain === 1 && i.drop && i.sockets >= 2).pop(); return { id: i.id, cls: i.class, group: D.classes.get(i.class).group, name: D.text(i.label), sockets: i.sockets }; });
console.log('base:', pick);
await p.goto(`http://localhost:5173/?group=${pick.group}&class=${pick.cls}&item=${pick.id}`);
await p.waitForSelector('#itemBox');
await p.click('[data-tab="Socketables"]'); await p.click('[data-sub="Runes"]');
console.log('empty sockets drawn:', await p.locator('.socket').count(), 'filled:', await p.locator('.socket.filled').count());
for (const n of [0, 1]) { await p.locator('.cur:not([disabled])').nth(n * 9).click(); await p.click('#itemBox'); }
console.log('after socketing: filled', await p.locator('.socket.filled').count(), '| images ok:', await p.$$eval('.socket img', is => is.filter(i => i.naturalWidth > 0).length), '| titles:', await p.$$eval('.socket.filled', ss => ss.map(s => s.title)));
await p.locator('#itemBox').scrollIntoViewIfNeeded();
await p.mouse.move(10, 10);
await p.locator('#tooltip').screenshot({ path: 'recon/sockets.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
