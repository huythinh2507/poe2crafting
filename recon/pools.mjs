import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1400 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
const sections = () => p.$$eval('.psec', ss => ss.map(s => {
  const title = s.querySelector('.psec-head span').innerText;
  const cols = [...s.querySelectorAll('.pool > div')].map(c => c.querySelector('h3').innerText.replace(/\n/g, ' ') + ' | ' + c.querySelector('.ptotal').innerText.replace(/\n/g, ' '));
  const note = (s.querySelector('.calc-note')?.innerText || '').replace(/\n/g, ' ').slice(0, 140);
  return `${title}: ${cols.join('  //  ')}${note ? '\n      note: ' + note : ''}`;
}));
for (const [label, url] of [
  ['Talisman (poe2db example)', '?group=8&class=90&item=3644'],
  ['Body Armour STR', '?group=1&class=4&item=3408'],
  ['Ring', '?group=5&class=33'],
  ['Helmet STR', '?group=4&class=25'],
]) {
  await p.goto('http://localhost:5173/' + url);
  await p.waitForSelector('#bases .base, #itemBox');
  if (!url.includes('item=')) { await p.locator('.base').first().click(); }
  await p.waitForSelector('#itemBox');
  console.log('\n== ' + label);
  for (const s of await sections()) console.log('  ' + s);
}
// interactions on the Talisman page
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
await p.click('[data-lichf="Kurgal"]');
console.log('\nKurgal filter ->', (await sections()).find(s => s.startsWith('Desecrated')));
await p.click('[data-lichf="all"]');
await p.locator('.psec-head:has-text("Thrud")').click();
console.log('collapsed Thrud section, body hidden:', await p.locator('.psec:has(.psec-head:has-text("Thrud")) .pool').count() === 0);
await p.locator('.psec-head:has-text("Thrud")').click();
await p.locator('.psec:has(.psec-head:has-text("Thrud")) .fam-name').first().click();
await p.screenshot({ path: 'recon/pools.png', fullPage: true });
console.log(errs.length ? errs.slice(0, 4).join('\n') : 'no errors');
await b.close();
