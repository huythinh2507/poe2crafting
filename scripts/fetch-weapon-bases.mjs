// Scrape base weapon stats from poe2db (physical + elemental base damage, crit, attack speed, range, requirements)
// into public/data/weapon-bases.json, keyed by base name.
//
// Why: our game data has physical damage / crit / attack time / range but NOT the hidden implicit stat that turns part
// of a base's damage into fire / cold / lightning (e.g. Cinderbark Talisman: "30% base damage is fire"), so poe2db's
// numbers are the source for the elemental split. Run: node scripts/fetch-weapon-bases.mjs
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SLUGS = ['One_Hand_Swords', 'Two_Hand_Swords', 'One_Hand_Axes', 'Two_Hand_Axes', 'One_Hand_Maces', 'Two_Hand_Maces', 'Spears',
  'Claws', 'Daggers', 'Quarterstaves', 'Flails', 'Wands', 'Staves', 'Bows', 'Crossbows', 'Sceptres', 'Talismans', 'Trarthan_Cannon'];

const browser = await chromium.launch();
const page = await browser.newPage();
const bases = {};
const parseRange = s => { const m = s?.match(/([\d.]+)\s*[-–—−�?]+\s*([\d.]+)/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; };

for (const slug of SLUGS) {
  try {
    await page.goto(`https://poe2db.tw/us/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
  } catch (e) { console.log(slug, 'FAILED', e.message.split('\n')[0]); continue; }
  const rows = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a.whiteitem[href]')) {
      const box = a.parentElement;
      if (!box || !box.classList.contains('flex-grow-1')) continue;
      const props = [...box.querySelectorAll('.property')].map(p => p.innerText.replace(/\s+/g, ' ').trim());
      const req = box.querySelector('.requirements')?.innerText.replace(/\s+/g, ' ').trim() || '';
      const hidden = [...box.querySelectorAll('.implicitMod .secondary')].map(x => x.innerText.trim());
      const implicits = [...box.querySelectorAll('.implicitMod')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
      out.push({ name: a.innerText.trim(), props, req, hidden, implicits });
    }
    return out;
  });
  let n = 0;
  for (const r of rows) {
    if (!r.props.some(p => /Physical Damage|Fire Damage|Cold Damage|Lightning Damage|Chaos Damage|Attacks per Second|Critical Hit Chance/.test(p))) continue; // caster weapons list only crit
    const e = { class: slug, damage: {}, hidden: r.hidden, requires: r.req };
    for (const p of r.props) {
      const [k, v] = p.split(/:\s*/);
      if (/^Physical Damage/.test(k)) e.damage.physical = parseRange(v);
      else if (/^Fire Damage/.test(k)) e.damage.fire = parseRange(v);
      else if (/^Cold Damage/.test(k)) e.damage.cold = parseRange(v);
      else if (/^Lightning Damage/.test(k)) e.damage.lightning = parseRange(v);
      else if (/^Chaos Damage/.test(k)) e.damage.chaos = parseRange(v);
      else if (/^Critical Hit Chance/.test(k)) e.crit = parseFloat(v);
      else if (/^Attacks per Second/.test(k)) e.aps = parseFloat(v);
      else if (/^Weapon Range/.test(k)) e.range = parseFloat(v);
    }
    bases[r.name] = e; n++;
  }
  console.log(slug.padEnd(18), n, 'bases');
}
await browser.close();

const withEle = Object.entries(bases).filter(([, b]) => b.damage.fire || b.damage.cold || b.damage.lightning || b.damage.chaos);
console.log(`\n${Object.keys(bases).length} bases, ${withEle.length} with elemental/chaos base damage`);
fs.writeFileSync(path.join(root, 'public/data/weapon-bases.json'), JSON.stringify(bases, null, 1));
