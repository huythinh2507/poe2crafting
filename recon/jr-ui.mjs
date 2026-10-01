import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const imgFail = []; p.on('response', r => { if (/assets\/items\/(Jewels|Relics)/.test(r.url()) && r.status() !== 200) imgFail.push(r.url()); });
await p.goto('http://localhost:5173/'); await p.waitForSelector('[data-group]');
const pickGroup = async name => { await p.locator('[data-group]').filter({ hasText: new RegExp('^' + name + '$') }).click(); await p.waitForTimeout(200); };
const mods = () => p.$$eval('#itemBox .mod', ms => ms.map(m => m.innerText.replace(/\n/g, ' ').slice(0, 60)));
const click = async h => { await p.evaluate(h => { const c = window.__craft; c.S.method = c.CATALOGUE.find(m => m.handler === h); c.renderCraft(); }, h); await p.click('#itemBox'); await p.waitForTimeout(150); };
for (const [group, klass] of [['Jewel', 'Time-Lost Ruby'], ['Relic', 'Medium Relics']]) {
  await p.goto('http://localhost:5173/'); await p.waitForSelector('[data-group]');
  await pickGroup(group);
  console.log(group, 'classes:', await p.$$eval('[data-class]', c => c.map(x => x.innerText)).then(a => a.join(', ')));
  await p.locator('[data-class]').filter({ hasText: klass }).click(); await p.waitForTimeout(200);
  console.log(' bases:', await p.$$eval('[data-base]', c => c.map(x => x.innerText.replace(/\n/g, ' '))).then(a => a.join(' | ')), '| art loaded:', await p.$$eval('[data-base] img', i => i.filter(x => x.naturalWidth > 0).length));
  await p.locator('[data-base]').first().click(); await p.waitForSelector('#itemBox');
  await click('poe2_transmutation'); await click('poe2_augmentation');
  console.log(' after trans+aug:', await mods());
  await p.evaluate(() => { const c = window.__craft; c.S.method = null; c.renderCraft(); });
  console.log(' regal disabled:', await p.locator('.cur').filter({ hasText: 'Regal Orb' }).first().isDisabled());
  await p.screenshot({ path: `recon/jr-${group}.png` });
}
console.log('image failures:', imgFail.join(',') || 'none'); console.log(errs.join('\n') || 'no errors');
await b.close();
