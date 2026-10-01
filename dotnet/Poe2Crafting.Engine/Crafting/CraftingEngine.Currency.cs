using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

public sealed partial class CraftingEngine
{
    /// <summary>The handler table: handler name -> the rule that runs. Each returns the changes, or null if impossible.</summary>
    private Dictionary<string, Func<CraftItem, CraftMethod, List<Change>?>> BuildHandlers() => new()
    {
        ["poe2_transmutation"] = (i, m) => { i.Rarity = Rarity.Magic; return Added(AddRandom(i, Opts(m))); },
        ["poe2_augmentation"] = (i, m) => Added(AddRandom(i, Opts(m))),
        ["poe2_regal"] = (i, m) => { i.Rarity = Rarity.Rare; return AddMany(i, 1, AddOptionsFor(Opts(m), "poe2_regal")); },
        ["poe2_alchemy"] = Alchemy,
        ["poe2_chaos"] = Chaos,
        ["poe2_exalted"] = (i, m) => AddMany(i, Context.Has("exalt_two") ? 2 : 1, AddOptionsFor(Opts(m), "poe2_exalted")),
        ["poe2_annulment"] = Annulment,
        ["poe2_divine"] = Divine,
        ["poe2_fracture"] = Fracture,
        ["poe2_vaal"] = Vaal,
        ["poe2_vaal_infuser"] = VaalInfuser,
        ["blacksmith_whetstone"] = (i, _) => AddQuality(i),
        ["arcanist_etcher"] = (i, _) => AddQuality(i),
        ["armourer_scrap"] = (i, _) => AddQuality(i),
        ["glassblower_bauble"] = (i, _) => AddQuality(i),
        ["artificer"] = (i, _) => { i.Sockets++; return Note($"Socket added ({i.Sockets})"); },
        ["poe2_essence"] = ApplyEssence,
        ["poe2_socketable"] = ApplySocketable,
        ["poe2_desecrate"] = ApplyDesecrate,
        ["hinekora_lock"] = (i, _) => { i.Locked = true; return Note("Hinekora's Lock armed — the next currency's result is foreseen"); },
        ["spawn_normal_item"] = (i, _) => { ResetMods(i, Rarity.Normal); return new List<Change>(); },
        ["spawn_magic_item"] = SpawnMagic,
        ["spawn_rare_item"] = SpawnRare,
    };

    private static AddOptions Opts(CraftMethod method) => new(method.MinModLevel);

    private static void ResetMods(CraftItem item, Rarity rarity)
    {
        item.Rarity = rarity;
        item.Mods.Clear();
        item.Unrevealed.Clear();
    }

    // ---- adding mods ----------------------------------------------------------------------------

    /// <summary>
    /// Orb of Alchemy: Normal/Magic -> Rare with 4 fresh mods. Sinistral / Dextral Alchemy (retired in the
    /// game since 0.3.0, kept for completeness) force three of one affix and one of the other.
    /// </summary>
    private List<Change>? Alchemy(CraftItem item, CraftMethod method)
    {
        ResetMods(item, Rarity.Rare);
        Affix?[] order =
            Context.Has("alch_prefix") ? new Affix?[] { Affix.Prefix, Affix.Prefix, Affix.Prefix, Affix.Suffix }
            : Context.Has("alch_suffix") ? new Affix?[] { Affix.Suffix, Affix.Suffix, Affix.Suffix, Affix.Prefix }
            : new Affix?[] { null, null, null, null };

        var changes = new List<Change>();
        foreach (var affix in order)
            changes.AddRange(Added(AddRandom(item, Opts(method) with { Affix = affix }) ?? AddRandom(item, Opts(method))));
        return changes;
    }

    private List<Change>? SpawnMagic(CraftItem item, CraftMethod method)
    {
        ResetMods(item, Rarity.Magic);
        var changes = Added(AddRandom(item, default));
        if (Rng.NextDouble() < 0.5) changes.AddRange(Added(AddRandom(item, default)));
        return changes;
    }

    private List<Change>? SpawnRare(CraftItem item, CraftMethod method)
    {
        ResetMods(item, Rarity.Rare);
        var changes = new List<Change>();
        var count = 4 + Rng.Next(3); // 4 to 6 mods
        for (var k = 0; k < count; k++) changes.AddRange(Added(AddRandom(item, default)));
        return changes;
    }

    // ---- removing / rerolling -------------------------------------------------------------------

    /// <summary>Chaos Orb: remove one random modifier, then add one. Omens narrow the removal (Whittling, Erasure).</summary>
    private List<Change>? Chaos(CraftItem item, CraftMethod method)
    {
        var removed = RemoveRandom(item, null, RemovalFilterFor("poe2_chaos"));
        if (removed is null) return null;
        var changes = new List<Change> { removed };
        changes.AddRange(Added(AddRandom(item, Opts(method))));
        return changes;
    }

    /// <summary>Chaos without omens or tiers; used by the Vaal Orb's "reroll" outcome.</summary>
    private List<Change> ChaosOnce(CraftItem item)
    {
        var removed = RemoveRandom(item);
        if (removed is null) return new List<Change>();
        var changes = new List<Change> { removed };
        changes.AddRange(Added(AddRandom(item, default)));
        return changes;
    }

    /// <summary>Orb of Annulment: remove one (or two with Greater Annulment) modifiers.</summary>
    private List<Change>? Annulment(CraftItem item, CraftMethod method)
    {
        var filter = RemovalFilterFor("poe2_annulment");
        var changes = new List<Change>();
        for (var k = 0; k < filter.Count; k++)
            if (RemoveRandom(item, null, filter) is { } removed) changes.Add(removed);
        return changes.Count > 0 ? changes : null;
    }

    /// <summary>
    /// Divine Orb: reroll the numeric values of implicits and unfractured mods. A fractured mod is locked against
    /// currency, so its values never change. The Omen of the Blessed limits the reroll to implicits.
    /// </summary>
    private List<Change>? Divine(CraftItem item, CraftMethod method)
    {
        var changes = new List<Change>();
        ModInstance Reroll(ModInstance old)
        {
            var fresh = RollMod(ModOf(old));
            fresh.Fractured = old.Fractured; fresh.Desecrated = old.Desecrated; fresh.Crafted = old.Crafted; // flags survive a reroll
            changes.Add(Change.Rerolled(fresh));
            return fresh;
        }

        item.Implicits = item.Implicits.Select(Reroll).ToList();
        if (!Context.Has("blessed")) item.Mods = item.Mods.Select(m => m.Fractured ? m : Reroll(m)).ToList();
        return changes;
    }

    /// <summary>Fracturing Orb: lock one random eligible mod. See <see cref="FractureCandidates"/>.</summary>
    private List<Change>? Fracture(CraftItem item, CraftMethod method)
    {
        var candidates = FractureCandidates(item);
        if (candidates.Count == 0) return null;
        var chosen = Pick(candidates);
        chosen.Fractured = true;
        return new List<Change> { Change.Fractured(chosen) };
    }

    // ---- Vaal Orb ---------------------------------------------------------------------------------

    /// <summary>
    /// Vaal Orb: corrupts the item and, with equal chance, does nothing else / rerolls 1-3 mods like a Chaos
    /// Orb / adds a corruption enchant / adds a socket (casters change quality instead). The Omen of Corruption
    /// removes the "does nothing" outcome.
    /// </summary>
    private List<Change>? Vaal(CraftItem item, CraftMethod method)
    {
        item.Corrupted = true;
        var roll = Context.Has("corruption") ? 1 + Rng.Next(3) : Rng.Next(4);

        if (roll == 0) return Note("Corrupted — no other change");
        if (roll == 1)
        {
            var count = 1 + Rng.Next(3);
            var changes = Note($"Corrupted — rerolled {count}×");
            for (var k = 0; k < count; k++) changes.AddRange(ChaosOnce(item));
            return changes;
        }

        List<Change> Enchant()
        {
            var pool = Pools.CorruptionPool(item.ClassId);
            var index = PickIndex(pool.Select(p => p.Weight).ToList());
            if (index < 0) return Note("Corrupted — no enchant available");
            var enchant = RollMod(pool[index].Mod);
            item.Corruption.Add(enchant);
            return new List<Change> { Change.Added(enchant) };
        }

        if (roll == 2) return Note("Corrupted — enchantment").Concat(Enchant()).ToList();

        if (CanSocket(item))
        {
            item.Sockets++;
            return Note($"Corrupted — +1 socket ({item.Sockets})");
        }
        if (IsCaster(item))
        {
            var delta = Rng.Next(11) * (Rng.NextDouble() < 0.5 ? -1 : 1);
            item.Quality = Math.Clamp(item.Quality + delta, 0, 23);
            return Note($"Corrupted — quality {(delta >= 0 ? "+" : "")}{delta}% (now {item.Quality}%)");
        }
        return Note("Corrupted — enchantment").Concat(Enchant()).ToList();
    }

    // ---- quality ----------------------------------------------------------------------------------

    /// <summary>Quality orbs add 5% (Normal), 2% (Magic) or 1% (Rare) up to the cap.</summary>
    private List<Change> AddQuality(CraftItem item, int cap = MaxQuality)
    {
        var gain = item.Rarity switch { Rarity.Normal => 5, Rarity.Magic => 2, _ => 1 };
        var before = item.Quality;
        item.Quality = Math.Min(cap, item.Quality + gain);
        return Note($"Quality +{item.Quality - before}% (now {item.Quality}%)");
    }

    /// <summary>Vaal infusers push quality past the normal cap (to 30%) with a chance of corrupting.</summary>
    private List<Change>? VaalInfuser(CraftItem item, CraftMethod method)
    {
        var changes = AddQuality(item, MaxQualityInfuser);
        if (Rng.NextDouble() < InfuserCorruptChance)
        {
            item.Corrupted = true;
            changes.AddRange(Note("Corrupted"));
        }
        return changes;
    }
}
