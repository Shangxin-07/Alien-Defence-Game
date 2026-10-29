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

- **Risk** scales with team size (×0.7 for one person up to ×1.15 for four). Places get picked over by 10% a day of work, down to 30%, and recover 2% a day. (Replaced by fixed stock, see "Places hold a fixed stock" below.)
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

### Ways out of a famine

Mike's playtest: food is brutal, and the $1M grant didn't help because money couldn't buy anything. Food stays brutal. These are paths out that cost something, not easier food.

- **Black market** (Scavenging panel): food in lots of 10 at $8k a unit, medicine in lots of 2 at $25k a unit. Every unit bought pushes that price up 1.2%, and only 3% of the markup wears off each day, so a price you've pushed up takes weeks to settle. A whole $1M grant buys about 70 food, which feeds four for 17 days and leaves nothing to build with.
- **Hydroponic farm** (2×1 room, underground): $300k, 60 person-days of work, 3 power. It's heavy, so it needs a lift route ($120k) before work starts, and a geothermal plant ($600k, 80 person-days) to run. Once running, it takes 12 days to bring in its first crop, then gives 5 food a day: enough for five mouths. If it loses power it stops growing and picks up where it left off. The full path costs about a grant and a half, or scrap in place of money.

### Places hold a fixed stock

Mike's playtest: percentage depletion ignored team size. Two days with one person cost a place as much as two days with five, and eight people at a fresh place got far more out of it than one ever could. Now every place holds literal amounts.

- **Stock:** each person takes their daily find out of what's left, so team size only changes how fast a place empties, never how much you get from it. A place that's picked clean is forgotten, the news says so, and a run there comes home early. Nothing grows back.
- **Starting places:** one of each kind, with this much stock:

  | Place | Food | Medicine | Scrap |
  |---|---|---|---|
  | Homes | 40 | 6 | 25 |
  | Supermarket | 70 | | |
  | Health centre | 6 | 20 | |
  | DIY superstore | | | 50 |
  | Industrial estate | 5 | | 90 |

  That's 121 food on top of the 30 you start with.
- **Searching** is a new kind of run:
  - Up to 2 people go out for 1 to 3 days, with 8% danger a day for a team of three.
  - Each searcher has a 30% chance a day of finding a new place.
  - What kind of place it is: homes 35%, supermarket 20%, pharmacy 15%, hardware 15%, industrial 15%.
  - Its stock is 40% to 120% of the table above, because most places have already been picked at.

## Step 4 as built

Sighting calls with travel on foot or by car, first cut. All numbers are placeholders. Food is untouched.

- **Calls:** each day there's a 30% chance someone calls in a sighting (a taxi driver, a night-shift nurse, someone who wouldn't give a name). Each call says where and how far from the base: 2 to 25 km. It shows up at the hour it was seen, and the news reports it. That news slows a fast clock like any other news. Nothing pauses.
- **The trail:** an alien moves on within 8 hours of being seen. When a team arrives, the chance it's still there is the share of those 8 hours that's left. So a team that arrives 2 hours after the sighting has a 75% chance.
- **Getting there:**
  - On foot: 5 km/h.
  - By car: 40 km/h. A car seats 4 and burns 1 fuel per 8 km, counting there and back. The fuel is taken when the team leaves.
  - The panel shows travel time and the chance the alien is still there before you send anyone.
- **Arriving:**
  - If the alien is still there, the clock stops at the moment of arrival and you choose to fight or pull back. The fight uses the scavenging ambush, with its own briefing that says who called and how long you took.
  - If the trail is cold, the team spends the same time going home.
- **Winning** brings home:
  - the body or a live alien (this counts for research and for revenge promises)
  - 6 scrap stripped from its kit
  - +5 loyalty for every recruit ("word gets round that you came when called")
- **Cars:**
  - Fixing up an abandoned car costs 15 scrap. It also takes 8 person-days of work at build skill. The panel picks your two handiest free people, and they're busy until the car runs.
  - Cars are the first machine you own. For now their only use is answering calls.
- **Fuel** is a new supply:
  - Homes hold 10 (0–1 per person per day). The industrial estate holds 30 (0–3 per person per day).
  - The black market sells fuel at $4k a unit, in lots of 10.
- Not yet built: the "first government contact" exit from the early game, and sightings that move or call back.

## Step 5 as built

Alien personalities and commanders, first cut. All numbers are placeholders. Food is untouched.

### Races

Three races, each with its own body, gun and personality norms (0 to 100 on each axis):

| Race | What they're like | Gun | Aggression | Caution | Cohesion | Cunning |
|---|---|---|---|---|---|---|
| **Strider** | Tall and patient. The first night's Hunter was one. Senses heartbeats 12 tiles through walls. | Plasma pistol | 35–75 | 35–75 | 45–90 | 40–80 |
| **Brute** | Big, slow, armoured (70 HP, armour 12). Senses 6 tiles. | Plasma scattergun: hits hard, useless past about 6 tiles | 60–100 | 0–35 | 20–65 | 0–30 |
| **Shade** | Small and quick (72 TU, reactions 95). Can't sense you at all. | Needle rifle: long and very accurate | 10–45 | 55–100 | 10–55 | 60–100 |

The prologue Hunter is always a Strider with its own stats. Per Mike, the map is random enough, so its personality barely varies: aggression 54–60, caution 58–64 and cunning 50–56. That's too low for it to lie in wait. Over 200 simulated seeds, a squad that only waits wins 19%, and one that only shoots wins 46% (it was 48%).

### Rolling a squad

- **The leader rolls the doctrine** inside the race's norms. Everyone else gets a nudge of up to ±12 on each axis.
- **Mavericks:** about one in eight non-leaders gets a nudge of up to ±35, and can step 20 outside the race's norms. This is the hothead in a cautious pack.
- **Ranks:** in a squad of two or more, one alien leads, with a crest on its head. In a squad of three, the second is next in line.
- **Which fights get squads:**
  - A scavenging run still meets one alien: a lone straggler, a Strider 60% of the time, a Brute or a Shade 20% each.
  - A sighting can be a squad: one alien 50%, two 35%, three 15%. The race is Strider 50%, Brute 25%, Shade 25%.
  - The squad is rolled from a seed kept on the run, so the fight-or-pull-back choice already shows what's there, and reloading doesn't change it.

### How personality plays

| Axis | What it changes |
|---|---|
| **Aggression** | Takes worse shots, keeps no TU back for reflexes, retreats later, closes in further. |
| **Caution** | Breaks off sooner when hurt, and prefers spots next to cover. |
| **Cohesion** | How hard losing an ally or the leader hits morale. A leaderless, tight-knit squad stops to regroup. |
| **Cunning** | Flanks under orders. Lies in wait for up to two turns when close to its prey. |

A lost alien no longer heads for the middle of town. It casts about somewhere near one of your people, and a trail it can see is empty goes cold. That stops fights stalling when nobody moves.

### Morale and panic

- **Losing an ally** costs each alien the usual bravery-based loss, times 0.5 to 1.5 by cohesion.
- **Recovery:** aliens get back 10 morale a turn while someone is giving orders, and only 3 without.
- **Panic:** below 50 morale, an alien may panic at the start of its turn, the same chance as your people. What it does depends on its nature:
  - aggression 65 or more: it **goes berserk** and charges, shooting at anything
  - otherwise, caution 50+ or cunning 60+: it **bolts for cover**
  - otherwise: it **freezes**

### Commanders

When the alien giving orders is killed or knocked out:

- **Coordination stops.** While someone leads, the squad shares sight (each can shoot at anything any of them sees), shares what it hears, piles onto whoever is already hurt, and flanks. Without a leader, each alien sees and hunts for itself.
- **Reorganising:** for this turn and the next two, alien accuracy drops to 75% and reactions to 65%.
- **Their morale:** each alien loses another 15 + 35% of its cohesion. Hotheads get 15 more aggression; the rest get 15 more caution.
- **The second steps up** two turns later, if it's still standing. That ends the penalties and brings back shared sight and focus fire, but not flanking. Kill the second first and nobody steps up.
- **Your side:** everyone gets +25 morale and is half as likely to panic for the rest of the fight.
- **Spoils:** a leader brings home a **Commander corpse** or a **Live commander** instead of the usual body. Each opens its own research: *Commander autopsy* (22 points), or *Interrogate the commander* (30 points, needs containment).

The same applies in reverse:

- **Your leader** is your bravest person (marked ★). If they die, everyone else loses 20 morale and aims at 85% for this turn and the next.
- The aliens gain 15 morale.

### Hints, not numbers

- **Before the fight** (on the fight-or-pull-back card and in the briefing), your people say what they can read. That's one line per axis that's well off the middle, for example "They're moving fast and loud" or "Something's been watching us".
- **What they can read grows with knowledge.** Knowledge goes up by one for each fight against the race (the prologue counts for Striders), and by two once a commander has been researched.
  - With no knowledge, they get one line and "More than one" for a squad.
  - With some, they get the race's name, the exact count, and more lines.
  - At knowledge 3, they're told to kill the one giving orders.
- **During the fight**, a soldier remarks on a maverick or on the leader when it first comes into view, for example "That one's not waiting for the others" or "That one hangs back. The others keep looking at it".
- **The log** reports what you'd notice: a squad falling apart, a berserker charging, something screaming in the dark, "Another one is giving the orders now".

### Balance

The squads are tuned to be brutal. These are from simulation, with a team of four that never moves and only shoots what it sees (a real player does better):

| Fight | Win rate |
|---|---|
| One Strider | about 55% |
| Two Striders | about 25% |
| Three Striders | about 20% |
| Brutes or Shades in squads | worse |

You can always pull back from a sighting before the fight. The briefing tells you as much as your people know.

Not built yet: commander kills slowing how fast a race learns your tactics (that waits for step 6), and mixed-race squads.

## Step 6 as built

Autoplay with doctrines, the rewind timeline and adaptive aliens, first cut. All numbers are placeholders. Food is untouched. Autoplay is offered in every fight after the prologue; the first night is still played by hand.

### Doctrines

Pick one in the mission panel, then **Autoplay**. Your people fight in that style:

| Doctrine | How it plays |
|---|---|
| **Cautious** | Holds where it is once it knows where they are, keeps to cover, kneels to aim, keeps a snap shot back for reflex fire, and only takes shots of 25% or better. Moves up half a turn at a time, together, and nobody strays more than 4 tiles from the group. |
| **Aggressive** | Pushes toward the nearest known alien, spends everything, and takes shots of 15% or better. |
| **Capture** | Holds fire on anything already under 45% health while someone with a baton is still standing, closes with the baton once a target is under 75%, and otherwise plays like Cautious. |

A medic patches up anyone bleeding before anything else, and will cross the street to do it. Nobody fires through one of your own.

**It fights a little worse than you.** Each person's turn has a **15%** chance of a fumble: a worse spot to move to, a hurried snap shot instead of an aimed one, going in with the baton too early, or forgetting to kneel. Autoplay also doesn't search the dead carefully: up to **30%** of the bodies are left behind, in proportion to how much of the fight it played. Manual play is still worth it for the fights that matter.

Simulated over 150 seeds, against sighting squads (one to three aliens):

| Doctrine | Win | Clean win | Wiped out | Dead per fight |
|---|---|---|---|---|
| Cautious | ~59% | ~14% | ~41% | 2.5 |
| Aggressive | ~54% | ~17% | ~46% | 2.5 |
| Capture | ~51% | ~10% (plus 6% taken alive) | ~49% | 2.7 |

Against a lone straggler on a scavenging run it's 73–85%. These are bot numbers: a person does better.

### Risk preview

Before it starts, your people give you odds: **clean win**, **someone lost or no result**, **disaster** (wiped out, or half the squad gone). They come from **20 simulated fights** against the squad that's actually out there, played with the doctrine you picked, so gear, stats, personalities and what the aliens have learned all count.

The odds are shown as a **range**, and the range is as wide as your people's ignorance: **±25** points with no knowledge of the race, ±15 with a little, ±8, then ±4 once they know them well (the same knowledge that sharpens the briefing). Strong squads against familiar enemies read as safe; anything new stays dangerous whatever the sim says.

Then: **Watch** (the fight plays at ×1 to ×4), or **Skip to the result**.

### The rewind timeline

Open it any time with **Timeline**. One row per round, oldest at the top:

- **Marks:** ◉ first contact, ● hurt, ✕ killed, ▲ alien down, ★ their commander down, ! panicked. Pointing at a round shows your people at the start of it next to how they are now.
- **The price**, on every row: "Play 5 rounds by hand · −6 morale". Rounds that are too far back, or that you played by hand (✋), are greyed out with the reason.
- **Take command** goes back to the start of that round. **Full rounds only.**

The rules, as agreed:

- **Rewinding re-rolls.** Everything after the point you go back to is gone, and the dice are new. The aliens keep the personalities they rolled, so you can't replay a future you've seen.
- **The price is measured from where the fight is now**, not from where you're watching. Playback runs one round behind the fight, and pausing it doesn't freeze the fight. Watching closely costs attention; coming back later costs more.
- **Lockout:** 1 + 2 × rounds undone, played by hand before autoplay can take over again. One round back costs 3 rounds of manual play; six rounds back costs 13.
- **Morale:** 3 per round undone, up to 15. "Make your mind up."
- **Window:** the last **6** rounds autoplay played.
- **Taking over now is free** and always allowed: you play the current round by hand, and autoplay can resume the round after.
- **No auto-pause on disasters**, by design. Watching closely is the price of a cheap rewind.
- **Brutal mode** (a tick box, remembered between fights): no rewinds at all, only taking over from the present. It can't be changed once autoplay has run in a fight.

### Adaptive aliens

Each race keeps a picture of how you fight, between **0 and 1** on three habits, and carries it from fight to fight:

| Habit | What it watches | What the race does about it |
|---|---|---|
| **Holding** | Time units left unspent at the end of your turns | Stops walking into your sights. It keeps just outside what you can see (10 tiles at night, 15 at dusk or dawn; by day, 14 tiles off, where pistols and shotguns fall away) and takes the long shot, and goes round the side rather than down the street. |
| **Pushing** | Time units spent, and how many of your shots were at 5 tiles or less | Waits for you to overreach. Against anyone who has spent 70% of their time units charging, it's twice as quick on the draw and aims 30% better. |
| **Takedowns** | Swings of the stun baton | Shoots whoever carries a baton first. |

- **Slowly.** After each fight the race moves **25%** of the way from what it knew to what it just saw, so it takes about four fights fought the same way for a counter to bite.
- **Faster if any got away.** A fight you fled or were wiped out in teaches them **1.5×** as fast: a brutal reason not to let anything escape.
- **Commander kills slow it.** Bring down the one giving the orders and that fight teaches them **half** as much. Research on their leaders (autopsy or interrogation) slows it to **0.75×** as well: you know how they pass things on.
- **It wears off.** Drop a habit and the same 25% pulls it back down. No tactic is banned; variety is the answer.
- **Hints, not numbers.** Past 0.35 your people say so, on the fight-or-pull-back card and in the briefing ("They've stopped walking into our sights"), and the news reports a race picking a habit up or letting it go.

**Each counter leaves its own opening, so changing how you fight is always the way out.** Simulated over 150 seeds against sighting squads:

| | They know nothing | They've learned that habit | After you switch |
|---|---|---|---|
| Cautious (holding) | 59% | 37% | aggressive: 55% |
| Aggressive (pushing) | 54% | 45% | cautious: 55% |

Not built yet: mixed-race squads, aliens learning from what they see of your gear, and autoplay for anything but these small fights.

## Inventory and loadouts as built

Mike asked (2026-10-28) for more control over kit: reloading from spare clips, stores in the base, good defaults for people coming in, a scavenging target for weapons and ammo, and warnings when someone goes out badly kitted. He leaned towards **requested** loadouts with no carrying limit, all bullets fitting all guns for now, and heat instead of clips for energy weapons. Numbers chosen by Claude; Mike can overrule. Code: `src/armoury.ts`, the armoury methods on `Campaign`, reload and heat in `battle.ts`, the Armoury panel in `main.ts`.

### Stores and requests

- **Stores** are shared by every base, like the supplies. Spare clips are a supply (`ammo`); guns, armour, stun batons and medikits sit on the armoury shelves.
- **Each person asks for a loadout**: a gun (a particular one, the best going, or none), 0 to 6 spare clips, armour or not, a baton, a medikit. The quartermaster fills every request from the stores in staff order whenever anything changes: a run coming home, a recruit joining, a request changing, every day. People who are out keep what they took.
- **Defaults by role.** Soldiers and reservists: rifle and 3 clips. Police: pistol, 2 clips and a baton. Guards: shotgun and 2 clips. Nurses and paramedics: pistol, 1 clip and a medikit. Everyone else: the best gun going and 2 clips. Everyone wants armour.
- **What people walk in with.** Soldiers bring a rifle, 1 to 2 clips and often a vest. Nurses bring a medikit. Anyone else has a 15% chance of a part-loaded pistol. Drifters bring nothing. The first night's survivors keep what they walked out with, so whatever they fired that night is gone.
- **Start:** 2 spare clips in the stores. Older saves give everyone their old job's gun with one clip, and add a police station to the places they know.

### Ammunition

- **All bullets fit all guns.** A clip fills any magazine: 12 for the pistol, 20 for the rifle, 8 for the shotgun.
- **Reload in a fight** costs 25% of full time units (R). What was left in the old clip is dropped.
- **At home nothing is wasted.** A part-used magazine is swapped for a full one and the rounds go back in the stores as loose rounds; every whole clip's worth is repacked.
- **Black market:** 4 clips for $15k a clip, with the same price creep as everything else there.

### Energy weapons

- No clips. Each shot heats the gun: plasma pistol 35, scattergun 45, needle rifle 30. At 100 it shuts down, and it cools 35, 35 or 30 a turn until it's back under 50. So the plasma pistol fires two shots a turn freely, a third trips it, and it fires about once a turn if you keep it going.
- **The aliens' own guns don't overheat.** They know how to vent them. Giving them heat would make every fight easier.
- **Research first.** Alien guns can't be issued until their project is done. The plasma pistol project already existed; scattergun and needle rifle projects are new.
- **Getting them.** The prologue's plasma pistol goes in the stores. An alien brought down in an ambush or sighting fight leaves its gun intact 60% of the time if captured, 35% if killed. Guns don't count as kills for revenge promises.

### Armour and kit

- Stab vest: armour 4. Body armour: armour 8. Added to the person's own armour in a fight.
- Medikits: make one from 2 medicine. A used medikit is restocked at home for 1 medicine a day, after the wounded have had theirs.
- **Kit of the dead:** win the fight and their gun, armour and kit come home (not what was in the gun). Lose or run and it stays where they fell.

### Police stations and gun shops

- A new kind of place to scavenge: danger 0.14 a day (as dangerous as a pharmacy). Each person finds 0 to 2 clips and 0 to 1 crate of arms a day. A starter station holds 14 clips and 5 crates. 7% of new finds are this kind.
- A crate of arms is sorted on the way in: pistol 34%, shotgun 24%, stab vest 18%, rifle 12%, body armour 6%, stun baton 6%.

### Warnings

Shown in the Armoury, against everyone on the scavenging and sighting team lists, and on the fight-or-run card: no gun, no ammo, no spare clips, fewer clips than asked for, a better gun or armour left in the stores, a medikit or baton asked for and not there, a used-up medikit. The Armoury also warns about alien guns waiting on research.

Not built yet: carrying limits, ammo types per gun, grenades, and swapping gear between people in a fight.

## Unit allocation as built

Mike asked for one place to set people aside for particular work, with a lock or at least a warning (2026-10-28). Code: `src/allocation.ts`, `Campaign.allocate`, `Campaign.setJob`, `Campaign.dutyWarnings`, and the duty check in `Campaign.checkRun`.

- Duties: supply runs, searching, recruiting, sighting calls, fixing cars, research, construction. Every scavenging place counts as a supply run.
- Each person is on **Any job** (the default), **Preferred** or **Locked**, with a set of ticked duties.
- Preferred: they can still be sent anywhere. Team lists flag "⚠ meant for …", the line by the send button repeats it, and the button reads "Send anyway".
- Locked: they can't be ticked for anything else, and `checkRun` refuses it, so the rules hold outside the UI too. Their job at home must be one of their duties; a lock with no home duty puts them on rest between trips. Resting is always allowed.
- Fights aren't a duty: ambushes take whoever is on the run, and a sighting call is the hunt you choose to send people on.
- The automatic car-repair pick never takes anyone locked elsewhere, and only takes people meant for something else if nobody else is free.
- The page lists gaps: any duty everyone is locked away from.
- Nothing about difficulty changed.

## Battle levels as built

Mike asked for levels in the combatscape, four like the base, with stairs and lifts so nothing is locked out (2026-10-29). Code: `TacMap` levels, `linked`, `slab`, `line`, `reach` and `cutOff` in `src/tactical/map.ts`; `raise`, `shaft` and `connect` in `src/tactical/cityMap.ts`; level view in `src/tactical/view.ts` and `src/combat.ts`.

- Every city has four levels: cellars (level −1), the street (0) and two floors above (1 and 2). Off the street there's open air above and solid earth below until a building fills them in.
- Buildings: the big block is three storeys with a cellar and a lift; paired buildings two or three storeys, cellar 40% of the time; the car-park office one or two, cellar 30%; the park kiosk one. Buildings under the top of the map get a flat roof with a low parapet that counts as cover. Every building has one stairwell from its lowest level to its roof.
- Stairs cost 8 TU a storey, a lift 6. You climb from the stairs tile to the same tile on the next level; facing doesn't change. Doors only on the ground floor.
- **Nothing is locked out.** After the map is built, `connect` walks it from the junction and keeps fixing until every walkable tile on every level can be reached: it clears clutter or knocks a door through a wall, runs stairs to a floor it can't reach from its own level, and as a last resort digs through a row of trees. Tests check 300 cities every run (and 3000 were checked once), and that no floor exists outside a building.
- Sight and fire run eye to eye in 3D, storeys counting 1.5 tiles. A line can drop from an upstairs window or a roof to the street or climb a stairwell, but never pass through a floor, so you can't see straight down through a building. Facing only matters across the map. Nobody sees into a cellar from outside.
- Shooting down from a floor above, low cover beside the target hides half as much: a roof or upstairs window is a real advantage, for them as much as you.
- Baton and medikit only work on the same level. The aliens' tracker senses you through floors as through walls; they path up and down stairs to hunt you and flank on your level.
- Screen: ▲/▼ by the view buttons, `[`/`]` or Page Up/Down. Everything above the level you look at is lifted off; units under a floor are hidden. Selecting someone, following them up stairs, or an alien coming into view switches to that level. A level button turns red when an alien is in view up or down there.
- Balance (autoplay sims, 300 prologue seeds and 100 sightings, cautious doctrine): disasters 199–201 of 300 before and after, sightings 70 → 73 of 100. Within noise. No defaults eased.
