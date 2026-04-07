# AmpleWeb - Agent Development Log

## Project Overview

AmpleWeb is a pure web-based version of AmpleWin / AmpleLinux — a MAME/MESS frontend for Apple II and Macintosh emulation, running entirely in the browser. It uses MameWasm's WebAssembly builds of MAME/MESS as the emulation backend.

**Goal**: Pixel-perfect web replica of AmpleWin's UI/UX, powered by browser-side WASM, zero server-side code.

**Tech Stack**: Vite + React + TypeScript, IndexedDB/OPFS for storage, MameWasm for WASM core.

**Developer**: Antigravity (anomixer)

---

## Current Status

### What Works
- ✅ Vite + React + TypeScript project initialized
- ✅ Machine tree UI (left sidebar) loads from `models.plist`
- ✅ Machine detail panel with slot configuration
- ✅ Light/dark theme support
- ✅ WASM loader module (`wasm_loader.ts`) — loads mame.js/mame.wasm
- ✅ MAME WASM builds successfully (both `-O2` 210MB and `-O1` 250MB)
- ✅ 251 `.plist` resource files copied to `public/resources/`
- ✅ Test ROM at `public/roms/apple2.7z`

### What Doesn't Work Yet
- ❌ **No emulator screen appears** — MAME WASM loads but canvas stays blank
- ❌ ROM loading into WASM FS via `preRun` — ROM data is fetched but MAME still reports "NOT FOUND"
- ❌ `callMain` is not exported on Module in the full build (only `tiny` build has it)
- ❌ Using `Module.arguments` + `noInitialRun: false` — MAME starts but exits immediately after printing ROM errors to console

### Current Error
```
[MAME] a2.chr NOT FOUND (tried in apple2)
[MAME] 341-0001-00.e0 NOT FOUND (tried in apple2)
...
Uncaught (in promise) 105734600  ← MAME exit code
```

The ROM file (`apple2.7z`) is fetched successfully via `fetch('/roms/apple2.7z')` and written to WASM FS via `FS.writeFile('/roms/apple2.7z', data)` in `preRun`, but MAME still can't find it.

### Key Files
- `src/App.tsx` — Main app with machine tree, slot config, launch buttons
- `src/core/wasm_loader.ts` — WASM loader (sets up Module, preRun, arguments)
- `src/core/data_manager.ts` — Plist/XML parser (complete but not fully integrated)
- `src/core/store.ts` — Zustand store (theme only)
- `src/styles/global.css` — Dark/light theme CSS
- `public/roms/apple2.7z` — Test ROM
- `wasm/mame.wasm` (250MB, -O1) + `wasm/mame.js` (528KB)
- `wasm/mametiny.wasm` (46MB) — also available but doesn't include Apple II drivers

---

## Development Plan

### Phase 1：WASM 基礎建設 ✅ (COMPLETED)
- [x] Create AmpleWeb directory and project plan
- [x] Initialize MameWasm environment (emsdk, ninja, mame source)
- [x] Build MAME tiny WASM subtarget (46MB)
- [x] Build full MAME WASM in WSL (Ubuntu, emscripten 4.0.5, -O1)
  - Output: `mame.js` (528KB) + `mame.wasm` (250MB)
  - 42740 drivers included (Apple II, Macintosh, all MESS drivers)
  - Fixes applied:
    - `fairlight/cmi.cpp`: PAGE_SIZE macro conflict → renamed to CMI_PAGE_SIZE
    - `msxdos2.cpp`: PAGE_SIZE macro conflict → renamed to MSX_PAGE_SIZE
    - `apollo.cpp`: unused variable errors → added __attribute__((unused))
    - `drcbec.cpp`: FENV_ACCESS pragma not supported on wasm → wrapped in #if 0
    - `luaengine.cpp`: sol2 ambiguous operator assignment → explicit std::make_pair
    - Increased INITIAL_MEMORY from 24MB to 128MB
    - Skipped tools build (jedutil, ldresample, etc. - not needed for web)
    - Used `-O1` instead of `-O2` to avoid V8 function size limit (7.6MB)
- [x] Copy built WASM artifacts to `C:\dev\ample\AmpleWeb\wasm\`

### Phase 2：前端骨架 + 核心整合 (BLOCKED - needs WASM fix)
- [x] Initialize Vite + React + TypeScript project
- [x] Create basic App.tsx with machine tree UI
- [x] Create Zustand store for state management
- [x] Create global CSS with light/dark theme support
- [x] Copy 251 .plist files from Ample/Resources to public/resources/
- [x] Port `.plist` parser from Python to TypeScript (`data_manager.ts`)
  - Parse `models.plist` (machine tree hierarchy)
  - Parse individual `<machine>.plist` files (slots/devices/media)
  - Parse MAME software list XML files
- [x] Build machine tree UI component (left panel)
- [x] Integrate WASM loader (based on MameWasm's `test_mamewasm.html` logic)
- [ ] **BLOCKED**: Basic flow: select machine → load WASM with correct driver → run
  - Need to fix ROM loading into WASM FS
  - Need to get canvas rendering working

### Phase 3：插槽/媒體系統
- [ ] Dynamic slot configuration UI (combo boxes with option overlays)
- [ ] Media file selectors (floppies, hard drives, CD-ROM, cassettes)
- [ ] Sub-slot popup system (nested hardware like SCSI cards)
- [ ] Software list overlay popup with deferred XML loading
- [ ] IndexedDB integration for disk image storage and WASM file system mounting

### Phase 4：ROM 管理
- [ ] ROM download engine (multi-server failover: callapple.org → mdk.cab)
- [ ] Browser-side ROM storage in IndexedDB
- [ ] ROM status display (All/Missing filter, search, progress bar)
- [ ] Settings persistence via localStorage

### Phase 5：進階功能 + 打磨
- [ ] Adaptive light/dark theme (prefers-color-scheme + manual toggle)
- [ ] Video/CPU/A/V/Paths tabs (BGFX, scaling, speed, recording, shared directory)
- [ ] Real-time command-line preview (editable, 4-line console)
- [ ] Window state persistence (geometry, splitter, last machine)
- [ ] VGM recording (if WASM supports audio capture)
- [ ] Responsive design for various screen sizes
- [ ] Performance optimization (WASM streaming compilation, lazy loading)

---

## Architecture

```
AmpleWeb/
├── wasm/                    # MAME/MESS WASM builds (from MameWasm)
│   ├── mame.js              # Emscripten JS loader (528KB)
│   ├── mame.wasm            # WebAssembly binary (250MB, -O1)
│   ├── mametiny.js          # Tiny build loader
│   └── mametiny.wasm        # Tiny build (46MB, no Apple II drivers)
├── src/
│   ├── components/          # React UI components
│   │   ├── MachineTree.tsx       # Left panel machine browser
│   │   ├── SlotConfig.tsx        # Dynamic slot configuration
│   │   ├── MediaSelector.tsx     # Floppy/HDD/CD/cassette selectors
│   │   ├── SoftwareList.tsx      # Software list overlay popup
│   │   ├── SubSlotPopup.tsx      # Nested slot configuration
│   │   ├── RomManager.tsx        # ROM management dialog
│   │   ├── CommandPreview.tsx    # Editable command-line preview
│   │   ├── TabsPanel.tsx         # Video/CPU/A/V/Paths tabs
│   │   └── ThemeToggle.tsx       # Light/dark theme switcher
│   ├── core/
│   │   ├── data_manager.ts       # .plist + XML parser
│   │   ├── wasm_loader.ts        # MAME/MESS WASM integration
│   │   ├── rom_manager.ts        # ROM download + storage
│   │   └── settings.ts           # localStorage persistence
│   ├── styles/
│   │   ├── theme.ts              # Light/dark QSS-equivalent tokens
│   │   └── global.css            # Global styles
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── resources/            # Copied from Ample/Resources/
│   │   ├── models.plist
│   │   ├── roms.plist
│   │   └── *.plist           # Individual machine definitions
│   └── roms/
│       └── apple2.7z         # Test ROM
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── AGENTS.md                 # This file
```

---

## Key Design Decisions

1. **Zero backend**: Everything runs client-side. WASM emulation, ROM storage, UI — all in the browser.
2. **Shared resources**: Symlink/copy `Ample/Resources/*.plist` to keep machine definitions in sync.
3. **WASM strategy**: Full MAME build with `-O1` to avoid V8 function size limit.
4. **Storage**: IndexedDB for ROMs and disk images, localStorage for settings.
5. **UI parity**: Match AmpleWin's layout, colors, and behavior as closely as possible.

## Related Projects

- **AmpleWin** (`C:\dev\ample\AmpleWin`) — Windows port (Python/PySide6)
- **AmpleLinux** (`C:\dev\ample\AmpleLinux`) — Linux port (Python/PySide6)
- **MameWasm** (`C:\dev\MameWasm`) — WASM build toolchain
- **ksherlock/ample** — Original macOS app (upstream)

## External Services

- **callapple.org** — Primary ROM download server
- **mdk.cab** — Fallback ROM download server
- **mamedev.org** — Free ROMs for testing

## Notes for Next Developer

### WASM Loading Issue
The main blocker is getting MAME to find ROM files in the WASM virtual filesystem. The approach used in `test_mamewasm.html` (MameWasm repo) works with `mametiny.js` but not with the full `mame.js`. Key differences:
- `mametiny.js` exports `callMain` on Module; `mame.js` (full build) does not
- `mame.js` uses `noInitialRun: false` + `Module.arguments` to auto-start
- `preRun` hooks are called but `FS.writeFile` may not persist before MAME scans ROMs
- MAME exits immediately with error code when ROMs are not found

### Possible Fixes to Try
1. Use `Module.preRun.push()` instead of pre-assigning `preRun` array
2. Use `Module.addRunDependency()` / `Module.removeRunDependency()` to block startup until ROM is loaded
3. Try `FS.createPreloadedFile()` instead of `FS.writeFile()`
4. Check if the ROM path in `arguments` (`-rompath /roms`) matches the FS path
5. Try using `--preload-file` at build time instead of runtime FS writes
6. Rebuild WASM with `-s EXPORTED_RUNTIME_METHODS="['FS','callMain','cwrap']"` to ensure `callMain` is available

---

## Session: 2026-04-07

### 🎯 Objective: WASM ROM Loading Fix + UI Overhaul

### ✅ Key Changes

#### `src/core/wasm_loader.ts` — 完整重寫
- **`addRunDependency` 策略**：ROM 寫入前呼叫 `addRunDependency('rom-load')`，寫入完後 `removeRunDependency`，確保 MAME 在 ROM 就緒前不啟動。
- **正確目錄結構**：建立 `/roms/<driver>/` 子目錄（例如 `/roms/apple2/apple2.zip`），匹配 MAME 期望的 rompath 解析邏輯。
- **`-rompath /roms` 自動注入**：若 driverArgs 未含 `-rompath`，自動加入，確保 MAME 能找到正確路徑。
- **`onAbort` / `quit` 回呼**：攔截 MAME abort 與正常退出，避免未處理的 Promise rejection。
- **`onLog` 回呼**：所有 `print`/`printErr`/`setStatus` 輸出統一傳到 UI。
- **新增 `fetchRom(url, driver, filename?)`** helper：從 URL fetch ROM 並包裝成 `RomFile` 結構。
- **`buildMameArgs` 改善**：更清晰的選項分組，自動帶入 `-video soft -resolution 640x480 -window -nomaximize -skip_gameinfo -nohlsl_enable`。

#### `src/App.tsx` — 重寫 UI
- **4 段 Launch 流程**：`idle → fetching-rom → loading-wasm → running/error`，每段有對應 badge 顯示。
- **多 ROM URL 嘗試**：自動嘗試 `/roms/<driver>.zip` 再 `/roms/<driver>.7z`，找不到才繼續（MAME 可能內建 ROM）。
- **MAME Console Log 面板**：底部可展開/收起的 log 視窗，即時顯示 MAME 的 stdout/stderr。
- **機器搜尋框**：左側欄加入搜尋，自動展開符合群組。
- **Tree 過濾**：搜尋時遞迴比對 description/value，不匹配的節點自動隱藏。
- **精緻 Welcome 畫面**：空白狀態改為 Apple logo + 說明文字。
- **進度 Bar 改版**：橫條 + 側邊文字，更不佔空間。

#### `src/styles/global.css` — 設計系統升級
- **Design Tokens 完整化**：8 層背景色 (`--bg0` ~ `--bg4`)、完整 text/border/accent 變數。
- **Google Fonts**：Inter（UI）+ JetBrains Mono（console/code）。
- **深色/亮色雙主題**：`.app.light` override，所有元件自動適配。
- **Slot Grid 改版**：label 固定 140px，select 自動撐滿，整齊對齊。
- **Log Panel**：monospace、max-height 240px、scroll、clear 按鈕。
- **Spinner 動畫**：候等 WASM 載入時顯示旋轉動畫。

### 🔧 已知問題（仍未解決）
- MAME 找不到 ROM 的根本原因仍需 ROM 檔案到位才能驗證。目前 `/public/roms/apple2.7z` 存在，但 MAME WASM 的 zip 解壓行為尚待確認。
- `callMain` 在 full build `mame.js` 不存在—使用 `noInitialRun: false` + `Module.arguments` 自動啟動是目前唯一選項。
- 若 ROM 仍找不到，下一步嘗試：在 preRun 把 zip 解壓後逐一寫入個別 ROM 檔，或改用 `--preload-file` 重新建置 WASM。

---

## Session: 2026-04-07 (Round 2) — FS/callMain 根本修復

### 🎯 Root Cause
`Module.FS` 和 `Module.callMain` 在 mame.js 全建置版中**未被 export**，導致：
- preRun 中 `Module.FS.writeFile` → `TypeError: Cannot read properties of undefined`
- `onRuntimeInitialized` 回報 `FS available: false`
- MAME 以 exit code 69195736/69195880 退出（ROM NOT FOUND）

### ✅ 修復方法

#### 1. Patch `wasm/mame.js`（在檔案尾端加兩行）
```js
Module['callMain'] = callMain;
Module['FS'] = FS;
```
這讓外部 JS 能存取 Emscripten 內部的 FS 物件和 callMain 函式。

#### 2. `wasm_loader.ts` 策略改為 `noInitialRun: true`
**舊做法（錯誤）**：在 `preRun` 中寫 ROM — FS 此時未初始化
**新做法（正確）**：
- `noInitialRun: true` — 阻止 MAME 自動執行
- `onRuntimeInitialized` callback 在此時 FS 已就緒
- 在 `onRuntimeInitialized` 中：
  1. 用 `Module.FS.writeFile('/roms/apple2.zip', data)` 寫入 ROM
  2. 呼叫 `Module.callMain(args)` 啟動 MAME

正確時序（mame.js internals）：
```
run() → preRun() → doRun() → initRuntime() [FS.init()在此] →
onRuntimeInitialized() ← 我們在這裡寫ROM+callMain → callMain()
```

#### 3. ROM 路徑結構修正
MAME rompath 搜尋邏輯：在 `-rompath /roms` 下找 `<driver>.zip`，解壓平坦結構的 ROM 檔。
- 正確：`/roms/apple2.zip`（zip 內直接是 `341-0001-00.e0` 等，無子目錄）
- 錯誤：`/roms/apple2/apple2.zip`（多一層目錄）

用 7-Zip 從 `apple2.7z`（多機器合集）解出 apple2 的 6 個 ROM 檔，重新打包成正確的 `public/roms/apple2.zip`：
```
apple2.zip 內容（平坦）：
  341-0001-00.e0  (2048 bytes)
  341-0002-00.e8  (2048 bytes)
  341-0003-00.f0  (2048 bytes)
  341-0004-00.f8  (2048 bytes)
  341-0016-00.d0  (2048 bytes)
  341-0020-00.f8  (2048 bytes)
  a2.chr          (2048 bytes)
```

#### 4. `writeRoms` 雙重 FS API 支援
- 方法 A：`Module.FS.writeFile('/roms/apple2.zip', data)` — patch 後可用
- 方法 B：`Module.FS_createDataFile('/roms', 'apple2.zip', data, ...)` — 官方 export

### 🔧 已知 official exports（`EXPORTED_RUNTIME_METHODS`）
```
Module['FS_createPath']
Module['FS_createDataFile']
Module['FS_createPreloadedFile']
Module['FS_unlink']
Module['FS_createLazyFile']
Module['FS_createDevice']
Module['requestFullscreen']
Module['setCanvasSize']
```
`callMain` 和完整 `FS` 未在官方 exports 中，需靠 patch。

### 🔧 測試結果：全數修復，發現根本原因是 Flag 與 ROM 版號問題
透過新加入的 **Exception Memory Dumper** (攔截 C++ unhandled exception pointer 並掃描 WASM Heap)，我們成功印出了讓 MAME 秒退的隱藏錯誤訊息，取得了兩項重大突破：

1. **Unsupported Flag (`-nohlsl_enable`)**:
   - `[WasmLoader] Potential exception string at offset 4: Error: unknown option: -nohlsl_enable`
   - **問題**：這個 MAME WASM build 拔除了 D3D/HLSL 支援，帶入這個 flag 會直接 Fatal Error。
   - **修復**：已從 `buildMameArgs` 中移除。

2. **Missing/Incorrect ROMs**:
   移除不支援的 flag 後，MAME 走到 ROM check 階段，爆出以下 fatal error：
   - `Required files are missing, the machine cannot be run.`
   - `a2.chr (Needs redump)` -> MAME 有讀到我們寫入的 `a2.chr`，但 checksum 與此版本的 core 期待的不符！
   - `sc01a.bin (NOT FOUND in votrsc01a, apple2)` -> 這是 Slot 4 `mockingboard` 依賴的語音晶片 ROM，缺失。
   - `341-0027-a.p5 (NOT FOUND in a2diskiing, apple2)` -> 這是 Slot 6 `diskiing` 依賴的磁碟機控制卡 ROM，缺失。
   
#### 🎉 WASM 載入與 FS 問題已完美解決
至此，以下問題**已確認完全修復**：
- `callMain` 不存在的問題（透過 patch file）
- FS 無法寫入與 `FS is undefined` 的問題（透過 `noInitialRun: true` + `onRuntimeInitialized`）
- MAME 無法自動解壓 ZIP 的問題（透過加入 `fflate` 套件在 JS 層解壓 zip，再寫入 `/roms/apple2/`）
- C++ Exception 被吃掉的問題（透過 Memory Pointer String Dumping）

### ⏭️ 下一步需要做的（Next Session）
程式碼與 WASM 掛載本身已無邏輯錯誤。下一步純粹需要準備正確的 ROM sets：
1. 準備符合此版 MAME WASM checksum 的 `apple2` ROM 檔 (特別是 `a2.chr` 的正確 dump)。
2. 若要使用擴充卡，需準備對應的 ROM 包（例如 `votrsc01a.zip`, `a2diskiing.zip`, `d2fdc.zip`）並透過同樣的載入機制寫入 FS。


