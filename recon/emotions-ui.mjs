import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const bad = []; p.on('response', r => { if (/DistilledEmotions/.test(r.url()) && r.status() !== 200) bad.push(r.url()); });
const tabs = () => p.$$eval('[data-tab]', t => t.map(x => x.dataset.tab));
const start = async (group, klass) => {
  await p.goto('http://localhost:5173/'); await p.waitForSelector('[data-group]');
  await p.locator('[data-group]').filter({ hasText: new RegExp('^' + group + '$') }).click();
  await p.locator('[data-class]').filter({ hasText: klass }).first().click();
  await p.locator('[data-base]').first().click(); await p.waitForSelector('#itemBox');
};
const setRare = () => p.evaluate(() => {
  const c = window.__craft, it = c.S.item; it.rarity = 'rare';
  const pool = [...c.DB.mods.values()]; c.renderCraft();
});
// body armour has no Emotions tab
await start('Body Armour', 'Body Armours (STR)');
console.log('body armour tabs:', (await tabs()).join(', '));
for (const [klass, label] of [['Emerald', 'normal Emerald'], ['Time-Lost Ruby', 'Time-Lost Ruby']]) {
  await start('Jewel', klass);
  console.log(label, 'tabs:', (await tabs()).join(', '));
  // build a rare jewel with 4 mods through the real UI, then open the Emotions tab
  await p.evaluate(() => { window.__craft.S.method = window.__craft.CATALOGUE.find(m => m.handler === 'poe2_alchemy'); window.__craft.renderCraft(); });
  await p.click('#itemBox'); await p.waitForTimeout(200);
  console.log(' rarity after alchemy:', await p.evaluate(() => window.__craft.S.item.rarity), 'mods', await p.locator('#itemBox .mod').count());
  await p.click('[data-tab="Emotions"]'); await p.waitForTimeout(300);
  const names = await p.$$eval('.cur', c => c.map(x => x.innerText.split('\n')[0]));
  const icons = await p.$$eval('.cur img.cur-icon', i => i.filter(x => x.naturalWidth > 0).length);
  console.log(' emotions listed:', names.length, '| icons loaded:', icons, '|', names.slice(-3).join(', '));
  const contempt = p.locator('.cur:not([disabled])').filter({ hasText: /Potent Liquid Contempt/ }).first();
  await contempt.click(); await p.click('#itemBox'); await p.waitForTimeout(300);
  console.log(' log:', (await p.innerText('#log')).split('\n').slice(0, 5).join(' / '));
  console.log(' slots header:', await p.$$eval('.hd, h4, .pool-head', h => h.map(x => x.innerText).filter(t => /PREFIXES|SUFFIXES/i.test(t)).join(' | ')).catch(() => ''));
  await p.screenshot({ path: `recon/emotions-${klass.replace(/\W/g, '')}.png` });
}
console.log('icon failures:', bad.join(',') || 'none');
console.log(errs.join('\n') || 'no errors');
await b.close();
