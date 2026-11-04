# Perks

Step 4b of the attributes plan. Mike chose (2026-11-04): a random offer of three that fit what the
person has done, and the player picks one. Code: `tactical/perks.ts` (the list),
`campaign/perks.ts` (offers), effects next to the numbers they change (`tactical/attributes.ts`,
`tactical/battle.ts`).

## When

Perks come from learning by doing. Each point someone learns counts (scars don't take points away).
Offers come at 8, 24, 48, 80, 120… points: the gap grows by 8 each time. Roughly, a reservist
gets a first offer after 4 ordinary fights and a second after 12; a year of building earns 1 or 2.

One offer waits at a time, on the staff screen (the Staff button says how many are waiting). If
they have already earned the next one, it comes as soon as the first is picked.

## Which three

Each perk is weighted by how well it fits their service record, plus 0.3 so anything can turn up:
aimed shots for Marksman, medikit uses for Field medic, people met for Silver tongue, days building
for Handy, and so on (`perkFit`). Three different ones they haven't got are drawn from those weights,
with growth's own dice (person, how many perks they have).

## The list

| Perk | Does | Fits |
| --- | --- | --- |
| Marksman | +10 accuracy on aimed shots | aimed shots, long hits |
| Quick draw | Snap shots take a quarter less time (reflex shots too) | snap and reflex shots |
| Steady hands | +8 reactions | reflex shots and hits |
| Iron nerve | Loses half as much morale | held nerve, friends lost, freezing |
| Tough | +4 health | wounds, damage taken |
| Runner | +4 time units | tiles walked |
| Field medic | Medikits heal 5 more | medikit uses |
| Brawler | +10 melee, +10 stun a baton blow | baton swings, takedowns |
| Silver tongue | +15 talk | people met and recruited |
| Scavenger | Finds 15% more | supplies found, runs |
| Pathfinder | +20 lookout | days out, ambushes run from, injuries |
| Handy | +0.1 building a day | days building, cars fixed |
| Bookworm | +0.1 research a day | days researching |
| Bedside manner | Medicine they give out heals 1 more | Medicine skill |

## Balance

Perks only add, so a veteran with three is clearly better. Nothing changes for anyone without
perks: the food and fight sims don't pick them and come out the same.
