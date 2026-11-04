# Talkers, lookouts and medics

Step 4a of the attributes plan (Mike, 2026-11-04: "have good talkers do the talking"). Formulas:
`tactical/attributes.ts` (bottom). Hooks: `campaign/campaign.ts`, `tactical/battle.ts`.

Every number here is pinned on the first night's people, so the defaults are where they were
before: the right person for the job claws some back, an ordinary civilian does a little worse.

## Talk = Charisma/2 + Persuasion

A civilian is 20, a police officer about 40 (the pivot), the liaison about 57.

| What | Formula | Liaison | Civilian |
| --- | --- | --- | --- |
| People a recruiter turns up | × 1 + (talk − 40)/100, 0.5–1.6 | ×1.17 | ×0.8 |
| What a candidate asks (food, medicine) | × 1 + (40 − talk)/200, 0.6–1.2 | ×0.92 | ×1.1 |
| Black-market prices | × 1 + (40 − talk)/400, 0.85–1.1 | ×0.96 | ×1.05 |

The best talker at home does all the dealing (shown above the market), and each deal teaches them
a little Persuasion.

## Lookout = Perception/2 + Scrounging

A civilian is 20, a reservist about 34; the pivot is 30. A run's daily chance of trouble is
× 1 + (30 − best lookout on the team)/200 (0.7–1.2). The odds on the send button include it.

Each person's finds are × 1 + (Scrounging − 10)/200: no Scrounging finds 5% less, a drifter with
30 finds 10% more. An ordinary team rolls exactly what it rolled before.

## Medicine

- **Nursing at home**: a dose of medicine heals max(1, 2 + round((Medicine − 20)/20)) on top of
  rest, from the best medic fit to work at home. A paramedic gives 3, nobody trained 1. Each patient
  teaches them a little.
- **Medikit in a fight**: heals its 10, + round((Medicine − 20)/8). A paramedic +3, nobody trained −2.

## Strength behind the baton

+ round((Str − 60)/3) stun a blow. A police officer is 0, a guard +2, the liaison −8.

## Balance check

Food sim, 40 seeds, before vs after: median days within 2, desertions within noise both ways. The
autoplay fight sim doesn't carry profiles, so it is unchanged.

## Not yet

- Night sight from Perception: sight is one number per battle today; making it per person touches
  every visibility check, so it waits.
- Perks (step 4b): Mike chose a random offer of three that fit what the person has done.
