# Art

Pictures for things in the game. Portraits and aliens sit at the top level and are imported by
`src/tactical/portraits.ts`. Everything else goes in one folder per kind of thing, one file per
thing, named by its id, and `src/ui/art.ts` picks it up on its own:

```
src/art/tech/plasmaPistol.webp     the Plasma pistol card in the tech tree
src/art/tech/alloyArmour.jpg
```

- Any of `.webp`, `.jpg`, `.png`. Square, 512 × 512 is plenty; keep each file under ~150 KB
  (webp or jpg at quality 80 does that), because the single-file build carries every picture.
- Anything without a picture shows a placeholder, so pictures can be added a few at a time.
- The ids, and a prompt for each picture, are in `docs/art/prompts.md`.
