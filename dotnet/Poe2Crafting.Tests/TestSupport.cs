using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Tests;

/// <summary>Shared helpers: the game data is loaded once, each test gets its own seeded engine.</summary>
public static class T
{
    public static readonly GameDatabase Db = GameDatabase.LoadFromRepo();
    public static readonly MethodCatalogue Methods = new(Db);

    // Class ids used throughout (see data.json "classes").
    public const int BodyArmourStr = 4;
    public const int Gloves = 19;       // Gloves (INT)
    public const int OneHandSword = 54;
    public const int Talisman = 90;
    public const int Wand = 45;

    public static CraftingEngine Engine(int seed = 1) => new(Db, new CraftContext(seed));

    public static CraftItem Item(CraftingEngine e, int classId, Rarity rarity = Rarity.Rare, int level = 100)
    {
        var item = e.NewItem(Db.BasesOfClass(classId).Last(), level);
        item.Rarity = rarity;
        return item;
    }

    /// <summary>Put specific mods on an item: for each (affix, level) the first pool mod of that affix and level, no repeated groups.</summary>
    public static CraftItem WithMods(CraftingEngine e, int classId, params (Affix Affix, int Level)[] spec)
    {
        var item = Item(e, classId);
        var used = new HashSet<int>();
        foreach (var (affix, level) in spec)
        {
            var entry = e.Pools.ClassPool(classId).First(p => p.Affix == affix && p.Mod.MinLevel == level && !used.Contains(p.Mod.Group));
            used.Add(entry.Mod.Group);
            item.Mods.Add(e.RollMod(entry.Mod));
        }
        return item;
    }

    /// <summary>Distinct mod levels available for an affix on a class, ascending.</summary>
    public static int[] Levels(CraftingEngine e, int classId, Affix affix) =>
        e.Pools.ClassPool(classId).Where(p => p.Affix == affix).Select(p => p.Mod.MinLevel).Distinct().OrderBy(x => x).ToArray();

    public static CraftMethod M(string handler) => Methods.Find(handler);

    public static int LevelOf(CraftingEngine e, ModInstance m) => e.Db.Mods[m.ModId].MinLevel;
    public static Affix? AffixOf(CraftingEngine e, ModInstance m) => e.Pools.AffixOf(e.Db.Mods[m.ModId]);
    public static string KeyOf(CraftingEngine e, ModInstance m) => e.Db.Mods[m.ModId].Key;

    /// <summary>A 4-mod rare with mixed levels, like the JS tests build.</summary>
    public static CraftItem FourMods(CraftingEngine e, int classId = BodyArmourStr)
    {
        var p = Levels(e, classId, Affix.Prefix);
        var s = Levels(e, classId, Affix.Suffix);
        return WithMods(e, classId, (Affix.Prefix, p[1]), (Affix.Prefix, p[4]), (Affix.Suffix, s[2]), (Affix.Suffix, s[6]));
    }
}
