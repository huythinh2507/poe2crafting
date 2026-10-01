namespace Poe2Crafting.Engine.Crafting;

public sealed partial class CraftingEngine
{
    // ---- what kind of item is it? --------------------------------------------------------------
    // These class-id lists match the website's "*_base" constraint ids.

    private static readonly HashSet<int> MartialClasses = new() { 43, 44, 51, 52, 53, 54, 55, 57, 58, 65, 66, 67, 68, 90, 103 };
    private static readonly HashSet<int> CasterClasses = new() { 45, 46, 47, 48, 49, 50, 56, 59, 60, 61, 62, 63, 64 };
    private static readonly HashSet<int> ShieldClasses = new() { 37, 38, 40, 41, 42 };

    /// <summary>Most sockets the item can hold: can be pushed past the base count: body armour 3, gloves / boots 2, one-handed weapons 2, two-handed weapons 3.</summary>
    public int MaxSockets(CraftItem item)
    {
        var baseSockets = Db.Items[item.BaseId].Sockets ?? 0;
        if (baseSockets == 0) return 0;
        return Math.Max(baseSockets, GroupOf(item) switch { 1 => 3, 2 or 3 or 7 => 2, 8 => 3, _ => 0 });
    }

    private int GroupOf(CraftItem item) => Db.GroupOfClass(item.ClassId);

    public bool IsMartial(CraftItem item) => MartialClasses.Contains(item.ClassId);
    public bool IsCaster(CraftItem item) => CasterClasses.Contains(item.ClassId);
    public bool IsArmour(CraftItem item) => GroupOf(item) is 1 or 2 or 3 or 4 || ShieldClasses.Contains(item.ClassId);
    private bool CanSocket(CraftItem item) => (Db.Items[item.BaseId].Sockets ?? 0) > 0;
    private static bool HasNoDesecration(CraftItem item) => item.Unrevealed.Count == 0 && !item.Mods.Any(m => m.Desecrated);

    // Abyssal bones are specific to item kinds.
    private bool JawboneBase(CraftItem i) => IsMartial(i) || IsCaster(i) || GroupOf(i) is 7 or 8 || i.ClassId == 36; // weapons, quivers
    private bool RibBase(CraftItem i) => IsArmour(i) || i.ClassId == 39;                                            // armour, foci
    private static bool CollarboneBase(CraftItem i) => i.ClassId is 33 or 34 or 35;                                 // rings, amulets, belts
    private bool CraniumBase(CraftItem i) => GroupOf(i) == 10;                                                      // jewels
    private bool VertebraeBase(CraftItem i) => GroupOf(i) == 13;                                                    // waystones

    // ---- constraints ----------------------------------------------------------------------------

    /// <summary>
    /// Constraint ids come straight from the game data's method tree, so each name here is a rule the
    /// data can reference. A method is usable only if every one of its constraints passes.
    /// </summary>
    private Dictionary<string, Func<CraftItem, bool>> BuildConstraints() => new()
    {
        // rarity
        ["rarity_normal"] = i => i.Rarity == Rarity.Normal,
        ["rarity_magic"] = i => i.Rarity == Rarity.Magic,
        ["rarity_rare"] = i => i.Rarity == Rarity.Rare,
        ["rarity_not_rare"] = i => i.Rarity != Rarity.Rare,
        ["rarity_not_normal"] = i => i.Rarity != Rarity.Normal,
        ["can_be_rare"] = _ => true,

        // state
        ["is_modifiable"] = i => !i.Corrupted,
        ["can_corrupt"] = i => !i.Corrupted && Db.Classes[i.ClassId].Corrupt != false,
        ["corruptable_base"] = i => !i.Corrupted,
        ["not_corrupted"] = i => !i.Corrupted,
        ["not_locked"] = i => !i.Locked,
        ["tablet_base"] = _ => false,
        ["not_strongbox"] = i => GroupOf(i) != 15,

        // slots and modifier counts
        ["open_affix"] = i => OpenSlotsOf(i).Any,
        ["minimum_1_explicit"] = i => ExplicitCount(i) >= 1,
        ["minimum_4_explicits"] = i => ExplicitCount(i) >= 4, // an unrevealed desecrated slot counts too
        ["no_fracture"] = i => !i.Mods.Any(m => m.Fractured),
        ["essence_base"] = _ => true,

        // quality and sockets
        ["weapon_quality_base"] = IsMartial,
        ["caster_quality_base"] = IsCaster,
        ["armour_quality_base"] = IsArmour,
        ["flask_base"] = i => GroupOf(i) == 9,
        ["ring_or_amulet_base"] = i => i.ClassId is 33 or 34,
        ["catalyst_base"] = i => !i.Corrupted && i.ClassId is 33 or 34 or 105,   // rings, amulets, Grasping Mail
        ["refined_catalyst_base"] = i => !i.Corrupted && GroupOf(i) == 10,       // jewels
        ["not_maximum_quality"] = i => i.Quality < MaxQuality,
        ["socketable_base"] = CanSocket,
        ["not_maximum_sockets"] = i => i.Sockets < MaxSockets(i),
        ["has_empty_socket"] = i => i.Socketed.Count < i.Sockets,

        // desecration
        ["desecration_base"] = i => JawboneBase(i) || RibBase(i) || CollarboneBase(i) || CraniumBase(i) || VertebraeBase(i),
        ["desecration_jawbone_base"] = JawboneBase,
        ["desecration_rib_base"] = RibBase,
        ["desecration_collarbone_base"] = CollarboneBase,
        ["desecration_cranium_base"] = CraniumBase,
        ["desecration_vertebrae_base"] = VertebraeBase,
        ["max_item_level_64"] = i => i.ItemLevel <= 64,
        ["not_desecrated"] = i => Context.Has("putrefaction") || HasNoDesecration(i),
        ["has_unrevealed"] = i => i.Unrevealed.Count > 0,
    };

    /// <summary>Requirements the data does not list but the game enforces.</summary>
    private static IEnumerable<string> ExtraConstraints(string? handler)
    {
        if (handler is null) return Array.Empty<string>();
        if (handler.StartsWith("spawn_", StringComparison.Ordinal)) return new[] { "not_corrupted" };
        return BaseHandler(handler) switch
        {
            "poe2_fracture" => new[] { "no_fracture" },      // only one fractured mod per item
            "poe2_vaal_infuser" => new[] { "not_corrupted" },
            "hinekora_lock" => new[] { "not_locked" },
            _ => Array.Empty<string>(),
        };
    }

    /// <summary>True when every constraint passes. An unknown constraint name fails (never silently passes).</summary>
    public bool CheckConstraints(CraftItem item, IEnumerable<string> constraints, string? handler = null) =>
        constraints.Concat(ExtraConstraints(handler))
            .All(name => _constraints.TryGetValue(name, out var check) && check(item));

    /// <summary>Faction omens (Sovereign / Liege / Blackblooded) only work on Weapon or Jewellery desecration.</summary>
    public bool FactionOmenApplies(CraftItem item) => JawboneBase(item) || CollarboneBase(item);
}
