import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
await p.route(/(nitropay|doubleclick|googletag|google-analytics|amazon-adsystem|id5|criteo|adsrvr|privacymanager|scalibur|hadronid|rlcdn|fastclick|ad\.gt)/, r => r.abort());
await p.goto('https://beta.craftofexile.com/?game=poe2&group=1&class=4&item=3408', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
// make item rare first via Alchemy so desecrate is allowed
await p.getByText('Orb of Alchemy', { exact: true }).first().click();
await p.waitForTimeout(500);
await p.locator('.item, [class*=item]').filter({ hasText: 'RUNEFORGED' }).first().hover().catch(()=>{});
await p.screenshot({ path: 'recon/coe1.png' });
fs.writeFileSync('recon/coe1.html', await p.content());
console.log('ok');
await b.close();
