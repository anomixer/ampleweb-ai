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
- ✅ 251 `.plist` resource files copied to `public/resources/`
- ✅ ROM ZIP files for all supported emulators in `public/roms/`
- ✅ WASM loading and Module setup verified working
- ✅ Per-emulator WASM routing (each machine loads its correct WASM)
- ✅ Per-emulator ROM mapping (DRIVER_ROM_MAP)
- ✅ Per-emulator MAME driver mapping (DRIVER_MAP)
- ✅ Per-emulator resolution (native from emularity config)
- ✅ **apple2e** — boots and runs correctly
- ✅ **apple3** — boots and runs correctly
- ✅ **apple2gs** — boots and runs correctly
- ✅ **mac128k / mac512k / mac512ke** — boots and runs correctly (via mac128.wasm)
- ✅ **macplus** — boots and runs correctly (via mac128.wasm)
- ✅ **macse / macsefd** — boots and runs correctly (via mac128.wasm)
- ✅ **maciici** — boots and runs correctly (via maciici.wasm)
- ✅ **c64** — boots and runs correctly
- ✅ **coco** — boots and runs correctly
- ✅ **coco3** — boots and runs correctly
- ✅ **trs80 (trs80l2)** — boots and runs correctly
- ✅ **mc10** — boots and runs correctly
- ✅ Config area right panel is resizable
- ✅ **apple2c / apple2c0 / apple2c3 / apple2cp** — boots and runs correctly (via mameapple2e.wasm from emularity-engine)
- ✅ **apple2p** — boots and runs correctly (via mameapple2.wasm, needs aux ROMs: votrax.zip, a2diskiing.zip, d2fdc.zip)
- ✅ **55+ Mac variants** — now supported via mac.wasm (full MAME Mac build from emularity-engine)
  - Mac II family: macii, maciihmu, mac2fdhd, maciix, maciifx, maciicx, maciisi, maciivx, maciivi
  - Mac Quadra: macqd605/610/650/700/800/900/950
  - Mac LC/Performa: maclc/2/3/3p/475/520/550/575/580, macct610/650, mactv
  - Mac Portable: macprtb, macpb100/140/145/145b/160/165/165c/170/180/180c
  - Mac Duo: macpd210/230/250/270c/280/280c
  - Mac Classic: macclasc, macclas2, maccclas
- ✅ Canvas centering fix — no flash at page bottom during boot
- ✅ Launcher scripts: AmpleWeb.bat & AmpleWeb.sh (auto-install + auto-open browser)

### What Doesn't Work Yet
- ✅ **apple2jp** — now boots via `apple2.zip` (mapped in DRIVER_ROM_MAP)
- ✅ **Atari ST** — no emularity WASM available (st.wasm is Stadium Hero arcade, not Atari ST)
- ✅ **Media Management** — implemented "Media" tab for mounting local disk images (.dsk, .img, etc.)
- ✅ **Tabbed Configuration** — integrated Slots, Media, and Logs into a unified tabbed UI
- ✅ **Dedicated Machine WASM** — infrastructure for loading per-machine builds (e.g. `apple2jp.wasm`) implemented
- ✅ **ROM Library Populated** — essential BIOS ROMs for 50+ models copied to `public/roms/`

### Key Insight (Session 3)
The **239MB full mame.wasm** is the root cause of most issues:
- Too large for practical web use (loading time, memory pressure)
- V8 function size limit issues
- C++ exception handling bugs specific to the full build

### Key Insight (Session 4 — emularity pivot)
Could not build MAME WASM under Linux — all Emscripten releases (2.0.24, 3.1.70, 4.0.23) have wasm-ld defaulting to wasm64, rejecting wasm32 object files. Tried every approach: `-m wasm32` flags, building.py patching, different Emscripten versions, clang flags. All failed.

**Solution**: Use Internet Archive's [emularity-engine](https://github.com/internetarchive/emularity-engine) which ships pre-built `mameapple2e.wasm.gz` + `mameapple2e.js.gz`. These are Emscripten-compiled MAME Apple IIe modules ready for browser use.

- `mameapple2e.wasm` — 27MB (decompressed from 5.7MB gz)
- `mameapple2e.js` — 1.7MB (decompressed from 263KB gz)
- JS glue uses `wasmBinaryFile="apple2e.wasm"` + `locateFile` to find the .wasm
- BIOS: `apple2e.zip` from [emularity-bios](https://github.com/internetarchive/emularity-bios)

### Key Files
- `src/App.tsx` — Main app with machine tree, slot config, per-emulator WASM routing
- `src/core/wasm_loader.ts` — WASM loader (preRun + addRunDependency, jsUrl option)
- `src/core/data_manager.ts` — Plist/XML parser
- `src/core/store.ts` — Zustand store (theme only)
- `src/styles/global.css` — Dark/light theme CSS
- `public/wasm/` — 13 WASM files (apple2e, apple2gs, apple3, mac, mac128, maciici, coco, coco3, trs80, st, c64, mc10, mame, mametiny)
- `public/wasm/*.js` — Corresponding JS glue files
- `public/roms/apple2e.zip` — Apple IIe BIOS ROM (from emularity-bios, 555KB)
- `public/resources/` — 251 `.plist` resource files
- `AGENTS.md` — Development log

---

## Development Plan

### Phase 1：WASM 基礎建設 ✅ (COMPLETED)
- [x] Create AmpleWeb directory and project plan
- [x] Initialize MameWasm environment (emsdk, ninja, mame source)
- [x] Build MAME tiny WASM subtarget (46MB)
- [x] Build full MAME WASM in WSL (239MB, all drivers)
- [x] Copy 251 .plist files from Ample/Resources to public/resources/

### Phase 2：前端骨架 + 核心整合 (IN PROGRESS)
- [x] Initialize Vite + React + TypeScript project
- [x] Create basic App.tsx with machine tree UI
- [x] Create Zustand store for state management
- [x] Create global CSS with light/dark theme support
- [x] Port `.plist` parser to TypeScript (`data_manager.ts`)
- [x] Build machine tree UI component (left panel)
- [x] Integrate WASM loader (based on test_mamewasm.html logic)
- [x] **Session 3**: Fix ROM loading — write ZIP directly to VFS (not extract with fflate)
- [x] **Session 3**: Fix wasm_loader.ts — use `preRun` + `addRunDependency` (proven approach)
- [x] **Session 3**: Remove fflate dependency (no longer needed)
- [x] **Session 3**: Fix `apple2eonly.lua` — add AY8910, TTL74259, VOTRAX dependencies
- [x] **Session 4**: Switch to emularity pre-built WASM (MAME WASM build blocked on wasm64)
- [x] **Session 4**: Copy `mameapple2e.wasm` + `mameapple2e.js` from emularity-engine
- [x] **Session 4**: Copy `apple2e.zip` BIOS from emularity-bios
- [x] **Session 4**: Fix WASM target detection (sync XHR instead of async fetch HEAD)
- [x] **Session 5**: Fix screen aspect ratio + canvas centering + height
- [x] **Session 6**: Deploy 11 emulator WASM files from emularity-engine
- [x] **Session 6**: Implement per-emulator WASM routing (replaced global WASM_TARGET_MAP)
- [x] **Session 7**: Download BIOS ROMs for all 11 deployed emulators
- [x] **Session 7**: Add `DRIVER_ROM_MAP` — driver name → ROM ZIP filename mapping
- [x] **Session 7**: Fix `fetchAllRoms` — look up ROM from map instead of driver name
- [x] **Session 7**: Add `DRIVER_MAP` — machine name → MAME driver name (e.g. mac128k → mac)
- [x] **Session 7**: Fix per-emulator resolutions (was hardcoded 640x480)
- [x] **Session 8**: Fix apple2p aux ROM loading (votrax, a2diskiing, d2fdc)
- [x] **Session 8**: Mark apple2 and apple2jp as unsupported (undumpable ROMs)
- [x] **Session 9**: Implement ROM download engine with multi-server failover
  - `src/core/rom_downloader.ts` — download engine, IndexedDB caching
  - `src/core/store.ts` — romSettings (downloadServers + autoDownload) persisted to localStorage
  - `fetchAllRoms` updated: tries local ROM first, then downloads from servers
  - Settings panel in sidebar (⚙️ button) for configuring download servers
- [ ] **TODO**: Test each emulator and verify correct boot
- [ ] **TODO**: Verify Mac canvas renders correctly (thin line was resolution mismatch)

- [x] **Session 10**: Implement Media Management & UI Overhaul
  - [x] Created "Media" tab for disk image mounting
  - [x] Updated `wasm_loader.ts` to handle VFS mounting of local files
  - [x] Added tabbed configuration interface (Slots, Media, Logs)
  - [x] Refined `DRIVER_MAP` and `DRIVER_ROM_MAP` for 100+ models
  - [x] Implemented dedicated per-machine WASM selection logic
  - [x] Populated `public/roms/` with essential BIOS from AmpleWin

### Phase 4：ROM 管理
- [ ] ROM download engine (multi-server failover)
- [ ] Browser-side ROM storage in IndexedDB
- [ ] Settings persistence via localStorage

### Phase 5：進階功能 + 打磨
- [ ] Adaptive light/dark theme
- [ ] Video/CPU/A/V/Paths tabs
- [ ] Command-line preview
- [ ] Responsive design

---

## Key Design Decisions

1. **Zero backend**: Everything runs client-side.
2. **Shared resources**: Symlink/copy `Ample/Resources/*.plist` to keep machine definitions in sync.
3. **WASM strategy**: Build dedicated per-machine WASM targets instead of the full 239MB build.
4. **ROM loading**: Write ZIP files directly to VFS (MAME handles extraction + checksum verification internally).
5. **Storage**: IndexedDB for ROMs and disk images, localStorage for settings.
6. **UI parity**: Match AmpleWin's layout, colors, and behavior.

---

## Session: 2026-04-10 — ROM Loading Rewrite + apple2eonly WASM Build

### 🎯 Objective
Get apple2e running by fixing ROM loading and building a dedicated WASM target.

### ✅ Key Changes

#### 1. `src/core/wasm_loader.ts` — 完整重寫
**問題**：之前用 `fflate` 解壓 ZIP 再寫個別 ROM 檔到 `/roms/<driver>/`。但 MAME 預期直接讀 ZIP 檔（它有內建 ZIP handler）。

**修正**（參考 `test_mamewasm.html` 已驗證的做法）：
- 改用 `preRun` + `addRunDependency('rom-write')` 暫停 MAME 啟動
- **直接寫 ZIP 檔**到 `/roms/<driver>.zip`（例如 `/roms/apple2e.zip`）
- `removeRunDependency('rom-write')` 後 MAME 自動 `callMain()`
- 移除 `fflate` 依賴（不再需要 JS 層解壓）
- 移除 `Module.FS` 和 `Module.callMain` patch（改用 `FS` 全域變數 + 自動啟動）

**關鍵差異**：
```
❌ 舊方法（不穩定）：
   onRuntimeInitialized → fflate.unzipSync() → FS.writeFile(個別檔案)

✅ 新方法（已驗證）：
   preRun → addRunDependency → FS.writeFile(ZIP整包) → removeRunDependency
```

#### 2. `src/App.tsx` — 簡化啟動流程
- 抽出 `fetchAllRoms()` 函式，清楚分離 ROM 取得邏輯
- 附屬 ROM 清單精簡為 Apple IIe 真正需要的：`a2diskiing`, `votrsc01a`, `d2fdc`
- 移除無關的 `mac128k`, `mac512k`, `macplus` 等 Mac ROM 載入
- Canvas 搜尋改用 `id='canvas'`（與 Emscripten SDL 硬編碼一致）

#### 3. `apple2eonly.lua` — 補上缺少的依賴
原始版本缺少 apple2e 運行所需的裝置類型：
- `SOUNDS["AY8910"] = true` — Mockingboard 音效卡依賴此晶片
- `SOUNDS["VOTRAX"] = true` — Votrax 語音合成
- `MACHINES["TTL74259"] = true` — Mockingboard 使用
- `MACHINES["INPUT_MERGE"] = true` — Apple II 輸入合併邏輯
- 新增 `superga2.cpp` 和 `tk2000.cpp` 原始碼（clone 驅動共用）

#### 4. `apple2eonly.lst` — 更新驅動清單
使用 MAME 0.287 的 `@source:` 格式：
```
@source:apple/apple2e.cpp
apple2e
apple2ep

@source:apple/apple2.cpp
apple2
apple2p
```

#### 5. `package.json` — 移除 fflate 依賴
不再需要 `fflate`，因為 ROM 不再在 JS 層解壓。

### 🔧 `apple2eonly` WASM 建置進行中
使用 Windows `build.ps1 -Target mame -Subtarget apple2eonly` 建置。
預期輸出大小：~10-20MB（vs 239MB 全建置）。

WSL `emmake make` 方式失敗原因：
- `.lua` 檔不能用 backtick 字串語法（改用雙引號已修）
- `USE_SDL=2` 不是有效的 make 參數
- `.lst` 解析 `do_parse` 未定義（需透過 `make generate` + ninja 流程）

### 📋 當前狀態

| 項目 | 狀態 |
|------|------|
| ROM 載入（寫 ZIP 直接） | ✅ 程式碼已修正 |
| wasm_loader（preRun + addRunDependency） | ✅ 程式碼已修正 |
| apple2eonly.lua 依賴 | ✅ 已補上 AY8910, TTL74259 等 |
| apple2eonly WASM 建置 | 🔄 build.ps1 執行中 |
| apple2e 實際啟動測試 | ⏳ 待 WASM 建置完成 |

---

## Session: 2026-04-25 — Emularity Pivot (MAME WASM Build Blocked)

### 🎯 Objective
Abandon custom MAME WASM build. Use Internet Archive's pre-built emularity MAME Apple IIe WASM.

### Problem: MAME WASM Build Exhausted All Options
All Emscripten releases (2.0.24, 3.1.70, 4.0.23) have wasm-ld that defaults to **wasm64 mode**, rejecting wasm32 object files with:
```
wasm-ld: error: wasm32 object file can't be linked in wasm64 mode
```

Tried fixes (all failed):
- `-m wasm32` / `-m wasm32-emscripten` via linker flags — rejected as invalid target architecture
- `-s MEMORY64=0` in command line — didn't reach wasm-ld or ignored
- Patched `building.py` to insert `-m wasm32` before `-o` — same issue
- Emscripten 2.0.24 (clang-13) — crashed, harfbuzz cmake compatibility issues
- Emscripten 4.0.23 — same wasm64 issue

### Solution: Use emularity-engine pre-built WASM
Internet Archive's [emularity-engine](https://github.com/internetarchive/emularity-engine) ships pre-built MAME Apple IIe WASM.

**Files copied to AmpleWeb**:
| File | Source | Size |
|------|--------|------|
| `public/wasm/apple2e.wasm` | emularity-engine `mameapple2e.wasm.gz` | 27 MB |
| `public/wasm/apple2e.js` | emularity-engine `mameapple2e.js.gz` | 1.7 MB |
| `public/roms/apple2e.zip` | emularity-bios | 555 KB |

**Integration details**:
- JS glue has `wasmBinaryFile="apple2e.wasm"` hardcoded
- Uses `locateFile` to resolve `.wasm` path relative to JS file location (`/wasm/`)
- `WASM_TARGET_MAP` updated: `apple2eonly` → `apple2e`
- WASM detection fixed: async `fetch()` HEAD requests were racing — replaced with sync `XMLHttpRequest` to avoid detecting non-existent `/wasm/mame.wasm` (which returned HTML 404 → `<!doctype` magic word → WASM compile failure)

### 📋 當前狀態

| 項目 | 狀態 |
|------|------|
| emularity WASM 複製 + 解壓縮 | ✅ 已複製到 public/wasm/ |
| BIOS apple2e.zip 複製 | ✅ 已複製到 public/roms/ |
| WASM target detection (sync XHR) | ✅ 已修正 |
| apple2e 啟動測試 | ✅ 已開機！ |
| 螢幕畫面比例 | ❌ 需要修正 |

### 💡 給下一個 Session 的提示
1. **螢幕比例** — 已修正：resolution 改為 `560x384`（匹配 native_resolution），移除 canvas `max-width/max-height` 防止拉伸
2. **畫面偏左** — 已修正：canvasContainerRef 從 `block` 改為 `flex`（`alignItems: center, justifyContent: center`），canvas 加 `margin: auto`
3. 測試畫面是否正確顯示
4. 如果比例還不對，檢查 emularity MAME 的實際渲染尺寸是否真的是 560x384

---

## Session: 2026-04-25 — Per-Emulator WASM Routing + Multi-Emulator Deployment

### 🎯 Objective
Deploy all emularity WASM emulators that Ample supports (not all 1101 emularity files). Implement per-emulator WASM routing so each machine loads its correct WASM file.

### Architecture Change: Per-Emulator WASM
**Before**: Single global `WASM_TARGET_MAP` → all machines share one WASM target.
**After**: `EMULATOR_WASM_MAP` maps emulator types to their dedicated WASM + JS + MAME driver. Each machine is routed to the correct WASM via `getEmulatorForMachine(machineName)`.

### Emulator Routing (`getEmulatorForMachine`)
```
apple2gs*    → apple2gs.wasm (apple2gs.js, driver: apple2gs)
apple2p*     → mameapple2.wasm (mameapple2.js, driver: apple2p)
apple2*      → mameapple2.wasm (mameapple2.js, driver: apple2)
apple2jp*    → mameapple2.wasm (mameapple2.js, driver: apple2)
apple2woz*   → apple2e.wasm (apple2e.js, driver: apple2woz)
apple2e*     → apple2e.wasm (apple2e.js, driver: apple2e)
apple3*      → apple3.wasm (apple3.js, driver: apple3)
maciici*     → maciici.wasm (maciici.js, driver: maciici)
mac128*      → mac128.wasm (mac128.js, driver: mac128k)
macplus      → mac128.wasm (mac128.js, driver: macplus)
macse        → mac128.wasm (mac128.js, driver: macse)
macsefd      → mac128.wasm (mac128.js, driver: macse)
coco3*       → coco3.wasm (coco3.js, driver: coco3)
coco*        → coco.wasm (coco.js, driver: coco)
trs80*       → trs80.wasm (trs80.js, driver: trs80l2)
c64*         → c64.wasm (c64.js, driver: c64)
mc10*        → mc10.wasm (mc10.js, driver: mc10)
```

### Supported Machines

| Emulator | WASM Size | Supported Machines | ROM ZIP | Resolution |
|----------|-----------|-------------------|---------|------------|
| Apple II (mameapple2.wasm) | 26 MB | apple2, apple2p, apple2jp | apple2.zip / apple2p.zip | 560x384 |
| Apple IIe | 27 MB | apple2e, apple2ee, apple2eeuk, apple2eede, apple2eese, apple2eefr, apple2ep, apple2euk, apple2ede, apple2ese, apple2efr, apple2ees | apple2e.zip | 560x384 |
| Apple IIgs | 27 MB | apple2gs, apple2gsr0, apple2gsr1 | apple2gs.zip | 704x462 |
| Apple III | 26 MB | apple3 | apple3.zip | 560x384 |
| Mac (mac128.wasm) | 33 MB | mac128k, mac512k, mac512ke, macplus, macse, macsefd | mac128k.zip / macplus.zip / macse.zip | 512x342 / 512x342 / 512x342 |
| Mac IIci | 26 MB | maciici | maciici.zip | 640x480 |
| ColecoVision / Coco | 21 MB | coco, cocoh, coco2b, coco2bh | coco.zip | 320x240 |
| Coco 3 | 21 MB | coco3, coco3p, coco3h | coco3.zip | 640x480 |
| TRS-80 | 20 MB | trs80, trs80l2 | trs80.zip | 384x192 |
| Commodore 64 | 11 MB | c64, c64c | c64.zip | 384x272 |
| MC-10 | 22 MB | mc10 | mc10.zip | 372x243 |

### Unsupported Machines

These machines have **NO emularity WASM** and will show "No emulator support" error:

| Category | Machines |
|----------|----------|
| Mac II family | macii, maciihmu, mac2fdhd, maciix, maciifx, maciicx, maciisi, maciivx, maciivi |
| Mac Quadra | macqd605, macqd610, macqd650, macqd700, macqd800, macqd900, macqd950 |
| Mac LC/Performa | maclc, maclc2, maclc3, maclc3p, maclc475, maclc520, maclc550, maclc575, macct610, macct650, mactv |
| Mac Portable | macprtb, macpb100, macpb140, macpb145, macpb145b, macpb160, macpb165, macpb165c, macpb170, macpb180, macpb180c |
| Mac Duo | macpd210, macpd230, macpd250, macpd270c, macpd280, macpd280c |
| Mac Classic | macclasc, macclas2, maccclas |
| Atari ST | All variants (st.wasm is Stadium Hero arcade, NOT Atari ST) |
| Franklin ACE | franklin, franklin100, franklin120, etc. |
| Agat | agat, agat10, agat6, agat6m, agat6mp, agatplus, etc. |
| Chinese PCs | cekc, ceckc, cecpc, etc. |
| Apple II Clones | laser12, superga2, tk2000, etc. |

### Deployed WASM Files

| File | Size | Source | Ample Emulators |
|------|------|--------|-----------------|
| `apple2e.wasm` | 27 MB | emularity-engine | apple2e, apple2ee, apple2ep, apple2c, etc. |
| `apple2gs.wasm` | 27 MB | emularity-engine (mameapple2gs.wasm.gz) | apple2gs, apple2gsr0, apple2gsr1 |
| `apple3.wasm` | 26 MB | emularity-engine (mameapple3.wasm.gz) | apple3 |
| `mac.wasm` | 24 MB | emularity-engine | mac, mac128, macplus, macse, macii, etc. |
| `mac128.wasm` | 33 MB | emularity-engine | mac128k variants |
| `maciici.wasm` | 26 MB | emularity-engine | maciici |
| `coco.wasm` | 21 MB | emularity-engine (mamecoco12.wasm.gz) | coco, cocoh, coco2b, coco2bh |
| `coco3.wasm` | 21 MB | emularity-engine (mamecoco3.wasm.gz) | coco3, coco3p, coco3h |
| `trs80.wasm` | 20 MB | emularity-engine (mametrs80.wasm.gz) | trs80, trs80l2 |
| `st.wasm` | 20 MB | emularity-engine (mamestadhero.wasm.gz) | st (Atari ST) |
| `c64.wasm` | 11 MB | emularity-engine (dedicated) | c64, c64c |
| `mc10.wasm` | 22 MB | emularity-engine | mc10 |
| `mame.wasm` / `mametiny.wasm` | 239/45 MB | MAME WASM build | fallback |

### Deployed ROM/BIOS Files

| File | Size | Source |
|------|------|--------|
| `apple2e.zip` | 555 KB | emularity-bios |
| `apple2c.zip` | 23 KB | emularity-bios |
| `apple2gs.zip` | 816 KB | emularity-bios |
| `apple3.zip` | 17 KB | emularity-bios |
| `macplus.zip` | 980 KB | emularity-bios |
| `mac128k.zip` | 98 KB | emularity-bios |
| `maciici.zip` | 344 KB | emularity-bios |
| `c64.zip` | 407 KB | emularity-bios |
| `coco.zip` | 180 KB | emularity-bios |
| `coco3.zip` | 78 KB | emularity-bios |
| `trs80.zip` | 450 KB | emularity-bios |
| `mc10.zip` | 15 KB | emularity-bios |

### WASM Loading Flow
1. `handleLaunch` → `getEmulatorForMachine(machineName)` → emulator type
2. `getWasmForEmulator(emulator)` → check if WASM exists, fallback to first available
3. `loadMameWasm(wasmUrl, { jsUrl, driverArgs, ... })` → load correct JS + WASM
4. `locateFile` in wasm_loader returns correct `.wasm` path
5. preRun writes ROM ZIPs to VFS → MAME auto-starts with driver

### Session 10 — Media Management & UI Overhaul
- **Media Mounting**: Added a "Media" tab to allow users to mount local `.dsk`, `.2mg`, `.hdv` files. These are written to `/media/` on the WASM VFS and passed as `-flop1`, `-hard1` etc. to MAME.
- **Tabbed Configuration**: Slots, Media, and Logs are now organized into tabs for a cleaner, more professional look.
- **Dedicated WASM Support**: The loader now looks for `<machine_name>.wasm` (e.g., `apple2jp.wasm`) before falling back to generic emulator WASMs. This enables the "one WASM per machine" goal.
- **ROM Library**: Synchronized 50+ BIOS ZIPs from `AmpleWin/mame/roms` to `public/roms/` to ensure immediate out-of-the-box compatibility for most models.
- **Driver Mapping expansion**: Updated mapping tables to cover Quadras, PowerBooks, and specialized Apple II clones.

### 💡 給下一個 Session 的提示
1. 測試各 emulator 能否正常啟動 — apple2e, apple3, apple2gs 已確認正常
2. 測試 mac, c64, coco, trs80, st, mc10 啟動是否正常
3. 為沒有 WASM 的 emulator 顯示更清晰的 "unsupported" 提示

---

## Session: 2026-05-01 — Standalone ROM Strategy & Universal ROM Fix

### 🎯 Objective
Solve the persistent "NOT FOUND" ROM errors for Apple IIc, IIe, IIgs, and Mac variants by implementing a fully independent, flattened ROM structure.

### ✅ Key Changes

#### 1. Standalone ROM Strategy
**Problem**: MAME WASM cores often fail to resolve ROMs located in subdirectories or within parent/clone ZIP relationships (the "tried in ..." error).
**Solution**: Every machine variant listed in `DRIVER_ROM_MAP` now has its **own unique ZIP file** that contains all necessary files in a **completely flat structure** (no subdirectories).

#### 2. `universal_rom_fix.js` — Enhanced Automation Tool
Developed a robust Node.js script to automate the creation of these standalone ROMs:
- **Multi-Source Injection**: Automatically merges content from multiple ZIPs (e.g., `apple2ee.zip` = `apple2e.zip` + `a2diskiing.zip` + `votrsc01a.zip`).
- **Deep Flattening**: Extracts all files from subdirectories and moves them to the root of the ZIP.
- **IO Robustness**: Implemented a **retry loop** (up to 3 attempts) for the compression step to overcome Windows file locking issues (Defender/Search Indexing).
- **VFS Simplicity**: By writing a single, complete ZIP to the WASM VFS (e.g., `/roms/apple2c0.zip`), MAME finds all BIOS and device ROMs instantly.

#### 3. `src/App.tsx` — Driver Mapping Overhaul
Updated `DRIVER_ROM_MAP` to ensure a 1:1 relationship between machine drivers and ZIP filenames:
- **Apple IIe**: `apple2ee`, `apple2eeuk`, etc. -> `apple2ee.zip`, `apple2eeuk.zip`
- **Apple IIc**: `apple2c0`, `apple2c3`, `apple2c4`, `apple2cp` -> `apple2c0.zip`, etc.
- **Apple IIgs**: `apple2gsr0`, `apple2gsr1` -> `apple2gsr0.zip`, etc.
- **Mac**: `mac512k`, `maciihmu`, `maciivi`, etc. -> Dedicated standalone ZIPs.
- **C64/CoCo**: Flattened `c1541.zip` and `coco_fdc.zip` into their respective machine ZIPs.

### 🔧 Tools Developed
- `scratch/find_apple2c_roms_v2.js`: ZIP scanner to verify which archives contain specific missing ROM files.
- `scratch/universal_rom_fix.js`: The primary engine for building the standalone ROM library.

### 📋 Status Update

| Machine Family | Status | Fix Details |
|----------------|--------|-------------|
| **Apple IIe Variants** | ✅ Stable | Injected Disk II & Votrax into all variant ZIPs. |
| **Apple IIc Variants** | ✅ Stable | Flattened parent `apple2c.zip` content into clones. |
| **Apple IIgs Variants** | ✅ Stable | Consolidated multi-part GS ROMs. |
| **Mac Variants** | ✅ Stable | Stabilized 10+ Mac II and LC variants with standalone packs. |
| **Commodore 64** | ✅ Stable | Merged `c1541` drive ROMs into `c64.zip` and `c64c.zip`. |
| **TRS-80 / CoCo** | ✅ Stable | Flattened FDC and Disk ROMs into main system ZIPs. |

### 💡 Tips for next Session
1. If any new machine shows a "NOT FOUND" error, identify the missing file using the browser log.
2. Add a new task to `universal_rom_fix.js` to inject the source of that file into the machine's standalone ZIP.
3. Run the script and `git add -f` the resulting ZIP.