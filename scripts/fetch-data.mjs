// Re-download game data from the live site. Usage: node scripts/fetch-data.mjs [version]
import fs from 'fs';
const version = process.argv[2] || '4.5.5.3';
const base = `https://beta.craftofexile.com/json/poe2/${version}`;
const files = { 'data.json': 'data.json', 'english.json': 'localization/english.json', 'prices.json': 'prices.json' };
fs.mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
for (const [out, remote] of Object.entries(files)) {
  const res = await fetch(`${base}/${remote}`);
  if (!res.ok) throw new Error(`${remote}: ${res.status}`);
  fs.writeFileSync(new URL(`../data/${out}`, import.meta.url), await res.text());
  console.log('fetched', remote);
}
