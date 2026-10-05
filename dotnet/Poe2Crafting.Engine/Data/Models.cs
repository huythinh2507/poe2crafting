using System.Text.Json;
using System.Text.Json.Serialization;

namespace Poe2Crafting.Engine.Data;

// ----------------------------------------------------------------------------------------------
// These types mirror the shape of Craft of Exile's data.json (the game data this project uses).
// Only the fields the crafting rules need are mapped; everything else in the file is ignored.
//
// The file is "compact": strings are not stored inline but as an index into english.json
// (the `Label` fields below), so GameDatabase.Text(label) is how you get readable text.
// ----------------------------------------------------------------------------------------------

/// <summary>A list wrapper: every top-level block in data.json looks like { "entries": [...] }.</summary>
public sealed class Block<T>
{
    [JsonPropertyName("entries")] public List<T> Entries { get; set; } = new();
}

/// <summary>An item class such as "Body Armours (STR)" or "One Hand Swords".</summary>
public sealed class ItemClass
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("label")] public int? Label { get; set; }

    /// <summary>The item group (1 = body armour, 7 = one-handed weapon, 8 = two-handed weapon, ...).</summary>
    [JsonPropertyName("group")] public int Group { get; set; }

    /// <summary>
    /// The item class *enum* (Wand, Dagger, Body Armour, Talisman, ...). Essence and socketable data
    /// are keyed by this, NOT by <see cref="Id"/>. Several values collide (class id 4 is "Body Armours
    /// (STR)" but enum 4 is "Amulet"), so always convert before looking those tables up.
    /// </summary>
    [JsonPropertyName("class")] public int ClassEnum { get; set; }

    [JsonPropertyName("corrupt")] public bool? Corrupt { get; set; }
}

/// <summary>A base item such as "Runeforged Warlord Cuirass" (also currency, essences, omens, ...).</summary>
public sealed class BaseItem
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("key")] public string Key { get; set; } = "";
    [JsonPropertyName("label")] public int? Label { get; set; }

    /// <summary>Id of the <see cref="ItemClass"/> this base belongs to.</summary>
    [JsonPropertyName("class")] public int? ClassId { get; set; }

    /// <summary>Drop level (0 / null for things that are not droppable equipment).</summary>
    [JsonPropertyName("drop")] public int? DropLevel { get; set; }

    /// <summary>Implicit modifier ids this base always has.</summary>
    [JsonPropertyName("implicits")] public List<int>? Implicits { get; set; }

    /// <summary>Domain 1 = ordinary equipment.</summary>
    [JsonPropertyName("domain")] public int Domain { get; set; }

    [JsonPropertyName("sockets")] public int? Sockets { get; set; }
    [JsonPropertyName("image")] public string? Image { get; set; }

    /// <summary>Base stats: physical_damage_min / max, critical_strike_chance (x100), attack_time (ms), range (x10), armour, evasion, energyshield, ward, block, spirit.</summary>
    [JsonPropertyName("props")] public JsonElement Props { get; set; }   // an object, or `[]` / null when the base has none

    /// <summary>A numeric base stat by name, or null when the base does not have it.</summary>
    public double? Prop(string key) =>
        Props.ValueKind == JsonValueKind.Object && Props.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    /// <summary>Ids into the `skills` block: the skill a wand / staff / sceptre grants.</summary>
    [JsonPropertyName("skills")] public List<int>? Skills { get; set; }
}

/// <summary>A game stat (the key is the stat index mods refer to): its id such as "local_attack_speed_+%".</summary>
public sealed class StatDef
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
}

public sealed class SkillEntry
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("item")] public int Item { get; set; }
}

/// <summary>One row of the item level to granted skill level table (`skills.scaling`).</summary>
public sealed class SkillScaling
{
    [JsonPropertyName("item")] public int Item { get; set; }
    [JsonPropertyName("gem")] public int Gem { get; set; }
}

public sealed class SkillBlock
{
    [JsonPropertyName("entries")] public List<SkillEntry> Entries { get; set; } = new();
    [JsonPropertyName("scaling")] public List<SkillScaling> Scaling { get; set; } = new();
}

/// <summary>One base from public/data/weapon-bases.json (scraped from poe2db): its damage split into physical + elemental.</summary>
public sealed class WeaponBaseRef
{
    [JsonPropertyName("damage")] public Dictionary<string, double[]?> Damage { get; set; } = new();
}

/// <summary>One stat line of a modifier, e.g. "+# to maximum Life" with a value range.</summary>
public sealed class ModStat
{
    [JsonPropertyName("label")] public int? Label { get; set; }

    /// <summary>Which game stat this line is (see RawData.Stats): "local_attack_speed_+%", "base_maximum_life", ...</summary>
    [JsonPropertyName("index")] public int? Index { get; set; }

    [JsonPropertyName("range")]
    [JsonConverter(typeof(RangeConverter))]
    public double[] Range { get; set; } = { 0, 0 };
}

/// <summary>
/// One tier of a modifier. "Life tier 3" and "Life tier 4" are two <see cref="Mod"/>s that share a
/// <see cref="Group"/>; an item can hold at most one mod per group.
/// </summary>
public sealed class Mod
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("key")] public string Key { get; set; } = "";

    /// <summary>The mod's name, e.g. "of the Brute" (a suffix) or "Hale" (a prefix).</summary>
    [JsonPropertyName("label")] public int? Label { get; set; }

    [JsonPropertyName("group")] public int Group { get; set; }

    /// <summary>The "mod level": the minimum item level for the mod to roll. Whittling compares this.</summary>
    [JsonPropertyName("minlvl")] public int MinLevel { get; set; }

    [JsonPropertyName("stats")] public List<ModStat> Stats { get; set; } = new();
}

/// <summary>
/// A family of mod tiers. <see cref="Type"/> says what kind of mod it is and <see cref="Influence"/>
/// says which pool it belongs to (see <see cref="Poe2Crafting.Engine.Data.ModPools"/>).
/// </summary>
public sealed class ModGroup
{
    [JsonPropertyName("id")] public int Id { get; set; }

    /// <summary>1 = prefix, 2 = suffix, 5 = Vaal corruption enchant, others = implicit / special.</summary>
    [JsonPropertyName("type")] public int Type { get; set; }

    [JsonPropertyName("tags")] public List<int> Tags { get; set; } = new();
    [JsonPropertyName("influence")] public int Influence { get; set; }
}

public sealed class Tag
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("key")] public string Key { get; set; } = "";
}

/// <summary>`mods` block: the entries plus the fire/cold/lightning equivalence tables.</summary>
public sealed class ModBlock
{
    [JsonPropertyName("entries")] public List<Mod> Entries { get; set; } = new();

    /// <summary>tag id -> tier-aligned mod ids (only resistances are defined in the data).</summary>
    [JsonPropertyName("equivalencies")] public Dictionary<string, List<int>> Equivalencies { get; set; } = new();
}

public sealed class Essence
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("item")] public int Item { get; set; }
    [JsonPropertyName("label")] public int? Label { get; set; }

    /// <summary>0 Lesser, 1 Normal, 2 Greater, 3 Perfect, 4 Corrupted, 5 Alloy.</summary>
    [JsonPropertyName("type")] public int Type { get; set; }
}

public sealed class EssenceBlock
{
    [JsonPropertyName("entries")] public List<Essence> Entries { get; set; } = new();

    /// <summary>essence id -> class ENUM -> the guaranteed mod ids for that class.</summary>
    [JsonPropertyName("byessences")] public Dictionary<string, Dictionary<string, List<int>>> ByEssence { get; set; } = new();
}

/// <summary>What a socketable does on one kind of item.</summary>
public sealed class SocketStat
{
    [JsonPropertyName("index")] public int Index { get; set; }

    /// <summary>The "increased effect of socketed ..." bonus scales this stat.</summary>
    [JsonPropertyName("scaling")] public bool Scaling { get; set; }

    [JsonPropertyName("output")] public int Output { get; set; }

    [JsonPropertyName("range")]
    [JsonConverter(typeof(RangeConverter))]
    public double[] Range { get; set; } = { 0, 0 };
}

/// <summary>A rune, soul core, idol or abyssal eye.</summary>
public sealed class Socketable
{
    [JsonPropertyName("item")] public int Item { get; set; }
    [JsonPropertyName("classify")] public List<string> Classify { get; set; } = new();

    // Effects by item kind. A rune usually defines a few of these.
    [JsonPropertyName("martial")] public SocketStat? Martial { get; set; }
    [JsonPropertyName("armour")] public SocketStat? Armour { get; set; }
    [JsonPropertyName("caster")] public SocketStat? Caster { get; set; }
    [JsonPropertyName("all")] public SocketStat? All { get; set; }

    /// <summary>Effects for specific item classes, keyed by class ENUM (as a string).</summary>
    [JsonPropertyName("class")] public Dictionary<string, SocketStat>? ByClass { get; set; }

    /// <summary>Index into <see cref="MethodsBlock.Socketables"/>.Limits (how many of this kind per item), or null.</summary>
    [JsonPropertyName("limit")] public int? Limit { get; set; }

    /// <summary>Socket-bound: once socketed it can never be removed or replaced.</summary>
    [JsonPropertyName("bound")] public bool Bound { get; set; }
}

public sealed class SocketLimit
{
    [JsonPropertyName("number")] public int Number { get; set; }
}

public sealed class SocketMethods
{
    [JsonPropertyName("limits")] public List<SocketLimit> Limits { get; set; } = new();
}

public sealed class MethodsBlock
{
    /// <summary>The crafting-method tree (currencies, essences, bones, ...). Kept as raw JSON; see <see cref="Crafting.MethodCatalogue"/>.</summary>
    [JsonPropertyName("crafting")] public JsonElement Crafting { get; set; }

    [JsonPropertyName("socketables")] public SocketMethods Socketables { get; set; } = new();
}

/// <summary>The whole data.json.</summary>
public sealed class RawData
{
    [JsonPropertyName("classes")] public Block<ItemClass> Classes { get; set; } = new();
    [JsonPropertyName("items")] public Block<BaseItem> Items { get; set; } = new();
    [JsonPropertyName("mods")] public ModBlock Mods { get; set; } = new();
    [JsonPropertyName("modgroups")] public Block<ModGroup> ModGroups { get; set; } = new();
    [JsonPropertyName("tags")] public Block<Tag> Tags { get; set; } = new();
    [JsonPropertyName("skills")] public SkillBlock Skills { get; set; } = new();

    /// <summary>stat index -> definition (only the id is read).</summary>
    [JsonPropertyName("stats")] public Dictionary<string, StatDef> Stats { get; set; } = new();
    [JsonPropertyName("essences")] public EssenceBlock Essences { get; set; } = new();
    [JsonPropertyName("socketables")] public Block<Socketable> Socketables { get; set; } = new();
    [JsonPropertyName("methods")] public MethodsBlock Methods { get; set; } = new();

    /// <summary>class id -> (mod id -> spawn weight). This is the main "what can roll on this class" table.</summary>
    [JsonPropertyName("classmods")] public Dictionary<string, Dictionary<string, double>> ClassMods { get; set; } = new();
}

/// <summary>
/// Value ranges are normally `[min, max]`, but one stat in the data has `false`; treat anything that
/// is not a two-number array as `[0, 0]` instead of failing the whole load.
/// </summary>
public sealed class RangeConverter : JsonConverter<double[]>
{
    public override double[] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.StartArray)
        {
            reader.Skip();
            return new double[] { 0, 0 };
        }

        var values = new List<double>();
        while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
        {
            if (reader.TokenType == JsonTokenType.Number) values.Add(reader.GetDouble());
            else reader.Skip();
        }
        return values.Count >= 2 ? new[] { values[0], values[1] } : new double[] { 0, 0 };
    }

    public override void Write(Utf8JsonWriter writer, double[] value, JsonSerializerOptions options)
    {
        writer.WriteStartArray();
        foreach (var v in value) writer.WriteNumberValue(v);
        writer.WriteEndArray();
    }
}
