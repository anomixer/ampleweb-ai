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

## Unified Engine Architecture

AmpleWeb now utilizes a unified **MAME 0.287 (Universal)** engine for all supported systems. This consolidation ensures maximum compatibility and feature parity (such as BGFX effects and sample support) across all machine variants.

| Engine | WASM Size | Description | Status |
|--------|-----------|-------------|--------|
| **Universal (mame.wasm.gz)** | 10 MB | **All 150+ Models** (Apple II, Mac, BBC, CoCo, C64, etc.) | ✅ Active |
| Tiny (mametiny.wasm) | 3 MB | Optimized build for early 8-bit machines | ⚡ Optional |

## Features

- **Multi-Tab Configuration**: Control **Video, CPU, A/V, Paths, Slots, and Media** settings from a unified side panel.
- **UI State Persistence**: Tabs and sidebar selections are saved across sessions for a seamless experience.
- **Advanced Video**: Support for **BGFX effects** (CRT-Geom, Scanlines, HQ2X), window scaling (1x to 4x), and true **Full Screen** mode.
- **Local Directory Mapping (/share)**: Map any local folder to `/share` within the emulator for seamless disk swapping.
- **Power Management**: Dedicated **Stop** (Power Off) and **Restart** (Power Cycle) controls for maximum WASM stability.
- **Enhanced ROM Support**: Automatic injection of auxiliary ROMs for SCSI, CFFA2, Disk II/III, and Cassette interfaces across the entire Apple I/II/III and Macintosh families.
- **International Localization**: Proper support for localized Apple IIe/IIee/IIep variants (DE, FR, ES, SE, UK) with accurate boot logos and character sets.
- **Interaction Polish**: Double-click any machine in the sidebar to launch instantly.

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

(tk3000 should be in apple2e.zip, but rom sources may put in apple2c.zip)

## Architecture

See `AGENTS.md` for detailed development log, architecture decisions, and session notes.
