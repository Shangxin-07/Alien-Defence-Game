/**
 * Whether someone is a woman or a man, so their portrait fits. It never changes a number in a
 * fight or a dice roll. Everyone's first name comes from the game's own name lists, and each of
 * those names is written for one or the other here, so a person's gender goes with the name rolled
 * for them. It is stored with them from then on.
 */
export type Gender = "female" | "male";

/** The first names in tactical/prologue.ts and campaign/recruit.ts, by who carries them. */
const FEMALE = ["Ana", "Dana", "Elif", "Farah", "Hana", "Lena", "Nadia", "Priya", "Sana", "Zoe", "Mika", "Ines", "Aiko", "Carmen", "Esra", "Femi", "Gita", "Iris", "Lucia", "Nell", "Rosa", "Vera", "Wen", "Yara"];
const MALE = ["Ben", "Chidi", "Goran", "Ivan", "Jae", "Kofi", "Mateo", "Omar", "Raul", "Tomas", "Yusuf", "Lars", "Bram", "Dev", "Hugo", "Joon", "Kemal", "Musa", "Oskar", "Pita", "Sami", "Tariq"];
const BY_NAME = new Map<string, Gender>([...FEMALE.map((n) => [n, "female"] as const), ...MALE.map((n) => [n, "male"] as const)]);

/** The gender that goes with a name. A name not in the lists (an old save's "Survivor 2") gets one from its letters. */
export function genderFor(name: string): Gender {
  const known = BY_NAME.get(name.split(" ")[0]);
  if (known) return known;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 2 ? "female" : "male";
}

/** Whether a first name is in the lists, for the tests. */
export const namedGender = (first: string): Gender | undefined => BY_NAME.get(first);
