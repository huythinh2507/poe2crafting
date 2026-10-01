namespace Poe2Crafting.Engine.Crafting;

/// <summary>
/// An omen is a one-shot modifier you arm before using a currency. It is consumed by the NEXT use of
/// the currency it targets (<see cref="For"/>). Wording follows poe2db.
/// </summary>
/// <param name="Id">Stable identifier used in code and tests.</param>
/// <param name="For">Handler of the currency that consumes it ("poe2_chaos", ...), or "reveal" for Well of Souls omens.</param>
/// <param name="Exclusive">Omens sharing a group cannot be armed together (Sinistral vs Dextral, ...).</param>
/// <param name="Retired">Exists in the data but can no longer be obtained (drop disabled in patch 0.3.0).</param>
/// <param name="NotSimulated">Real omen the engine does not implement yet.</param>
public sealed record Omen(string Id, string Name, string For, string Hint, string? Exclusive = null, bool Retired = false, bool NotSimulated = false);

public static class OmenCatalogue
{
    public static readonly IReadOnlyList<Omen> All = new List<Omen>
    {
        // Chaos Orb
        new("whittling", "Omen of Whittling", "poe2_chaos", "Chaos Orb removes the lowest-LEVEL modifier (required level, not tier). Unrevealed desecrated slots count as level 1. Ties: random."),
        new("erasure_prefix", "Omen of Sinistral Erasure", "poe2_chaos", "Chaos Orb removes only prefix modifiers.", "erasure"),
        new("erasure_suffix", "Omen of Dextral Erasure", "poe2_chaos", "Chaos Orb removes only suffix modifiers.", "erasure"),
        // Orb of Annulment
        new("annul_two", "Omen of Greater Annulment", "poe2_annulment", "Annulment removes two modifiers.", Retired: true),
        new("annul_prefix", "Omen of Sinistral Annulment", "poe2_annulment", "Annulment removes only prefix modifiers.", "annul"),
        new("annul_suffix", "Omen of Dextral Annulment", "poe2_annulment", "Annulment removes only suffix modifiers.", "annul"),
        new("light", "Omen of Light", "poe2_annulment", "Annulment removes only Desecrated modifiers (revealed or not).", "annul"),
        // Exalted Orb
        new("exalt_two", "Omen of Greater Exaltation", "poe2_exalted", "Exalted Orb adds two random modifiers."),
        new("exalt_prefix", "Omen of Sinistral Exaltation", "poe2_exalted", "Exalted Orb adds only prefix modifiers.", "exalt"),
        new("exalt_suffix", "Omen of Dextral Exaltation", "poe2_exalted", "Exalted Orb adds only suffix modifiers.", "exalt"),
        new("exalt_homog", "Omen of Homogenising Exaltation", "poe2_exalted", "Exalted Orb adds a modifier of the same type (shares a tag) as an existing modifier."),
        new("exalt_catalyst", "Omen of Catalysing Exaltation", "poe2_exalted", "Exalted Orb consumes all catalyst quality: modifiers with the catalyst's tag become more likely (weight x (1 + 0.2 x quality))."),
        // Regal Orb
        new("regal_prefix", "Omen of Sinistral Coronation", "poe2_regal", "Regal Orb adds only a prefix.", "regal", Retired: true),
        new("regal_suffix", "Omen of Dextral Coronation", "poe2_regal", "Regal Orb adds only a suffix.", "regal", Retired: true),
        new("regal_homog", "Omen of Homogenising Coronation", "poe2_regal", "Regal Orb adds a modifier of the same type (shares a tag) as an existing modifier."),
        // Orb of Alchemy
        new("alch_prefix", "Omen of Sinistral Alchemy", "poe2_alchemy", "Alchemy results in the maximum number of prefixes (3 prefixes, 1 suffix).", "alch", Retired: true),
        new("alch_suffix", "Omen of Dextral Alchemy", "poe2_alchemy", "Alchemy results in the maximum number of suffixes (3 suffixes, 1 prefix).", "alch", Retired: true),
        // Vaal / Divine
        new("corruption", "Omen of Corruption", "poe2_vaal", "Vaal Orb always results in a change (never the \"no change\" outcome)."),
        new("blessed", "Omen of the Blessed", "poe2_divine", "Divine Orb rerolls only implicit modifiers."),
        new("sanctification", "Omen of Sanctification", "poe2_divine", "Sanctification is not simulated yet.", NotSimulated: true),
        // Perfect / Corrupted / Alloy essences
        new("crystal_prefix", "Omen of Sinistral Crystallisation", "poe2_essence", "Perfect / Corrupted essence (and alloy) removes only a prefix.", "crystal"),
        new("crystal_suffix", "Omen of Dextral Crystallisation", "poe2_essence", "Perfect / Corrupted essence (and alloy) removes only a suffix.", "crystal"),
        // Desecration
        new("sinistral", "Omen of Sinistral Necromancy", "poe2_desecrate", "Next desecration adds a prefix only.", "necro"),
        new("dextral", "Omen of Dextral Necromancy", "poe2_desecrate", "Next desecration adds a suffix only.", "necro"),
        new("putrefaction", "Omen of Putrefaction", "poe2_desecrate", "Replaces every unfractured modifier with an unrevealed desecrated one and corrupts the item."),
        new("echoes", "Omen of Abyssal Echoes", "reveal", "Lets you reroll the revealed options once."),
        new("Ulaman", "Omen of the Sovereign", "reveal", "Weapon / Jewellery only: one revealed option is guaranteed to be an Ulaman modifier.", "faction"),
        new("Kurgal", "Omen of the Blackblooded", "reveal", "Weapon / Jewellery only: one revealed option is guaranteed to be a Kurgal modifier.", "faction"),
        new("Amanamu", "Omen of the Liege", "reveal", "Weapon / Jewellery only: one revealed option is guaranteed to be an Amanamu modifier.", "faction"),
    };

    private static readonly Dictionary<string, Omen> ById = All.ToDictionary(o => o.Id);
    public static Omen? Find(string id) => ById.GetValueOrDefault(id);
}

/// <summary>Tunable assumptions for the Well of Souls reveal pool. GGG publishes no desecration weights.</summary>
public sealed record DesecrationSettings(bool IncludeNormalMods = true, double LichWeight = 1000);

/// <summary>
/// Session state shared by every craft: which omens are armed, the desecration assumptions, and the
/// random number generator. Pass a seed for repeatable results (tests do).
/// </summary>
public sealed class CraftContext
{
    public HashSet<string> Omens { get; } = new();

    /// <summary>Pinned omens are not used up: they stay armed after each craft, so a combo (Chaos + Whittling) can be repeated.</summary>
    public HashSet<string> Pinned { get; } = new();
    public DesecrationSettings Desecration { get; set; } = new();
    public Random Rng { get; }

    public CraftContext(int? seed = null) => Rng = seed is null ? new Random() : new Random(seed.Value);

    public bool Has(string omenId) => Omens.Contains(omenId);

    /// <summary>Arm / disarm an omen. Arming one switches off any omen in the same exclusive group.</summary>
    public void ToggleOmen(string id)
    {
        var omen = OmenCatalogue.Find(id);
        if (omen is null || omen.NotSimulated) return;
        if (Omens.Remove(id)) { Pinned.Remove(id); return; }   // switching an omen off also unpins it
        if (omen.Exclusive is not null)
            foreach (var other in OmenCatalogue.All.Where(o => o.Exclusive == omen.Exclusive)) { Omens.Remove(other.Id); Pinned.Remove(other.Id); }
        Omens.Add(id);
    }

    /// <summary>Pin an omen (arming it if needed); calling again unpins it, leaving it armed for one more use.</summary>
    public void TogglePin(string id)
    {
        var omen = OmenCatalogue.Find(id);
        if (omen is null || omen.NotSimulated) return;
        if (Pinned.Remove(id)) return;
        if (!Omens.Contains(id)) ToggleOmen(id);
        Pinned.Add(id);
    }

    /// <summary>Use up one omen unless it is pinned.</summary>
    public void SpendOmen(string id)
    {
        if (!Pinned.Contains(id)) Omens.Remove(id);
    }

    /// <summary>Disarm omens. <paramref name="keepPinned"/> leaves the pinned ones armed (what "Reset item" does).</summary>
    public void ClearOmens(bool keepPinned = false)
    {
        foreach (var id in Omens.ToList())
            if (!(keepPinned && Pinned.Contains(id))) Omens.Remove(id);
        if (!keepPinned) Pinned.Clear();
    }

    /// <summary>Called after a successful (non-preview) craft: the currency used up the omens that target it.</summary>
    public void ConsumeOmens(string handler)
    {
        var baseHandler = CraftingEngine.BaseHandler(handler);
        foreach (var omen in OmenCatalogue.All.Where(o => o.For == baseHandler)) SpendOmen(omen.Id);
    }
}
