// Market prices, in Divine Orbs. Layers, first hit wins: your own override > live snapshot (poe.ninja) > Craft of Exile snapshot.
// A name with no price anywhere is "unpriced": callers count it as 0 and flag it.
import { DB } from './data.js';

export const PRICES = {
  live: null,        // prices-live.json: { league, fetchedAt, rates, byName }
  coe: new Map(),    // item name -> divine, from the Craft of Exile snapshot bundled with the data
  overrides: {},     // item name -> divine, typed in by the user
};

const OVERRIDE_KEY = 'poe2craft.priceOverrides';
const storage = {
  read() { try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {}; } catch { return {}; } },
  write(v) { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(v)); } catch { /* storage blocked: overrides last for this session */ } },
};

const getJson = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);

/** Load the snapshots (live file may be missing) and the saved overrides. Call after loadData(). */
export async function loadPrices() {
  const [live, coe] = await Promise.all([getJson('data/prices-live.json'), getJson('data/prices.json')]);
  PRICES.live = live;
  PRICES.coe = new Map();
  const table = coe?.leagueSoftcore || {};
  for (const item of DB.items.values()) {
    const v = table[item.key];
    const name = DB.text(item.label);
    if (typeof v === 'number' && name && !PRICES.coe.has(name)) PRICES.coe.set(name, v);
  }
  PRICES.overrides = storage.read();
  return PRICES;
}

/** { value, source: 'override' | 'live' | 'coe' } or null when unpriced. */
export function priceOf(name) {
  if (name in PRICES.overrides) return { value: PRICES.overrides[name], source: 'override' };
  const live = PRICES.live?.byName?.[name];
  if (typeof live === 'number') return { value: live, source: 'live' };
  const coe = PRICES.coe.get(name);
  if (typeof coe === 'number') return { value: coe, source: 'coe' };
  return null;
}

/** Set (or with null clear) your own price for `name`. */
export function setOverride(name, value) {
  if (value == null || !Number.isFinite(value) || value < 0) delete PRICES.overrides[name];
  else PRICES.overrides[name] = value;
  storage.write(PRICES.overrides);
}

/** Divine Orbs as a short string: 2.47, 0.0123, 0.00004. Decimals are fine: this is an estimate. */
export function fmtDivine(v) {
  if (!v) return '0';
  const a = Math.abs(v);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 5;
  return String(+v.toFixed(digits));
}
