using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

/// <summary>Why a craft did or did not happen.</summary>
public sealed record CraftResult(bool Success, IReadOnlyList<Change> Changes, string? Failure = null)
{
    public static CraftResult Ok(IReadOnlyList<Change> changes) => new(true, changes);
    public static CraftResult Fail(string reason) => new(false, Array.Empty<Change>(), reason);
}

/// <summary>A previewed outcome (Hinekora's Lock): the item as it would be, and what changed.</summary>
public sealed record Foresight(CraftItem Item, IReadOnlyList<Change> Changes);

/// <summary>How likely each mod is to be added next, as a share of the total weight.</summary>
public sealed record AddChanceTable(double TotalWeight, IReadOnlyDictionary<int, double> ByModId);

/// <summary>
/// The crafting rules. Read the partial files in this order:
///   CraftingEngine.cs               this file: entry points (TryCraft / ApplyMethod / Foresee) and shared helpers
///   CraftingEngine.Pools.cs         what mod can roll right now, and Minimum Modifier Level
///   CraftingEngine.Removal.cs       removing mods (Chaos, Annulment, Whittling, fracturing candidates)
///   CraftingEngine.Constraints.cs   the "can this currency be used on this item?" checks
///   CraftingEngine.Currency.cs      Transmutation, Augmentation, Regal, Alchemy, Chaos, Exalted, Annulment, Divine,
///                                   Fracturing, Vaal, quality orbs, sockets (Artificer), Generate
///   CraftingEngine.Essence.cs       essences and alloys
///   CraftingEngine.Socket.cs        runes, soul cores, meta runes, replacing and socket-bound augments
///   CraftingEngine.Desecration.cs   bones, the Well of Souls reveal, faction omens
///   ModText.cs                      turning a mod + rolls into display text
///
/// The engine mutates the item you hand it and returns the list of <see cref="Change"/>s it made.
/// All randomness comes from <see cref="CraftContext.Rng"/>, so a seeded context is repeatable.
/// </summary>
public sealed partial class CraftingEngine
{
    public const int MaxQuality = 20;

    /// <summary>Vaal infuser quality can exceed the normal cap by up to 10%.</summary>
    public const int MaxQualityInfuser = 30;

    /// <summary>Assumption: no source gives the chance an infuser corrupts the item.</summary>
    private const double InfuserCorruptChance = 0.25;

    /// <summary>The Well of Souls offers three options.</summary>
    private const int RevealOptionCount = 3;

    public GameDatabase Db { get; }
    public ModPools Pools { get; }
    public CraftContext Context { get; }

    private readonly Dictionary<string, Func<CraftItem, CraftMethod, List<Change>?>> _handlers;
    private readonly Dictionary<string, Func<CraftItem, bool>> _constraints;

    private Random Rng => Context.Rng;

    public CraftingEngine(GameDatabase db, CraftContext? context = null)
    {
        Db = db;
        Pools = new ModPools(db);
        Context = context ?? new CraftContext();
        _constraints = BuildConstraints();
        _handlers = BuildHandlers();
    }

    // ---- creating items ---------------------------------------------------------------------

    /// <summary>A fresh Normal item of the given base, with its implicit rolled.</summary>
    public CraftItem NewItem(BaseItem baseItem, int itemLevel = 100) => new()
    {
        BaseId = baseItem.Id,
        ClassId = baseItem.ClassId ?? throw new ArgumentException("base item has no class"),
        ItemLevel = itemLevel,
        Rarity = Rarity.Normal,
        Implicits = (baseItem.Implicits ?? new List<int>()).Select(id => RollMod(Db.Mods[id])).ToList(),
        Sockets = baseItem.Sockets ?? 0,
    };

    /// <summary>Roll every stat of a mod inside its range.</summary>
    public ModInstance RollMod(Mod mod) => new()
    {
        ModId = mod.Id,
        Rolls = mod.Stats.Select(s => RollValue(s.Range[0], s.Range[1])).ToArray(),
    };

    /// <summary>Whole-number ranges roll whole numbers (inclusive); fractional ranges roll 2 decimals.</summary>
    private double RollValue(double min, double max)
    {
        if (max < min) (min, max) = (max, min);
        if (min == Math.Floor(min) && max == Math.Floor(max)) return min + Rng.Next((int)(max - min) + 1);
        return Math.Round(min + Rng.NextDouble() * (max - min), 2);
    }

    // ---- entry points -------------------------------------------------------------------------

    /// <summary>
    /// Use a currency on an item the way a player would: check the constraints, honour Hinekora's Lock,
    /// apply it, and use up the omens that target it. On failure the item is left exactly as it was.
    /// </summary>
    public CraftResult TryCraft(CraftItem item, CraftMethod method)
    {
        if (!CheckConstraints(item, method.Constraints, method.Handler))
            return CraftResult.Fail("the item does not meet this currency's requirements");

        IReadOnlyList<Change>? changes;
        if (item.Locked && method.Handler != "hinekora_lock")
        {
            // Foresight: the previewed outcome is exactly what happens, and the Lock is used up.
            var preview = Foresee(item, method);
            if (preview is null) return CraftResult.Fail("the foreseen outcome is that it cannot be applied");
            item.CopyFrom(preview.Item);
            changes = preview.Changes;
        }
        else
        {
            changes = ApplyMethod(item, method);
            if (changes is null) return CraftResult.Fail("no valid target on this item");
        }

        Context.ConsumeOmens(method.Handler);
        return CraftResult.Ok(changes);
    }

    /// <summary>
    /// Run the currency's rule on the item. Returns the changes, or null when the currency cannot do
    /// anything here (in which case the item is restored untouched). Constraints are NOT checked here;
    /// use <see cref="TryCraft"/> for the full player-facing behaviour.
    /// </summary>
    public IReadOnlyList<Change>? ApplyMethod(CraftItem item, CraftMethod method)
    {
        var handler = BaseHandler(method.Handler);
        if (!_handlers.TryGetValue(handler, out var run)) return null;

        // Currencies that add a mod fail up front when nothing could be added.
        if (AddsMod(handler) && EligibleMods(ProbeRarity(item, handler), AddOptionsFor(new AddOptions(method.MinModLevel), handler)).Count == 0)
            return null;

        var snapshot = item.Clone();
        var changes = run(item, method);
        if (changes is null)
        {
            item.CopyFrom(snapshot); // a handler may have changed things before giving up
            return null;
        }
        item.ForesightCache.Clear(); // the item changed, so earlier previews no longer apply
        return changes;
    }

    /// <summary>
    /// Hinekora's Lock: what would this currency do? The real item is not touched. While the item is Locked the
    /// outcome is remembered, so asking again (or then using the currency) gives exactly the same result.
    /// </summary>
    public Foresight? Foresee(CraftItem item, CraftMethod method)
    {
        var key = $"{method.Handler}|{method.MinModLevel}|{method.Name}|{method.Slot}|{string.Join(',', Context.Omens.Order())}";
        if (item.Locked && item.ForesightCache.TryGetValue(key, out var cached)) return cached;

        var clone = item.Clone();
        clone.Locked = false;
        var changes = ApplyMethod(clone, method);
        var preview = changes is null ? null : new Foresight(clone, changes);
        if (item.Locked && preview is not null) item.ForesightCache[key] = preview;
        return preview;
    }

    /// <summary>The chance of each mod being picked by the NEXT mod-adding step of this currency.</summary>
    public AddChanceTable AddChances(CraftItem item, CraftMethod method)
    {
        var handler = BaseHandler(method.Handler);
        if (handler is "poe2_essence" or "poe2_socketable") return new AddChanceTable(0, new Dictionary<int, double>());
        var pool = EligibleMods(ProbeRarity(item, handler), AddOptionsFor(new AddOptions(method.MinModLevel), handler));
        var total = pool.Sum(e => e.Weight);
        return new AddChanceTable(total, pool.ToDictionary(e => e.Mod.Id, e => e.Weight / total));
    }

    // ---- handler names ------------------------------------------------------------------------

    /// <summary>
    /// Greater / Perfect variants ("poe2_chaos_perfect") use the base currency's rule and differ only in
    /// MinModLevel; every desecration bone ("poe2_desecrate_low/mid/high/breach") shares one rule too.
    /// </summary>
    public static string BaseHandler(string handler)
    {
        if (handler.StartsWith("poe2_desecrate", StringComparison.Ordinal)) return "poe2_desecrate";
        foreach (var suffix in new[] { "_greater", "_perfect" })
            if (handler.EndsWith(suffix, StringComparison.Ordinal)) return handler[..^suffix.Length];
        return handler;
    }

    public bool IsImplemented(string handler) => _handlers.ContainsKey(BaseHandler(handler));

    private static bool AddsMod(string handler) =>
        handler is "poe2_transmutation" or "poe2_augmentation" or "poe2_regal" or "poe2_exalted" or "poe2_alchemy" or "poe2_chaos";

    /// <summary>The item as it will be when the new mod is chosen (the rarity upgrade happens first).</summary>
    private CraftItem ProbeRarity(CraftItem item, string handler)
    {
        var probe = item.Clone();
        if (handler == "poe2_transmutation") probe.Rarity = Rarity.Magic;
        if (handler is "poe2_regal" or "poe2_alchemy") probe.Rarity = Rarity.Rare;
        if (handler == "poe2_alchemy") { probe.Mods.Clear(); probe.Unrevealed.Clear(); }
        if (handler == "poe2_chaos" && probe.Mods.Count > 0) probe.Mods.RemoveAt(probe.Mods.Count - 1); // approximation: removal frees a slot
        return probe;
    }

    // ---- small shared helpers -----------------------------------------------------------------

    private T Pick<T>(IReadOnlyList<T> items) => items[Rng.Next(items.Count)];

    /// <summary>Weighted random choice. Returns the index, or -1 when nothing can be chosen.</summary>
    private int PickIndex(IReadOnlyList<double> weights)
    {
        var total = weights.Sum();
        if (total <= 0) return -1;
        var r = Rng.NextDouble() * total;
        for (var i = 0; i < weights.Count; i++)
            if ((r -= weights[i]) < 0) return i;
        return weights.Count - 1;
    }

    private PoolEntry? PickWeighted(IReadOnlyList<PoolEntry> entries)
    {
        var index = PickIndex(entries.Select(e => e.Weight).ToList());
        return index < 0 ? null : entries[index];
    }

    private static List<Change> Added(ModInstance? mod) => mod is null ? new List<Change>() : new List<Change> { Change.Added(mod) };
    private static List<Change> Note(string text) => new() { Change.NoteOf(text) };

    private Affix? AffixOf(ModInstance m) => Pools.AffixOf(Db.Mods[m.ModId]);
    private Mod ModOf(ModInstance m) => Db.Mods[m.ModId];
}
