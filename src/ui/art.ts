/**
 * Pictures for things in the game, dropped into src/art/<kind>/<id>.<ext> (see src/art/README.md).
 * Anything without a picture yet gets a plain placeholder, so art can arrive a piece at a time.
 */
const FILES = import.meta.glob("../art/**/*.{png,jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const BY_KEY = new Map<string, string>();
for (const [path, url] of Object.entries(FILES)) {
  const m = path.match(/\/art\/([^/]+)\/([^/]+)\.\w+$/);
  if (m) BY_KEY.set(`${m[1]}/${m[2]}`, url);
}

/** The picture for `id` among `kind` (such as "tech"), or null if there isn't one yet. */
export const art = (kind: string, id: string): string | null => BY_KEY.get(`${kind}/${id}`) ?? null;
