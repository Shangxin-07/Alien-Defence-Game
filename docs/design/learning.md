# Learning by doing

Step 3 of the attributes plan (Mike, 2026-11-04). Code: `campaign/growth.ts`, hooked in from
`campaign/campaign.ts`. People get better at what they actually do. A veteran is better, never a
superhero.

## How a point is earned

Everything someone does gives **practice**: chances at a point, per trait. A fraction is a chance at
one more (1.3 is one chance, plus a 30% shot at a second).

- **Skill** chance: succeeds with (100 − skill)/100 × (0.75 + Int/160). Low skills climb fast, high
  ones crawl, sharp people learn quicker.
- **Attribute** chance: a coin toss (50%), and only while below their **ceiling**. The ceiling is
  rolled once, hidden, the first time they learn anything: 5–20 above where they started, max 100.

The dice are their own (`growthDice(person, day, why)`), so growth never moves any other roll in a
fight, a run or a day.

## What teaches what

| Doing | Practice |
| --- | --- |
| Hits / reflex shots / misses | Firearms 0.35 / 0.2 / 0.05 each |
| Baton hits, takedowns, swings | Close combat 0.6, 1, 0.1 each; swings also Str 0.15 |
| Medikit uses | Medicine 0.5 each |
| Time units spent | Dex 1 per 400 TU |
| Tiles walked, wounds taken | End 1 per 120 tiles, 0.3 per wound |
| First to spot an alien, a hit at 12+ tiles | Per 0.3 each, 0.2 |
| Holding their nerve, friends lost, turns fought | Wil 0.3, 0.2, 0.02 each |
| Stairs climbed or dropped | Str 0.05 per storey |
| A day building / researching (scaled by work pace) | Engineering 0.08, Str and End 0.01 / Science 0.08, Int 0.01 |
| A day out on a run | Scrounging 0.1, Per 0.01 |
| Someone met recruiting / someone who joined | Persuasion 0.5, Cha 0.1 / Persuasion 1, Cha 0.2 |
| A new place found / a car got running | Scrounging 1, Per 0.1 / Engineering 1 |

Only people who walk away from a fight learn from it.

## Scars

After a fight: someone who froze has a 25% chance to lose a point of Willpower; someone left on a
quarter of their health or less has a 30% chance to lose a point of Endurance. Never below 1.

## What the player sees

After a fight, news says "X learned from it: Firearms +2, Dexterity +1" or "X isn't the same after
that: Willpower −1". The service record keeps the running total ("Learned by doing", "Scarred").
Stats, research and build rates are worked out again straight away.

## How much

Headless check (scratch sim, a reservist through 10 ordinary fights): accuracy +9, reactions +3,
time units +2, bravery +2, health +0.5. A year of building adds about 0.2 to the build rate. The
food sim finishes 1–3 days sooner because builders get a little faster; nothing else moved.
