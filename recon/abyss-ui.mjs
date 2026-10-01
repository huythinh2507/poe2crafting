import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408'); await p.waitForSelector('#itemBox');
const log = async tag => console.log(tag, '|', (await p.innerText('#log')).split('\n').slice(0, 4).join(' / '));
const mods = () => p.$$eval('#itemBox .mod', ms => ms.map(m => m.innerText.replace(/\n/g, ' ').slice(0, 70)));
// get a rare item with 4 mods through the UI: alchemy, then exalts
const cur = async re => { const l = p.locator('.cur:not([disabled])').filter({ hasText: re }).first(); await l.click(); await p.click('#itemBox'); };
await p.click('[data-tab="Currencies"]');
await cur(/Alchemy/);
while ((await p.locator('#itemBox .mod').count()) < 4) await cur(/^\s*Exalted Orb/);
console.log('mods before:', await mods());
// Essences tab: Essence of the Abyss
await p.click('[data-tab="Essences"]');
for (const sub of await p.$$eval('[data-sub]', s => s.map(x => x.dataset.sub))) { await p.click(`[data-sub="${sub}"]`); if (await p.locator('.cur').filter({ hasText: /Essence of the Abyss/ }).count()) { console.log('found in sub', sub); break; } }
const btn = p.locator('.cur').filter({ hasText: /Essence of the Abyss/ }).first();
console.log('abyss button disabled:', await btn.isDisabled());
await btn.click();
// Omens shown for the essence
console.log('omens offered:', await p.$$eval('[data-omen]', o => o.map(x => x.innerText.trim())));
await p.click('[data-omen="crystal_suffix"]');
console.log('removal preview:', (await p.innerText('.targets').catch(() => 'none')).replace(/\n/g, ' | ').slice(0, 300));
await p.click('#itemBox'); await log('after essence');
console.log('mods after:', await mods());
await p.screenshot({ path: 'recon/abyss-ui-1.png' });
// bone on the Mark
await p.click('[data-tab="Desecrate"]');
const bone = p.locator('.cur:not([disabled])').first(); console.log('bone:', (await bone.innerText()).replace(/\n/g, ' '));
await bone.click(); await p.click('#itemBox'); await log('after bone');
console.log('mods after bone:', await mods(), '| unrevealed:', await p.locator('.unrevealed').count());
await p.screenshot({ path: 'recon/abyss-ui-2.png' });
await p.click('[data-reveal]'); await p.waitForSelector('.reveal-opt');
console.log('reveal options:', await p.$$eval('.reveal-opt .meta', m => m.map(x => x.innerText)));
console.log(errs.join('\n') || 'no errors');
await b.close();
