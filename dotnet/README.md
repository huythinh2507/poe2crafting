# PoE2 crafting engine in C#

This is the crafting **logic** of the web app (`public/js/engine.js` + `data.js`) written in C#, so you can read
and step through the rules in a typed, debuggable language. There is no UI here. The website keeps running the
JavaScript engine (that is what GitHub Pages hosts); this project is the same rules, kept honest by tests.

```
dotnet test dotnet/Poe2Crafting.Tests                 # 66 tests
dotnet run --project dotnet/Poe2Crafting.Cli          # a guided craft, printed step by step
dotnet run --project dotnet/Poe2Crafting.Cli -- 7     # same, different random seed
```

It reads the game data from `public/data` (the same files the website loads), so nothing is duplicated.

## Where to read

`Poe2Crafting.Engine/Crafting/CraftingEngine*.cs` is one class split into chapters. Read them in this order:

| File | What it answers |
|---|---|
| `CraftingEngine.cs` | Entry points: `TryCraft` (use a currency like a player), `ApplyMethod` (the raw rule), `Foresee` (Hinekora's Lock) |
| `CraftingEngine.Pools.cs` | *Which mod can roll right now?* Slots, item level, "Minimum Modifier Level" (Greater/Perfect orbs) |
| `CraftingEngine.Removal.cs` | Removing mods: Chaos, Annulment, **Whittling**, **Light**, which mods a Fracturing Orb may lock |
| `CraftingEngine.Constraints.cs` | "Can this currency be used on this item?" (rarity, open slots, 4 modifiers, ...) |
| `CraftingEngine.Currency.cs` | One method per currency: Transmutation, Augmentation, Regal, Alchemy, Chaos, Exalted, Annulment, Divine, Fracturing, Vaal, quality |
| `CraftingEngine.Essence.cs` | Essences and Alloys (the "crafted" mod limit) |
| `CraftingEngine.Socket.cs` | Runes, soul cores, meta runes, replacing a rune, socket-bound runes |
| `CraftingEngine.Desecration.cs` | Bones, unrevealed slots, the Well of Souls reveal, faction omens |
| `Crafting/CraftContext.cs` | The omen catalogue and the armed-omen state, plus the random number generator |

Supporting types: `CraftItem.cs` (the item state), `CraftMethod.cs` (a currency, built from the game data),
`Data/` (loading `data.json` and the weighted mod pools).

## Ideas worth knowing before you read

- **Mod vs tier vs mod level.** A *mod* is one tier of a family ("Life tier 3"). Tier 1 is the best. The *mod level*
  (`Mod.MinLevel`) is the required level of that tier. **Whittling compares mod level, not tier.**
- **Pools.** The data has one big table of "mod id -> weight" per class, mixing several pools. A mod group's
  `Influence` number separates them: `6` = normal, `1000` = desecrated Lich mods, `1002-1007` = pools unlocked by meta
  runes. `ModPools.PoolFor` is the only place that reads this.
- **Class id vs class enum.** Essences and socketables are keyed by the item class *enum* (Wand, Talisman, ...), not by
  the class id. They collide (id 4 is Body Armours, enum 4 is Amulet), so always go through `Db.ClassEnum`.
- **Minimum Modifier Level never removes a mod type.** If no tier of a mod reaches the minimum, its highest tier
  stays in the pool (`ApplyMinLevel`). GGG confirmed this.
- **An unrevealed desecrated slot** takes up an affix slot, counts toward the 4-mod minimum for the Fracturing Orb,
  counts as mod level 1 for Whittling, and cannot be fractured. Once revealed, a desecrated mod is an ordinary
  fracture candidate.
- **Omens** are armed in `CraftContext` and consumed by the *next* use of the currency they target
  (`TryCraft` does this). Armed omens change what `RemovalFilterFor` / `AddOptionsFor` return.
- **Handlers.** Greater/Perfect orbs share the basic orb's rule; only `CraftMethod.MinModLevel` differs.
  `BaseHandler("poe2_chaos_perfect") == "poe2_chaos"`.

## Differences from the JavaScript version (on purpose)

- `ApplyMethod` is transactional: if a rule gives up half way, the item is restored. In JS the app did that.
- Hinekora's Lock lives in the engine: a foreseen outcome is remembered on the item, so previewing twice gives the same
  answer and using the currency does exactly that. In JS the UI cached it.
- `TryCraft` does constraint checking, Foresight, omen consumption in one call. In JS the UI did those steps.

## Honest limits

- GGG publishes no desecration weights. The Well of Souls pool is `DesecrationSettings` (Lich mods share one weight,
  normal mods optionally join in). It is an assumption, flagged in the code.
- Not simulated: Omen of Catalysing Exaltation and Omen of Sanctification (real omens, listed as `NotSimulated`);
  transform runes only affect resistances because the data defines no other equivalents.
- Orb of Chance, Scroll of Wisdom, Mirror of Kalandra and extraction are out of scope.
