# [AmpleWeb-AI](https://github.com/anomixer/ampleweb-ai) - Vision-Based LLM Agent Edition

[English](README.md) | [繁體中文](README_tw.md)

This is a specialized, standalone edition of **AmpleWeb** configured as an experimental platform for Vision-Based AI Agents (LLM + Vision). By leveraging multi-modal large language models (such as Gemini 2.5/3.5 Flash, GPT-4o-mini, and Claude 3.5 Sonnet), AmpleWeb-AI allows an AI agent to "look" at the emulator canvas (running retro machines like the Apple IIe) via real-time screenshots, read the text, reason, and automatically dispatch keystroke sequences to play text adventure games (like Zork) autonomously.

## 🤖 Vision AI Agent — How It Works

```
MAME WASM (Canvas Screen)
    ↓  WebGL readPixels() + vertical flip
  Base64 PNG Screenshot
    ↓  multimodal Vision API (Gemini / GPT / Claude)
  Text Command (e.g. "GO EAST")
    ↓  DOM KeyboardEvent sequence (async, 60ms/char)
  Emscripten WASM Input
```

*   **Decoupled & Non-Invasive**: The AI layer treats MAME WASM as a complete black box. It reads the canvas via WebGL pixel extraction and sends keypresses via DOM events — no WASM code modifications needed.
*   **WebGL Framebuffer Capture**: The canvas `getContext` is intercepted at boot to force `preserveDrawingBuffer: true`, then `gl.readPixels()` extracts raw GPU pixels with Y-axis vertical flip correction. This produces a clear, pixel-perfect screenshot even on WebGL-rendered canvases.
*   **Asynchronous Typist**: Each keystroke is dispatched (`keydown` → delay → `keyup`) sequentially with a configurable delay between characters, preventing Emscripten frame loop input skipping.
*   **Dual Modes (Vision & Low-Token Text)**: Switch between `Vision Mode` (captures pixel-perfect screenshots) and `Text Mode` (directly reads Apple II text memory buffer from WASM memory for extremely low token cost, no external OCR required).
    *   *Direct RAM Access (DMA Tech)*: Employs exported C helper APIs (`_emscripten_get_main_ram_wasm_offset` and `_emscripten_get_aux_ram_wasm_offset`) to fetch the exact WASM linear memory offset of the physical Main and Aux RAM pointers. This allows direct `HEAPU8` reading of screen memory (`0x400` / `0x800`) with **100% precision** and **zero delay**, completely bypassing fragile heap scanning.
    *   *Advanced 80-Column Decoupled Decoding*: Solves the character pair flipping bug (where `"ZORK I"` gets garbled into `"I   R OKI"`) using **Dynamic Dual-Base Pairing** to automatically resolve the dynamically-allocated Main and Aux RAM heaps without hardcoded 65,536-byte offset assumptions. It applies a **Self-Correcting Way A/Way B Heuristic** that runs both odd/even column interleaving patterns concurrently, measuring character density via `/[A-Za-z]/g` to auto-select the perfectly formatted text stream.
    *   *Incremental Chatbot Diffing*: In `Text Mode`, the frontend compares the current screen text with the previous turn using **LCS Suffix-Prefix matching** and command markers. It isolates and transmits *only* the newly printed game output (e.g. `"Opening the mailbox reveals a leaflet."` instead of the full room description). This reduces repetitive token costs by over 90% and keeps the context history extremely clean and focused.

*   **Chain-of-Thought (CoT) Reasoning**: Prompts the AI to output its reasoning process before deciding the command. The system prompt templates require the LLM to output a `Reasoning:` block followed by a `Command:` line. The frontend parses the multi-line response, extracting only the clean action command for typing, which unlocks deeper logical planning and reduces repetitive "guessing" loops.
*   **Extended LLM Providers**: Support for Gemini 3.5 Flash, GPT-4o-mini, Claude 3.5 Sonnet, NVIDIA NIM, **Groq**, Ollama Cloud, LM Studio (Local), Ollama (Local), and Custom Providers.
*   **Conversation History Limit**: Customizable turn history memory buffer (configurable $N$ turns from `0` to `20`) to eliminate AI "goldfish brain" repetition. Automatically formatted for Gemini, Claude, and OpenAI APIs.
*   **Auto-Retry on API Overload**: A `fetchWithRetry` wrapper automatically retries on `503`/`429` errors using exponential backoff (up to 3 retries), so transient API demand spikes never crash the AI loop.

---

## 🎮 AI Agent — Step-by-Step Operation Guide

### Step 1: Launch Your Emulator First

Before enabling the AI, you **must** have the emulator running:

1. In the **left panel**, select a machine (e.g. `Apple //e (Enhanced)`).
2. In the **bottom-right panel → Media tab**, mount a game disk (e.g. a Zork .dsk file). You can use the 🌐 URL button to load directly from a URL.
3. Click the **Launch** button. Wait until the emulator header shows `● Running` (green badge).

> [!IMPORTANT]
> The AI can only operate while the emulator is **actively running**. The Enable button is intentionally greyed out at all other times.

---

### Step 2: Configure AI Settings (Top-Right Panel → "AI" Tab)

Click the **AI** tab in the upper-right settings panel. You will see:

| Setting | Description | Default |
| :--- | :--- | :--- |
| **AI Agent Status** | 🔴 Disabled / 🟢 Enabled toggle button | Disabled |
| **Mode** | Choose: `🖼️ Vision Mode` (transmits base64 screenshots, consumes more tokens) or `📝 Text Mode (Low Token)` (directly parses emulator text buffer from WASM memory, extremely cheap/low-token) | Vision Mode |
| **Provider** | Choose: `Mock Simulator`, `Gemini 3.5 Flash`, `OpenAI GPT-4o-mini`, `Claude 3.5 Sonnet`, `NVIDIA NIM`, `Groq`, `Ollama Cloud`, `LM Studio (Local)`, `Ollama (Local)`, `Custom Provider` | Mock Simulator |
| **API Key** | Your LLM provider's secret key (stored locally in browser, never sent to third-party servers) | — |
| **API URL** | Base endpoint URL for the selected provider (editable, visible for OpenAI-compatible options) | *(auto-filled)* |
| **Model** | The model name to request from the provider API (editable, visible for OpenAI-compatible options) | *(auto-filled)* |
| **Tick Rate (sec)** | How often (in seconds) the AI captures screen and decides the next command | 15 |
| **Type Delay (ms)** | Millisecond delay between each character keystroke (keep at 60ms to avoid WASM input skipping) | 60 |
| **Max Tokens** | Maximum output token limit for the LLM response (increase if AI responses are being truncated) | 1000 |
| **History Limit** | Turn limit of conversation history (screen states + AI actions) sent in request to prevent "goldfish brain" (configurable from `0` to `20`) | 5 |
| **System Prompt** | Natural language instructions for the AI (what game it's playing, how to behave). Automatically syncs with current Mode templates | Zork preset |

#### Getting an API Key

- **Gemini 3.5 Flash** (Recommended — fastest and most affordable):
  1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
  2. Click **"Create API Key"** → copy the key
  3. Paste it into the **API Key** field and select **Gemini 3.5 Flash** as Provider.

- **OpenAI GPT-4o-mini**:
  1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  2. Create a new key and paste it in.

- **Claude 3.5 Sonnet**:
  1. Go to [console.anthropic.com](https://console.anthropic.com)
  2. Create an API key and paste it in.

- **Groq** (Fast inference, free tier available):
  1. Go to [console.groq.com](https://console.groq.com/keys)
  2. Create an API key and paste it in. Select **Groq** as Provider.

> [!NOTE]
> All API keys are stored **only** in your browser's `localStorage`. They are never committed to source code or sent to any third-party server other than your chosen LLM provider directly.

---

### Step 3: Start the AI Agent

1. Click **🔴 Disabled** — it will toggle to **🟢 Enabled**.
2. Switch to the **bottom-right panel → "AI Agent" tab** to monitor activity.

---

### Step 4: Monitor in the "AI Agent" Tab (Bottom-Right Panel)

| Element | What it shows |
| :--- | :--- |
| **Status badge** | `Idle` (grey) → `Thinking` (yellow) → `Typing` (green) → `Error` (red) |
| **Vision Screen Capture** | A live thumbnail of what the AI "sees" — the current emulator canvas frame |
| **Agent Execution Log** | Timestamped log of every action: capture, API call, command received, characters typed, retry warnings |

**A healthy cycle looks like:**
```
[HH:MM:SS] AI Agent Enabled - Starting loop
[HH:MM:SS] Capturing emulator screen...
[HH:MM:SS] Calling LLM API (gemini)...
[HH:MM:SS] AI Command received: "OPEN MAILBOX"
[HH:MM:SS] Successfully typed command: "OPEN MAILBOX"
```

**If the server is busy (503/429), the retry system handles it automatically:**
```
[HH:MM:SS] [Retry] API returned 503 (busy/limit). Retrying in 1.5s... (Attempt 1/3)
[HH:MM:SS] [Retry] API returned 503 (busy/limit). Retrying in 3.8s... (Attempt 2/3)
[HH:MM:SS] AI Command received: "GO NORTH"
```

---

### Step 5: Troubleshooting

| Error | Cause | Fix |
| :--- | :--- | :--- |
| `API key is required for gemini` | No API key entered | Enter your key in the API Key field |
| `Gemini API error: 404` | Wrong model name or endpoint | Update to latest code (model is auto-set to `gemini-3.5-flash`) |
| `Empty response from Gemini API` | `MAX_TOKENS` too low (Gemini 3.5 uses tokens for internal reasoning too) | Increase **Max Tokens** to `1000` or higher |
| `AI Agent repeatedly types LOOK` | Canvas is black (WebGL buffer cleared) — needs latest AI layer code | `git pull` and re-deploy; the `preserveDrawingBuffer` fix resolves this |
| `Error: Emulator canvas not found` | Emulator is not running | Launch the emulator first, wait for the `Running` badge |
| `503 high demand` (no retry shown) | Outdated code without retry logic | `git pull` and re-deploy for auto-retry support |

---

### Quick Reference: Mock Simulator (No API Key Needed)

Want to test the pipeline without spending API credits?

1. Set **Provider** to **Mock Simulator**.
2. Set **Tick Rate** to `5` seconds.
3. Enable the AI.
4. Watch as the AI automatically steps through a pre-scripted Zork sequence: `LOOK` → `OPEN MAILBOX` → `TAKE LEAFLET` → `READ LEAFLET` → `GO EAST` → `GO NORTH` → `GO WEST`...

This verifies that screenshot capture, keystroke injection, and the AI loop are all working correctly before you use a real API key.

---

![](screenshot.png)

> [!IMPORTANT]
> **Pure Client-Side**: AmpleWeb runs entirely in your browser. No backend, no server-side emulation, and zero installation required.



## 🍎 Ample (macOS) vs. AmpleWeb (Web) Comparison

| Feature | Ample (macOS Native) | AmpleWeb (Web) | Notes |
| :--- | :--- | :--- | :--- |
| **Language** | Objective-C (Cocoa) | **React + TypeScript (Vite)** | 1:1 UI replica using modern web standards |
| **Installation** | .dmg Image / Homebrew | **Zero Install (Web-based)** | Runs directly via URL |
| **MAME Integration** | Built-in Custom Core | **MAME WASM (Universal)** | High-performance Emscripten-compiled binary |
| **UI** | Native macOS Components | **Pixel-Perfect CSS Replica** | Includes **Dark/Light Mode** & Tab Persistence |
| **File System** | Native HFS/ProDOS Access | **VFS + Local Folder Mapping** | Support for mounting local folders via File System Access API |
| **Data Persistence** | Direct Disk Write | **Save-on-Change Guard** | Detects VFS changes and prompts to save locally when ejecting, changing files, or loading URLs |
| **Video Support** | Metal / OpenGL / BGFX | **WebGL / BGFX WASM** | Full BGFX effects (CRT-Geom, Scanlines, etc.) |
| **XML Config (.cfg)** | Plist / Native MAME .cfg | **Decoupled LocalStorage + VFS mapping** | Built-in **XML Configuration Editor** supporting instant editing, direct local import/export, and decoupled persistence per specific clone model (e.g. `macpd280` / `macpd280c`) |

## 🌟 Key Features

### 🍏 Faithful Experience (Feature Parity)
*   **Visual Precision**: Support for **Window 1x-4x** modes, **Integer Fit (Sharp)** mode, and **Full Screen** (Fit-to-Screen) scaling.
*   **Square Pixel Support**: Fully enabled and operational "Square Pixel" mode which disables aspect-ratio correction, passing `-nokeepaspect` to the WASM core for a perfect 1:1 hardware pixel grid rendering.
*   **Comprehensive Library**: Full support for **Apple I, II, III, and Macintosh** families.
*   **International Localization**: Proper support for localized **Apple IIe/IIee/IIep** variants (DE, FR, ES, SE, UK) with accurate character sets and boot logos.
*   **Peripheral Support**: Supports auto-injection for **SCSI, CFFA2, Mouse cards, and Memory expansion**.
*   **Dynamic ROM Management**: Automatically fetches required device ROMs (e.g., `a2mouse.zip`) for selected slot peripherals, preventing boot crashes.
*   **Advanced Video**: Fully enabled and operational **BGFX screen chains** (including scanline and CRT Geom filters), utilizing WebGL hardware acceleration for authentic retro visuals.
*   **Personalized UI**: Full support for **Dark/Light Mode** switching, faithfully replicating the macOS native visual aesthetics.
*   **Slot Configuration Consistency**: Improved slot initialization logic to respect "None" (empty) selections across UI refreshes, matching the high standards of the native macOS and Windows/Linux ports.
### 🌐 Web-Specific Features
*   **Background Run & Audio Support**: The emulator keeps running and playing sound in the background when the browser window loses focus. (Requires keeping the page in a separate, non-minimized window; do not minimize the window or switch to other tabs in the same browser window, as browsers automatically suspend background tabs).
*   **Premium Collapsible Drawers**: Both left (Machine List) and right (Settings Panel) lanes utilize smooth CSS hardware-accelerated transitions and absolute floating drawer pull handles (`◀` / `▶`) that automatically nest into sidebar inner edges when expanded.
*   **Fully Resizable Workspace**: The interface features a flexible layout. Drag the horizontal divider in the right settings panel to seamlessly adjust the vertical height of the System Settings and Machine Configuration frames.
*   **Active Workspace Resizing**: Synchronized manual drag-to-resize operations with MAME's WASM engine. Adjusting the left sidebar or right settings panel width dynamically dispatches `resize` events to ensure real-time viewport and pointer coordination mapping alignment.
*   **Mobile Overlay Drawers & Auto-Collapse**: On phone screens (width <= 800px), sidebars transition to fixed overlay drawer panels with rich box-shadows, leaving the emulator canvas at 100% fullscreen height. Includes auto-collapsing states triggered dynamically on window resize or initial load to keep the UI clean and focused.
*   **Unconfigurable Slot Dropdowns Cleanup**: Automatically hides blank, useless select dropdowns for built-in/unchangeable slot lanes (where `options.length <= 1`), turning their labels into clean bold section headers while keeping selectable sub-slots (e.g. floppy drives) perfectly functional underneath.
*   **Light Theme Contrast & Interactive Polish**: Fixed the high-contrast visibility issue of the "📺 Full Screen" badge button in light theme, replacing hardcoded styles with dynamic theme-aware coloring, and added smooth micro-animations (scale/fade transitions) on hover and active click actions.
*   **Local Directory Mapping (/share)**: Map any local host folder directly to the emulator's VFS for seamless data exchange.
*   **Save back to Local (Save-on-Change Guard)**: Any write operations to virtual disks/hard disks during emulator runtime are automatically tracked. Clicking **Eject (⏏️)**, selecting a **Local File (📁)**, or inserting a **URL (🌐)** will trigger a safety check, prompting you to save changes back to your local filesystem first, preventing accidental data loss.
*   **Capture Persistence**: Export generated **AVI video** and **WAV audio** captures directly to your local device (avoid long recordings to prevent browser memory buffer overflow).
*   **Deep Linking & Complete URL Persistence**: Pre-configure machines, slots, and media via URL parameters; supports automatic startup (URL ending with `&autoboot`) for seamless demos. All query string flags stay fully persisted in your browser's address bar after launching, allowing instant manual page reloads (F5). Use the new **🔗 Share** button next to the machine name in the header to copy a fully-restored, self-launching deep link instantly to your clipboard!
*   **URL-Based Media Loading**: Mount disks directly from any external URL using the `?media=slotId:http://...` parameter or via the new **🌐 URL Button** in the Media tab.
*   **Automatic ZIP Unzipping**: Support for loading `.zip` disk images from URLs or local selection. Automatically extracts valid images (.dsk, .do, .po, etc.) for mounting.
*   **Recursive Device Dependencies**: Automatically resolves sub-dependencies for slot peripherals (e.g., `a2mouse` needing `m68705p3`).
*   **Persistent Configuration**: Machine and slot selections are automatically saved in local storage. Refreshing or "Stopping" the emulator no longer loses your current setup.
*   **Internal Controls**: Dedicated UI buttons for **MAME UI (Scroll Lock)** and **MAME Menu (Tab)** to facilitate easier access to internal emulator settings.
*   **Zero-Setup ROMs**: Multi-server failover engine for automatic firmware downloading and caching in IndexedDB.
*   **Intelligent Machine Reset**: Automatically clears previous slot configurations and media mounts when switching between different machines. This ensures a clean slate and prevents "configuration pollution" when transitioning from specialized URL-based sessions.
*   **Indeterminate Progress Spinner Loader**: The loading overlay features a beautiful, rotating circular spinner next to status text (replacing crude jumpy 0-100% bars), providing a highly polished, professional loading feel. Canvas is always centered from the start.
*   **Audio/Video Synchronization**: Screen and sound now start simultaneously. The emulator overlay is removed the instant MAME's runtime initializes (`onRuntimeInitialized`), the same moment audio begins, eliminating the previous 1–2 second audio-before-video gap.
*   **Built-in XML Configuration Editor**: Edit and tweak MAME's low-level system configuration XML directly from the UI. Features intelligent syntax preservation, auto-correction of the target `<system name="...">` tags, dynamic on-launch driver translation (e.g. `macpd280` / `macpd280c`), and fully responsive equal-width operations (**Read**, Save, Export, Import, Reset) presented in a single centered row.
*   **Corsfix Sponsored Proxy**: Cross-origin media downloads are proudly powered by [Corsfix](https://corsfix.com/).

## 🔗 Deep Link URL Parameter Specification

AmpleWeb features a powerful URL parameter mapping engine (Deep Linking) that allows you to pre-configure and share precise emulator environments, peripherals, disk media, window dimensions, and shader effects.

### Core Parameters

| Parameter | Alias | Expected Values | Description |
| :--- | :--- | :--- | :--- |
| **`m`** | — | Machine identifier (e.g., `apple2ee`, `apple2gsr1`) | Sets the target Apple/Macintosh model system to load. |
| **`d`** | — | Encoded string (e.g., `Apple+%2F%2Fe+%28enhanced%29`) | Sets the human-readable description shown in the UI. |
| **`s`** | — | Comma-separated slot-value pairs (e.g., `ramsize:64K,sl4:mouse,sl6:diskiing`) | Pre-configures slot peripherals, memory cards, and internal settings. |
| **`media`** | — | `slotId:URL` or `slotId:filename` | Mounts external disk images directly from a URL. Supports `.zip`, `.dsk`, `.2mg`, `.hdv`, `.woz`, etc. |
| **`extra`** or **`?extra`** | — | Raw MAME OSD arguments (e.g., `-port,:a2video:a2_video_config,3`) | Inject custom low-level MAME options or port overrides (with automatic query string typos handling). |
| **`autoboot`** | — | Flag or numeric (e.g., `&autoboot` or `&autoboot=0` or `&autoboot=5`) | Triggers automated machine launch. Accepts a custom delay value `n` in seconds (0 to 10). `n=0` or valueless flag launches instantly. (Clicking the "Stop" button during emulation automatically strips this parameter to prevent endless restart loops). |

### Video & Shader Settings Parameters

You can pass these to configure display settings on startup. Note that choosing any shader effect automatically switches the rendering method to hardware-accelerated **BGFX WebGL**:

| Parameter | Alias / Synonyms | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| **`windowMode`** | `window_mode`, `wm`, `w` | `1x`, `2x`, `3x`, `4x`, `fit`, `integer-fit` | **Window scale**. `fit` fits to screen; `integer-fit` locks scaling to exact integer multipliers for ultra-sharp pixels. |
| **`videoShader`** | `video_shader`, `shader`, `effect`, `bgfxEffect`, `bgfx_effect` | `none`, `scanlines`, `crt-geom`, `crt-geom-deluxe`, `hq2x`, `lcd-grid` | **Display filter**. Values can use underscores or hyphens interchangeably. |
| **videoMethod** | `video_method`, `vm` | `soft`, `bgfx`, `opengl` | **Rendering backend engine**. |

### Complete URL Sharing Examples

Here are some real-world combination examples to demonstrate the URL deep linking capabilities:

1. **Apple IIe Enhanced with BGFX CRT Shader, 64K RAM, Mouse Card, Video-7 configuration & Auto-boot:**
   ```
   https://anomixer.github.io/ample/?m=apple2ee&d=Apple+%2F%2Fe+%28enhanced%29&s=ramsize%3A64K%2Csl4%3Amouse%2Csl6%3Adiskiing%2Csl6%3Adiskiing%3A0%3A525%2Csl6%3Adiskiing%3A1%3A525%2Csl7%3Acffa202%2Caux%3Aext80%2Csl7%3Acffa202%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa202%3Acffa2_ata%3A1%3Ahdd&extra=-port,:a2video:a2_video_config,3&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot&w=fit&shader=crt-geom
   ```
   *(Features demonstrated: `m` for model, `s` slots mapping, `extra` for Video-7 OSD settings, `media` for external .zip HDD image, `autoboot` timer, `w` window mode override, and `shader` for BGFX CRT display filter)*

2. **Apple IIgs ROM 01 with 1.25MB RAM, Floppy & CFFA2 HDD drives & Auto-boot:**
   ```
   https://anomixer.github.io/ample/?m=apple2gsr1&d=Apple+IIgs+%28ROM01%29&s=ramsize%3A1280K%2Csmartport%3Afdc%3A0%3A525%2Csmartport%3Afdc%3A1%3A525%2Csmartport%3Afdc%3A2%3A35dd%2Csmartport%3Afdc%3A3%3A35dd%2Csl7%3Acffa2%2Csl7%3Acffa2%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa2%3Acffa2_ata%3A1%3Ahdd&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot
   ```

---

## ⚠️ Known Limitations
*   **Disk Mounting Limits**: Due to browser VFS limitations, disks can only be mounted before launching the machine. Real-time disk swapping is not supported (Alternative: Use the "Local Directory Mapping" feature in the Paths tab and mount via MAME's internal UI from the `/share` directory).
*   **Core Stability**: Machines highlighted in **yellow** may not function correctly due to underlying emulation core limitations.
*   **Audio Latency**: There may be slight audio lag, which is a known limitation of MAME WASM.
*   **Execution Speed**: Speed gains are limited by the WASM architecture; settings like 500% or Max speed may not be achievable.
*   **Disabled Features**: Due to compatibility issues, the following features are currently disabled: Debug and Generate VGM.
*   **Browser Limits**: Large AVI captures may exceed browser memory buffers if recorded for extended periods.

## 🛠️ Quick Start

### 1. Instant Online Experience (Recommended)

No setup required. Enjoy the classic 80s computing experience directly in your browser:
👉 **[Main Site](https://anomixer.github.io/ample/)**

We have pre-configured two instant-launch retro systems containing Apple II Desktop for you:
*   **[Launch Apple IIe (enhanced)](https://anomixer.github.io/ample/?m=apple2ee&d=Apple+%2F%2Fe+%28enhanced%29&s=ramsize%3A64K%2Csl4%3Amouse%2Csl6%3Adiskiing%2Csl6%3Adiskiing%3A0%3A525%2Csl6%3Adiskiing%3A1%3A525%2Csl7%3Acffa202%2Caux%3Aext80%2Csl7%3Acffa202%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa202%3Acffa2_ata%3A1%3Ahdd&extra=-port,:a2video:a2_video_config,3&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot&windowMode=fit&videoMethod=bgfx)** (with Video-7 RGB, BGFX Hardware Acceleration & Autoboot)
*   **[Launch Apple IIgs (ROM01)](https://anomixer.github.io/ample/?m=apple2gsr1&d=Apple+IIgs+%28ROM01%29&s=ramsize%3A1280K%2Csmartport%3Afdc%3A0%3A525%2Csmartport%3Afdc%3A1%3A525%2Csmartport%3Afdc%3A2%3A35dd%2Csmartport%3Afdc%3A3%3A35dd%2Csl7%3Acffa2%2Csl7%3Acffa2%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa2%3Acffa2_ata%3A1%3Ahdd&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot)** (with 1.25MB RAM, CFFA2 HDD controller & Autoboot)

### 2. Running Locally (Developers/Offline Use)

#### Prerequisites
-   A modern web browser ( **Chrome, Edge, or Opera** recommended for File System Access API support).

1.  **One-Click Start (Recommended)**:
    *   **Windows**: Run `AmpleWeb.bat`
    *   **Linux/macOS**: Run `./AmpleWeb.sh` (requires `chmod +x AmpleWeb.sh`)
    The scripts will automatically check the environment, install dependencies, **download ROMs**, and start the server.

2.  **Manual Start (For Developers)**:
    *   Install dependencies: `npm install`
    *   **Download ROMs**: Run `download_roms.ps1`
        - The system detects missing files in `public/roms` and launches the high-speed multi-threaded downloader.
        - You can select sources (CallApple, MDK, etc.) or provide a custom URL.
        - Downloaded `.zip` files are stored in `public/roms` for immediate use by the WASM frontend.
    *   **(Optional)** To rebuild `public/wasm/mame.wasm.gz`, use the [MameWasm](https://github.com/anomixer/MameWasm) project to build the binary, then compress it to `.gz`.
    *   Launch server: `npm run dev` or `node server.js`
    Open `http://localhost:5173` to start playing.

## 📂 Project Structure

| File/Directory | Description |
| :--- | :--- |
| **`AmpleWeb.bat / .sh`** | **One-Click Start Scripts**. Automatically checks env, installs deps, downloads ROMs, and starts server. |
| **`download_roms.ps1`** | **ROM Downloader**. PowerShell script with interactive menus and automatic patching logic. |
| **`rom_manager_cli.py`** | **Download Engine**. Python-based multi-threaded (50-threads) tool with failover support. |
| **`server.js`** | **Local Dev Server**. Handles npm install, environment preparation, and auto-opens browser. |
| **`src/App.tsx`** | Main application logic, UI layout, and state management. |
| **`src/core/wasm_loader.ts`** | MAME WASM bridge, VFS management, and boot argument builder. |
| **`public/roms/`** | Default directory for system firmware (ROM download target). |
| **`public/wasm/`** | **MAME WASM Core**. Contains `mame.wasm.gz` and its loader script. |
| **`public/samples/`** | **Audio Samples**. e.g., floppy drive mechanical sounds (`floppy/*.wav`). |
| **`public/resources/`** | **UI Resources**. Includes machine icons, logos, and UI assets. |

## 📝 Acknowledgments

*   Original macOS version developer: [Kelvin Sherlock](https://github.com/ksherlock)
*   **Web Port Developers: anomixer + Antigravity**
*   **WASM Core**: Powered by [emularity-engine](https://github.com/internetarchive/emularity-engine) and custom MAME builds.

---
*Disclaimer: AmpleWeb is an independent open-source project and is not affiliated with, authorized, maintained, or endorsed by Apple Inc. or any other respective companies mentioned. All product and company names are trademarks™ or registered® trademarks of their respective holders.*
