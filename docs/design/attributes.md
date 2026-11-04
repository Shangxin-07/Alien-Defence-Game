# Attributes and skills

Step 2 of the attributes plan (Mike, 2026-11-04; seven attributes, no Luck). Code:
`tactical/attributes.ts`. Nothing here changes how good people are on average: the formulas are
fitted so the old numbers come out of the new ones.

## What people have

- **Attributes**, 1–100: Strength, Dexterity, Endurance, Perception, Intelligence, Willpower,
  Charisma. An ordinary adult is about 40.
- **Skills**, 0–100: Firearms, Close combat, Medicine, Persuasion, Engineering, Science, Scrounging.
  Medicine, Persuasion and Scrounging don't drive anything yet (step 4).

`Person.attributes`/`skills` are the truth. `Person.stats`, `aptitude` and `build` are worked out
from them by `settle` (campaign/staff.ts) whenever someone joins or a save loads.

## What they work out to

| Number | Formula |
| --- | --- |
| Time units | 28 + 0.35 Dex + 0.25 End |
| Health | 12 + 0.4 End + 0.1 Str |
| Bravery | 0.8 Wil + 0.2 Cha |
| Reactions | 10 + 0.4 Per + 0.4 Dex + 0.1 Firearms |
| Accuracy | 18 + 0.3 Per + 0.3 Dex + 0.7 Firearms |
| Melee | 14 + 0.3 Str + 0.3 Dex + 0.6 Close combat |
| Research a day | 0.4 + Int/100 + Science/100 |
| Building a day | 0.2 + round((Str + End)/2)/100 + Engineering/100 |
| Armour | always 0: only what they wear counts |

All rounded to whole numbers (research and building to hundredths). A civilian with 40s and no
skills (Str 45) gets TU 52, health 33, bravery 40, reactions 42, accuracy 42, melee 40: the old
civilian base.

## Where people start

- **First night:** `ROLE_TEMPLATES` per job, fitted to the old role stats (police, reservist, guard,
  paramedic, plus the council liaison), each attribute and skill ±20%. The officer wears a stab vest
  (4) and the guard a new padded jacket (2), so their armour is unchanged but can now be taken off.
- **Recruits:** `CIVILIAN` (or `FIGHTER` for soldiers), ±30%, with Intelligence tilted by trade.
  Their trade's research and building, rolled by quality as before, set Science and Engineering
  (`setWorkSkills`), so those ranges are exactly what they were. Nurses get Medicine, shop workers and
  teachers Persuasion, mechanics and drifters Scrounging. Drifters are worn down: lower End, Str, Int.
- The spreads were set so a recruit's accuracy and time units vary about as much as before
  (standard deviation about 3, against about 4 before).

## Old saves

`inferProfile` works attributes back from someone's old numbers, starting from their job's
template, so fight numbers land within a point and research and building exactly. Armour that was
part of them becomes a vest or jacket they wear, or goes in the stores if they already wear better.
Waiting candidates get the same treatment.

## Checks

The food sim prints exactly what it did before. The fight sim at 200 seeds, old against new: the
average win rate across its eleven scenarios went from 58.6% to 56.9%, a little harder and mostly in
the squad fights. Average stats per job match; what changed is the spread, since one attribute now
moves several numbers together (a low-Willpower recruit is low on bravery, not on everything).
Prologue spread is ±20% per attribute, recruits ±30%.
