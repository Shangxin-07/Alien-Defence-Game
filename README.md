# Alien Defence

A brutal, turn-based alien defence game in the spirit of *UFO: Enemy Unknown* (1994).
Humanity is badly outmatched. The game splits between the **Geoscape** (a world view for
tracking contacts, building bases and managing the war) and **tactical combat** on the ground.

## Status

The geoscape and base building run as one game on one page, with one campaign clock and one
budget.

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
- `src/campaign.ts`: the campaign: shared clock and funds, site surveys, founding bases, saving
- `src/main.ts`, `src/base.ts`: the geoscape and base screens
- `src/base/rooms.ts`: base facilities, costs and power
- `src/base/layout.ts`: the base grid, placement rules, tunnel connectivity, power, construction,
  city cover and base specialism
- `src/base/baseView.ts`, `baseCamera.ts`: base rendering and camera controls
- `src/data/*.json`: coastlines and bloc shapes, generated by `npm run build:geo`
  (edit the bloc membership lists in `scripts/build-geo.mjs`)

## Tech

TypeScript, [three.js](https://threejs.org) and [Vite](https://vitejs.dev). Coastlines are from
[Natural Earth](https://www.naturalearthdata.com) (public domain) via `world-atlas`.
