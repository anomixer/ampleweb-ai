// Kept intentionally short to minimise input token usage on every API call.
export const DEFAULT_VISION_SYSTEM_PROMPT = `You are an AI agent playing a text adventure game (e.g. Zork) on an Apple II emulator.
Read the screenshot and output ONLY the next game command (e.g. LOOK, GO NORTH, OPEN MAILBOX).
Rules: single line, UPPERCASE, no markdown, no explanation.`;

export const DEFAULT_TEXT_SYSTEM_PROMPT = `You are an AI agent playing a text adventure game (e.g. Zork) on an Apple II emulator.
You will receive the raw text contents of the screen buffer.
Analyze the game text and output ONLY the next game command (e.g. LOOK, GO NORTH, OPEN MAILBOX).
Rules: single line, UPPERCASE, no markdown, no explanation.`;

export const DEFAULT_SYSTEM_PROMPT = DEFAULT_VISION_SYSTEM_PROMPT;

export const ADVENTURE_PROMPT_PRESETS = [
  {
    id: 'zork_vision',
    name: 'Zork Solver (Vision Mode)',
    prompt: DEFAULT_VISION_SYSTEM_PROMPT
  },
  {
    id: 'zork_text',
    name: 'Zork Solver (Text Mode)',
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

