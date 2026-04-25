# AmpleWeb

> **⚠️ WARNING: WORK IN PROGRESS ⚠️**
>
> AmpleWeb is currently in an active testing and development phase.
> Please **do not Git clone or fork** for production use at this time.
> The core WASM integration and filesystem hooks are undergoing rapid changes.

## Overview

AmpleWeb is the pure browser-based emulation frontend for the Ample project. It runs MAME WASM directly in the client — zero backend, zero server-side code. Powered by [emularity-engine](https://github.com/internetarchive/emularity-engine) pre-built WASM modules.

**Goal**: Pixel-perfect web replica of AmpleWin's UI/UX, running entirely in the browser.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Emulation**: emularity-engine WASM (pre-built MAME Apple IIe, C64, TRS-80, etc.)
- **State**: Zustand
- **Storage**: IndexedDB / OPFS for ROMs and disk images
- **UI**: Custom CSS with dark/light theme support

## Currently Deployed Emulators

| Emulator | WASM Size | Supported Machines | Status |
|----------|-----------|-------------------|--------|
| Apple II (mameapple2.wasm) | 26 MB | apple2, apple2p, apple2woz | ✅ Working |
| Apple IIe | 27 MB | apple2e, apple2ee, apple2ep, apple2c, apple2cp, etc. | ✅ Working |
| Apple IIgs | 27 MB | apple2gs, apple2gsr0, apple2gsr1 | ✅ Working |
| Apple III | 26 MB | apple3 | ✅ Working |
| Mac (mac128.wasm) | 33 MB | mac128k, mac512k, mac512ke, macplus, macse, macsefd | ✅ Working |
| Mac IIci | 26 MB | maciici | ✅ Working |
| ColecoVision / Coco | 21 MB | coco, cocoh, coco2b, coco2bh | ✅ Working |
| Coco 3 | 21 MB | coco3, coco3p, coco3h | ✅ Working |
| TRS-80 | 20 MB | trs80, trs80l2 | ✅ Working |
| Commodore 64 | 11 MB | c64, c64c | ✅ Working |
| MC-10 | 22 MB | mc10 | ✅ Working |
| Atari ST | — | _none_ | ❌ No WASM (st.wasm is Stadium Hero arcade) |

## Unsupported Machines

55+ Mac variants and other machines have **NO emularity WASM support**: macii, maciix, macquadra, maclc, macportable, macpb, macpd, macclasc, macclas2, maccclas, mactv, Franklin ACE, Agat, Chinese Education Computers, and more. These will show "No emulator support" when selected.

## Getting Started

```bash
npm install
npm run dev
```

## ROM Requirements

Each emulator needs its BIOS ROM ZIP in `public/roms/`. Currently only `apple2e.zip` is included.

## Architecture

See `AGENTS.md` for detailed development log, architecture decisions, and session notes.
