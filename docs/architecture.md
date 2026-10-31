# How the code is laid out

The game is split into **rules** (plain TypeScript, no DOM or three.js, testable headless) and
**screens** (DOM and three.js, which call the rules and draw the result). Keep that line sharp:
anything that decides what happens in the game belongs in the rules, so the tests and the sims in
`scripts/` see it too.

```
src/
  main.ts            the geoscape screen: globe, command panel, clock; wires up the panels
  campaign/          campaign rules: the war, its people and its stores (no DOM)
  geoscape/          the world: geography, sun, biomes, blocs, cities; globe rendering
  base/              base rules (rooms.ts, layout.ts) and the base screen (screen.ts, baseView.ts)
  tactical/          battle rules (rules, map, battle, aliens, autoplay...) and battle rendering
  combat.ts          the combat screen
  ui/                shared screen code: DOM helpers, panels, fights started from the globe
  data/              generated map data (npm run build:geo)
tests/               vitest, one file per system
scripts/             headless sims that play the real rules (sim-food, sim-autoplay)
```

## Which layer imports which

```
ui/, main.ts, combat.ts, base/screen.ts   screens
        │
campaign/                                 the campaign as a whole
        │
base/ rules, tactical/ rules, geoscape/ data and maths
```

Arrows point down only. Rules never import a screen, and `base/` and `tactical/` don't import from
`campaign/` (one exception today: `tactical/prologue.ts` uses the armoury's kit types). If two
modules need the same constant, it lives in the lower one.

## The campaign

`campaign/campaign.ts` holds the `Campaign` class: one clock, one purse, every base, person, run
and call, and the save format. The rules for each system live in their own module beside it, as
plain functions and tables the class calls:

| Module | What it holds |
| --- | --- |
| `staff.ts` | people, jobs, build skill, research projects |
| `allocation.ts` | duties, and how firmly someone is held to them |
| `armoury.ts` | guns, armour, kit, loadout requests, the quartermaster |
| `scavenge.ts` | supplies, places, runs, the black market |
| `recruit.ts` | candidates, what they want, promises and loyalty |
| `sightings.ts` | sighting calls, travel, cars and fuel |

The save is versioned (`SavedCampaign` in campaign.ts). New fields are optional and `Campaign.load`
fills them in for older saves, so a player's war is never thrown away.

## Adding a feature

A new campaign system (say, interceptions):

1. Put its rules and tables in a new `campaign/<system>.ts`, as pure functions that take dice
   (`rand: () => number`) instead of calling `Math.random`, so tests can fix them.
2. Give `Campaign` the state and the actions the player can take (`checkX` returning a reason it
   can't be done or `null`, then `x` to do it). Advance it from `advanceTo`/`workDay` if it moves
   with the clock.
3. Add the state to `SavedCampaign` as an optional field and load it with a default.
4. Write `tests/<system>.test.ts`.
5. Add a panel for it (below).

A new panel on the geoscape:

1. Add its button to the command panel and its modal to `index.html`, following the others.
2. Write `ui/panels/<name>.ts` exporting a function that takes the `Ui` and returns a `PanelSpec`:
   the element ids, `draw()` to fill it in, and `summary()` for the line beside its button.
   Helpers for lists, segmented buttons, "who goes" tick lists and send buttons are in `ui/dom.ts`
   and `ui/people.ts`.
3. Add it to the `panels` list in `main.ts`. It then opens, closes and redraws with the rest.

After any change to the campaign, a panel calls `ui.persist()` and then `ui.refresh()`, which
redraws the command panel and whichever panel is open.

A new kind of fight: the battle setups live in `tactical/prologue.ts` (`startPrologue`,
`startAmbush`); `ui/fights.ts` starts them from the globe and hands the result back to the campaign.

## Checks

```sh
npm run typecheck && npm test && npm run build
npx vite-node scripts/sim-food.ts       # food against headcount
npx vite-node scripts/sim-autoplay.ts   # autoplay doctrines against the aliens
```

A refactor shouldn't change what the sims print for the same seeds.
