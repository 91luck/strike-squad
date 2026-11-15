import type { SagaId } from '@strikesquad/shared';

/**
 * The Astra Saga's story (docs/STORY.md has the whole of it): told in the game as short radio lines over the action
 * (story-comms in game/comms.ts: a portrait, a name, a line typed out, never stopping play), and as a chapter page on
 * the results screen when a stage is won.
 *
 * The cast is original. VANI is the flame of the Akhand Deep, the lamp that keeps the dawn of the realm of Akshaya
 * lit; she pulled the squad through the rift when the realm's own warriors fell. SAPTASHIR, the seven-headed king of
 * Suvarna, stole the lamp to drink the amrit in its oil and live for ever; his generals hold the ten astras that once
 * guarded it. Every astra the squad wins back burns Vani's flame a little lower, and she does not tell them.
 */

export type Speaker = 'vani' | 'hero' | 'boss' | 'saptashir';

export interface Line {
  who: Speaker;
  text: string;
}

export interface Chapter {
  /** Chapter title on the results page. */
  title: string;
  /** Said as the stage begins (the first time it is played, all of it; afterwards only the first line). */
  open: Line[];
  /** The final boss's first words when it wakes. */
  boss: Line[];
  /** When the boss changes phase. */
  rage: Line;
  /** When it falls. */
  down: Line[];
  /** The chapter page on the results screen after the win. */
  page: string;
  /** The hook for the next chapter. */
  next: string;
}

export const CHAPTERS: Record<SagaId, Chapter> = {
  'astra-1': {
    title: 'Chapter 1 · The Lamp in the Fire',
    open: [
      {
        who: 'vani',
        text: 'You came! I am Vani, the flame of the Akhand Deep. I pulled you through the rift.',
      },
      { who: 'vani', text: 'Saptashir stole my lamp. Without it, dawn never comes to Akshaya again.' },
      { who: 'hero', text: 'Long story short: the forest is on fire and we are standing in it.' },
      { who: 'vani', text: 'Then run! The Agniastra burns in the heart of this forest. Take it back!' },
    ],
    boss: [{ who: 'boss', text: 'Little sparks… I am the fire that ate this forest. You are kindling.' }],
    rage: { who: 'boss', text: 'My bark turns to iron! Climb, if you can.' },
    down: [
      { who: 'boss', text: 'The heart… goes out…' },
      { who: 'vani', text: 'The Agniastra is free! It is yours now. Hold it close.' },
    ],
    page:
      'The heart of the burning forest went dark, and the Agniastra flew to the squad like a bird coming home. ' +
      'Vani glowed brighter than she had in a hundred years. Then, when no one was looking, she flickered.',
    next: 'Next: Sagar Setu. A bridge that sinks, a sea that hunts, and a shadow with jaws.',
  },
  'astra-2': {
    title: 'Chapter 2 · The Drowned Bridge',
    open: [
      { who: 'vani', text: 'The old sea bridge to Suvarna. Half of it sank when Saptashir took the lamp.' },
      { who: 'hero', text: 'Floating stones that sink when you stand on them. Love it.' },
      { who: 'vani', text: 'Keep hopping. Something below the water has been following my light.' },
    ],
    boss: [{ who: 'boss', text: 'I do not chase you. I chase your shadow. And your shadow is slow.' }],
    rage: { who: 'boss', text: 'The tide answers me! Drown with your shadows!' },
    down: [
      { who: 'boss', text: 'Without shadows… there is no me…' },
      { who: 'vani', text: 'The Jalastra! Rain enough to drown a fire astra. We will need it.' },
    ],
    page:
      'Chhaya sank into the sea she came from, and the tide went still. On the far shore the squad saw it for the ' +
      'first time: Suvarna, the golden city, burning on the horizon. Saptashir was watching them back.',
    next: 'Next: Vayu Shikhar. Climb into the storm. A sage waits on the summit.',
  },
  'astra-3': {
    title: 'Chapter 3 · The Sage of Storms',
    open: [
      {
        who: 'saptashir',
        text: 'So the little lamp found soldiers. Climb my mountain, soldiers. The fall is long.',
      },
      { who: 'vani', text: 'That was him. Do not listen. A sage on the summit keeps the Vayuastra safe.' },
      { who: 'hero', text: 'A friendly sage? On this trip? Sure.' },
    ],
    boss: [{ who: 'boss', text: 'Welcome, travellers. Sit, rest… and let the wind carry you off my peak.' }],
    rage: { who: 'boss', text: 'Enough tea! Now, the true storm!' },
    down: [
      { who: 'boss', text: 'The real sage… is in the cave below… I only wore his face…' },
      { who: 'vani', text: 'The Vayuastra is ours. And somewhere, an old sage is free.' },
    ],
    page:
      'The sage was Aandhi in disguise, and the real one was found in the cave below, tied up and furious. He told ' +
      'the squad one thing: “The lamp burns for whoever carries the astras. Ask your flame what it costs her.”',
    next: 'Next: Naag Lok. Down into the dark, where serpents never miss.',
  },
  'astra-4': {
    title: 'Chapter 4 · The Serpent Below',
    open: [
      { who: 'hero', text: 'Vani. The sage said the astras cost you something. What did he mean?' },
      { who: 'vani', text: 'He meant… mind the dark. Naag Lok is close, and serpents see heat, not light.' },
      { who: 'vani', text: 'The Naagastra is here, and the eagle that hunts it. Win both.' },
    ],
    boss: [{ who: 'boss', text: 'A flame, down here? My children have never tasted light. Feed them.' }],
    rage: { who: 'boss', text: 'Rise, all my heads! The lake is ours!' },
    down: [
      { who: 'boss', text: 'The eagle… always the eagle…' },
      { who: 'vani', text: 'Naagastra and Shyenastra, both free. Five astras left.' },
    ],
    page:
      'Vishdhar coiled into the poison lake and did not rise. In the quiet that followed, the squad noticed what Vani ' +
      'had hidden for four chapters: her flame was smaller. Every astra set free had taken a little of her light.',
    next: 'Next: Maya Nagri. A palace of mirrors, where nothing is what it shows you.',
  },
  'astra-5': {
    title: 'Chapter 5 · The Hall of Mirrors',
    open: [
      {
        who: 'vani',
        text: 'Yes, every astra burns me lower. No, we are not stopping. Akshaya needs its dawn.',
      },
      { who: 'hero', text: 'Then we finish this fast. Before you run out.' },
      {
        who: 'vani',
        text: 'Maya Nagri lies. Floors that are not there, walls that are. Trust each other, not your eyes.',
      },
    ],
    boss: [
      { who: 'boss', text: 'Look into me, soldier. See yourself fail. See her go out. See it all, again.' },
    ],
    rage: { who: 'boss', text: 'More mirrors! More of you! Which one is real?' },
    down: [
      { who: 'boss', text: 'You saw the worst… and kept going? Then I have nothing left to show…' },
      {
        who: 'vani',
        text: 'Halfway. The paramastra wakes when you fight as one. Remember that, at the end.',
      },
    ],
    page:
      'In the last mirror the squad saw a future where Vani went out and the dawn came anyway. Darpan-asur meant it ' +
      'as a threat. Vani said it was the best thing she had ever seen.',
    next: 'Next: Bhasm Parvat. The mountain of ash, and a demon whose touch turns heads to dust.',
  },
  'astra-6': {
    title: 'Chapter 6 · The Ash Dancer',
    open: [
      {
        who: 'vani',
        text: 'Bhasm Parvat. Do not let Raakhasur touch your head. Nothing grows back from ash.',
      },
      { who: 'hero', text: 'Noted. No head-touching. Anything else?' },
      { who: 'vani', text: 'He loves to dance. When Nartaki appears, copy her steps. He will copy you.' },
    ],
    boss: [{ who: 'boss', text: 'One touch. Only one. And you will blow away like everything else here.' }],
    rage: { who: 'boss', text: 'Dance with me! Faster! FASTER!' },
    down: [
      { who: 'boss', text: 'My own hand… on my own head… tricked by a dance…' },
      { who: 'vani', text: 'The Vidyutastra. Lightning in your hand. Four astras left.' },
    ],
    page:
      'Raakhasur ended the way he ended everyone else: with his own burning hand. Ash fell like snow over the ' +
      'mountain, and for the first time the squad could see the road down to the plain where Saptashir’s army waited.',
    next: 'Next: Samarpan Maidan. An army, a chariot, and a warrior who fights out of honour, not hate.',
  },
  'astra-7': {
    title: 'Chapter 7 · The Honourable Enemy',
    open: [
      {
        who: 'vani',
        text: 'Maniyodha leads this army. He swore an oath to Saptashir long ago, and he keeps oaths.',
      },
      { who: 'hero', text: 'So he is a good guy fighting for a bad guy.' },
      {
        who: 'vani',
        text: 'When he calls the Samarpanastra, stop fighting. Bow. It only strikes those who resist.',
      },
    ],
    boss: [{ who: 'boss', text: 'You fight well. I wish we had met on the same side. Draw.' }],
    rage: { who: 'boss', text: 'Then I give you everything I have. Samarpan!' },
    down: [
      { who: 'boss', text: 'My oath is kept: I fought to the end. The road to Chakra Durg is yours. Go.' },
      { who: 'vani', text: 'He let us pass. Not every enemy here is a monster.' },
    ],
    page:
      'Maniyodha laid down his bow and told them the secret of the fortress of rings: “The Chakram turns the gates. ' +
      'Win the Chakram, and the fortress opens itself.” Then he walked away from the war, a free man.',
    next: 'Next: Chakra Durg. Seven rings of walls, and a king who cannot be hurt while the sun shines.',
  },
  'astra-8': {
    title: 'Chapter 8 · The Seventh Gate',
    open: [
      { who: 'saptashir', text: 'You turned my best warrior. Clever. Suryakavach will not be turned. Ever.' },
      { who: 'vani', text: 'His armour drinks the sun. While it shines, nothing touches him.' },
      { who: 'hero', text: 'Then we wait for the sun to go away. Easy.' },
    ],
    boss: [{ who: 'boss', text: 'The sun is my shield. Try to put out the sun, little soldiers.' }],
    rage: { who: 'boss', text: 'My mace was made from a fallen star! Feel it!' },
    down: [
      { who: 'boss', text: 'The sky… went dark… who covered the sun…' },
      { who: 'vani', text: 'The Chakram covered it. Ours now. Two astras left, and then… him.' },
    ],
    page:
      'With the Chakram in their hands, all seven rings of the fortress turned at once and opened toward Suvarna. ' +
      'Vani was small now, the size of a candle. She told them a story that night: she had not always been a flame.',
    next: 'Next: Dwand Bhoomi. The wrestler-king who cannot be killed, because he was never one person.',
  },
  'astra-9': {
    title: 'Chapter 9 · Two Halves',
    open: [
      {
        who: 'vani',
        text: 'Jodasur was born in two halves and joined by force. Split him, and keep him split.',
      },
      { who: 'hero', text: 'Vani, what did you mean last night? You were not always a flame?' },
      { who: 'vani', text: 'Win first. Then I will tell you who Saptashir was before he had seven heads.' },
    ],
    boss: [{ who: 'boss', text: 'Break me in two, and I just get up twice. Come, wrestle a king!' }],
    rage: { who: 'boss', text: 'I am TWO kings now!' },
    down: [
      { who: 'boss', text: 'Kept apart… at last… it is quiet in my head…' },
      {
        who: 'vani',
        text: 'Saptashir was the lamp’s keeper. My keeper. He was afraid to die, so he stole forever.',
      },
    ],
    page:
      'Long ago a lamp-keeper loved his lamp so much he could not bear to grow old beside it. He drank one drop of ' +
      'its oil and grew a second head; a hundred years later, a seventh. Vani was the light he left behind.',
    next: 'Final chapter: Suvarna Nagri. The golden city, the seven heads, and the last of Vani’s light.',
  },
  'astra-10': {
    title: 'Chapter 10 · Dawn',
    open: [
      { who: 'saptashir', text: 'Little lamp. You came home. And you brought me soldiers to burn.' },
      { who: 'vani', text: 'Cut every head, and the amrit in his heart shows. That is where it ends.' },
      { who: 'hero', text: 'And you? What happens to you when we win?' },
      { who: 'vani', text: 'The dawn comes. That is all that matters. Go!' },
    ],
    boss: [{ who: 'saptashir', text: 'Seven heads, seven lifetimes of hate. Which one will you cut first?' }],
    rage: { who: 'saptashir', text: 'PRALAY! Let the whole city burn with you!' },
    down: [
      { who: 'saptashir', text: 'I only… wanted… more time…' },
      { who: 'vani', text: 'Then here is mine. Light the lamp. Light it with me…' },
    ],
    page:
      'The Akhand Deep was lit again, and the sun rose over Akshaya for the first time in a hundred years. Where ' +
      'Vani had been there was only warm light, everywhere at once. And far above, the rift the squad came through ' +
      'did not close. Something on the other side had been watching all along.',
    next: 'The Astra Saga is complete. Replay any chapter for three stars, or take on the daily trial.',
  },
};

export const SPEAKER_NAME: Record<Speaker, string> = {
  vani: 'VANI',
  hero: 'YOU',
  boss: '',
  saptashir: 'SAPTASHIR',
};

/** What Vani says when a surprise breaks out (one of these, by turn), and the banner that names it. */
export const SURPRISE_LINES: Record<string, { banner: string; lines: string[] }> = {
  ambush: {
    banner: '⚔ AMBUSH! They were waiting on both sides',
    lines: ['Behind you too! They were hiding, waiting for us.', 'An ambush! Back to back, everyone!'],
  },
  elite: {
    banner: '👑 AN ELITE HUNTER! Bring it down for a reward',
    lines: [
      'That one is stronger than the rest. Bring it down and I can heal you.',
      'A champion of Saptashir. Beat it!',
    ],
  },
  skyfall: {
    banner: '☄ FIRE FROM THE SKY! Watch the marks',
    lines: [
      'The sky is burning! Keep moving, watch the marks on the ground.',
      'Fire rain! Do not stand still!',
    ],
  },
  raid: {
    banner: '🪽 RAIDERS FROM THE SKY!',
    lines: ['Above us! They are diving from behind.', 'Look up! Wings, coming fast!'],
  },
  tremor: {
    banner: '〰 THE GROUND SHAKES! Jump the waves',
    lines: [
      'The ground is breaking! Jump when the wave comes.',
      'Tremors! Something big is moving below us.',
    ],
  },
  stampede: {
    banner: '🐘 STAMPEDE! War elephants from behind',
    lines: ['Elephants! Run, or get out of their way!', 'The ground is shaking. Elephants, charging!'],
  },
  duel: {
    banner: '🤼 A CHALLENGE! Two champions of the akhada',
    lines: ['Two champions want a fight. Give them one.', 'The akhada calls you out. Win the duel!'],
  },
  blessing: {
    banner: '🪔 VANI’S BLESSING! Healed, supers charged',
    lines: ['Take a little of my light. You will need it.', 'Here, breathe. My light is yours for a moment.'],
  },
};

/**
 * Each stage's goal as the player meets it: its title on the HUD chip, how its captives or targets look in the world
 * (game/goal-art.ts), and what Vani says when it starts, as each one falls, when it is done and when it is missed.
 */
export interface GoalText {
  title: string;
  look: 'spirit' | 'light' | 'cage' | 'totem' | 'mirror' | 'lock' | 'shrine' | 'banner' | 'tide' | 'bell';
  start: string;
  item: string;
  done: string;
  fail: string;
}

export const GOAL_TEXT: Record<SagaId, GoalText> = {
  'astra-1': {
    title: 'Free the forest spirits',
    look: 'spirit',
    start: 'Forest spirits are trapped in rings of fire. Touch them to set them free!',
    item: 'Free! It is flying home.',
    done: 'Every spirit is free. The forest will grow back. Thank you.',
    fail: 'We left some behind… keep going, the fire is right behind us.',
  },
  'astra-2': {
    title: 'Cross before the tide rises',
    look: 'tide',
    start: 'The tide is coming in. Cross to the far shore before it swallows the bridge!',
    item: '',
    done: 'Across in time! The sea can have the bridge now.',
    fail: 'The tide caught us. Wet, but alive. Keep going.',
  },
  'astra-3': {
    title: 'Break the storm totems',
    look: 'totem',
    start: 'Those carved totems feed the storm. Shoot them down!',
    item: 'A totem breaks. The wind drops a little.',
    done: 'All the totems are down. The mountain can breathe.',
    fail: 'Some totems still stand. The storm will be stronger at the top.',
  },
  'astra-4': {
    title: 'Gather the lost lights',
    look: 'light',
    start: 'Lost lights wander down here, little pieces of my flame. Gather them!',
    item: 'Oh, that is warm. One more light.',
    done: 'Every light gathered. I feel brighter already.',
    fail: 'Some lights stay lost in the dark. Maybe next time.',
  },
  'astra-5': {
    title: 'Shatter the true mirrors',
    look: 'mirror',
    start: 'Three mirrors here are real. They make the illusions. Shatter them!',
    item: 'A true mirror shatters!',
    done: 'All three broken. The palace cannot lie so well now.',
    fail: 'A true mirror survives. Watch what you trust in there.',
  },
  'astra-6': {
    title: 'Guard the shrine fire',
    look: 'shrine',
    start: 'An old shrine fire still burns here. Guard it until it blazes up!',
    item: '',
    done: 'The shrine fire blazes! The ash pulls back from it.',
    fail: 'We could not hold the shrine. The ash takes it.',
  },
  'astra-7': {
    title: 'Hold the line',
    look: 'banner',
    start: 'They are charging! Hold this ground until the bar fills. Do not give it up!',
    item: '',
    done: 'The line held! Their charge is broken.',
    fail: 'The line broke. Push on anyway!',
  },
  'astra-8': {
    title: 'Break the gate locks',
    look: 'lock',
    start: 'Golden locks hold the rings shut. Break every lock!',
    item: 'A lock breaks. A ring turns.',
    done: 'Every lock broken. The fortress is opening for us.',
    fail: 'Some locks hold. We go the hard way.',
  },
  'astra-9': {
    title: 'Reach the akhada before the bell',
    look: 'bell',
    start: 'The akhada bell rings soon. Reach the ring before it does, or the king fights fresh!',
    item: '',
    done: 'In before the bell! The crowd is roaring.',
    fail: 'The bell has rung. He is waiting for us, fresh.',
  },
  'astra-10': {
    title: 'Free the captives of Suvarna',
    look: 'cage',
    start: 'Saptashir keeps prisoners in cages along the road. Free them!',
    item: 'Free! Run, find your family!',
    done: 'Every captive is free. The city is already fighting back.',
    fail: 'Some are still in cages. We will come back for them.',
  },
};
