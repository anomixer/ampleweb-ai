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

| Emulator | WASM Size | Source |
|----------|-----------|--------|
| Apple IIe | 27 MB | emularity dedicated |
| Apple IIgs | 27 MB | emularity MAME-wrapped |
| Apple III | 26 MB | emularity MAME-wrapped |
| Mac (all variants) | 24 MB | emularity dedicated |
| Mac 128K | 33 MB | emularity dedicated |
| Mac IIci | 26 MB | emularity dedicated |
| ColecoVision / Coco | 21 MB | emularity MAME-wrapped |
| Coco 3 | 21 MB | emularity MAME-wrapped |
| TRS-80 | 20 MB | emularity MAME-wrapped |
| Atari ST | 20 MB | emularity MAME-wrapped |
| Commodore 64 | 11 MB | emularity dedicated |
| MC-10 | 22 MB | emularity dedicated |

## Getting Started

```bash
npm install
npm run dev
```

## ROM Requirements

Each emulator needs its BIOS ROM ZIP in `public/roms/`. Currently only `apple2e.zip` is included.

## Architecture

See `AGENTS.md` for detailed development log, architecture decisions, and session notes.
