using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;

// A guided tour of the engine: craft a Maji Talisman step by step and print what happens.
//   dotnet run --project dotnet/Poe2Crafting.Cli           (seed 42)
//   dotnet run --project dotnet/Poe2Crafting.Cli -- 7       (any other seed)

var seed = args.Length > 0 && int.TryParse(args[0], out var s) ? s : 42;
var db = GameDatabase.LoadFromRepo();
var methods = new MethodCatalogue(db);
var engine = new CraftingEngine(db, new CraftContext(seed));
var item = engine.NewItem(db.BaseByName("Maji Talisman"), 100);
item.Sockets = 2;

Console.WriteLine($"Crafting a Maji Talisman (item level 100), random seed {seed}\n");
Show();

Use("Orb of Alchemy", "Alchemy: Normal -> Rare with 4 random mods.");
Use("Fracturing Orb", "Fracturing: locks one random mod forever. Needs 4 mods.");
Console.WriteLine($"  (the fractured mod is safe from Chaos, Annulment and essences)\n");

Console.WriteLine("-- Desecration -------------------------------------------------------------");
Use("Preserved Jawbone", "A bone adds an UNREVEALED desecrated slot (weapons use Jawbones).");
var slot = item.Unrevealed[0];
Console.WriteLine($"  Well of Souls offers three options for the unrevealed {slot.Affix.ToString().ToLower()}:");
var options = engine.RevealOptions(item, slot);
var chances = engine.DesecratedChances(item, slot);
foreach (var option in options)
{
    var share = chances.First(c => c.Entry.Mod.Id == option.Mod.Id).Chance;
    Console.WriteLine($"    - {string.Join(" / ", engine.ModLines(option.Mod)),-62} {(option.IsLich ? option.Faction + " (Lich)" : "normal"),-16} {share:P1} per draw");
}
engine.RevealMod(item, 0, options[0]);
Console.WriteLine($"  You pick the first one.\n");
Show();

Console.WriteLine("-- Omens: Whittling ----------------------------------------------------------");
engine.Context.ToggleOmen("whittling");
var targets = engine.RemovalPool(item, new RemovalFilter(Whittle: true));
Console.WriteLine("  Omen of Whittling armed. Chaos Orb will remove the LOWEST mod level (not tier):");
foreach (var t in targets)
    Console.WriteLine($"    target: {(t.Mod is null ? "unrevealed slot" : string.Join(" / ", engine.ModLines(t.Mod)))}  (mod level {t.Level})");
Use("Chaos Orb", "Chaos: remove one mod (the Whittling target), add one.");
Console.WriteLine($"  Omen consumed: {(engine.Context.Has("whittling") ? "no" : "yes")}\n");
Show();

Console.WriteLine("-- Hinekora's Lock: see the result first ---------------------------------------");
Use("Hinekora's Lock", "Lock armed.");
var preview = engine.Foresee(item, methods.ByName("Divine Orb"))!;
Console.WriteLine($"  Foreseen Divine Orb result: {preview.Changes.Count} values rerolled (nothing changed yet)");
var done = engine.TryCraft(item, methods.ByName("Divine Orb"));
Console.WriteLine($"  Used for real: the item now matches the preview exactly: {done.Success}\n");
Show();

void Use(string name, string explanation)
{
    var method = methods.ByName(name);
    Console.WriteLine($"> {name}: {explanation}");
    var result = engine.TryCraft(item, method);
    if (!result.Success) { Console.WriteLine($"  could not be used: {result.Failure}"); return; }
    foreach (var change in result.Changes)
    {
        var what = change.Mod is not null ? string.Join(" / ", engine.ModLines(change.Mod)) : change.Text;
        Console.WriteLine($"  {change.Op,-9} {what}");
    }
}

void Show()
{
    Console.WriteLine($"  [{item.Rarity}] sockets {item.Socketed.Count}/{item.Sockets}  quality {item.Quality}%  {(item.Corrupted ? "CORRUPTED" : "")}");
    foreach (var mod in item.Mods)
    {
        var flags = string.Concat(mod.Fractured ? " [fractured]" : "", mod.Desecrated ? " [desecrated]" : "", mod.Crafted ? " [crafted]" : "");
        var affix = engine.Pools.AffixOf(db.Mods[mod.ModId])?.ToString().ToLower();
        Console.WriteLine($"    {affix,-6} {string.Join(" / ", engine.ModLines(mod))}{flags}");
    }
    foreach (var slotLeft in item.Unrevealed) Console.WriteLine($"    {slotLeft.Affix.ToString().ToLower(),-6} (unrevealed desecrated slot)");
    Console.WriteLine();
}
