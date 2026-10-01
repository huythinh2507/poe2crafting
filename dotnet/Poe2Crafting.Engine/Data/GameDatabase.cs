using System.Text.Json;
using System.Text.RegularExpressions;

namespace Poe2Crafting.Engine.Data;

/// <summary>
/// Loads data.json + english.json and indexes them by id. Everything else in the engine reads game
/// facts (mods, classes, essences, ...) through this class; it never changes after loading.
/// </summary>
public sealed partial class GameDatabase
{
    public RawData Raw { get; }
    public IReadOnlyDictionary<int, ItemClass> Classes { get; }
    public IReadOnlyDictionary<int, BaseItem> Items { get; }
    public IReadOnlyDictionary<int, Mod> Mods { get; }
    public IReadOnlyDictionary<int, ModGroup> Groups { get; }
    private readonly string[] _english;

    private GameDatabase(RawData raw, string[] english)
    {
        Raw = raw;
        _english = english;
        Classes = raw.Classes.Entries.ToDictionary(c => c.Id);
        Items = raw.Items.Entries.ToDictionary(i => i.Id);
        Mods = raw.Mods.Entries.ToDictionary(m => m.Id);
        Groups = raw.ModGroups.Entries.ToDictionary(g => g.Id);
    }

    /// <summary>Load from a folder that contains data.json and english.json (the repo's public/data).</summary>
    public static GameDatabase Load(string dataDirectory)
    {
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawData>(File.ReadAllText(Path.Combine(dataDirectory, "data.json")), options)
                  ?? throw new InvalidDataException("data.json is empty");
        var english = JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(dataDirectory, "english.json")), options)
                      ?? throw new InvalidDataException("english.json is empty");
        return new GameDatabase(raw, english);
    }

    /// <summary>
    /// Walks up from a starting folder until it finds public/data/data.json. Handy for tests and the
    /// demo, which can be started from anywhere inside the repo.
    /// </summary>
    public static GameDatabase LoadFromRepo(string? startDirectory = null)
    {
        var dir = new DirectoryInfo(startDirectory ?? AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "public", "data");
            if (File.Exists(Path.Combine(candidate, "data.json"))) return Load(candidate);
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not find public/data/data.json above " + (startDirectory ?? AppContext.BaseDirectory));
    }

    // --- text ---------------------------------------------------------------------------------

    [GeneratedRegex(@"\[([^\]|]*)\|([^\]]*)\]")] private static partial Regex PipeMarkup();
    [GeneratedRegex(@"\[([^\]]*)\]")] private static partial Regex PlainMarkup();

    /// <summary>
    /// Resolve a label index to text and strip the game's link markup: "[Armour|Armour]" and
    /// "[Armour]" both become "Armour" (for the pipe form the second part is what is shown).
    /// </summary>
    public string Text(int? label)
    {
        if (label is null || label < 0 || label >= _english.Length) return "";
        var s = PipeMarkup().Replace(_english[label.Value], "$2");
        return PlainMarkup().Replace(s, "$1");
    }

    // --- convenience lookups -----------------------------------------------------------------

    public string ModName(Mod mod) => Text(mod.Label);
    public string ItemName(int itemId) => Items.TryGetValue(itemId, out var i) ? Text(i.Label) : "";

    /// <summary>Droppable equipment bases of a class, lowest level first.</summary>
    public IEnumerable<BaseItem> BasesOfClass(int classId) =>
        Raw.Items.Entries
            .Where(i => i.ClassId == classId && i.Domain == 1 && (i.DropLevel ?? 0) > 0)
            .OrderBy(i => i.DropLevel).ThenBy(i => Text(i.Label), StringComparer.Ordinal);

    /// <summary>Find a base item by exact name, e.g. "Runeforged Warlord Cuirass".</summary>
    public BaseItem BaseByName(string name) =>
        Raw.Items.Entries.FirstOrDefault(i => i.Domain == 1 && Text(i.Label) == name)
        ?? throw new KeyNotFoundException($"No base item called '{name}'");

    public Essence EssenceByName(string name) =>
        Raw.Essences.Entries.FirstOrDefault(e => Text(e.Label) == name)
        ?? throw new KeyNotFoundException($"No essence called '{name}'");

    public Socketable SocketableByName(string name) =>
        Raw.Socketables.Entries.FirstOrDefault(s => ItemName(s.Item) == name)
        ?? throw new KeyNotFoundException($"No socketable called '{name}'");

    public int ClassEnum(int classId) => Classes.TryGetValue(classId, out var c) ? c.ClassEnum : -1;
    public int GroupOfClass(int classId) => Classes.TryGetValue(classId, out var c) ? c.Group : -1;
}
