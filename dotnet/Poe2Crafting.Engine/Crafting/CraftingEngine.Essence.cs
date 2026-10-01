using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

public sealed partial class CraftingEngine
{
    /// <summary>
    /// Essence kinds (Essence.Type): 0 Lesser, 1 Normal, 2 Greater work on MAGIC items and make them rare;
    /// 3 Perfect, 4 Corrupted and 5 Alloy work on RARE items and replace a random mod ("remove one, add the
    /// guaranteed one"). The replacing kinds produce a "crafted" mod, and an item may hold only one.
    /// </summary>
    public static bool EssenceReplaces(Essence essence) => essence.Type >= 3;

    /// <summary>
    /// The guaranteed mod an essence gives on this item: the highest tier the item level allows, falling back
    /// to the lowest tier if the item level is below all of them.
    /// </summary>
    public Mod? EssenceMod(CraftItem item, Essence essence)
    {
        var mods = Pools.EssenceModIds(essence.Id, item.ClassId)
            .Select(id => Db.Mods.GetValueOrDefault(id)).OfType<Mod>().ToList();
        return mods.Where(m => m.MinLevel <= item.ItemLevel).OrderByDescending(m => m.MinLevel).FirstOrDefault()
               ?? mods.OrderBy(m => m.MinLevel).FirstOrDefault();
    }

    /// <summary>Can this essence work on the item right now? (A UI would grey the button out otherwise.)</summary>
    public bool EssenceApplicable(CraftItem item, Essence essence)
    {
        var mod = EssenceMod(item, essence);
        if (mod is null) return false;
        var clash = item.Mods.Any(m => ModOf(m).Group == mod.Group);
        if (!EssenceReplaces(essence)) return item.Rarity == Rarity.Magic && !clash;
        return item.Rarity == Rarity.Rare && !CraftedFull(item);
    }

    private List<Change>? ApplyEssence(CraftItem item, CraftMethod method)
    {
        var essence = method.Essence ?? throw new ArgumentException("an essence method needs its Essence");
        var mod = EssenceMod(item, essence);
        if (mod is null || Pools.AffixOf(mod) is not { } kind) return null;

        if (!EssenceReplaces(essence))
        {
            // Lesser / Normal / Greater: Magic -> Rare, adding the guaranteed mod.
            if (item.Rarity != Rarity.Magic || item.Mods.Any(m => ModOf(m).Group == mod.Group)) return null;
            item.Rarity = Rarity.Rare;
            if (OpenSlotsOf(item).For(kind) <= 0) return null;
            var rolled = RollMod(mod);
            item.Mods.Add(rolled);
            return new List<Change> { Change.Added(rolled) };
        }

        // Perfect / Corrupted / Alloy: remove one mod (Crystallisation omens choose prefix/suffix), add the guaranteed one.
        if (item.Rarity != Rarity.Rare || CraftedFull(item)) return null;
        var filter = RemovalFilterFor("poe2_essence", essenceReplaces: true);

        // With no omen, if the essence's affix is already full the removal must free a slot of that affix.
        var removeKind = filter.Kind ?? (OpenSlotsOf(item).For(kind) > 0 ? (Affix?)null : kind);
        var gone = RemoveRandom(item, removeKind);
        if (gone is null) return null;

        if (item.Mods.Any(m => ModOf(m).Group == mod.Group) || OpenSlotsOf(item).For(kind) <= 0) return null;
        var crafted = RollMod(mod);
        crafted.Crafted = true;
        item.Mods.Add(crafted);
        return new List<Change> { gone, Change.Added(crafted) };
    }
}
