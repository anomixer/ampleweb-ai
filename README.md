# AmpleWeb

> **⚠️ WARNING: WORK IN PROGRESS ⚠️**
>
> AmpleWeb is currently in an active testing and development phase.
> Please **do not Git clone or fork** for production use at this time.
> The core WASM integration and filesystem hooks are undergoing rapid changes.

## Overview

AmpleWeb is the pure browser-based emulation frontend for the Ample project. It runs MAME WASM directly in the client — zero backend, zero server-side code. Powered by [emularity-engine](https://github.com/internetarchive/emularity-engine) pre-built WASM modules and custom universal MAME builds.

**Goal**: Pixel-perfect web replica of AmpleWin's UI/UX, running entirely in the browser.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Emulation**: emularity-engine WASM + custom universal `mame.wasm`
- **State**: Zustand
- **Storage**: IndexedDB / OPFS for ROMs and disk images
- **UI**: Custom CSS with dark/light theme support

## Currently Deployed Emulators

| Emulator | WASM Size | Supported Machines | Status |
|----------|-----------|-------------------|--------|
| **Universal (mame.wasm)** | 41 MB | **100+ Models** (BBC, Dragon, Oric, Agat, Franklin, etc.) | ✅ Working |
| Apple II (mameapple2.wasm) | 26 MB | apple2, apple2p, apple2woz | ✅ Working |
| Apple IIe | 27 MB | apple2e, apple2ee, apple2ep, apple2c, apple2cp, etc. | ✅ Working |
| Apple IIgs | 27 MB | apple2gs, apple2gsr0, apple2gsr1 | ✅ Working |
| Apple III | 26 MB | apple3 | ✅ Working |
| Mac (mac.wasm) | 55 MB | **All Macintosh Variants** (II, Quadra, LC, PB, Duo, etc.) | ✅ Working |
| Mac Legacy (mac128.wasm) | 33 MB | mac128k, mac512k, macplus, macse | ✅ Working |
| Mac IIci | 26 MB | maciici | ✅ Working |
| Color Computer / Coco | 21 MB | coco, cocoh, coco2b, coco2bh | ✅ Working |
| Coco 3 | 21 MB | coco3, coco3p, coco3h | ✅ Working |
| TRS-80 | 20 MB | trs80, trs80l2 | ✅ Working |
| Commodore 64 | 11 MB | c64, c64c | ✅ Working |
| MC-10 | 22 MB | mc10 | ✅ Working |

## Features

- **Multi-Tab Configuration**: Control **Video, CPU, A/V, Paths, Slots, and Media** settings from a unified side panel.
- **Advanced Video**: Support for **BGFX effects** (CRT-Geom, Scanlines, HQ2X), window scaling (1x to 4x), and mouse pointer lock.
- **Hardware Accuracy**: Optional **Disk Sound Effects** using real hardware audio samples.
- **VFS Integration**: Map local directories to MAME's `/share` path for easy file transfer between host and guest.
- **Intelligent Media Eject**: Automatically clears incompatible disk images when switching hardware families (e.g., from Apple II to Apple III or Mac).
- **Persistence**: All settings (theme, configurations, sidebar width) are saved automatically via IndexedDB.

## Supported Machines

AmpleWeb now supports nearly the entire library of 8-bit and 16-bit machines featured in AmpleWin, including Apple II clones (Franklin, Laser, Agat), the full Macintosh 68k family (including Quadra and PowerBook), and UK classics like the BBC Micro and Oric-1.

## Getting Started

```bash
npm install
npm run dev
```
or
```cmd
ampleweb.bat
```

## ROM Requirements

Each emulator needs its BIOS ROM ZIP in `public/roms/`.

Use `download_roms.ps1` to download and prepare the required ROM library automatically.

https://mdk.cab/download/full/<romname>.7z
and convert to zip

tk3000 required to download too

## Architecture

See `AGENTS.md` for detailed development log, architecture decisions, and session notes.
