// Download current market prices (in Divine Orbs) from poe.ninja into public/data/prices-live.json.
// Usage: node scripts/fetch-prices.mjs [league]   (default: the current challenge league)
// Also used by server.mjs for the in-app "Refresh prices" button; browsers cannot call poe.ninja directly (no CORS).
import fs from 'fs';
import { fileURLToPath } from 'url';

const API = 'https://poe.ninja/poe2/api/economy';
// Item categories the simulator spends: orbs, bones, essences, runes / soul cores / idols, omens (Ritual), catalysts (Breach), emotions (Delirium).
const TYPES = ['Currency', 'Abyss', 'Essences', 'Runes', 'SoulCores', 'Idols', 'Ritual', 'Breach', 'Delirium', 'Fragments'];
export const OUT = new URL('../public/data/prices-live.json', import.meta.url);

const getJson = async url => {
  const res = await fetch(url, { headers: { 'User-Agent': 'poe2craft (personal crafting simulator)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Fetch every type for `league` (or the current challenge league). Returns the price document and writes it to OUT. */
export async function fetchPrices(league) {
  const leagues = (await getJson(`${API}/leagues`)).map(l => l.id);
  league ||= leagues[0]; // the API lists the current temporary challenge league first
  if (!league) throw new Error('No league found');
  const byName = {};
  let rates = null;
  for (const type of TYPES) {
    const j = await getJson(`${API}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`);
    const names = Object.fromEntries((j.items || []).map(i => [i.id, i.name]));
    rates ||= j.core?.rates || null;
    for (const line of j.lines || []) {
      const name = names[line.id];
      if (name && typeof line.primaryValue === 'number' && !(name in byName)) byName[name] = line.primaryValue;
    }
    await sleep(250); // be gentle: a manual refresh is a handful of requests
  }
  const doc = { league, source: 'poe.ninja', unit: 'divine', fetchedAt: new Date().toISOString(), leagues, rates, byName };
  fs.writeFileSync(OUT, JSON.stringify(doc));
  return doc;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = await fetchPrices(process.argv[2]);
  console.log(`${doc.league}: ${Object.keys(doc.byName).length} prices, fetched ${doc.fetchedAt}`);
}
