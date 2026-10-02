// Crafting spend: how many of each thing was used up. Counts only, so a price refresh re-prices everything
// and Undo can restore the exact earlier state. Costs are worked out on demand (see costOf).
import { priceOf } from './prices.js';

export const newSpend = () => ({ counts: {} });

export function addCount(spend, name, n = 1) {
  if (name) spend.counts[name] = (spend.counts[name] || 0) + n;
}

/** A new spend holding the sum of all `spends`. */
export function mergeSpend(...spends) {
  const out = newSpend();
  for (const s of spends) for (const [name, n] of Object.entries(s?.counts || {})) addCount(out, name, n);
  return out;
}

/**
 * Price a spend in Divine Orbs.
 * Returns { total, rows: [{ name, count, each, total, source }] sorted by cost, unpriced: [name, ...] }.
 * Unpriced names cost 0 and are listed in `unpriced` so the caller can warn.
 */
export function costOf(spend) {
  const rows = [];
  const unpriced = [];
  let total = 0;
  for (const [name, count] of Object.entries(spend?.counts || {})) {
    const p = priceOf(name);
    const each = p ? p.value : 0;
    if (!p) unpriced.push(name);
    total += each * count;
    rows.push({ name, count, each, total: each * count, source: p?.source || null });
  }
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { total, rows, unpriced };
}

export const uses = spend => Object.values(spend?.counts || {}).reduce((s, n) => s + n, 0);
