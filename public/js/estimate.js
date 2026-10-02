// "Repeat until" estimator: apply the held currency (and its armed omens) to copies of the current item over and over,
// until a wanted modifier shows up, and report how many uses and how many Divine Orbs that took on average.
// It reuses the real crafting rules (applyMethod), so the odds are the ones the simulator itself plays by.
import { DB, poolEntry } from './data.js';
import { ctx, applyMethod, checkConstraints, consumeOmens, omensConsumedBy, fullPool, modTemplate, OMENS } from './engine.js';
import { priceOf } from './prices.js';

// These need a choice per use (which socket, which reveal option), so a blind repeat does not make sense.
const UNSUPPORTED = /^(poe2_desecrate|poe2_socketable|hinekora_lock)/;
export const canEstimate = method => !!method && !UNSUPPORTED.test(method.handler);

/** Modifier families that can be asked for on `item`: [{ group, label, affix, tiers }] sorted by label. */
export function targetOptions(item) {
  const byGroup = new Map();
  for (const e of fullPool(item)) {
    if (e.mod.minlvl > item.ilvl) continue;
    const g = byGroup.get(e.mod.group) || { group: e.mod.group, label: modTemplate(e.mod), affix: e.affix, tiers: 0 };
    g.tiers = Math.max(g.tiers, e.tier);
    byGroup.set(e.mod.group, g);
  }
  return [...byGroup.values()].sort((a, b) => a.label.localeCompare(b.label) || a.affix.localeCompare(b.affix));
}

/** Does `item` carry a modifier of family `target.group` at tier `target.maxTier` or better? */
export function hasTarget(item, target) {
  return item.mods.some(m => {
    const mod = DB.mods.get(m.id);
    return mod.group === target.group && (poolEntry(item.classId, m.id)?.tier ?? Infinity) <= target.maxTier;
  });
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
const mean = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

/**
 * Run the experiment. options: { item, method, methodName, target: { group, maxTier }, trials, maxUses, budgetMs, onProgress, signal }.
 * Each trial starts from a fresh copy of `item` with the omens armed right now; unpinned omens are used up by the first use, as in the app.
 * Resolves to { trials, hits, capped, stuck, alreadyThere, uses: { mean, median, p90 }, cost: { mean, median, p90 }, hitPerUse, priceKnown, omenNames }.
 */
export async function estimate({ item, method, methodName, target, trials = 300, maxUses = 20000, budgetMs = 8000, onProgress, signal }) {
  if (!canEstimate(method)) throw new Error('This currency needs a choice on every use, so it cannot be repeated automatically.');
  if (hasTarget(item, target)) return { alreadyThere: true };

  const armed = new Set(ctx.omens);          // restored afterwards: the estimate must not disturb the live session
  const perUse = [];                         // uses per successful trial
  const omenUses = [];                       // { id: count } per successful trial
  let capped = 0, stuck = 0, totalUses = 0, hits = 0;
  const started = performance.now();
  let lastYield = started, done = 0;

  try {
    for (; done < trials; done++) {
      if (signal?.aborted || performance.now() - started > budgetMs) break;
      const it = structuredClone(item); it.lock = false;
      ctx.omens.clear(); for (const id of armed) ctx.omens.add(id);
      const omenCount = {};
      let uses = 0, hit = false, blocked = false;
      while (uses < maxUses) {
        if (!checkConstraints(it, method.constraints, method.handler)) { blocked = true; break; }
        const used = omensConsumedBy(method.handler).filter(id => ctx.omens.has(id));
        const changes = applyMethod(it, method);
        if (!changes) { blocked = true; break; }
        uses++;
        for (const id of used) omenCount[id] = (omenCount[id] || 0) + 1;
        consumeOmens(method.handler);
        if (hasTarget(it, target)) { hit = true; break; }
      }
      totalUses += uses;
      if (hit) { hits++; perUse.push(uses); omenUses.push(omenCount); }
      else if (blocked) stuck++;
      else capped++;
      if (performance.now() - lastYield > 40) {   // keep the page responsive
        onProgress?.({ done: done + 1, trials, hits });
        await new Promise(r => setTimeout(r));
        lastYield = performance.now();
      }
    }
  } finally {
    ctx.omens.clear(); for (const id of armed) ctx.omens.add(id);
  }

  const price = priceOf(methodName);
  const omenName = id => OMENS.find(o => o.id === id)?.name;
  const costs = perUse.map((n, i) => {
    let c = n * (price?.value || 0);
    for (const [id, k] of Object.entries(omenUses[i])) c += k * (priceOf(omenName(id))?.value || 0);
    return c;
  }).sort((a, b) => a - b);
  const sortedUses = [...perUse].sort((a, b) => a - b);
  const omenNames = [...armed].map(omenName).filter(Boolean);
  return {
    trials: done, hits, capped, stuck,
    uses: { mean: mean(sortedUses), median: quantile(sortedUses, 0.5), p90: quantile(sortedUses, 0.9) },
    cost: { mean: mean(costs), median: quantile(costs, 0.5), p90: quantile(costs, 0.9) },
    hitPerUse: totalUses ? hits / totalUses : 0,
    priceKnown: !!price, omenNames, aborted: !!signal?.aborted,
  };
}
