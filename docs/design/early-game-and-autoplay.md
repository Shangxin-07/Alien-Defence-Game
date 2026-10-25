# Early game, alien behaviour and autoplay

Design notes from the discussion on 2026-10-25. Nothing here is final: numbers marked *(placeholder)* are first guesses to be tuned in play.

## The problem

XCOM's middle game is excellent. Its start is thin (wait for buildings, wait for research) and its end drags (the same fights, over and over). This design gives the opening its own game, a survival and insurgency phase where the "organisation" has to be earned, and gives the late game a way to delegate routine fights without making them trivial.

The arc, in one line each:

- **Early:** you are survivors. You dig, scavenge, recruit and answer calls yourselves. Fights are scrappy and manual.
- **Middle:** full XCOM. Money, bases, interceptors, research.
- **Late:** you are a commander. Routine fights can be autoplayed with a doctrine; the important ones you play by hand.

## Rules that apply to everything

- **Harder, never impossible.** Losing people makes things slower or riskier, never unwinnable. No chain may depend on a particular person surviving, and every chain has a fallback that works with unskilled people (slow digging, begging instead of recruiting).
- **No free lunches.** A choice that always pays the lowest price for the full payoff is not a choice. (This is why auto-pause on disasters was rejected, see below.)
- **Hints, not numbers.** Where the game hides information (alien personality, what the aliens have learned), the player reads it from reports and research, not from a stat sheet.

---

## 1. Manpower economy

**There is no money at the start.** Work costs **person-days**, and how fast a person works depends on their skill at the job.

- Every job has an amount of work in person-days at skill 1.0. A person contributes their skill (around 0.6 to 1.4) in person-days for each day they spend on it.
- Only so many people fit on one job: a narrow shaft takes two diggers, a big room takes more. Extra hands go to the next job in the queue.
- Someone digging is not researching, scavenging or recruiting. That trade-off is the early game.
- Money arrives later as **backing**: a council grant once someone official starts to take you seriously. Rooms that need bought equipment (a lift motor, lab benches, generators) cost money as well as work, so they wait for backing or, later, for scavenged materials.

### Getting underground: shaft, then stairs, then lift

Each step works before the next exists:

| Step | What it is | Lets you | Cost |
|---|---|---|---|
| **Shaft** | A hole with rope ladders | Builders can climb down and dig. Nothing down there runs yet. | Work only |
| **Stairs** | The shaft fitted with a staircase | People live and work below. Rooms come online. | Work only |
| **Lift** | The stairwell fitted with a lift | Heavy kit can go down: generators, workshops and containment can only be built with a lift route. | Work and money |

A conversion keeps the old link working while it's being fitted: the stairs stay usable while the lift goes in.

### Fallbacks

- No builders at all: nothing gets built, but research and everything else continues. Anyone can be moved to construction, at any skill.
- Nobody survived the prologue: the council liaison still digs, slowly.

---

## 2. Scavenging

- **Food, medicine, scrap and fuel** are hard limits. Hungry people lose morale, then desert.
- Scavenging runs are short abstract expeditions with a risk roll: who goes, where, how long.
- The occasional run goes wrong and becomes a **small tactical fight**. This keeps the combatscape in use early without needing full alien missions.
- Scrap becomes **materials**, which can stand in for money on early rooms.

## 3. Recruitment with fulfillments

- Someone walks the streets and **promises things** to bring people in.
- Each recruit wants a **fulfillment**: safety for their family, revenge, food, a cure, a rank.
- Skilled people ask for more.
- **Broken promises cost loyalty**, and disloyal people leave (or worse).
- Scavenged goods get a second use here, beyond survival.
- Fallback: begging and word of mouth bring in unskilled people slowly, with nothing promised.

## 4. Sighting calls and travel

- Alien sightings come in as **calls from people**, not as radar blips.
- You travel **on foot or by car**. A sighting across the city might take hours, so you arrive late and the trail is cold.
- Geography matters early. **Vehicles are the first real "tech" milestone**, long before interceptors.
- Early missions stay small and local, which suits the tone.

### Leaving the early game

The phase needs a clear exit so it doesn't drag. Proposed: **first lift + first vehicle + first government contact**. After that, backing (money) becomes the main economy and the classic geoscape takes over.

---

## 5. Alien personalities

Before each battle, the aliens roll a personality **inside their race's norms**, so the same race doesn't play the same way twice.

- **Axes:** aggression (charge or hold), caution (values cover and retreat), cohesion (pack or loners), cunning (flanks, ambushes, feints).
- **Race ranges:** "alien tanks" sit high on aggression and low on cunning, and roll anywhere from *slightly aggressive* to *charges straight into your face*. Backstabbers sit high on cunning and caution, and roll from *sneaky* to *paranoid*.
- **Leader plus individuals:** the squad leader rolls the group's doctrine; each alien gets a small personal nudge. One hothead in a cautious pack is a story.
- **Morale shifts it mid-fight:** a disciplined squad that loses its leader can break into reckless or panicking individuals.
- **Hints, not numbers:** soldiers report "they're moving fast and loud" or "something's been watching us". Autopsies, interrogations and experience sharpen what you can read.
- Feeds the autoplay risk estimate ("aggressive contact, higher casualty risk").

## 5b. Commanders

Killing the alien commander must count for more than morale.

- **Coordination loss (the big one):** shared sight, focus fire and flanking stop. Each alien falls back on its own rolled personality.
- **Combat penalty:** a few turns of accuracy and reaction penalties while they reorganise. A sub-leader may step up after a turn or two and recover some of it, so killing the sub-leader matters too.
- **Morale both ways:** aliens may panic or retreat; your squad gets a morale boost and some steadiness against panic for the rest of the fight.
- **Campaign payoff:** a commander corpse is high value, a live commander is a jackpot interrogation, and either slows how fast that race learns your tactics.
- **Symmetry:** lose your own squad leader and your soldiers take the morale hit.

## 6. Adaptive aliens

People who play the same way every time get punished.

- **They learn from what they see.** Each race tracks the player's habits across battles (heavy overwatch, shotgun rushes, rooftop sniping, always breaching the same way) and shifts its personality range to counter them: more grenades, smoke, flankers, or waiting you out.
- **Slowly, and readably.** Soldiers and research pick up signs ("they've started carrying smoke", "they avoid open ground now"), so the player knows why it got harder.
- **It wears off.** Drop a tactic and the counter fades. No tactic is banned outright; variety is rewarded.
- **Per race.** Aliens that escape spread what they learned faster, which is a brutal reason not to let anything get away.
- They learn from manual play as well as from autoplay doctrines.

## 6b. Autoplay with doctrines

For the routine late-game fights.

- **Doctrines, not one button:** Cautious (overwatch, cover, leave nobody behind), Aggressive (push and flank), Capture (stun weapons, take prisoners). The AI plays your units in that style.
- **Watch or resolve:** watch at speed, or skip to the result.
- **Risk preview before committing**, e.g. "85% clean win, 10% one casualty, 5% disaster", from gear, stats, enemy type and rolled personality. Strong squads against familiar enemies are safe; anything new stays dangerous.
- **The AI is a bit worse than you:** more wounds, fewer captures, lost loot. Manual play stays worth it for the fights that matter.
- Routine fights are autoplay candidates; important ones are hand-built set pieces. Late threats change shape (terror campaigns, infiltration of covert bases, counter-raids) rather than just getting bigger.

### The rewind timeline

During or after autoplay you can scroll back through the fight and **take command**.

- **Full rounds only.** You take command from the start of a round, never from one soldier's turn.
- **Rewinding re-rolls.** Everything after that point is gone; the aliens keep their rolled personalities but the dice are new. You can't replay a future you've already seen.
- **The price is a manual lockout** that scales with how far back you go: one round back might cost 3 rounds of manual play, eight rounds back might cost the rest of the fight. Optionally a small morale cost ("command second-guessed us").
- **The price is measured from where the fight is now.** Pausing playback does not freeze it. Watching closely costs attention; coming back later costs more rounds.
- **Capped window:** only the last N rounds *(placeholder)*, or checkpoints such as first contact and each new sighting.
- **Brutal mode:** no rewind; you can only take over from the present.
- **Readable timeline:** one row per round, marked with first contact, wounds (yellow), deaths (red), alien kills, commander down and panics. Hovering a round shows the squad at its start next to the final outcome. Each round shows its price ("Take command from round 4: play 6 rounds manually, −5 morale"); older rounds visibly cost more; rounds outside the window are greyed out.

### Rejected: auto-pause on disasters

Auto-pausing before a death would hand the player the cheapest rewind for free every time, so the price would stop mattering. Without it, the player chooses between watching closely and paying more later. That trade-off is the point.

---

## Build order

1. **Manpower economy** and the first base's shaft, stairs and lift. Everything else hangs off it.
2. **Scavenging** runs for food and materials, with the occasional small fight.
3. **Recruitment** with fulfillments.
4. **Sighting calls** with travel on foot or by car.
5. **Alien personalities**, then **commander effects** (these need more alien types to be worth much).
6. **Autoplay** with doctrines and the **rewind timeline**, plus **adaptive aliens**. Last, because they are late-game features and need a stable combat AI underneath.

## Step 1 as built

The first cut of the manpower economy. All numbers are placeholders.

- **No starting funds.** The council sends a grant of $1,000,000 every 30 days, the first at the end of the first month. This stands in for "backing" until government contact exists.
- **Skills:** every person has a construction skill and a research skill (the old aptitude). Construction skill is random around a base set by their old job: army reservist 1.15, security guard 1.0, police officer 0.95, paramedic 0.85, council liaison 0.8.
- **Work:** every room has a work cost in person-days (roughly 4 × the old build days, since the prologue leaves about four survivors), multiplied by depth like money is. Rooms that need bought equipment still cost money too; the shaft, stairs, tunnels and the access point cost work only.
- **Crews:** people on Construction work their base's jobs in the order they were placed, at most 2 people per cell of the job's footprint. A job can only be worked once builders can reach it: on the surface, or next to a tunnel or shaft that links back to the entrance.
- **Shaft → stairs → lift:** a 1×1 shaft is dug first; it is then converted in place to stairs, and the stairs to a lift. Rooms reached only by a shaft are built but not online. Geothermal plants, workshops and alien containment need a lift route before work can start on them.
- **Staff can move between bases**, so later bases have someone to build them.
- Old saves keep their money and buildings; existing lifts stay lifts.

## Step 2 as built

Scavenging, first cut. All numbers are placeholders.

- **Supplies:** food, medicine and scrap. A campaign starts with 30 food (about a week for four), 3 medicine and no scrap. Fuel waits for vehicles in step 4.
- **Eating:** everyone eats 1 food a day, out on a run or not. Whoever can't eat goes hungry: they work at half pace and don't heal. After 5 hungry days, each hungry person has a 20% chance a day of leaving. The last person never leaves.
- **Medicine** goes automatically to anyone too hurt to work (under half health) and heals them 2 extra a day.
- **Scrap pays for rooms before money does**, at $10k a unit, with money topping up the rest. This is what fixes the slow first month: a few hardware runs buy a lift.
- **Runs:** pick a kind of place, 1 to 3 days, and up to 4 people. People on a run stop their other work.

  | Place | Each person finds a day | Danger a day (team of 3) |
  |---|---|---|
  | Abandoned homes | food 1–3, medicine 0–1, scrap 0–2 | 4% |
  | Supermarkets | food 3–6 | 8% |
  | Pharmacies and clinics | medicine 1–3, food 0–1 | 12% |
  | Hardware stores | scrap 2–5 | 6% |
  | Industrial estate | scrap 4–8, food 0–1 | 15% |

- **Risk** scales with team size (×0.7 for one person up to ×1.15 for four). Places get picked over by 10% a day of work, down to 30%, and recover 2% a day.
- **Trouble:** half the time someone gets hurt and the run comes home early with what it has. The other half, the run **meets a lone alien** and the clock stops until the player chooses:
  - **Fight:** a small tactical battle in the base's city with the run's own people and their current health against a weaker "Straggler". Kill it and you keep everything plus a corpse; capture it and you get a live alien (both open research). Flee mid-fight and you keep half. If the whole team dies, so does the loot. The dead are gone for good; if nobody is left, the council sends a liaison.
  - **Run for it:** drop everything, and each person has a 40% chance of getting hurt on the way out.

## Step 3 as built

Recruitment with fulfillments, first cut. All numbers are placeholders. Per Mike, food stays very hard; nothing here eases it, and families make it harder.

- **Recruiters:** one or two people go out into the streets for 1 to 3 days. It works like a scavenging run and can go wrong the same way (5% danger a day for a team of three). Each recruiter has a 45% chance a day of meeting someone worth talking to, and a 25% chance of meeting a drifter.
- **Candidates** come from eight trades (builder, electrician, mechanic, nurse, chemist, teacher, soldier, shop worker), each with its own construction and research range. They wait 3 days for an answer, then move on.
- **Fulfillments** (the better the candidate, the bigger the ask):
  - **Food up front:** 6–18 food, paid when they join.
  - **Medicine for a sick parent:** 2–5 medicine within 10 days, handed over automatically once you have it.
  - **Room for family:** 1–3 dependants who eat every day but never work. They eat after the workers; if they go hungry, the recruit loses 10 loyalty.
  - **Revenge:** an alien killed or captured within 30 days.
  - **A real bed:** living quarters working in a base within 30 days.
- **Loyalty:** recruits start at 60 (drifters at 45). A kept promise gives +20; a broken one costs −40. Below 30 they walk out (with their family); below 10 they take food with them. The original survivors have no loyalty score and never leave this way. The last person never leaves.
- **Drifters** ask for nothing and bring little: construction 0.6–0.8, research 0.7–0.85, a bit less health. They're the fallback when you can't afford promises.
