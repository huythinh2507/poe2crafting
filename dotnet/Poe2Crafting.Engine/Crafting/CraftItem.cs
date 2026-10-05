using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

public enum Rarity { Normal, Magic, Rare }

/// <summary>A modifier on an item: which mod, the rolled values, and any special status flags.</summary>
public sealed class ModInstance
{
    public int ModId { get; set; }

    /// <summary>One rolled value per stat line of the mod.</summary>
    public double[] Rolls { get; set; } = Array.Empty<double>();

    /// <summary>Locked in by a Fracturing Orb: can never be removed or changed by currency.</summary>
    public bool Fractured { get; set; }

    /// <summary>Added through desecration (revealed at the Well of Souls). Cannot be fractured.</summary>
    public bool Desecrated { get; set; }

    /// <summary>Added by an Alloy / Perfect / Corrupted essence. An item may hold only a limited number.</summary>
    public bool Crafted { get; set; }

    public ModInstance Clone() => new()
    {
        ModId = ModId, Rolls = (double[])Rolls.Clone(), Fractured = Fractured, Desecrated = Desecrated, Crafted = Crafted,
    };
}

/// <summary>
/// A desecrated slot a bone has added but the Well of Souls has not yet revealed. It already takes up
/// a prefix or suffix slot, counts toward the 4-mod minimum for fracturing, and counts as mod level 1
/// for the Omen of Whittling.
/// </summary>
public sealed class UnrevealedSlot
{
    public Affix Affix { get; set; }

    /// <summary>The bone's "Minimum Modifier Level" (Ancient bones use 40).</summary>
    public int MinLevel { get; set; }

    public UnrevealedSlot Clone() => new() { Affix = Affix, MinLevel = MinLevel };
}

/// <summary>A rune / soul core / idol sitting in a socket, with the effects the engine cares about.</summary>
public sealed class SocketedAugment
{
    public int ItemId { get; set; }
    public int? Limit { get; set; }
    public string Name { get; set; } = "";
    public List<string> Lines { get; set; } = new();

    /// <summary>Socket-bound augments can never be removed or replaced.</summary>
    public bool Bound { get; set; }

    // Meta effects parsed from the rune's text (see CraftingEngine.MetaEffects).
    public int ExtraSuffix { get; set; }
    public int ExtraCrafted { get; set; }
    public int? UnlocksPool { get; set; }
    public string? TransformTo { get; set; }

    // "Increased effect of socketed ..." (see CraftingEngine.SocketEffectPct). Meta counts above are the BASE values; Bonus() scales them.
    public bool IsRune { get; set; }
    public bool Scaling { get; set; }
    /// <summary>"#% increased effect of Socketed Runes" this augment gives (Aldur's Legacy). Never scaled itself.</summary>
    public double RuneEffect { get; set; }
    /// <summary>"#% increased effect of Socketed Augment Items" this augment gives. Never scaled itself.</summary>
    public double AugmentEffect { get; set; }

    public SocketedAugment Clone() => new()
    {
        ItemId = ItemId, Limit = Limit, Name = Name, Lines = new List<string>(Lines), Bound = Bound,
        ExtraSuffix = ExtraSuffix, ExtraCrafted = ExtraCrafted, UnlocksPool = UnlocksPool, TransformTo = TransformTo,
        IsRune = IsRune, Scaling = Scaling, RuneEffect = RuneEffect, AugmentEffect = AugmentEffect,
    };
}

/// <summary>
/// Everything about the item being crafted. The engine mutates this in place; call <see cref="Clone"/>
/// first when you need to keep the old state (undo, Hinekora's Lock preview, "what if" probing).
/// </summary>
public sealed class CraftItem
{
    public int BaseId { get; set; }

    /// <summary>The item class id (see ItemClass.Id), used for the weighted mod tables.</summary>
    public int ClassId { get; set; }

    public int ItemLevel { get; set; } = 100;
    public Rarity Rarity { get; set; } = Rarity.Normal;

    public List<ModInstance> Implicits { get; set; } = new();
    public List<ModInstance> Mods { get; set; } = new();
    public List<UnrevealedSlot> Unrevealed { get; set; } = new();

    public int Quality { get; set; }

    /// <summary>Jewellery catalyst quality (rings, amulets): one tag, replaced when another catalyst is used. Null when none.</summary>
    public CatalystQuality? Catalyst { get; set; }

    public int Sockets { get; set; }
    public List<SocketedAugment> Socketed { get; set; } = new();

    /// <summary>Corrupted items cannot be modified further by most currency.</summary>
    public bool Corrupted { get; set; }

    /// <summary>Vaal-orb enchant implicits.</summary>
    public List<ModInstance> Corruption { get; set; } = new();

    /// <summary>Hinekora's Lock armed: the next currency's result is foreseen.</summary>
    public bool Locked { get; set; }

    /// <summary>
    /// Outcomes already foreseen while Locked. A foreseen result is deterministic: previewing a currency twice
    /// shows the same outcome, and using it does exactly that. Cleared whenever the item changes.
    /// </summary>
    internal Dictionary<string, Foresight> ForesightCache { get; } = new();

    /// <summary>Overwrite this item with another item's state (used to restore a snapshot or commit a preview).</summary>
    public void CopyFrom(CraftItem other)
    {
        var copy = other.Clone();
        BaseId = copy.BaseId; ClassId = copy.ClassId; ItemLevel = copy.ItemLevel; Rarity = copy.Rarity;
        Implicits = copy.Implicits; Mods = copy.Mods; Unrevealed = copy.Unrevealed;
        Quality = copy.Quality; Catalyst = copy.Catalyst; Sockets = copy.Sockets; Socketed = copy.Socketed;
        Corrupted = copy.Corrupted; Corruption = copy.Corruption; Locked = copy.Locked;
        ForesightCache.Clear();
    }

    public CraftItem Clone() => new()
    {
        BaseId = BaseId, ClassId = ClassId, ItemLevel = ItemLevel, Rarity = Rarity,
        Implicits = Implicits.Select(m => m.Clone()).ToList(),
        Mods = Mods.Select(m => m.Clone()).ToList(),
        Unrevealed = Unrevealed.Select(u => u.Clone()).ToList(),
        Quality = Quality, Catalyst = Catalyst, Sockets = Sockets,
        Socketed = Socketed.Select(s => s.Clone()).ToList(),
        Corrupted = Corrupted,
        Corruption = Corruption.Select(m => m.Clone()).ToList(),
        Locked = Locked,
    };
}

public enum ChangeOp { Add, Remove, Reroll, Fracture, Note }

/// <summary>One thing a craft did: a mod added / removed / rerolled / fractured, or a plain note.</summary>
public sealed record Change(ChangeOp Op, ModInstance? Mod = null, string? Text = null)
{
    public static Change Added(ModInstance m) => new(ChangeOp.Add, m);
    public static Change Removed(ModInstance m) => new(ChangeOp.Remove, m);
    public static Change RemovedText(string text) => new(ChangeOp.Remove, null, text);
    public static Change Rerolled(ModInstance m) => new(ChangeOp.Reroll, m);
    public static Change Fractured(ModInstance m) => new(ChangeOp.Fracture, m);
    public static Change NoteOf(string text) => new(ChangeOp.Note, null, text);
}

/// <summary>Catalyst quality on a ring or amulet: scales every modifier carrying <paramref name="Tag"/> (e.g. "life").</summary>
public sealed record CatalystQuality(string Tag, int Quality);
