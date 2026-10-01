// Convert downloaded coe*.json (JS assignments) into plain JSON under public/data.
import fs from 'fs';
const src = new URL('../data/', import.meta.url), out = new URL('../public/data/', import.meta.url);
const files = { 'data.json': /^coedata=/, 'english.json': /^coelang=/, 'prices.json': /^coeprices=/ };
for (const [f, re] of Object.entries(files)) {
  const txt = fs.readFileSync(new URL(f, src), 'utf8').trim().replace(re, '').replace(/;$/, '');
  JSON.parse(txt); // validate
  fs.writeFileSync(new URL(f, out), txt);
  console.log('wrote', f, txt.length);
}
