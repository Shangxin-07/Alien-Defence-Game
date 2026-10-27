# Alien Defence

A brutal, turn-based alien defence game in the spirit of *UFO: Enemy Unknown* (1994).
Humanity is badly outmatched. The game splits between the **Geoscape** (a world view for
tracking contacts, building bases and managing the war) and **tactical combat** on the ground.

## Status

The geoscape, base building and the first tactical battle run as one game on one page, with one
campaign clock and one budget.

**A new campaign opens with the prologue**, a turn-based tactical battle. It's night in one of the
world's megacities. Something came down in the junction, and four people who were in the wrong
place (a police officer, an army reservist, a security guard and a paramedic) are hiding in a
building while a single alien hunts them. Turn the tables: kill it, or knock it out with the
police officer's stun baton and take it alive, and take its tech. A live capture brings home the
alien, its plasma pistol and the implant it tracked you with; a kill brings a corpse and the
pistol; running or dying brings nothing. Then you choose a city for your first base, starting with
the one you just escaped. The geoscape panel shows what you recovered, and you can replay the
prologue from there.

- **The survivors become your first staff.** Whoever walked out (wounds and all) moves into
  your first base. If nobody did, the council sends a liaison, so there is always someone. In
  **Staff & research** on the geoscape, put each person on research, construction or rest. Anyone
  can do any job: fewer people makes everything slower, never impossible. Research works on one
  project at a time, at about a point a day per person (each has a random aptitude of 80–120%), and
  labs at their base add half again. Builders bring their base's construction forward a quarter of a
  day each per day. Anyone under half health rests and heals a point a day. The first projects come
  from the night itself (debrief, the crash site, alien alloys) and from what you brought home (the
  plasma pistol, an autopsy, interrogating a live captive once you have alien containment, the
  tracking implant).
- **Route preview.** Rest the pointer on a tile and the route there is drawn after a delay you
  set with the Route preview slider (1–6 seconds, default 2, or off). The tiles you can reach are
  always tinted.
- **Everything runs on stats.** Each person has time units, health, accuracy, reactions,
  bravery, melee and armour, varied a little per person. Moving costs 4 TU a step, 6 diagonally,
  more through doors and rubble; turning costs 1 TU per 45°; kneeling 4, standing 8. Snap, aimed
  and auto shots cost a share of your full TU and multiply your accuracy, and kneeling steadies it.
- **Shots are traced.** A miss flies off somewhere near the target and can hit someone else;
  cover on the line (cars, crates, windows, trees) soaks up shots, more so if the target is kneeling
  right behind it. Damage rolls 0–200% of the weapon's power, minus armour.
- **Reaction fire, like the original.** TU you don't spend carry through the enemy's turn. When
  someone moves or shoots in view of an enemy, the one with more reactions × share of TU left
  gets to fire first.
- **Light follows the globe.** A fight is fought in whatever light the geoscape shows at that
  city when it starts: day, dusk, dawn or night, from the sun's height there. People see 9 tiles
  at night and 14 at dusk or dawn, further under the street lights, and 20 by day; the aliens see
  20 in any light. In the dark, firing gives your position away. The prologue is always night.
  You only see what's in front of you (a 90° cone).
- **Brutal**: big hits leave you bleeding a point a turn until a medikit stops it, friends dying
  drains morale and frightened people freeze. The alien has a plasma pistol that often kills in one
  hit, heals slowly, senses anyone within 12 tiles through walls, hunts the last noise it heard and
  breaks off to hide when badly hurt.
- **City maps** are generated per city: a crossroads with four blocks of buildings, alleys, car
  parks and parks, with rooms, doors, windows, cars, street lights (some out) and a crash site.
  The geoscape biome under the city dresses it: snow, sand, palms, pines or plane trees.

- **Found bases from the globe.** Click a spot to survey it. Anywhere within 120 km of a city
  is a covert base under that city; other dry land is a remote base. The first base has to be
  in a city and is paid for; later ones cost $900k (city) or $600k (remote), must sit at least
  400 km from another base, and command runs at most eight.
- **The clock starts with your first base.** Construction in every base moves on at each day
  boundary, at whatever time speed the geoscape runs. When something finishes, fast time drops
  back to a crawl so you notice. Time stands still while you're in a base, and its `+1 day` and
  skip buttons move the whole campaign on.
- **Your bases on the globe**: markers (dashed for covert bases), working radar shown as a ring
  of its real range, and a base list with cover, radar and construction at a glance. Pick a
  base from the list or its marker to go into it, and `Geoscape` brings you back.
- The campaign saves in the browser.

The geoscape: a stylised 3D Earth you can spin and zoom.

- **Terrain biomes** painted on the map. Each biome is a tactical map family, so the ground
  under a crash site decides what the battle looks like: polar ice, tundra, boreal forest,
  temperate, grassland, savanna, desert, jungle and mountains.
- **Major cities**: megacities at every zoom, more as you zoom in. They glow on the night side.
- **Post-war blocs**: after the last war the old countries were merged into 16 blocs with
  smoothed borders (the funding nations). Borders and bloc names fade in as you zoom in.
- **Day and night** driven by a game clock using the original's time speeds.
- Hover for terrain and territory, click to survey a site.

Base building: dig out a base on an 8×8 grid over four levels, the
surface plus three underground.

- **Two kinds of site.** The first base is covert, in a city block. It starts as a single front
  building with no way down: convert it into an access point (a lift inside the building) before
  you can dig. The rest of the surface is already built on: clearing a building costs money and
  **cover**, and so does anything you put up in plain sight. Underground is never seen. Remote bases
  start as just the access lift on open ground, with no cover to lose.
- **Base types come from what you build.** Labs and containment count as research, workshops and
  stores as manufacturing, radar as surveillance, and hangars, missile batteries and medical bays as
  military. When one role holds 40%, 60% or 80% of that floor space the base becomes a specialist
  and gets +10%, +20% or +30% at that job. A mixed base gets nothing.

- **Rooms** of different sizes: hangars, radar and missile batteries need open sky; geothermal
  plants and alien containment need rock overhead; everything else goes anywhere. Press `R` to
  rotate a room.
- **Tunnels and lifts** carry people. Rooms only open onto tunnels and lifts, never onto each
  other, and a room works only if there's a route back to the surface lift. Lifts stacked on top
  of each other link the levels, and a new level starts from a lift under an existing one.
- **Power**: geothermal plants run hotter the deeper they are. When demand outruns supply the
  newest rooms go dark first.
- **Brutal economics**: digging deeper costs more, construction takes days, and demolition
  refunds nothing. The base saves in the browser.

## Running it

Needs Node 20 or newer.

```sh
npm install
npm run dev        # local dev server with hot reload
npm test           # unit tests
npm run build      # production build into dist/
npm run build:single  # one self-contained HTML file in dist-single/, handy for sharing
```

Controls: drag to spin, scroll or pinch to zoom, arrow keys and `+`/`-` also work. Click the
globe to survey a site for a base.

In battle: click or tap one of your people to select them, then a tile to move (on touch, tap
once to preview and again to go). Click the alien to line up your best shot, or pick Snap, Aimed or
Auto (`1`/`2`/`3`) and then a target. `B` stun baton, `H` medikit, `F` turn to face, `K` kneel,
`N` next unit. Drag or hold `W`/`A`/`S`/`D` to pan, right-drag or `Q`/`E` to turn the view, scroll or pinch to zoom.

In the base view: drag to turn, scroll or pinch to zoom, `[`/`]` or Page Up/Down to change level,
`R` rotates, `X` demolishes, `Esc` goes back to inspecting. On touch screens, tap once to preview
a spot and again to build.

## Layout

- `src/geoscape/geo.ts`: lat/lon maths and sun position
- `src/geoscape/clock.ts`: game clock and time speeds
- `src/geoscape/biomes.ts`: biome types and the rules that place them
- `src/geoscape/blocs.ts`: the 16 blocs, territory lookup
- `src/geoscape/cities.ts`: major cities
- `src/geoscape/mapTextures.ts`: draws the map, night lights and border textures
- `src/geoscape/globe.ts`, `labels.ts`, `baseMarks.ts`, `orbitView.ts`: rendering, labels, base
  markers and camera controls
- `src/campaign.ts`: the campaign: shared clock and funds, site surveys, founding bases, staff, research, saving
- `src/staff.ts`: people, jobs and the research projects
- `src/main.ts`, `src/base.ts`, `src/combat.ts`: the geoscape, base and combat screens
- `src/tactical/rules.ts`: stats, weapons, TU costs, accuracy and damage
- `src/tactical/map.ts`: the battlefield grid, line of sight and pathfinding
- `src/tactical/battle.ts`: turns, actions, reaction fire, bleeding, morale and the alien's AI
- `src/tactical/cityMap.ts`: the city map generator and its per-biome looks
- `src/tactical/prologue.ts`: the opening battle, the survivors and what they can bring home
- `src/tactical/view.ts`, `camera.ts`: battlefield rendering and camera controls
- `src/base/rooms.ts`: base facilities, costs and power
- `src/base/layout.ts`: the base grid, placement rules, tunnel connectivity, power, construction,
  city cover and base specialism
- `src/base/baseView.ts`, `baseCamera.ts`: base rendering and camera controls
- `src/data/*.json`: coastlines and bloc shapes, generated by `npm run build:geo`
  (edit the bloc membership lists in `scripts/build-geo.mjs`)

## Tech

TypeScript, [three.js](https://threejs.org) and [Vite](https://vitejs.dev). Coastlines are from
[Natural Earth](https://www.naturalearthdata.com) (public domain) via `world-atlas`.
