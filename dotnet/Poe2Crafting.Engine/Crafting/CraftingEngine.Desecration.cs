using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

/// <summary>One candidate in a Well of Souls reveal, with its share of a single weighted draw.</summary>
public sealed record DesecratedChance(PoolEntry Entry, double Chance);

public sealed partial class CraftingEngine
{
    // Desecration is two steps:
    //   1. a bone (a currency) adds an UNREVEALED slot to a rare item  -> ApplyDesecrate()
    //   2. at the Well of Souls you reveal it: three options are offered and you pick one
    //                                                                  -> RevealOptions() / RevealMod()

    /// <summary>
    /// Apply a bone. On a full item a random modifier is removed first and its slot is reused. Omens: Sinistral /
    /// Dextral Necromancy pick the affix; Putrefaction turns every unfractured mod into an unrevealed slot and
    /// corrupts the item.
    /// </summary>
    private List<Change>? ApplyDesecrate(CraftItem item, CraftMethod method)
    {
        if (item.Rarity != Rarity.Rare) return null;
        var minLevel = method.MinModLevel; // Ancient bones: 40

        if (Context.Has("putrefaction"))
        {
            var gone = item.Mods.Where(m => !m.Fractured).ToList();
            if (gone.Count == 0) return null;
            item.Mods = item.Mods.Where(m => m.Fractured).ToList();
            var removals = new List<Change>();
            foreach (var mod in gone)
            {
                item.Unrevealed.Add(new UnrevealedSlot { Affix = AffixOf(mod) ?? Affix.Prefix, MinLevel = minLevel });
                removals.Add(Change.Removed(mod));
            }
            item.Corrupted = true;
            removals.AddRange(Note($"Putrefaction: {gone.Count} unrevealed desecrated modifiers, item corrupted"));
            return removals;
        }

        var open = OpenSlotsOf(item);
        Affix? affix = Context.Has("sinistral") ? Affix.Prefix : Context.Has("dextral") ? Affix.Suffix : null;
        var changes = new List<Change>();

        if (affix is null)
        {
            var free = new[] { Affix.Prefix, Affix.Suffix }.Where(k => open.For(k) > 0).ToList();
            if (free.Count > 0) affix = Pick(free);
            else
            {   // full item: a random modifier is removed first and its slot is reused
                var removed = RemoveRandom(item);
                if (removed is null) return null;
                changes.Add(removed);
                affix = removed.Mod is not null ? AffixOf(removed.Mod) : Pick(new[] { Affix.Prefix, Affix.Suffix });
            }
        }
        else if (open.For(affix.Value) <= 0)
        {
            var removed = RemoveRandom(item, affix);
            if (removed is null) return null;
            changes.Add(removed);
        }

        item.Unrevealed.Add(new UnrevealedSlot { Affix = affix!.Value, MinLevel = minLevel });
        changes.AddRange(Note($"Unrevealed desecrated {affix.Value.ToString().ToLowerInvariant()} added — reveal it at the Well of Souls"));
        return changes;
    }

    /// <summary>
    /// What a reveal can offer for one unrevealed slot. GGG publishes no weights, so this follows the
    /// assumptions in <see cref="CraftContext.Desecration"/>: every Lich mod shares one weight and (optionally)
    /// normal mods join the pool with their normal weights. Only mods of the slot's affix, within the item
    /// level and the bone's minimum level, and not already on the item, qualify.
    /// </summary>
    public IReadOnlyList<PoolEntry> DesecratedPool(CraftItem item, UnrevealedSlot slot)
    {
        var usedGroups = item.Mods.Select(m => ModOf(m).Group).ToHashSet();
        bool Eligible(PoolEntry e) => e.Affix == slot.Affix && e.Mod.MinLevel <= item.ItemLevel && !usedGroups.Contains(e.Mod.Group);

        var settings = Context.Desecration;
        var lich = ApplyMinLevel(Pools.LichPool(item.ClassId).Where(Eligible).ToList(), slot.MinLevel)
            .Select(e => e.WithWeight(settings.LichWeight, isLich: true));
        var normal = settings.IncludeNormalMods
            ? ApplyMinLevel(FullPool(item).Where(Eligible).ToList(), slot.MinLevel)
            : Array.Empty<PoolEntry>();
        return lich.Concat(normal).ToList();
    }

    /// <summary>The share of a single draw each candidate gets (weight / total weight).</summary>
    public IReadOnlyList<DesecratedChance> DesecratedChances(CraftItem item, UnrevealedSlot slot)
    {
        var pool = DesecratedPool(item, slot);
        var total = pool.Sum(e => e.Weight);
        return pool.Select(e => new DesecratedChance(e, total > 0 ? e.Weight / total : 0)).ToList();
    }

    /// <summary>
    /// Draw up to three DIFFERENT mods (never two of the same group), weighted, without replacement. A faction
    /// omen (Sovereign / Liege / Blackblooded, Weapon and Jewellery only) guarantees one option from that faction.
    /// </summary>
    public IReadOnlyList<PoolEntry> RevealOptions(CraftItem item, UnrevealedSlot slot)
    {
        var pool = DesecratedPool(item, slot).ToList();
        var options = new List<PoolEntry>();

        var faction = FactionOmenApplies(item) ? ModPools.Factions.FirstOrDefault(Context.Has) : null;
        if (faction is not null)
        {
            var guaranteed = PickWeighted(pool.Where(e => e.IsLich && e.Faction == faction).ToList());
            if (guaranteed is not null)
            {
                options.Add(guaranteed);
                pool.RemoveAll(e => e.Mod.Group == guaranteed.Mod.Group);
            }
        }

        while (options.Count < RevealOptionCount && pool.Count > 0)
        {
            var pick = PickWeighted(pool)!;
            options.Add(pick);
            pool.RemoveAll(e => e.Mod.Group == pick.Mod.Group);
        }
        return options;
    }

    /// <summary>Turn unrevealed slot <paramref name="index"/> into the chosen mod (flagged desecrated, so it can never be fractured).</summary>
    public IReadOnlyList<Change> RevealMod(CraftItem item, int index, PoolEntry chosen)
    {
        item.Unrevealed.RemoveAt(index);
        var mod = RollMod(Transformed(item, chosen.Mod));
        mod.Desecrated = true;
        item.Mods.Add(mod);
        return new List<Change> { Change.Added(mod) };
    }
}
