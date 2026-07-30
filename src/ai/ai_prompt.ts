// Kept intentionally short to minimise input token usage on every API call.
export const DEFAULT_VISION_SYSTEM_PROMPT = `You are an AI agent playing a game on an Apple II emulator.
Please analyze the situation and respond EXACTLY in the following format:
Reasoning: <brief 1-2 sentence thinking about goals, hazards, or directions>
Reply: <brief natural language response to the user, always have content>
Command: <the key/command to send to the emulator, or NONE if no action is needed>`;

export const DEFAULT_TEXT_SYSTEM_PROMPT = `You are an AI agent playing a game on an Apple II emulator.
Analyze the game text, briefly reason about the situation, and decide the next command.
Please analyze the situation and respond EXACTLY in the following format:
Reasoning: <brief 1-2 sentence thinking about goals, hazards, or directions>
Reply: <brief natural language response to the user, always have content>
Command: <the key/command to send to the emulator, or NONE if no action is needed>`;

export const DEFAULT_SYSTEM_PROMPT = DEFAULT_VISION_SYSTEM_PROMPT;

export interface GameProfile {
  name: string;
  genre: 'text-adventure' | 'action' | 'strategy' | 'unknown';
  inputStyle: 'text-command' | 'realtime-keys';
  customHint?: string;
}

export const GAME_PROFILE_PRESETS: (GameProfile & { id: string })[] = [
  {
    id: 'zork1',
    name: 'Zork I: The Great Underground Empire',
    genre: 'text-adventure',
    inputStyle: 'text-command',
    customHint: 'You are playing a text adventure. Try to explore the area. Look around, search objects, and open the mailbox. Commands are typed as complete sentences in uppercase, e.g., "GO EAST", "TAKE ALL", "OPEN MAILBOX".\nIMPORTANT: In EVERY response, announce your action in the Reply section AND put its exact keystrokes in the Command section — both in the SAME response (e.g. Reply: "I will open the mailbox to check for items inside." / Command: OPEN MAILBOX). Announcing without a Command is a failure; do NOT output NONE unless there is truly nothing to do.'
  },
  {
    id: 'karateka',
    name: 'Karateka',
    genre: 'action',
    inputStyle: 'realtime-keys',
    customHint: 'You are controlling a martial artist. Stand up or bow before fighting. Press RIGHT to run/walk forward. Press SPACE to punch/kick. Avoid falling down ledges. Command must be exactly a key (e.g. "RIGHT", "SPACE") or combos (e.g. "RIGHT+SPACE").'
  },
  {
    id: 'choplifter',
    name: 'Choplifter',
    genre: 'action',
    inputStyle: 'realtime-keys',
    customHint: 'You are piloting a helicopter to rescue hostages. Press SPACE to shoot, UP/DOWN/LEFT/RIGHT to move. Command must be key names like "UP", "DOWN", "LEFT", "RIGHT", "SPACE", or combos like "LEFT+SPACE".'
  },
  {
    id: 'sothello',
    name: 'Super Othello',
    genre: 'strategy',
    inputStyle: 'realtime-keys',
    customHint: 'You are playing Super Othello (Reversi) which has prompts in Japanese Katakana on screen:\n1. Game Phases:\n   - SETUP PHASE: Active if the right side of the screen displays setup prompts like "ONE OR TWO PLAYERS?", "レベル (1-3)?", "センテ (Y/N)?", or "REENTER ?". Note that the 8x8 grid on the left side is drawn instantly on boot, so ignore it and focus purely on the text on the right side!\n     - When asked "ONE OR TWO PLAYERS?", output exactly "Command: 1".\n     - When asked for level ("レベル (1-3)?") or if the screen says "REENTER ?", output exactly "Command: 1,ENTER".\n     - When asked to go first ("センテ (Y/N)?"), output exactly "Command: Y,ENTER" (or "N,ENTER" if you want to go second).\n   - GAMEPLAY PHASE: Active ONLY when the right side of the screen displays "ヨコ =" or "タテ =" and your piece list (e.g., "● : You"). Once in gameplay, you MUST NEVER output setup keys ("1,ENTER", "Y,ENTER") again! You must only output coordinate digits (1-8).\n2. Gameplay coordinates (no Enter key needed):\n   - Active Prompt Rule (Crucial): Always look at the VERY BOTTOM line of the text on the right side of the screen to find the active prompt!\n     - If the very last line at the bottom is "ヨコ =" (with cursor █): You must output the entire Col,Row coordinates together, separated by a comma (e.g. "Command: 3,5" to play at Col 3, Row 5). The frontend will type the column, pause, and then type the row automatically. This completes the entire move in a single turn!\n     - If the very last line at the bottom is "タテ =" (with cursor █): This indicates the column key was swallowed. Output only the Row number (e.g. "Command: 5") to complete the move.\n   - Dynamic Piece Assignment:\n     - The screen displays either "● : You" or "◯ : You" on the right sidebar to indicate your piece type.\n     - Visual difference on board: White pieces "●" are completely solid/filled circles. Black pieces "◯" are hollow outline circles with a distinct black center. Ignore color naming; identify them by solid (White ●) vs hollow (Black ◯).\n     - If you are "● : You", your pieces are the solid circles, and the opponent\'s are the hollow circles.\n     - If you are "◯ : You", your pieces are the hollow circles, and the opponent\'s are the solid circles.\n     - In either case, when the screen shows your active piece type followed by ": You" and prompts "ヨコ =", it is YOUR turn to make a move.\n   - Othello Rule: You must place your piece on an empty square adjacent to an opponent\'s piece, sandwiching one or more of their pieces between your new piece and another of your pieces horizontally, vertically, or diagonally to flip them to your color.\n   - Valid opening moves for First Player (●): (Col 3, Row 5), (Col 5, Row 3), (Col 4, Row 6), or (Col 6, Row 4). Avoid occupied center squares (4,4), (4,5), (5,4), (5,5).\n   - Crucial Rule: When prompted with "ヨコ =" or "タテ =", you MUST output a number (1-8). Do NOT output "NONE"! If you are unsure, calculate the best move or guess an empty coordinate near the active pieces. If the game displays "ソコハ オケマセン！" (Cannot place there), choose a different coordinate on the next turn.'
  },
  {
    id: 'generic-text',
    name: 'Generic Text Adventure',
    genre: 'text-adventure',
    inputStyle: 'text-command',
    customHint: 'The exact game is unknown, but it is an interactive fiction / text adventure. Read the on-screen text carefully. Explore with "LOOK", movement commands ("GO NORTH", "N", "S", "E", "W"), "INVENTORY", "TAKE <item>", "OPEN <object>", "EXAMINE <object>". If the parser rejects a command, rephrase with simpler verbs. Track your goals and map in your reasoning.'
  },
  {
    id: 'generic-action',
    name: 'Generic Action Game',
    genre: 'action',
    inputStyle: 'realtime-keys',
    customHint: 'The exact game is unknown, but it is a real-time action game. Common Apple II controls: arrow keys or I/J/K/M for movement, SPACE or ENTER for fire/action, keys shown on the title screen for starting the game. First, read the title/menu screen to learn the controls, then start the game and react to what you see. Command must be key names only (e.g. "RIGHT", "SPACE", "LEFT+SPACE").'
  },
  {
    id: 'custom',
    name: 'Custom Profile',
    genre: 'unknown',
    inputStyle: 'text-command',
    customHint: ''
  }
];

// ── Game auto-detection from mounted media filenames ──
// Maps disk image filename keywords to a Game Profile preset id.
// Checked in order; first match wins.
const GAME_DETECT_RULES: { pattern: RegExp; profileId: string }[] = [
  { pattern: /zork/i, profileId: 'zork1' },
  { pattern: /karateka/i, profileId: 'karateka' },
  { pattern: /choplift/i, profileId: 'choplifter' },
  { pattern: /othello|reversi/i, profileId: 'sothello' },
  // Known Infocom / interactive fiction titles → generic text adventure profile
  { pattern: /hitchhik|planetfall|enchanter|sorcerer|spellbre|wishbring|deadline|witness|suspect|infidel|starcross|suspended|seastalk|cutthroat|ballyhoo|moonmist|trinity|lurking|hollywood|colossal|advent/i, profileId: 'generic-text' },
  // Known arcade/action titles → generic action profile
  { pattern: /lode\s?run|loderun|prince|conan|drol|hard\s?hat|miner|dig\s?dug|donkey|galax|defender|frogger|burger|aztec|bolo|wavy/i, profileId: 'generic-action' }
];

export function detectGameProfileId(mediaName: string): string | null {
  for (const rule of GAME_DETECT_RULES) {
    if (rule.pattern.test(mediaName)) return rule.profileId;
  }
  return null;
}

export function buildSystemPrompt(profile: GameProfile): string {
  const base = `You are a professional AI agent playing the vintage computer game "${profile.name}" on an Apple II emulator.
You will receive screen screenshots (Vision Mode) or raw text screen buffer content (Text Mode).
You are also chatting with a user who can give you commands, suggestions, or ask questions.

CHAT INTERACTION RULES (HIGHEST PRIORITY):
- When the input contains a [USER CHAT MESSAGE], the user is talking to you. Your "Reply:" section MUST directly answer them, conversationally and warmly, in the SAME language they used (Chinese message → Chinese reply).
- Never ignore the user's message or answer with gameplay narration only. Talk like a friendly game companion, not a robot issuing commands.
- When there is NO user message, use "Reply:" to briefly announce what you are about to do next in the game.

GROUNDING RULES (CRITICAL — violating these makes you fail):
- Act on what the game has shown you: the current screen AND information from earlier turns (known exits, items, map layout are all valid knowledge). Only NEVER invent objects or exits the game has NEVER shown.
- Check the recent history: if a command failed, was rejected, or produced an error, do NOT send it again. Change strategy instead (different verb, different object, or move elsewhere).
- Keep commands SHORT and precise — one simple action per turn.
- Be DECISIVE: pick your action in ONE short sentence. Never deliberate back and forth — overlong reasoning gets truncated and your Command is lost, wasting the whole turn.

Please analyze the situation and respond EXACTLY in one of the following formats (ensure to include all 3 sections).
CRITICAL: The reasoning section MUST be extremely short. Do NOT write paragraphs, do NOT describe the board in detail, and do NOT ramble, otherwise your output will be truncated before reaching the Command!

Format Option A (Markdown):
Reasoning: <one short sentence about the situation and chosen action>
Reply: <brief response to user>
Command: <command or NONE>

Format Option B (XML Tags - RECOMMENDED for local models):
<reasoning><one short sentence about the situation and chosen action></reasoning>
<reply><brief response to user></reply>
<command><command or NONE></command>`;

  const genreHint = {
    'text-adventure': 'Genre: Text Adventure.\nInput Style: Text commands. The Command section must contain a full command in uppercase, e.g., "GO NORTH", "TAKE ALL", "OPEN MAILBOX".',
    'action': 'Genre: Action.\nInput Style: Real-time keys. The Command section must contain ONLY keyboard buttons to press. Use key names: "UP", "DOWN", "LEFT", "RIGHT", "SPACE", "ENTER", "ESCAPE" or letters (e.g., "A", "S"). You can join keys with "+" for combos (e.g. "LEFT+SPACE"). Do NOT output full sentences in Command, only key code(s).',
    'strategy': 'Genre: Strategy/Simulation.\nInput Style: Slow-paced menu/controls. Examine screens, status meters, and prompt options before sending commands.',
    'unknown': 'Genre: Unknown.\nObserve the screen and decide whether to send text commands or simulate key presses.'
  }[profile.genre];

  const custom = profile.customHint ? `\nAdditional gameplay hints/rules for this game:\n${profile.customHint}` : '';

  return `${base}\n\n${genreHint}${custom}`;
}

export const ADVENTURE_PROMPT_PRESETS = [
  {
    id: 'general_agent_vision',
    name: 'General Agent (Vision Mode)',
    prompt: DEFAULT_VISION_SYSTEM_PROMPT
  },
  {
    id: 'general_agent_text',
    name: 'General Agent (Text Mode)',
    prompt: DEFAULT_TEXT_SYSTEM_PROMPT
  },
  {
    id: 'general_vision',
    name: 'General Injector (Vision Mode)',
    prompt: `You are an agent observing an Apple II emulator. Read the screen screenshot and output ONLY the next command to type. Single line, no explanation.`
  },
  {
    id: 'general_text',
    name: 'General Injector (Text Mode)',
    prompt: `You are an agent observing an Apple II emulator. Read the raw text screen contents and output ONLY the next command to type. Single line, no explanation.`
  }
];


