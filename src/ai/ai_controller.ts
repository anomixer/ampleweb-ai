

/**
 * Captures the current frame from the emulator canvas as a base64 PNG data URL.
 */
export function captureScreen(canvas: HTMLCanvasElement): string {
  try {
    // If it's a WebGL context and preserveDrawingBuffer wasn't enabled, 
    // toDataURL might return blank. In such case, we capture the data.
    return canvas.toDataURL('image/png');
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
 * Call real LLM API with screenshot and prompt.
 */
export async function callRealLLM(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  screenshotBase64: string
): Promise<string> {
  const prompt = "Observe the attached emulator screen. What is the next single text command to play/solve the game? Output ONLY the command.";

  if (provider === 'gemini') {
    // Gemini API expects raw base64 data without data:image/png;base64, prefix
    const rawBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // We default to Gemini 2.5 Flash as it is modern, fast and affordable
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\nUser Request: ${prompt}`
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: rawBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 30,
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOut) throw new Error('Empty response from Gemini API');
    return cleanLLMResponse(textOut);
  } 
  
  if (provider === 'openai') {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: screenshotBase64
                }
              }
            ]
          }
        ],
        max_tokens: 30,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const textOut = data.choices?.[0]?.message?.content;
    if (!textOut) throw new Error('Empty response from OpenAI API');
    return cleanLLMResponse(textOut);
  }

  if (provider === 'claude') {
    const url = 'https://api.anthropic.com/v1/messages';
    const rawBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'dangerouslyAllowBrowser': 'true' // For frontend testing, though standard warning applies
      } as any,
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 30,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: rawBase64
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const textOut = data.content?.[0]?.text;
    if (!textOut) throw new Error('Empty response from Claude API');
    return cleanLLMResponse(textOut);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
