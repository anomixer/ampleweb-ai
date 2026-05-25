

/** Max width for screenshot sent to LLM. Smaller = fewer image tokens. */
const CAPTURE_MAX_WIDTH = 480;

/**
 * Captures the current frame from the emulator canvas as a compressed JPEG data URL.
 * The image is downscaled to CAPTURE_MAX_WIDTH and encoded at low quality to minimise
 * the number of image tokens consumed by the Vision LLM on each tick.
 */
export function captureScreen(canvas: HTMLCanvasElement): string {
  try {
    // --- Step 1: Extract raw pixels from WebGL framebuffer ---
    // WebGL clears its drawing buffer after each frame. We must read pixels directly
    // from the GPU via readPixels() while the buffer is still alive.
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl');
    let srcWidth = canvas.width || 560;
    let srcHeight = canvas.height || 384;
    let pixelSource: HTMLCanvasElement | null = null;

    if (gl) {
      const webgl = gl as WebGLRenderingContext | WebGL2RenderingContext;
      srcWidth = webgl.drawingBufferWidth;
      srcHeight = webgl.drawingBufferHeight;
      const pixels = new Uint8Array(srcWidth * srcHeight * 4);
      webgl.readPixels(0, 0, srcWidth, srcHeight, webgl.RGBA, webgl.UNSIGNED_BYTE, pixels);

      // Check for non-empty frame
      let hasData = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0 || pixels[i + 3] > 0) {
          hasData = true; break;
        }
      }

      if (hasData) {
        // Blit into a 2D canvas with Y-axis flip (WebGL is bottom-up, Canvas is top-down)
        const tmpFull = document.createElement('canvas');
        tmpFull.width = srcWidth;
        tmpFull.height = srcHeight;
        const tmpCtx = tmpFull.getContext('2d');
        if (tmpCtx) {
          const imageData = tmpCtx.createImageData(srcWidth, srcHeight);
          for (let y = 0; y < srcHeight; y++) {
            const srcOffset = (srcHeight - 1 - y) * srcWidth * 4;
            imageData.data.set(pixels.subarray(srcOffset, srcOffset + srcWidth * 4), y * srcWidth * 4);
          }
          tmpCtx.putImageData(imageData, 0, 0);
          pixelSource = tmpFull;
        }
      }
    }

    // --- Step 2: Downscale to CAPTURE_MAX_WIDTH and encode as JPEG ---
    // Smaller image = fewer Vision tokens = lower API cost.
    const scale = Math.min(1, CAPTURE_MAX_WIDTH / srcWidth);
    const outW = Math.round(srcWidth * scale);
    const outH = Math.round(srcHeight * scale);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    if (outCtx) {
      if (pixelSource) {
        outCtx.drawImage(pixelSource, 0, 0, outW, outH);
      } else {
        // Fallback: draw directly from the original canvas element
        outCtx.drawImage(canvas, 0, 0, outW, outH);
      }
      // JPEG at 0.6 quality gives ~80% token savings vs full-res PNG
      return outCanvas.toDataURL('image/jpeg', 0.6);
    }

    // Last resort fallback
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch (e) {
    console.error('[AI Controller] Failed to capture canvas screen:', e);
    return '';
  }
}

/**
 * Types a text command into the emulator sequentially with custom delay to prevent missed inputs.
 */
export async function sendTextCommand(
  text: string,
  target: HTMLElement,
  charDelayMs: number = 60
): Promise<void> {
  // If the active element is a form input or editable field, blur it first.
  // When the browser is in the background, target.focus() might fail to steal focus
  // from the active element. Blurring it ensures that document.activeElement reverts to
  // body/canvas, preventing both our capture hook and Emscripten's internal focus-checks
  // from discarding key events.
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== target && (
    activeEl.tagName.toLowerCase() === 'input' ||
    activeEl.tagName.toLowerCase() === 'textarea' ||
    activeEl.tagName.toLowerCase() === 'select' ||
    activeEl.hasAttribute('contenteditable') ||
    activeEl.getAttribute('contenteditable') === 'true'
  )) {
    try {
      (activeEl as HTMLElement).blur();
    } catch (e) {
      console.warn('[AI Typist] Failed to blur active element:', e);
    }
  }

  // Focus the emulator canvas so it receives key inputs
  target.focus();

  const cleanText = text.trim();
  console.log(`[AI Typist] Typing command: "${cleanText}"`);

  const dispatchSingleKey = async (char: string) => {
    let key = char;
    let code = `Key${char.toUpperCase()}`;
    let keyCode = char.toUpperCase().charCodeAt(0);

    if (char === '\n' || char === '\r') {
      key = 'Enter';
      code = 'Enter';
      keyCode = 13;
    } else if (char === ' ') {
      key = ' ';
      code = 'Space';
      keyCode = 32;
    } else if (char === '-') {
      key = '-';
      code = 'Minus';
      keyCode = 189;
    } else if (char >= '0' && char <= '9') {
      key = char;
      code = `Digit${char}`;
      keyCode = char.charCodeAt(0);
    }

    const commonOpts = {
      key,
      code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    };

    // Dispatch keydown
    target.dispatchEvent(new KeyboardEvent('keydown', commonOpts));

    // Hold the key briefly
    await new Promise(resolve => setTimeout(resolve, charDelayMs));

    // Dispatch keyup
    target.dispatchEvent(new KeyboardEvent('keyup', commonOpts));

    // Brief spacing between keys
    await new Promise(resolve => setTimeout(resolve, Math.max(15, charDelayMs / 2)));
  };

  // Type out each character
  for (const char of cleanText) {
    await dispatchSingleKey(char);
  }

  // Final Enter to execute command
  await dispatchSingleKey('\n');
}

/**
 * Mock LLM response generator that simulates playing Zork step-by-step.
 */
let mockStepIndex = 0;
const MOCK_ZORK_COMMANDS = [
  'LOOK',
  'OPEN MAILBOX',
  'TAKE LEAFLET',
  'READ LEAFLET',
  'GO EAST',
  'LOOK',
  'GO NORTH',
  'GO WEST'
];

export function resetMockController(): void {
  mockStepIndex = 0;
}

export async function callMockLLM(): Promise<string> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  const cmd = MOCK_ZORK_COMMANDS[mockStepIndex];
  mockStepIndex = (mockStepIndex + 1) % MOCK_ZORK_COMMANDS.length;
  return cmd;
}

/**
 * Clean up potential markdown formatting or extra text from LLM response.
 */
export function cleanLLMResponse(response: string): string {
  let cleaned = response.trim();
  // Remove markdown code blocks like ```json ... ``` or ```text ... ```
  cleaned = cleaned.replace(/```[a-zA-Z]*\n?/g, '');
  cleaned = cleaned.replace(/```/g, '');
  // Remove quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  // Remove trailing dots/periods or punctuation that isn't valid for adventure games
  cleaned = cleaned.replace(/[.!?]+$/, '');
  return cleaned.trim().toUpperCase();
}

/**
 * Enterprise-grade fetch wrapper that automatically retries on 503 (high demand) or 429 (rate limit) 
 * using exponential backoff with jitter.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  onRetry?: (status: number, nextDelay: number, attempt: number) => void
): Promise<Response> {
  let delay = 1500; // Start with 1.5s delay
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      // If we encounter 503 (Service Unavailable/High Demand) or 429 (Rate Limited)
      if (response.status === 503 || response.status === 429) {
        if (i === maxRetries - 1) return response; // Last attempt, return the error response

        const nextDelay = delay + Math.random() * 500; // Add some jitter
        if (onRetry) {
          onRetry(response.status, Math.round(nextDelay), i + 1);
        } else {
          console.warn(`[AI Controller] API returned ${response.status}. Retrying in ${Math.round(nextDelay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        }
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        delay *= 2.5; // Exponential backoff factor
        continue;
      }

      return response;
    } catch (err) {
      // TypeError: "Failed to fetch" usually means CORS block or network unreachable.
      // NVIDIA NIM (integrate.api.nvidia.com) and some enterprise APIs do not send
      // Access-Control-Allow-Origin headers, so direct browser fetch is blocked.
      const isCorsLike = err instanceof TypeError && String(err).includes('fetch');
      if (i === maxRetries - 1) {
        if (isCorsLike) {
          throw new TypeError(
            `Failed to fetch — likely a CORS block. ` +
            `"${url.replace(/^(https?:\/\/[^/]+).*/, '$1')}" may not allow browser requests. ` +
            `Try using a local instance (e.g. localhost) or a CORS proxy instead.`
          );
        }
        throw err;
      }

      const nextDelay = delay + Math.random() * 500;
      console.warn(`[AI Controller] Fetch failed: ${err}. Retrying in ${Math.round(nextDelay)}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      delay *= 2.5;
    }
  }
  return fetch(url, options);
}

/**
 * Default base URLs and model names for each supported provider.
 * The UI auto-fills these when the user switches providers.
 */
export const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; requiresKey: boolean; label: string }> = {
  mock: { baseUrl: '', model: '', requiresKey: false, label: 'Mock Simulator' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1', model: 'gemini-3.5-flash', requiresKey: true, label: 'Gemini 3.5 Flash' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', requiresKey: true, label: 'OpenAI GPT-4o-mini' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022', requiresKey: true, label: 'Claude 3.5 Sonnet' },
  // NVIDIA NIM blocks browser CORS — route through corsfix.com proxy (already used by this project for ROM downloads)
  // URL format: https://proxy.corsfix.com/?TARGET → callOpenAICompatible appends /chat/completions to baseUrl
  nvidia: { baseUrl: 'https://proxy.corsfix.com/?https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.1-70b-instruct', requiresKey: true, label: 'NVIDIA NIM' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', requiresKey: true, label: 'Groq' },
  // Ollama Cloud also blocks browser CORS — route through corsfix.com proxy
  'ollama-cloud': { baseUrl: 'https://proxy.corsfix.com/?https://api.ollama.com/v1', model: 'gemma4:31b-cloud', requiresKey: true, label: 'Ollama Cloud' },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'qwen/qwen3.6:35b-a3b', requiresKey: false, label: 'LM Studio' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3.6:35b-a3b', requiresKey: false, label: 'Ollama (Local)' },
  custom: { baseUrl: '', model: '', requiresKey: false, label: 'Custom Provider' },
};


export interface HistoryTurn {
  mode: 'vision' | 'text';
  screenshotBase64?: string;
  screenText?: string;
  command: string;
}

/**
 * Generic OpenAI-compatible caller.
 * Used by: openai, nvidia, ollama-cloud, lmstudio, ollama, custom
 */
async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: any[],
  maxTokens: number,
  temperature: number,
  providerLabel: string,
  onRetry?: (status: number, nextDelay: number, attempt: number) => void
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  }, 3, onRetry);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${providerLabel} API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const textOut = data.choices?.[0]?.message?.content;
  if (!textOut) throw new Error(`Empty response from ${providerLabel} API. Response: ${JSON.stringify(data)}`);
  return cleanLLMResponse(textOut);
}

/**
 * Call real LLM API with screenshot/text, history context, and prompt.
 * @param provider    Provider ID (gemini | openai | claude | nvidia | groq | ollama-cloud | lmstudio | ollama | custom)
 * @param apiKey      API key
 * @param systemPrompt System-level instruction
 * @param screenshotBase64 JPEG data URL from captureScreen()
 * @param screenText  Raw text screen buffer content (used in Text Mode)
 * @param mode        AI reasoning mode ('vision' | 'text')
 * @param history     Recent command history turns
 * @param maxTokens   Output token budget
 * @param temperature LLM temperature
 * @param apiBaseUrl  Override base URL
 * @param aiModel     Model name override
 * @param onRetry     Callback fired on 503/429 retry
 */
export async function callRealLLM(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  screenshotBase64: string,
  screenText: string,
  mode: 'vision' | 'text',
  history: HistoryTurn[],
  maxTokens: number = 1000,
  temperature: number = 0.6,
  apiBaseUrl?: string,
  aiModel?: string,
  onRetry?: (status: number, nextDelay: number, attempt: number) => void
): Promise<string> {
  const prompt = "Next command? Output ONLY the command, nothing else.";

  // ── Gemini (custom REST API, not OpenAI-compatible) ──────────────────────
  if (provider === 'gemini') {
    const model = aiModel || 'gemini-3.5-flash';
    const base = (apiBaseUrl || PROVIDER_DEFAULTS.gemini.baseUrl).replace(/\/$/, '');
    const url = `${base}/models/${model}:generateContent?key=${apiKey}`;

    const contents: any[] = [];

    // Add history turns
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      const parts: any[] = [];
      const turnPrompt = i === 0 ? `${systemPrompt}\n\n${prompt}` : prompt;

      if (turn.mode === 'vision') {
        const rawBase64 = turn.screenshotBase64!.replace(/^data:image\/\w+;base64,/, '');
        parts.push({ text: turnPrompt });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: rawBase64 } });
      } else {
        parts.push({ text: `${turnPrompt}\n\nGame Screen Text:\n================================\n${turn.screenText}\n================================` });
      }
      contents.push({ role: 'user', parts });
      contents.push({ role: 'model', parts: [{ text: turn.command }] });
    }

    // Add current turn
    const currentParts: any[] = [];
    const currentPrompt = history.length === 0 ? `${systemPrompt}\n\n${prompt}` : prompt;
    if (mode === 'vision') {
      const rawBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      currentParts.push({ text: currentPrompt });
      currentParts.push({ inlineData: { mimeType: 'image/jpeg', data: rawBase64 } });
    } else {
      currentParts.push({ text: `${currentPrompt}\n\nGame Screen Text:\n================================\n${screenText}\n================================` });
    }
    contents.push({ role: 'user', parts: currentParts });

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature }
      })
    }, 3, onRetry);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOut) {
      throw new Error(`Empty response from Gemini API. Response JSON: ${JSON.stringify(data)}`);
    }
    return cleanLLMResponse(textOut);
  }

  // ── Claude (Anthropic REST API, not OpenAI-compatible) ───────────────────
  if (provider === 'claude') {
    const model = aiModel || PROVIDER_DEFAULTS.claude.model;
    const base = (apiBaseUrl || PROVIDER_DEFAULTS.claude.baseUrl).replace(/\/$/, '');
    const url = `${base}/messages`;

    const messages: any[] = [];

    // Add history turns
    for (const turn of history) {
      const userContent: any[] = [];
      if (turn.mode === 'vision') {
        const rawBase64 = turn.screenshotBase64!.replace(/^data:image\/\w+;base64,/, '');
        userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: rawBase64 } });
        userContent.push({ type: 'text', text: prompt });
      } else {
        userContent.push({ type: 'text', text: `Game Screen Text:\n================================\n${turn.screenText}\n================================\n\n${prompt}` });
      }

      messages.push({
        role: 'user',
        content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent
      });
      messages.push({ role: 'assistant', content: turn.command });
    }

    // Add current turn
    const currentUserContent: any[] = [];
    if (mode === 'vision') {
      const rawBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      currentUserContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: rawBase64 } });
      currentUserContent.push({ type: 'text', text: prompt });
    } else {
      currentUserContent.push({ type: 'text', text: `Game Screen Text:\n================================\n${screenText}\n================================\n\n${prompt}` });
    }
    messages.push({
      role: 'user',
      content: currentUserContent.length === 1 && currentUserContent[0].type === 'text' ? currentUserContent[0].text : currentUserContent
    });

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'dangerouslyAllowBrowser': 'true'
      } as any,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages
      })
    }, 3, onRetry);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    const textOut = data.content?.[0]?.text;
    if (!textOut) throw new Error('Empty response from Claude API');
    return cleanLLMResponse(textOut);
  }

  // ── All OpenAI-compatible providers ──────────────────────────────────────
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
  const baseUrl = apiBaseUrl || defaults.baseUrl;
  const model = aiModel || defaults.model;
  const label = defaults.label || provider;

  if (!baseUrl) throw new Error(`No API URL configured for provider "${provider}". Please enter the API URL.`);
  if (!model) throw new Error(`No model configured for provider "${provider}". Please enter the model name.`);

  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Cap screen text to avoid overflowing local model context windows (e.g. LM Studio).
  // Take the LAST 400 chars (most recent output) since that's what matters for commands.
  const capScreen = (t: string | undefined) =>
    !t ? '' : t.length > 400 ? '...' + t.slice(-400) : t;

  // Add history turns
  for (const turn of history) {
    if (turn.mode === 'vision') {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: turn.screenshotBase64! } }
        ]
      });
    } else {
      messages.push({
        role: 'user',
        content: `Game Screen:\n${capScreen(turn.screenText)}\n\n${prompt}`
      });
    }
    messages.push({ role: 'assistant', content: turn.command });
  }

  // Add current turn
  if (mode === 'vision') {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: screenshotBase64 } }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: `Game Screen:\n${capScreen(screenText)}\n\n${prompt}`
    });
  }

  return callOpenAICompatible(baseUrl, model, apiKey, messages, maxTokens, temperature, label, onRetry);
}

// \u2500\u2500 Apple II Memory Screen Reader (Text Mode Support) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// Apple II text screen row offsets within each 1KB page (+0x400 or +0x800).
// Non-sequential by design - this hardware-specific interleaving is the key fingerprint.
const ROW_OFFSETS = [
  0x000, 0x080, 0x100, 0x180, 0x200, 0x280, 0x300, 0x380, // Rows 0-7
  0x028, 0x0A8, 0x128, 0x1A8, 0x228, 0x2A8, 0x328, 0x3A8, // Rows 8-15
  0x050, 0x0D0, 0x150, 0x1D0, 0x250, 0x2D0, 0x350, 0x3D0  // Rows 16-23
];

let cachedRamBase: number | null = null;
let cachedAuxBase: number | null = null;

const LS_RAM_BASE_KEY = 'ampleweb_apple2_ram_base';

/**
 * Resets the memory-mapping pointer cache AND clears localStorage.
 * Fired on ROM reload / mode switch.
 */
export function resetMemoryCache(): void {
  cachedRamBase = null;
  cachedAuxBase = null;
  try { localStorage.removeItem(LS_RAM_BASE_KEY); } catch { /* ignore */ }
  console.log('[AI Text Mode] Memory base caches reset.');
}

/**
 * Decodes an Apple II screen character byte into printable ASCII.
 *
 * Apple II screen codes:
 *   0x00-0x1F: Inverse uppercase  (@=0x00 ... _=0x1F)  -> ASCII 0x40-0x5F
 *   0x20-0x3F: Inverse symbols    (space=0x20 ... ?=0x3F) -> ASCII 0x20-0x3F
 *   0x40-0x5F: Flashing uppercase (@=0x40 ... _=0x5F)  -> ASCII 0x40-0x5F
 *   0x60-0x7F: Flashing symbols   (space=0x60 ... ?=0x7F) -> ASCII 0x20-0x3F
 *   0x80-0x9F: Normal uppercase   (@=0x80 ... _=0x9F)  -> ASCII 0x40-0x5F
 *   0xA0-0xFF: Normal ASCII       (space=0xA0 ... ~=0xFE) -> ASCII 0x20-0x7E
 */
function decodeAppleChar(b: number): string {
  // 0x00 = inverse null/cursor (rendered as space for LLM clarity)
  if (b === 0x00) return ' ';
  if (b >= 0x80) {
    if (b <= 0x9F) return String.fromCharCode(b - 0x40); // Normal uppercase A-Z etc
    return String.fromCharCode(b - 0x80);                // Normal space-~ (most common)
  }
  // Low-bit characters (b < 0x80)
  // In Apple IIe, normal lowercase/uppercase ASCII is supported,
  // and many interpreters write standard ASCII (0x20-0x7F) directly.
  if (b >= 0x20 && b <= 0x7E) {
    return String.fromCharCode(b);
  }
  if (b <= 0x1F) {
    return String.fromCharCode(b + 0x40); // Inverse uppercase
  }
  return String.fromCharCode(b);
}

/**
 * Attempts to get the Emscripten heap buffer, trying multiple property paths
 * for compatibility across different Emscripten and MAME build versions.
 *
 * CONFIRMED: this MAME build puts HEAPU8 on window (global), NOT on Module.
 */
function getHeap(): Uint8Array | null {
  // 1. window.HEAPU8 (global) - confirmed working in this MAME WASM build
  const gHEAPU8 = (window as any).HEAPU8;
  if (gHEAPU8 instanceof Uint8Array && gHEAPU8.length > 1024 * 1024) return gHEAPU8;

  const M = (window as any).Module;
  if (!M) return null;

  // 2. Module.HEAPU8 - works in some Emscripten builds
  if (M.HEAPU8 instanceof Uint8Array && M.HEAPU8.length > 0) return M.HEAPU8;

  // 3. Module.wasmMemory (modern Emscripten)
  if (M.wasmMemory instanceof WebAssembly.Memory) {
    return new Uint8Array(M.wasmMemory.buffer);
  }
  // 4. Module.asm.memory (older Emscripten)
  if (M.asm && M.asm.memory instanceof WebAssembly.Memory) {
    return new Uint8Array(M.asm.memory.buffer);
  }

  // 5. Scan window for any WebAssembly.Memory large enough to be the heap
  for (const k of Object.keys(window as any)) {
    try {
      const v = (window as any)[k];
      if (v instanceof WebAssembly.Memory && v.buffer.byteLength > 64 * 1024 * 1024) {
        return new Uint8Array(v.buffer);
      }
    } catch { /* ignore */ }
  }

  // 6. Last resort: scan Module keys for any large Uint8Array
  for (const k of Object.keys(M)) {
    try {
      if (M[k] instanceof Uint8Array && M[k].length > 4 * 1024 * 1024) return M[k];
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Score a memory region as a potential Apple II text page.
 *
 * Strategy: Apple II text pages are almost entirely filled with 0xA0 (normal space)
 * when the screen has little content, and predominantly high-bit bytes (0x80-0xFF)
 * for normal text. This scoring function returns 0-100.
 */
function scoreTextPage(heap: Uint8Array, base: number, pageOffset: number): number {
  // ── XML/Metadata 垃圾特徵過濾 ──────────────────────────────────────────────
  // 構建一個臨時解碼字串以進行特徵過濾，排除 MAME WASM heap 中偽裝成文字頁面的 XML/PNG 元數據
  let tempStr = '';
  for (let r = 0; r < 24; r++) {
    const rowStart = base + pageOffset + ROW_OFFSETS[r];
    if (rowStart + 40 > heap.length) return 0;
    for (let c = 0; c < 40; c++) {
      tempStr += decodeAppleChar(heap[rowStart + c]);
    }
  }

  const noSpace = tempStr.replace(/\s/g, '');
  const noSpaceLower = noSpace.toLowerCase();
  
  // 檢測是否包含常見的 XML Metadata 或圖片二進位垃圾特徵
  const ltCount = (noSpace.match(/</g) || []).length;
  if (ltCount >= 3 || 
      noSpaceLower.includes('rdf:') || 
      noSpaceLower.includes('xmlns') || 
      noSpaceLower.includes('xmp') || 
      noSpaceLower.includes('stevt') || 
      noSpaceLower.includes('stref') || 
      noSpaceLower.includes('adobe') || 
      noSpaceLower.includes('photoshop') ||
      noSpaceLower.includes('http:') || 
      noSpaceLower.includes('instanceid') ||
      noSpaceLower.includes('derivedfrom') ||
      noSpaceLower.includes('creator') ||
      noSpaceLower.includes('metadata')
  ) {
    return 0; // 100% 排除偽裝的二進位/XML 垃圾記憶體
  }

  let spaceCountHi = 0;    // 0xA0 - Apple II normal space
  let spaceCountLo = 0;    // 0x20 - ASCII space
  let charCountHi = 0;     // 0x80-0xFF - Apple II normal characters
  let charCountLo = 0;     // 0x21-0x7E - ASCII normal characters
  let zeroCount = 0;       // 0x00 - null

  for (let r = 0; r < 24; r++) {
    const rowStart = base + pageOffset + ROW_OFFSETS[r];
    if (rowStart + 40 > heap.length) return 0;


    for (let c = 0; c < 40; c++) {
      const b = heap[rowStart + c];
      if (b === 0xA0) spaceCountHi++;
      else if (b === 0x20) spaceCountLo++;
      else if (b >= 0x80) charCountHi++;
      else if (b >= 0x21 && b <= 0x7E) charCountLo++;
      else if (b === 0x00) zeroCount++;
    }
  }

  const total = 24 * 40; // 960 bytes
  
  // High-bit text page scores
  const spaceDensityHi = spaceCountHi / total;
  const charDensityHi = (spaceCountHi + charCountHi) / total;

  // Low-bit (ASCII) text page scores
  const spaceDensityLo = spaceCountLo / total;
  const charDensityLo = (spaceCountLo + charCountLo) / total;

  let scoreHi = 0;
  if (spaceDensityHi >= 0.7) scoreHi += 50;
  else if (spaceDensityHi >= 0.5) scoreHi += 40;
  else if (spaceDensityHi >= 0.3) scoreHi += 20;
  else if (spaceDensityHi >= 0.1) scoreHi += 5;

  if (charDensityHi >= 0.8) scoreHi += 30;
  else if (charDensityHi >= 0.6) scoreHi += 20;
  else if (charDensityHi >= 0.4) scoreHi += 10;

  if (charCountHi > 5) scoreHi += 10;
  if (charCountHi > 30) scoreHi += 10;

  let scoreLo = 0;
  if (spaceDensityLo >= 0.7) scoreLo += 50;
  else if (spaceDensityLo >= 0.5) scoreLo += 40;
  else if (spaceDensityLo >= 0.3) scoreLo += 20;
  else if (spaceDensityLo >= 0.1) scoreLo += 5;

  if (charDensityLo >= 0.8) scoreLo += 30;
  else if (charDensityLo >= 0.6) scoreLo += 20;
  else if (charDensityLo >= 0.4) scoreLo += 10;

  if (charCountLo > 5) scoreLo += 10;
  if (charCountLo > 30) scoreLo += 10;

  return Math.min(Math.max(scoreHi, scoreLo), 100);
}

/**
 * Diagnostic tool - call window.apple2Diagnose() in DevTools Console while emulator is running.
 * Shows heap structure, top RAM candidates, and scans for ZORK text.
 */
export function apple2Diagnose(logFn?: (msg: string) => void): void {
  const log = logFn || ((s: string) => console.log(s));
  const M = (window as any).Module;
  if (!M) { log('Module not found on window!'); return; }

  log(`Module keys (first 30): ${Object.keys(M).slice(0, 30).join(', ')}`);
  log(`Module.HEAPU8: ${M.HEAPU8 ? `Uint8Array[${M.HEAPU8.length}]` : 'undefined'}`);
  log(`Module.wasmMemory: ${M.wasmMemory ? 'WebAssembly.Memory' : 'undefined'}`);

  const heap = getHeap();
  if (!heap) { log('ERROR: Could not get heap from Module!'); return; }
  log(`Heap size: ${heap.length} bytes = ${(heap.length / 1024 / 1024).toFixed(1)} MB`);

  // Hex dump at several key offsets
  const offsets = [0, 0x400, 0x800, 0x4000, 0x8000, 0x10000, 0x20000];
  for (const off of offsets) {
    if (off + 16 <= heap.length) {
      const hex = Array.from(heap.slice(off, off + 16)).map((b: number) => b.toString(16).padStart(2, '0')).join(' ');
      log(`  heap[0x${off.toString(16).padStart(5, '0')}]: ${hex}`);
    }
  }

  // Scan for best Apple II text page candidates
  log('--- Scanning for Apple II text pages (score >= 30) ---');
  const results: { base: number, page: number, score: number }[] = [];
  for (let base = 0; base + 0x1000 < heap.length; base += 4096) {
    const s1 = scoreTextPage(heap, base, 0x400);
    const s2 = scoreTextPage(heap, base, 0x800);
    if (s1 >= 30) results.push({ base, page: 1, score: s1 });
    if (s2 >= 30) results.push({ base, page: 2, score: s2 });
  }
  results.sort((a, b) => b.score - a.score);
  log(`Top candidates (${results.length} total):`);
  for (const r of results.slice(0, 10)) {
    log(`  base=0x${r.base.toString(16)}, page=${r.page}, score=${r.score}`);
  }

  // Scan for ZORK in plain ASCII and high-bit encoding
  log('--- Scanning for ZORK text ---');
  const maxScan = Math.min(heap.length - 4, 16 * 1024 * 1024);
  let zorkFound = 0;
  for (let i = 0; i < maxScan; i++) {
    // Plain ASCII "ZORK"
    if (heap[i] === 0x5A && heap[i + 1] === 0x4F && heap[i + 2] === 0x52 && heap[i + 3] === 0x4B) {
      log(`  'ZORK' (ASCII) at 0x${i.toString(16)}`); zorkFound++;
    }
    // High-bit "ZORK" (Apple II screen encoding)
    if (heap[i] === 0xDA && heap[i + 1] === 0xCF && heap[i + 2] === 0xD2 && heap[i + 3] === 0xCB) {
      log(`  'ZORK' (hi-bit) at 0x${i.toString(16)}`); zorkFound++;
    }
  }
  if (zorkFound === 0) log('  No ZORK found in first 16MB of heap');
  log('--- Diagnosis complete ---');
}
// Expose to window so DevTools users can call it directly
(window as any).apple2Diagnose = () => apple2Diagnose(console.log.bind(console));

/**
 * Helper to pair Main RAM and Aux RAM banks.
 * In Apple IIe, Even columns are stored in Aux RAM (lower address)
 * and Odd columns are stored in Main RAM (higher address, e.g. main = aux + 65536).
 */
function pairBases(heap: Uint8Array, b: number): { main: number; aux: number } {
  const scoreLower = b >= 65536 ? Math.max(scoreTextPage(heap, b - 65536, 0x400), scoreTextPage(heap, b - 65536, 0x800)) : 0;
  if (scoreLower >= 15) {
    // b is the higher address (Main RAM), b - 65536 is the lower address (Aux RAM)
    return { main: b, aux: b - 65536 };
  } else {
    // b is the lower address (Aux RAM), b + 65536 is the higher address (Main RAM)
    return { main: b + 65536, aux: b };
  }
}

/**
 * Main scanner: returns up to MAX_CANDIDATES sorted by score descending.
 * Uses a low threshold (20) to cast a wide net even when screen is full of text.
 */
const MAX_CANDIDATES = 8;

function findApple2RamBases(
  heap: Uint8Array,
  logCallback?: (msg: string) => void
): Array<{ mainBase: number; auxBase: number; score: number }> {
  if (logCallback) logCallback(`[Scanner] Heap: ${(heap.length / 1024 / 1024).toFixed(1)} MB. Scanning...`);

  const baseScores = new Map<number, number>();
  for (let base = 0; base + 0xC00 < heap.length; base += 4096) {
    const s1 = scoreTextPage(heap, base, 0x400);
    const s2 = scoreTextPage(heap, base, 0x800);
    const score = Math.max(s1, s2);
    if (score >= 20) {
      baseScores.set(base, score);
    }
  }

  // Sort bases by score descending
  const sortedBases = Array.from(baseScores.keys()).sort((a, b) => baseScores.get(b)! - baseScores.get(a)!);

  const uniqueCandidates = new Map<string, { mainBase: number; auxBase: number; score: number }>();

  // 1. Dynamic dual-base pairing: If there are at least two distinct high-scoring bases in the Heap,
  // we pair the best one (main) and the second-best one (aux) directly.
  // Way A/Way B auto-correction in decodeFromBase will take care of ordering.
  if (sortedBases.length >= 2) {
    const main = sortedBases[0];
    const aux = sortedBases[1];
    const pairScore = Math.max(baseScores.get(main)!, baseScores.get(aux)!);
    uniqueCandidates.set(`${main}-${aux}`, { mainBase: main, auxBase: aux, score: pairScore });
  }

  // 2. Fallback to old heuristic pairing (using pairBases helper) to support single-base 40-col scenarios
  // or additional candidate options.
  for (const base of sortedBases) {
    const score = baseScores.get(base)!;
    const { main, aux } = pairBases(heap, base);
    const key = `${main}-${aux}`;
    if (!uniqueCandidates.has(key)) {
      const pairScore = Math.max(score, baseScores.get(main) ?? 0, baseScores.get(aux) ?? 0);
      uniqueCandidates.set(key, { mainBase: main, auxBase: aux, score: pairScore });
    }
  }

  const unique = Array.from(uniqueCandidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  if (logCallback) {
    logCallback(`[Scanner] ${unique.length} candidates (score>=20). Best: score=${unique[0]?.score ?? 'none'} @ 0x${unique[0]?.mainBase.toString(16) ?? '?'}, aux=0x${unique[0]?.auxBase.toString(16) ?? '?'}`);
  }
  return unique;
}

/**
 * Decodes Apple II text from a specific base address.
 * Returns null if the decoded text fails the quality gate (< 30% letters).
 */
function decodeFromBase(
  heap: Uint8Array,
  mainBase: number,
  auxBase: number,
  logCallback?: (msg: string) => void,
  skipQualityGate = false,
  force80Col?: boolean
): { text: string; is80Col: boolean } | null {
  // Pick active page (1 or 2) based on which scores higher
  const p1Score = scoreTextPage(heap, mainBase, 0x400);
  const p2Score = scoreTextPage(heap, mainBase, 0x800);
  const page: 1 | 2 = (p2Score > p1Score + 10) ? 2 : 1;
  const pageOffset = page === 1 ? 0x400 : 0x800;

  if (logCallback) {
    logCallback(`[Scanner] Page ${page} active (p1=${p1Score}, p2=${p2Score}), base=0x${mainBase.toString(16)}`);
  }

  // Detect 80-column mode
  let auxHighBit = 0;
  for (let r = 0; r < 24; r++) {
    const rowStart = auxBase + pageOffset + ROW_OFFSETS[r];
    if (rowStart + 40 <= heap.length) {
      for (let c = 0; c < 40; c++) {
        if (heap[rowStart + c] >= 0x80) auxHighBit++;
      }
    }
  }
  const is80Col = force80Col ?? (auxHighBit > 5 && auxBase !== mainBase);

  // Decode all 24 rows
  let screenText = '';
  if (is80Col) {
    // 80-column mode: try both Way A (aux-even, main-odd) and Way B (main-even, aux-odd)
    // and pick the one that yields the highest letter density to correct word-reversals (e.g., ZORK I vs I   R OKI).
    let textWayA = '';
    let textWayB = '';
    for (let r = 0; r < 24; r++) {
      const mainRowStart = mainBase + pageOffset + ROW_OFFSETS[r];
      const auxRowStart = auxBase + pageOffset + ROW_OFFSETS[r];
      let rowTextA = '';
      let rowTextB = '';
      for (let c = 0; c < 80; c++) {
        const halfCol = Math.floor(c / 2);
        // Way A: even = aux, odd = main
        const bA = c % 2 === 0
          ? heap[auxRowStart + halfCol]
          : heap[mainRowStart + halfCol];
        rowTextA += decodeAppleChar(bA);

        // Way B: even = main, odd = aux
        const bB = c % 2 === 0
          ? heap[mainRowStart + halfCol]
          : heap[auxRowStart + halfCol];
        rowTextB += decodeAppleChar(bB);
      }
      textWayA += rowTextA.trimEnd() + '\n';
      textWayB += rowTextB.trimEnd() + '\n';
    }

    // Evaluate both text ways by counting letters [A-Za-z]
    const lettersA = (textWayA.match(/[A-Za-z]/g) || []).length;
    const lettersB = (textWayB.match(/[A-Za-z]/g) || []).length;

    screenText = lettersB > lettersA ? textWayB : textWayA;
    if (logCallback && (lettersA > 0 || lettersB > 0)) {
      logCallback(`[Scanner] 80-col pairing heuristic: Way A (aux-even) = ${lettersA} letters, Way B (main-even) = ${lettersB} letters. Selected Way ${lettersB > lettersA ? 'B' : 'A'}.`);
    }
  } else {
    for (let r = 0; r < 24; r++) {
      const mainRowStart = mainBase + pageOffset + ROW_OFFSETS[r];
      let rowText = '';
      for (let c = 0; c < 40; c++) {
        rowText += decodeAppleChar(heap[mainRowStart + c]);
      }
      screenText += rowText.trimEnd() + '\n';
    }
  }

  // Post-process: trim, filter garbage rows, take last 16 lines
  const cleanRows = screenText.split('\n')
    .map(r => r.trim())
    .filter(r => /[A-Za-z0-9>.,!?:'\-]/.test(r));
  const cleanText = cleanRows.slice(-16).join('\n');

  // ── Quality gate ──────────────────────────────────────────────────────────
  if (!skipQualityGate) {
    const nonSpace = cleanText.replace(/\s/g, '');
    const letterCount = (cleanText.match(/[A-Za-z]/g) || []).length;
    const letterRatio = nonSpace.length > 20 ? letterCount / nonSpace.length : 1;
    if (letterRatio < 0.30) {
      if (logCallback) {
        const snippet = cleanText.substring(0, 100).replace(/\n/g, ' \\ ');
        logCallback(`[Scanner] Quality low (${(letterRatio * 100).toFixed(0)}% letters) at 0x${mainBase.toString(16)} — skipping. Snippet: "${snippet}"`);
      }
      return null;
    }
  }

  return { text: cleanText || screenText.trimEnd(), is80Col };
}

/**
 * Helper to read directly from the emulated Apple II's virtual RAM via exported WASM functions.
 */
function readDirectRam(startAddr: number, length: number): Uint8Array | null {
  const M = (window as any).Module;
  if (!M) return null;

  // 1. Try bulk read
  const bulkFn = M._ZN15running_machine24emscripten_read_ram_bulkEjjPh || M.__ZN15running_machine24emscripten_read_ram_bulkEjjPh;
  if (typeof bulkFn === 'function' && typeof M._free === 'function' && typeof M._malloc === 'function') {
    const heap = getHeap();
    if (heap) {
      const ptr = M._malloc ? M._malloc(length) : 0;
      if (ptr) {
        try {
          const bytesRead = bulkFn(startAddr, length, ptr);
          if (bytesRead > 0) {
            const result = new Uint8Array(heap.buffer, ptr, length).slice();
            M._free(ptr);
            return result;
          }
        } catch (e) {
          console.error('[AI Direct RAM] Bulk read failed:', e);
        }
        M._free(ptr);
      }
    }
  }

  // 2. Fall back to single-byte reads in a loop
  const readFn = M._ZN15running_machine19emscripten_read_ramEj || M.__ZN15running_machine19emscripten_read_ramEj;
  if (typeof readFn === 'function') {
    try {
      const result = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        result[i] = readFn(startAddr + i);
      }
      return result;
    } catch (e) {
      console.error('[AI Direct RAM] Single-byte loop read failed:', e);
    }
  }

  return null;
}




/**
 * Score a pre-read direct RAM page buffer.
 */
function scoreDirectPage(pageBytes: Uint8Array): number {
  let spaceCount = 0;
  let highBitCount = 0;

  for (let r = 0; r < 24; r++) {
    const rowStart = ROW_OFFSETS[r];
    if (rowStart + 40 > pageBytes.length) return 0;

    for (let c = 0; c < 40; c++) {
      const b = pageBytes[rowStart + c];
      if (b === 0xA0) spaceCount++;
      else if (b >= 0x80) highBitCount++;
    }
  }

  const total = 24 * 40; // 960 bytes
  const spaceDensity = spaceCount / total;
  const highBitDensity = (spaceCount + highBitCount) / total;

  let score = 0;
  if (spaceDensity >= 0.7) score += 50;
  else if (spaceDensity >= 0.5) score += 40;
  else if (spaceDensity >= 0.3) score += 20;
  else if (spaceDensity >= 0.1) score += 5;

  if (highBitDensity >= 0.8) score += 30;
  else if (highBitDensity >= 0.6) score += 20;
  else if (highBitDensity >= 0.4) score += 10;

  if (highBitCount > 5) score += 10;
  if (highBitCount > 30) score += 10;

  return Math.min(score, 100);
}

/**
 * Reads and decodes the emulated Apple II text buffer (40 or 80 columns).
 *
 * Priority order:
 *   1. Direct RAM reading via exported C++ API (100% accurate, no scanning)
 *   2. In-memory cache (fastest, no scanning needed)
 *   3. localStorage confirmed base (survived a quality gate before; lenient re-check)
 *   4. Full scan: try top candidates until one passes quality gate
 */
export function readApple2TextScreen(
  logCallback?: (msg: string) => void,
  force80Col?: boolean
): { text: string; is80Col: boolean } | null {
  // ── Priority 1: Try direct RAM reading first if the WASM exports exist ────
  const M = (window as any).Module;
  if (M && (typeof M._ZN15running_machine19emscripten_read_ramEj === 'function' ||
    typeof M.__ZN15running_machine19emscripten_read_ramEj === 'function')) {

    // Read the RD80COL softswitch ($C01F) to see if 80-column mode is active.
    // Bit 7 of $C01F is 1 if 80-column mode is enabled.
    const readFn = M._ZN15running_machine19emscripten_read_ramEj || M.__ZN15running_machine19emscripten_read_ramEj;
    const rd80col = readFn(0xC01F);
    const is80Col = force80Col ?? ((rd80col & 0x80) !== 0);

    if (is80Col) {
      // 80-column 模式：由於 MAME 驅動並未將 Main/Aux RAM 註冊為 Named Memory Shares，
      // 無法使用 C++ machine_ram 直讀。因此我們安全降級到搭配 XML 垃圾防禦過濾的 Heap Scan，
      // 這能在 1ms 內完美且自適應地還原 80 行大小寫文字。
      if (logCallback) logCallback('[AI Direct RAM] 80-col mode detected → using robust Heap Scan with XML filter.');
    } else {
      if (logCallback) {
        logCallback('[AI Direct RAM] 40-column mode detected. Using Direct CPU RAM!');
      }

      // Determine active page using CPU space direct RAM functions
      const p1Bytes = readDirectRam(0x400, 1024);
      const p2Bytes = readDirectRam(0x800, 1024);

      if (p1Bytes && p2Bytes) {
        const p1Score = scoreDirectPage(p1Bytes);
        const p2Score = scoreDirectPage(p2Bytes);

        const page: 1 | 2 = (p2Score > p1Score + 10) ? 2 : 1;

        if (logCallback) {
          logCallback(`[AI Direct RAM] Page ${page} active (p1Score=${p1Score}, p2Score=${p2Score})`);
        }

        const pageBytes = page === 1 ? p1Bytes : p2Bytes;
        let screenText = '';
        for (let r = 0; r < 24; r++) {
          const rowOffset = ROW_OFFSETS[r];
          let rowText = '';
          for (let c = 0; c < 40; c++) {
            rowText += decodeAppleChar(pageBytes[rowOffset + c]);
          }
          screenText += rowText.trimEnd() + '\n';
        }

        const cleanRows = screenText.split('\n')
          .map(r => r.trim())
          .filter(r => /[A-Za-z0-9>.,!?:'\-]/.test(r));
        const cleanText = cleanRows.slice(-16).join('\n');

        return { text: cleanText || screenText.trimEnd(), is80Col: false };
      }
    }
  }

  const heap = getHeap();
  if (!heap) {
    if (logCallback) logCallback('[Scanner] Error: WASM heap not accessible.');
    return null;
  }

  // ── Priority 1: In-memory cache ───────────────────────────────────────────
  if (cachedRamBase !== null && cachedAuxBase !== null) {
    const result = decodeFromBase(heap, cachedRamBase, cachedAuxBase, logCallback, false, force80Col);
    if (result) {
      return result;
    }
    // Cache base failed quality gate — clear cache and fall through to scan
    cachedRamBase = null;
    cachedAuxBase = null;
    try { localStorage.removeItem(LS_RAM_BASE_KEY); } catch { /* ignore */ }
    if (logCallback) logCallback('[Scanner] Cached base failed quality gate, clearing cache.');
  }

  // ── Priority 2: localStorage confirmed base ───────────────────────────────
  try {
    const stored = localStorage.getItem(LS_RAM_BASE_KEY);
    if (stored) {
      const b = parseInt(stored, 10);
      if (!isNaN(b) && b >= 0 && b + 0xC00 < heap.length) {
        const s = Math.max(scoreTextPage(heap, b, 0x400), scoreTextPage(heap, b, 0x800));
        if (s >= 15) {
          // Correctly pair Main and Aux RAM using pairBases helper.
          const { main, aux } = pairBases(heap, b);
          const result2 = decodeFromBase(heap, main, aux, logCallback, false, force80Col);
          if (result2) {
            cachedRamBase = main;
            cachedAuxBase = aux;
            if (logCallback) logCallback(`[Scanner] Using confirmed base 0x${main.toString(16)} from storage (score=${s})`);
            if (main !== b) {
              try { localStorage.setItem(LS_RAM_BASE_KEY, main.toString()); } catch {}
            }
            return result2;
          }
        }
        // Stored base no longer usable or failed quality gate — remove it
        localStorage.removeItem(LS_RAM_BASE_KEY);
        if (logCallback) logCallback(`[Scanner] Stored base 0x${b.toString(16)} invalid (score=${s}) or failed quality gate, clearing.`);
      }
    }
  } catch { /* localStorage not available */ }

  // ── Priority 3: Full scan + quality gate ──────────────────────────────────
  const candidates = findApple2RamBases(heap, logCallback);
  if (logCallback) {
    const listStr = candidates.map(c => `main=0x${c.mainBase.toString(16)},aux=0x${c.auxBase.toString(16)},score=${c.score}`).join(' | ');
    logCallback(`[Scanner] Candidates found: ${listStr}`);
  }
  if (candidates.length === 0) {
    if (logCallback) {
      logCallback('[Scanner] ERROR: No Apple II text RAM found. Try: apple2Diagnose() in DevTools.');
    }
    return null;
  }

  for (const { mainBase, auxBase, score } of candidates) {
    const result = decodeFromBase(heap, mainBase, auxBase, logCallback, false, force80Col);
    if (result) {
      cachedRamBase = mainBase;
      cachedAuxBase = auxBase;
      try { localStorage.setItem(LS_RAM_BASE_KEY, mainBase.toString()); } catch { /* ignore */ }
      if (logCallback) logCallback(`[Scanner] Locked base 0x${mainBase.toString(16)} (score=${score}) — saved to storage.`);
      return result;
    }
  }

  if (logCallback) logCallback('[Scanner] All candidates failed quality gate. Screen may be transitioning.');
  return null;
}
