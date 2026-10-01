using System.Text.Json;
using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

/// <summary>
/// One way of crafting: a currency, an essence, a socketable, a bone, ... The <see cref="Handler"/> string
/// picks the rule that runs ("poe2_chaos"); Greater/Perfect tiers share a handler and only differ in
/// <see cref="MinModLevel"/>. <see cref="Constraints"/> are the conditions the item must meet first.
/// </summary>
public sealed class CraftMethod
{
    public required string Handler { get; init; }
    public required string Name { get; init; }

    /// <summary>"Minimum Modifier Level" of Greater (35/44) and Perfect (50/70) orbs; 0 for the basic ones.</summary>
    public int MinModLevel { get; init; }

    /// <summary>Gate checks (rarity, open affix, ...). See CraftingEngine.Constraints for the full list.</summary>
    public IReadOnlyList<string> Constraints { get; init; } = Array.Empty<string>();

    // Payload for the methods that carry data.
    public Essence? Essence { get; init; }
    public Socketable? Socket { get; init; }

    /// <summary>Which socket to put an augment in (null = first empty one; a filled socket is only replaced when named).</summary>
    public int? Slot { get; init; }

    public CraftMethod WithSlot(int slot) => new()
    {
        Handler = Handler, Name = Name, MinModLevel = MinModLevel, Constraints = Constraints,
        Essence = Essence, Socket = Socket, Slot = slot,
    };

    public override string ToString() => Name;
}

/// <summary>
/// Builds <see cref="CraftMethod"/>s from the data's method tree, so the engine uses exactly the same
/// constraints and minimum levels as the data (and the website). The tree is nested: a method
/// ("Currencies") contains currencies ("Orb of Transmutation") that contain tiers (basic / Greater / Perfect),
/// and constraints accumulate down the tree.
/// </summary>
public sealed class MethodCatalogue
{
    private readonly List<CraftMethod> _methods = new();
    private readonly GameDatabase _db;

    public IReadOnlyList<CraftMethod> All => _methods;

    public MethodCatalogue(GameDatabase db)
    {
        _db = db;
        foreach (var top in db.Raw.Methods.Crafting.EnumerateArray())
        {
            var label = top.GetProperty("label").GetString();
            if (label is not ("Currencies" or "Generate" or "Desecrate" or "Catalysts" or "Refined Catalysts")) continue;
            var inherited = ReadConstraints(top);
            if (top.TryGetProperty("elements", out var elements) && elements.ValueKind == JsonValueKind.Array)
                Walk(elements, inherited);
        }

        // Not in the site's method data: added by hand, mirroring the JS app.
        _methods.Add(new CraftMethod { Handler = "hinekora_lock", Name = "Hinekora's Lock", Constraints = new[] { "is_modifiable" } });
    }

    private void Walk(JsonElement elements, IReadOnlyList<string> inherited)
    {
        foreach (var node in elements.EnumerateArray())
        {
            var constraints = inherited.Concat(ReadConstraints(node)).ToList();
            if (node.TryGetProperty("handler", out var handlerProp))
            {
                var handler = handlerProp.GetString()!;
                var item = node.TryGetProperty("item", out var itemProp) && itemProp.ValueKind == JsonValueKind.Number ? itemProp.GetInt32() : (int?)null;
                var name = item is int id ? _db.ItemName(id) : handler switch
                {
                    "spawn_normal_item" => "Normal item",
                    "spawn_magic_item" => "Magic item",
                    "spawn_rare_item" => "Rare item",
                    _ => handler,
                };
                _methods.Add(new CraftMethod { Handler = handler, Name = name, MinModLevel = ReadMinModLevel(node), Constraints = constraints });
            }
            if (node.TryGetProperty("elements", out var children) && children.ValueKind == JsonValueKind.Array)
                Walk(children, constraints);
        }
    }

    private static List<string> ReadConstraints(JsonElement node) =>
        node.TryGetProperty("constraints", out var c) && c.ValueKind == JsonValueKind.Array
            ? c.EnumerateArray().Select(x => x.GetString()!).ToList()
            : new List<string>();

    private static int ReadMinModLevel(JsonElement node)
    {
        if (node.TryGetProperty("properties", out var props) && props.ValueKind == JsonValueKind.Array)
            foreach (var p in props.EnumerateArray())
                if (p.GetProperty("key").GetString() == "min_mod_level") return p.GetProperty("value").GetInt32();
        return 0;
    }

    /// <summary>Find a method by handler, e.g. Find("poe2_chaos") or Find("poe2_chaos_perfect").</summary>
    public CraftMethod Find(string handler) =>
        _methods.FirstOrDefault(m => m.Handler == handler) ?? throw new KeyNotFoundException($"No method with handler '{handler}'");

    /// <summary>Find the bone/currency by display name, e.g. "Perfect Orb of Transmutation", "Preserved Jawbone".</summary>
    public CraftMethod ByName(string name) =>
        _methods.FirstOrDefault(m => m.Name == name) ?? throw new KeyNotFoundException($"No method named '{name}'");

    /// <summary>An essence as a craft method (Lesser/Greater work on magic items, Perfect/Corrupted/Alloy on rares).</summary>
    public CraftMethod ForEssence(Essence essence) => new()
    {
        Handler = "poe2_essence", Name = _db.Text(essence.Label), Essence = essence,
        Constraints = new[] { "is_modifiable", essence.Type <= 2 ? "rarity_magic" : "rarity_rare" },
    };

    /// <summary>A rune / soul core / idol as a craft method.</summary>
    public CraftMethod ForSocketable(Socketable socketable, int? slot = null) => new()
    {
        Handler = "poe2_socketable", Name = _db.ItemName(socketable.Item), Socket = socketable,
        Constraints = new[] { "socketable_base" }, Slot = slot,
    };
}
