# Food playtest: self-sufficiency by headcount

Mike's question (2026-10-25): with one food per person per day, is self-sufficiency impossible for some population sizes? Most prologues should end with about 3 alive, so 3 is the case that matters most. More people should make it easier through manpower, but must cost food: hard is fine, impossible is not.

**Answer: no headcount from 1 to 8 is impossible. All of them reach self-sufficiency in every simulated game. The black market is what makes 1 to 3 people survivable. With it shut, 1 to 3 people get close to impossible.** Nothing was tuned.

## How it was tested

`scripts/sim-food.ts` plays the real `Campaign` rules headlessly, with no changes to them: eating, hunger and desertion, runs with fixed-stock places, searching, injuries, ambushes, the black market, scrap and grants, construction crews and the hydroponic farm's 12-day first crop. A bot founds the first base under a city and builds the shortest route to food:

access point → shaft → stairs → lift → geothermal plant → one farm per five mouths.

That route is about 200 person-days of work and $1.12M, with scrap counting as money. Each day the bot sends a food run when food runs low, a scrap run while the rooms can't be paid for, and two searchers once the known places run short of food. It buys food on the black market with money the rooms don't need.

"Self-sufficient" means farms that have brought in their first crop feed everyone left. Each headcount is played over 200 seeds, over one year. The first four people are the prologue survivors. Anyone after that is an average recruit with no family and nothing owed.

The bot is a careful player in some ways and a timid one in others:
- It runs from every ambush, so nobody dies in a fight.
- It puts nobody on research.
- It ignores sighting calls.
- Recruits ask for nothing.

Real games will lose people that the bot doesn't lose.

## Results

**Good play.** For each headcount the bot tried 216 play styles (run size, length, food threshold, builders kept home, when to buy) and kept the best one.

| People | Reached | Kept everyone | Median day | 90% by day | Black-market food bought |
|---|---|---|---|---|---|
| 1 | 100% | 100% | 204 | 228 | 177 |
| 2 | 100% | 100% | 117 | 127 | 181 |
| **3** | **100%** | **100%** | **90** | **100** | **146** |
| 4 | 100% | 100% | 82 | 87 | 131 |
| 5 | 100% | 98% | 75 | 80 | 130 |
| 6 | 100% | 98% | 83 | 89 | 129 |
| 7 | 100% | 99% | 78 | 83 | 128 |
| 8 | 100% | 100% | 75 | 80 | 52 |

**Plain play.** One fixed style for every headcount: food runs of 2 for 3 days when food drops under 6 days' worth, one builder always home, and food bought only when it's under 3 days away. 300 seeds.

| People | Median day | Lost someone | Hungry person-days |
|---|---|---|---|
| 1 | 205 | 0% | 30 |
| 2 | 146 | 5% | 2 |
| **3** | **120** | **1%** | **1** |
| 4 | 100 | 0% | 1 |
| 5 | 85 | 0% | 5 |
| 6 | 90 | 3% | 15 |
| 7 | 82 | 5% | 30 |
| 8 | 76 | 10% | 60 |

**Black market shut** (best of 72 styles):

| People | Reached within a year | Kept everyone | Median day | Hungry person-days |
|---|---|---|---|---|
| 1 | 74% | 74% | 322 | 305 |
| 2 | 90% | 83% | 153 | 51 |
| **3** | **97%** | **87%** | **137** | **23** |
| 4 | 100% | 97% | 97 | 5 |
| 5 | 100% | 100% | 87 | 2 |
| 6 | 100% | 96% | 95 | 10 |
| 7 | 100% | 92% | 85 | 34 |
| 8 | 100% | 90% | 78 | 57 |

## What it means

- **Three survivors is hard, not impossible.** A careful player gets there in about three months: 90 days with good play, 120 with plain play. It costs about $1.2M of black-market food, more than a month's grant. Without the black market it takes 137 days, and one game in eight loses someone to hunger.
- **The real bottleneck is labour, not food.** The geothermal plant alone is 88 person-days. Every person on a food run is a person not digging. Bought food stands in for foraging, so money turns into construction time.
- **Each extra person helps, but less each time.** Going from 1 to 2 people saves 87 days, 2 to 3 saves 27, and 3 to 4 saves 8. After 5 the gain is mostly gone.
- **Six is a bad number.** Each farm feeds exactly five, so a sixth mouth means building a second farm (66 more person-days and $330k) for one person. Six is slower than five, and it's the first size where hunger starts to bite.
- **Big groups pay for their speed in hunger.** With plain play, 8 people have twice the hungry days of 7, and 10% of games lose someone. That's the food drain Mike wanted adding people to cost.
- **A lone survivor can't lose, only crawl.** The last person never leaves, so the liaison-only game always gets there eventually. With the market it takes about 7 months. Without it, a quarter of games take more than a year.
- **The bot is rarely hungry with the market open.** It plays with patience a person won't have, and it never fights. Mike's "very hard" feel and these numbers fit together: the margin exists, but you have to find it.

## Possible follow-ups (not done)

- Nothing needs easing for any headcount. If anything is worth changing, it's the six-person cliff, for example farms that feed 6 or a smaller first farm. Only if Mike wants it.
- Teach the bot to fight ambushes using the combat sim, so the deaths count too.
- Simulate recruiting mid-game with real demands, especially families, rather than starting with N people.
