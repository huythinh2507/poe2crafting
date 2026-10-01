import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
await p.route(/(nitropay|doubleclick|googletag|google-analytics|amazon-adsystem|id5|criteo|adsrvr|privacymanager|scalibur|hadronid|rlcdn|fastclick|ad\.gt)/, r => r.abort());
const imgs = [];
p.on('response', r => { if (r.request().resourceType() === 'image' && /items|weapons/i.test(r.url())) imgs.push(r.status() + ' ' + r.url()); });
// Shortsword = item id? find via data
const data = JSON.parse((await (await fetch('https://beta.craftofexile.com/json/poe2/4.5.5.3/data.json')).text()).replace(/^coedata=/, '').replace(/;\s*$/, ''));
const lang = JSON.parse((await (await fetch('https://beta.craftofexile.com/json/poe2/4.5.5.3/localization/english.json')).text()).replace(/^coelang=/, '').replace(/;\s*$/, ''));
const it = data.items.entries.find(i => lang[i.label] === 'Shortsword');
console.log('Shortsword id', it.id, it.image, it.key);
await p.goto(`https://beta.craftofexile.com/?game=poe2&group=7&class=54&item=${it.id}&method=0`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5000);
console.log(imgs.filter(u => !/Currency|SoulCores|ui\//.test(u)).slice(0, 15).join('\n'));
await p.screenshot({ path: 'recon/weapon-site.png' });
await b.close();
