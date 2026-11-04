# Service records

Step 1 of the attributes plan (Mike, 2026-11-04): stop throwing away what people do. Nothing in
the rules reads these counts yet. They're the raw material for learning by doing (step 3) and for
attributes and skills (step 2). The full plan is in the "Attributes, skills and service records" doc.

## In battle: `tactical/deeds.ts`

Each of your people carries `Unit.deeds` through a fight. Aliens don't. The counts are kept on the
unit, so a rewind or a fork takes them back with everything else. No dice are rolled for them, so
the same seed plays exactly the same fight as before.

| Counted | When |
| --- | --- |
| turns, tuHad, tuLeft | End of each of your turns, for everyone standing. A frozen turn adds nothing to tuHad |
| tiles, storeys, doors, kneels | Each step, each change of level, each door opened, each time they kneel |
| snap/aimed/autoShots, rounds | Each trigger pull, and each round fired |
| hits, longest, friendlyHits | Each round that hits an enemy (the longest of those, in tiles) or one of your own |
| reflexShots, reflexHits | Reaction fire, and the rounds of it that hit |
| kills, damageDealt | Whoever fired the round that dropped an alien to 0 gets the kill |
| swings, stunHits, takedowns | Baton swings, hits, and aliens knocked out by them |
| wrecked | Scenery they brought down |
| spotted | Aliens that came into view when they stepped or turned |
| timesHit, damageTaken, bled, wounds | Hits on them (grazes too), damage from hits and from bleeding, wounds opened |
| nerveHeld, froze | Panic checks with any chance of panic: held, or froze |
| friendsLost | A friend died while they were standing |
| heals, healed, bleedsStopped | Medikit uses they made |
| led | They led the squad (the bravest, when there are two or more) |

The combat results screen shows a one-line summary for each person.

## In the campaign: `campaign/record.ts`

`Person.record` is a `ServiceRecord`: when and how they joined, fights fought, won and pulled out
of, ambushes run from, all their deeds summed (`addDeeds`, keeping the best for `longest`), days on
each job (unfit days count as rest), research points put in, days out and runs done, their share of
supplies found, places found searching, people met and recruited (candidates remember who found
them), sighting calls, cars fixed, injuries on runs, hungry days, and promises kept and broken.

`Campaign.gone` is everyone who died or walked away, with how and when, and their record. The
first night's dead are in it too. The Staff panel shows a folded record under each person and a
"The fallen, and those who left" list.

Saves: `gone` and `record` are optional. Older saves get clean records ("With you before records
were kept") and an empty roll.

Not counted yet, because nobody does it in the rules: black-market trades (no one person buys),
and construction work done (only days on the job).
