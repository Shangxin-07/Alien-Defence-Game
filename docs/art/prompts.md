# Art prompts

Prompts for making the game's pictures with an image generator (ChatGPT, or anything similar).
Each picture is one thing in the game; save it under `src/art/<kind>/<id>.webp` (see
`src/art/README.md`). Anything without a picture shows a placeholder, so they can arrive a few at a
time.

## How to use these

1. Paste the **style block** first, then one **subject** line. Keep the style block the same for
   every picture: that is what makes them look like one set.
2. Ask for a square picture. If a result drifts (cartoony, too clean, text in the picture), say
   "grittier, darker, no text" and try again.
3. Save it as `<id>.png` (the id is in the heading), or just upload the pictures to the project
   and Claude will shrink them and put them in.

## Style block

> Square illustration for a card in a gritty strategy game about humans losing a war to alien
> invaders. Painterly, realistic, desaturated: dark blue-grey shadows, one strong practical light
> source, film grain. Near-future world after a war: improvised, worn, scavenged equipment. Alien
> technology is smooth, dark and organic with a violet glow. Subject centred with dark space
> around it so it reads at small sizes. No text, no logos, no UI, no borders.

## Tech tree (`src/art/tech/`)


### T1

- **Debrief the survivors** (`debrief`): three exhausted survivors in torn police and security uniforms sitting around a folding table in a dim underground room, one writing in a notebook by lamplight, a cassette recorder on the table.
- **Survey the crash site** (`crashSite`): a rain-soaked city road junction at dawn with a scorched crater, police tape, and a few curved fragments of dark metallic hull glinting in the rubble.
- **Pipe bombs** (`pipeBombs`): a workbench with steel pipe sections, end caps, a coil of fuse, jars of chemicals and a pair of safety goggles, close-up.
- **Reloading** (`reloading`): a reloading bench with brass cartridge cases, a hand press, a scale and boxes of fresh rounds, close-up.

### T2

- **Frag grenades** (`fragGrenades`): a row of hand-made fragmentation grenades with scored metal casings on a cloth, one with its pin being taped.
- **Armour-piercing rounds** (`apRounds`): a handful of rifle rounds with black hardened steel tips spilling from a cardboard box onto a metal bench.

### T3

- **Demolition charges** (`demolition`): a shaped demolition charge taped to a concrete bunker door, wires running to a detonator on the floor.

### H1

- **Alien alloys** (`alloys`): a fragment of iridescent dark grey alien hull alloy held in steel tongs over a blowtorch flame, faint hexagonal grain visible in the metal.
- **Alloy-tipped rounds** (`alloyRounds`): close-up of bullets tipped with slivers of iridescent alien alloy, laid out in a neat row on a bench.
- **Alloy armour** (`alloyArmour`): a tactical vest fitted with angular plates of iridescent dark alien alloy, hanging on a rack in a dim armoury.
- **Alloy shield** (`alloyShield`): a battered riot shield with a plate of iridescent alien alloy riveted into its face, scorched where a plasma bolt struck.

### H2

- **Cell carbine** (`cellCarbine`): a home-built carbine: a human rifle stock and body with a glowing violet alien power cell clamped underneath and a dark alloy barrel with cooling fins.
- **Heartbeat scanner** (`heartbeat`): a handheld scanner with a cracked green screen showing faint pulsing dots behind a wall outline, alien circuitry visible through an open panel.
- **Regen medikit** (`regenMedikit`): an open field medikit with ordinary bandages beside syringes of faintly glowing amber fluid in an improvised rack.
- **Shaped plasma charge** (`shapedCharge`): a disc-shaped charge built around a glowing alien power cell, pressed against the curved dark hull of an alien craft.

### H3

- **Powered alloy suit** (`poweredSuit`): a human soldier in bulky powered armour made from angular alien alloy plates, a violet power cell glowing at the hip, standing in a concrete corridor.
- **Link headset** (`linkHeadset`): a rugged military headset fitted with a small organic-looking alien node behind the ear, faint glowing veins in it.
- **Cell truck** (`cellTruck`): a battered white panel van in an underground garage, its rear doors open showing a softly glowing alien sphere strapped into a steel cradle.

### A1

- **Plasma pistol** (`plasmaPistol`): an alien plasma pistol lying on a lab bench under a lamp: smooth, organic, dark curved casing with a violet-glowing power cell, faint heat haze.
- **Plasma scattergun** (`plasmaScatter`): a heavy, wide-muzzled alien scattergun built for a huge hand, dark ridged casing with glowing violet vents, on a steel table.
- **Needle rifle** (`needleRifle`): a long slender alien rifle with a needle-thin barrel and translucent sliver magazine, resting on a padded lab cradle.
- **Hunter autopsy** (`autopsy`): a grey-skinned alien corpse under a sheet on a steel autopsy table, only a clawed hand and part of a dense ridged skull visible, harsh overhead light.
- **Interrogate the captive** (`interrogation`): a live alien seen through thick reinforced glass in a concrete containment cell, crouched, eyes reflecting the light, a map pinned to the outside of the glass.
- **Tracking implant** (`implant`): a small alien tracking implant, like a bean of dark chitin with fine wires, held in tweezers above a petri dish.
- **Hunter biology** (`biology`): a cluttered research wall covered in sketches of alien anatomy, x-rays of dense bones and handwritten notes, a mug of cold coffee in front.
- **Commander autopsy** (`commanderAutopsy`): the back of an alien skull on an autopsy table, opened to show an extra glowing organ at its base, surgical tools beside it.
- **Interrogate the commander** (`commanderInterrogation`): a tall alien commander standing perfectly still in a containment cell, staring straight at the viewer through scratched glass.

### A2

- **Vent the plasma pistol** (`ventPistol`): a scientist's gloved hands holding an alien plasma pistol with thermal camera readouts showing heat bleeding off its casing.
- **Vent the scattergun** (`ventScatter`): an alien scattergun clamped in a test rig, its stock cut down and fitted with heat-sink fins, faint heat shimmer.
- **Vent the needle rifle** (`ventNeedle`): an alien needle rifle opened on a bench, a small glowing component highlighted, oscilloscope traces in the background.
- **Craft core** (`coreStudy`): a sealed spherical alien craft core glowing softly violet, held in a cradle behind lead-lined glass, warning tape on the floor.
- **Cell recharging** (`cellRecharge`): five alien power cells in a row wired to a glowing craft core, each cell lighting up in turn.
- **Copy the plasma guns** (`plasmaCopies`): an engineering workshop bench with an alien plasma pistol disassembled into parts beside a crude human-made copy.
- **Shell armour** (`shellArmour`): a piece of alien chitin shell armour recut and strapped with nylon webbing to fit a human torso, on a mannequin.

### A3

- **Cold recharge** (`coldRecharge`): a spent, cracked alien power cell on a workbench slowly glowing back to life under a web of improvised cables.
- **Siege caster** (`siegeCaster`): an enormous alien siege weapon lying on a loading pallet, ridged dark casing and a wide glowing violet muzzle.
- **Lance** (`lance`): a long, elegant alien beam weapon on an alien armoury rack, cold blue-white light running along its length.
- **Their flight** (`flight`): a captured alien craft in a vast underground hangar, floodlights on it, human engineers dwarfed on scaffolding beside it.

## Next sets

Once the tech cards look right, the same style block works for:
- **Armoury items** (`src/art/gear/`): service pistol, pump shotgun, assault rifle, padded jacket,
  stab vest, body armour, stun baton, medikit, and the three alien guns.
- **Alien races** (`src/art/aliens/`): Strider, Brute, Shade, and a commander.
- **Base rooms** (`src/art/rooms/`): one per room on the base screen.
- **Scavenging places** (`src/art/places/`): homes, supermarket, pharmacy, hardware store,
  industrial estate, police station.

