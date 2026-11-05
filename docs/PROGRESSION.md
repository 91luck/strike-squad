# Progression: the "one more run" loop

The missions give a player something to do; this layer gives them a reason to come back. It is client-side only: the
simulation and the server never see it, so it cannot affect fairness, netcode or the saga's balance.

Code: `client/src/profile.ts` (rules and saving), `client/src/villains.ts` (the "up next" tease), `client/src/weekly.ts`
(weekly challenges), and the UI wiring in
`client/src/main.ts`. Tests: the "profile" and "villain tease" groups in `client/tests/client.test.ts`, and the first
clear / hero tests in `e2e/game.spec.ts`.

## What a player sees

| Moment                 | What happens                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Menu                   | A card with level, XP bar, day streak and "Next hero: Viper at LV 2" (always one goal in sight).         |
| First visit of a day   | A daily reward of astra shards: 1 on day 1, one more each day in a row, up to 5. A missed day resets it. |
| End of every run       | XP bar fills, then LEVEL UP, NEW HERO and trophy lines slide in. A lost run still pays a little XP.      |
| Right below the reward | "UP NEXT": the next stage, its boss names, a villain taunt, and the astra the player will learn.         |
| After a loss           | The same stage's villain taunts the player ("THE VILLAIN WAITS"), a reason to retry at once.             |
| Squad picker           | Locked heroes are visible, greyed, with "Unlocks at LV N". Clicking one says what opens it.              |
| Saga screen, Trophies  | 12 one-time goals; each pays 2 astra shards.                                                             |

## The numbers

- **XP per run:** a win pays 100 + 40 per star (+60 the first time a stage is cleared); a loss pays 25. On top: 2 per
  enemy defeated (capped at 60 enemies), 5 per style rank, and 20 for hurting a boss. A run everybody abandoned pays
  nothing.
- **Level curve:** total XP to reach level L is `50 x L x (L - 1)`: level 2 at 100, 3 at 300, 4 at 600, 5 at 1000. The
  first three-star clear alone reaches level 2, so the first unlock comes in the first few minutes. Cap: level 30.
- **Heroes:** Blaze, Nova and Tusk are open from the start. Viper opens at level 2, Sparky 3, Ghost 4, Kiki 5, Sarge 6
  (`HERO_UNLOCK_LEVEL`). A hero chosen before it was unlocked falls back to Blaze.
- **Trophies:** First Blood, Flawless, Style Master, Boss Slayer, Super Star, Hundred Down, Asura Bane, Devoted (3-day
  streak), Unbroken (7-day streak), Halfway There, Astra Master, Full Squad. See `TROPHIES` in `profile.ts`.

## Hero passives

Each hero has one passive (Blaze takes less damage, Viper knifes harder, Kiki fires faster …): the table is in
[GAME_RULES.md](GAME_RULES.md#hero-passives). Unlocking a hero therefore opens a new way to play, not a stronger
soldier. The menu shows the selected hero's passive under its name; the squad picker shows it on every card, and a
locked card shows the passive it will bring.

## Weekly challenges

Code: `client/src/weekly.ts`. Three goals per ISO week (Monday to Sunday), picked from the week number with a fixed
hash, so every player has the same three goals in the same week (friends can race).

- The first goal is always one that any win moves forward (clear N stages, or earn N saga stars), so a new player
  sees weekly progress after their very first win.
- The other two come from a pool that pushes a different way to play: defeat enemies, super moves, a long combo, a
  style rank, boss fights, co-op clears online, a Hard clear, three-star clears, and clears with different heroes.
- Each finished goal pays 3 shards and 150 XP (the XP is added to that run's XP bar); finishing all three opens the
  weekly chest (+5 shards). Each pays once per week.
- Menu: "Weekly 1/3" button on the profile card opens the list with progress bars and the days left. Results: one
  line per goal the run moved, "Weekly done" when one finished.
- Saved under `strikesquad.weekly.v1` (cloud save on CrazyGames); a new week clears the old progress.

## Saving

The profile is stored under `strikesquad.profile.v1` next to the settings and progress. On CrazyGames it is part of
`SAVE_KEYS`, so it lives in the portal's cloud save. Blocked or wiped storage just starts a fresh profile.

## Changing it safely

- Tune the economy in `profile.ts` only (the constants and `runXp`); the unit tests check the properties that matter
  (the curve always rises, every hero has a level, the first clear opens the first hero), not magic numbers.
- A new trophy is one entry in `TROPHIES`; nothing else needs to change.
- Villain boss names are read from each stage's own level, so a renamed boss shows up in the tease by itself. Only the
  taunts (`TAUNTS`) are written by hand.
- Tune a hero passive in `shared/src/heroes.ts` (`perk`); the sim tests check each passive really changes its one
  thing and that no two heroes share one. Weekly goals and their targets are in `weekly.ts` (`BASIC`, `SPECIAL`).
- Ideas not built yet: hero mastery levels, a villain gallery in the codex, a weekly leaderboard (needs a server).
