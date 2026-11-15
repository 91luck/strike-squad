# The Astra Saga: story

The saga's ten stages tell one story. In the game it is told in two places, and neither ever stops play:

- **The radio** (`client/src/game/comms.ts`): short lines with a portrait over the action. A stage opens with its
  chapter's lines (all of them the first time, then only the first), the final boss speaks when it wakes, when it
  changes phase and when it falls.
- **The chapter page** on the results screen after a win: what happened, and the hook for the next chapter.

The words live in `client/src/story.ts`. Every name is original (see the originality rule in `ASTRA_SAGA.md`).

## The world and the cast

- **Akshaya**, a realm where the dawn is kept by one lamp, the **Akhand Deep**.
- **Vani**, the lamp's flame: a small, warm, brave spirit in a clay lamp. She pulled the squad through a rift when the
  realm's own warriors fell. She is the guide and the heart of the story (portrait: `art3d/story_art.py`).
- **Saptashir**, king of Suvarna, seven heads. Once the lamp's own keeper: afraid to grow old, he drank one drop of
  its oil and grew a second head; a hundred years later, a seventh. He stole the lamp to drink all of it.
- **The squad**: the player's heroes, speaking as "you", dry and brave.
- **The ten guardians' astras**, held by Saptashir's generals. Each stage wins one back.

## The arc

| Ch. | Stage           | What happens                                                                         | Turn                                                          |
| --- | --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1   | Agnivan         | Vani meets the squad; the burning forest; Jwala Vriksh-asur holds the Agniastra.     | Vani flickers when no one is looking.                         |
| 2   | Sagar Setu      | The sinking bridge; Chhaya hunts their shadows.                                      | First sight of Suvarna burning; Saptashir is watching.        |
| 3   | Vayu Shikhar    | Saptashir speaks for the first time; the "sage" on the summit is Aandhi in disguise. | The real sage: "ask your flame what it costs her".            |
| 4   | Naag Lok        | The squad asks; Vani dodges. Serpents in the dark.                                   | Her flame is smaller: every astra freed burns her lower.      |
| 5   | Maya Nagri      | Vani admits it. Darpan-asur shows each of them their worst future.                   | A future where Vani goes out and the dawn comes anyway.       |
| 6   | Bhasm Parvat    | The ash dancer; Raakhasur is undone by his own hand.                                 | The road to the plain and Saptashir's army.                   |
| 7   | Samarpan Maidan | Maniyodha, an honourable enemy bound by an oath.                                     | He keeps his oath, loses, and lets them pass: a free man.     |
| 8   | Chakra Durg     | Suryakavach cannot be hurt while the sun shines; the Chakram covers it.              | Vani, candle-small: "I was not always a flame."               |
| 9   | Dwand Bhoomi    | Jodasur, born in two halves.                                                         | Saptashir was the lamp's keeper. Vani is what he left behind. |
| 10  | Suvarna Nagri   | Seven heads; the amrit in his heart. "I only wanted more time."                      | Vani gives the last of her light; the dawn comes.             |

The ending leaves the rift open, with something on the other side watching: the hook for a second saga.

## Writing rules

- A radio line is at most 100 characters (a test checks it): one breath, readable mid-fight.
- Bosses speak in character; the squad is dry and brave; Vani is warm and never complains.
- Each chapter ends on a turn that makes the next one matter.
