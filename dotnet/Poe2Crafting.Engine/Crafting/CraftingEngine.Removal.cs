using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

/// <summary>Something a removal could hit: a mod, or an unrevealed desecrated slot.</summary>
/// <param name="Level">Mod level (unrevealed slots count as 1, so Whittling takes them first).</param>
public sealed record RemovalCandidate(ModInstance? Mod, UnrevealedSlot? Slot, int Level, Affix? Affix, bool Desecrated);

/// <summary>Omen-driven restrictions on a removal.</summary>
/// <param name="Kind">Only prefixes / only suffixes (Erasure, Sinistral/Dextral Annulment, Crystallisation).</param>
/// <param name="DesecratedOnly">Omen of Light.</param>
/// <param name="Whittle">Omen of Whittling: only the lowest mod level.</param>
/// <param name="Count">How many mods to remove (Greater Annulment: 2).</param>
public readonly record struct RemovalFilter(Affix? Kind = null, bool DesecratedOnly = false, bool Whittle = false, int Count = 1);

public sealed partial class CraftingEngine
{
    /// <summary>Fractured mods are locked in and are never removable.</summary>
    private static IEnumerable<ModInstance> Removable(CraftItem item) => item.Mods.Where(m => !m.Fractured);

    /// <summary>
    /// The mods a Fracturing Orb can lock: every mod that is not already fractured, including a desecrated mod once it
    /// has been revealed. An UNREVEALED desecrated slot is the exception: it counts toward the 4-modifier minimum but
    /// cannot be fractured, so 3 mods + 1 unrevealed slot gives each mod a 1-in-3 chance instead of 1-in-4.
    /// (Guides only describe the unrevealed slot; none says a revealed desecrated mod is excluded.)
    /// </summary>
    public IReadOnlyList<ModInstance> FractureCandidates(CraftItem item) =>
        item.Mods.Where(m => !m.Fractured).ToList();

    /// <summary>
    /// Everything a removal could hit once the filters are applied. Whittling then keeps only the
    /// candidates with the lowest mod LEVEL (the required level, not the tier).
    /// </summary>
    public IReadOnlyList<RemovalCandidate> RemovalPool(CraftItem item, RemovalFilter filter = default)
    {
        var candidates = Removable(item)
            .Select(m => new RemovalCandidate(m, null, ModOf(m).MinLevel, AffixOf(m), m.Desecrated))
            .Concat(item.Unrevealed.Select(u => new RemovalCandidate(null, u, 1, u.Affix, true)))
            .ToList();

        if (filter.Kind is { } kind) candidates = candidates.Where(c => c.Affix == kind).ToList();
        if (filter.DesecratedOnly) candidates = candidates.Where(c => c.Desecrated).ToList();
        if (filter.Whittle && candidates.Count > 0)
        {
            var lowest = candidates.Min(c => c.Level);
            candidates = candidates.Where(c => c.Level == lowest).ToList();
        }
        return candidates;
    }

    private static Change RemoveCandidate(CraftItem item, RemovalCandidate c)
    {
        if (c.Mod is not null)
        {
            item.Mods.Remove(c.Mod);
            return Change.Removed(c.Mod);
        }
        item.Unrevealed.Remove(c.Slot!);
        return Change.RemovedText($"Unrevealed desecrated {c.Affix.ToString()!.ToLowerInvariant()}");
    }

    /// <summary>Remove one random candidate. <paramref name="kind"/> overrides the filter's kind when given.</summary>
    private Change? RemoveRandom(CraftItem item, Affix? kind = null, RemovalFilter filter = default)
    {
        var candidates = RemovalPool(item, filter with { Kind = kind ?? filter.Kind });
        return candidates.Count == 0 ? null : RemoveCandidate(item, Pick(candidates));
    }

    /// <summary>The removal restrictions the armed omens put on a currency.</summary>
    public RemovalFilter RemovalFilterFor(string handler, bool essenceReplaces = false)
    {
        var o = Context;
        switch (handler)
        {
            case "poe2_chaos":
                return new RemovalFilter(
                    Kind: o.Has("erasure_prefix") ? Affix.Prefix : o.Has("erasure_suffix") ? Affix.Suffix : null,
                    Whittle: o.Has("whittling"));
            case "poe2_annulment":
                return new RemovalFilter(
                    Kind: o.Has("annul_prefix") ? Affix.Prefix : o.Has("annul_suffix") ? Affix.Suffix : null,
                    DesecratedOnly: o.Has("light"),
                    Count: o.Has("annul_two") ? 2 : 1);
            case "poe2_essence" when essenceReplaces:
                return new RemovalFilter(Kind: o.Has("crystal_prefix") ? Affix.Prefix : o.Has("crystal_suffix") ? Affix.Suffix : null);
            default:
                return new RemovalFilter();
        }
    }
}
