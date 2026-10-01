using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

public enum ModFlag { Fractured, Desecrated, Crafted }

public sealed partial class CraftingEngine
{
    // Manual editing: for setting up an item you bought (a magic base that already has two good mods) or testing a
    // what-if. These are not currency; nothing here is random except the value roll of a freshly added mod.

    /// <summary>
    /// Add a specific mod. A Normal item becomes Magic, and a Magic item becomes Rare as soon as it would hold more
    /// than one prefix or one suffix. <paramref name="desecrated"/> picks it from the Lich pool and flags it desecrated.
    /// Returns null when it cannot go on (same group present, no free slot, level too high, corrupted).
    /// </summary>
    public ModInstance? AddModManually(CraftItem item, int modId, bool desecrated = false)
    {
        if (item.Corrupted) return null;
        var pool = desecrated ? Pools.LichPool(item.ClassId) : FullPool(item);
        var entry = pool.FirstOrDefault(e => e.Mod.Id == modId);
        if (entry is null || entry.Mod.MinLevel > item.ItemLevel) return null;
        if (item.Mods.Any(m => ModOf(m).Group == entry.Mod.Group)) return null;

        var prefixes = CountAffix(item, Affix.Prefix) + (entry.Affix == Affix.Prefix ? 1 : 0);
        var suffixes = CountAffix(item, Affix.Suffix) + (entry.Affix == Affix.Suffix ? 1 : 0);
        var needed = prefixes > 1 || suffixes > 1 ? Rarity.Rare : Rarity.Magic;
        var rarity = needed > item.Rarity ? needed : item.Rarity;

        var probe = item.Clone();
        probe.Rarity = rarity;
        if (OpenSlotsOf(probe).For(entry.Affix) <= 0) return null;

        item.Rarity = rarity;
        var added = RollMod(Transformed(item, entry.Mod));
        added.Desecrated = desecrated;
        item.Mods.Add(added);
        return added;
    }

    /// <summary>Overwrite the rolled values of mod <paramref name="index"/>, each clamped to its stat's range.</summary>
    public ModInstance? SetModValues(CraftItem item, int index, IReadOnlyList<double> rolls)
    {
        if (index < 0 || index >= item.Mods.Count) return null;
        var instance = item.Mods[index];
        var mod = ModOf(instance);
        instance.Rolls = mod.Stats.Select((stat, i) =>
        {
            var (low, high) = stat.Range[0] <= stat.Range[1] ? (stat.Range[0], stat.Range[1]) : (stat.Range[1], stat.Range[0]);
            var value = i < rolls.Count && double.IsFinite(rolls[i]) ? Math.Clamp(rolls[i], low, high) : instance.Rolls[i];
            return low == Math.Floor(low) && high == Math.Floor(high) ? Math.Round(value) : Math.Round(value, 2);
        }).ToArray();
        return instance;
    }

    /// <summary>Why a flag cannot be set on a mod (null = fine). A UI greys the entry out with this as the hint.</summary>
    public string? FlagBlocked(CraftItem item, ModInstance mod, ModFlag flag)
    {
        switch (flag)
        {
            case ModFlag.Fractured:
                if (mod.Fractured) return null; // can always be removed again
                return item.Mods.Any(m => m.Fractured) ? "An item can only have one fractured modifier" : null;
            default:
                return null;
        }
    }
}
