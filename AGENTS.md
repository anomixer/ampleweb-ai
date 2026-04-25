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
- ✅ ROM ZIP files for apple2e and aux devices in `public/roms/`
- ✅ WASM loading and Module setup verified working
- ✅ 11 emulator WASM files deployed (apple2e, apple2gs, apple3, mac, mac128, maciici, coco, coco3, trs80, st, c64, mc10)
- ✅ Per-emulator WASM routing (each machine loads its correct WASM)

### What Doesn't Work Yet
- ❌ BIOS/ROM files missing for non-Apple emulators (c64, trs80, coco, st, mc10)
- ❌ Resolution hardcoded to 640x480 (should read from machine plist)
- ❌ Many Ample emulators have no emularity WASM (Franklin, Agat, Chinese PCs, etc.)

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
- [ ] **TODO**: Add BIOS/ROM files for non-Apple emulators (c64, trs80, coco, st, mc10)
- [ ] **TODO**: Read resolution from machine plist instead of hardcoding 640x480
- [ ] **TODO**: Test each emulator and verify correct boot

### Phase 3：插槽/媒體系統
- [ ] Dynamic slot configuration UI
- [ ] Media file selectors (floppies, hard drives)
- [ ] Sub-slot popup system
- [ ] Software list overlay
- [ ] IndexedDB integration for disk image storage

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
apple2e*     → apple2e.wasm (apple2e.js, driver: apple2e)
apple2gs*    → apple2gs.wasm (apple2gs.js, driver: apple2gs)
apple3*      → apple3.wasm (apple3.js, driver: apple3)
mac*         → mac.wasm (mac.js, driver: mac)
coco3*       → coco3.wasm (coco3.js, driver: coco3)
coco*        → coco.wasm (coco.js, driver: cocoh)
trs80*       → trs80.wasm (trs80.js, driver: trs80)
c64*         → c64.wasm (c64.js, driver: c64)
mc10*        → mc10.wasm (mc10.js, driver: mc10)
st*          → st.wasm (st.js, driver: stadhero)
```

### Deployed WASM Files

| File | Size | Source | Ample Emulators |
|------|------|--------|-----------------|
| `apple2e.wasm` | 27 MB | emularity-engine | apple2e, apple2ee, apple2ep, apple2c, etc. |
| `apple2gs.wasm` | 27 MB | emularity-engine (mameapple2gs.wasm.gz) | apple2gs, apple2gsr0, apple2gsr1 |
| `apple3.wasm` | 26 MB | emularity-engine (mameapple3.wasm.gz) | apple3 |
| `mac.wasm` | 24 MB | emularity-engine | mac, mac128, macplus, maciici, etc. |
| `mac128.wasm` | 33 MB | emularity-engine | mac128k variants |
| `maciici.wasm` | 26 MB | emularity-engine | maciici |
| `coco.wasm` | 21 MB | emularity-engine (mamecoco12.wasm.gz) | coco, cocoh, coco2b, coco2bh |
| `coco3.wasm` | 21 MB | emularity-engine (mamecoco3.wasm.gz) | coco3, coco3p, coco3h |
| `trs80.wasm` | 20 MB | emularity-engine (mametrs80.wasm.gz) | trs80, trs80l2 |
| `st.wasm` | 20 MB | emularity-engine (mamestadhero.wasm.gz) | st (Atari ST) |
| `c64.wasm` | 11 MB | emularity-engine (dedicated) | c64, c64c |
| `mc10.wasm` | 22 MB | emularity-engine | mc10 |
| `mame.wasm` / `mametiny.wasm` | 239/45 MB | MAME WASM build | fallback |

### WASM Loading Flow
1. `handleLaunch` → `getEmulatorForMachine(machineName)` → emulator type
2. `getWasmForEmulator(emulator)` → check if WASM exists, fallback to first available
3. `loadMameWasm(wasmUrl, { jsUrl, driverArgs, ... })` → load correct JS + WASM
4. `locateFile` in wasm_loader returns correct `.wasm` path
5. preRun writes ROM ZIPs to VFS → MAME auto-starts with driver

### Key Code Changes
- `src/App.tsx`: `EMULATOR_WASM_MAP`, `getEmulatorForMachine()`, `getWasmForEmulator()`, updated `handleLaunch`/`handleTestLaunch`
- `src/core/wasm_loader.ts`: Added `jsUrl` option to `WasmLoaderOptions`

### Emulators WITHOUT WASM Support
These Ample emulators have NO emularity WASM — will show "no emulator support" error:
- Franklin ACE series (franklin, franklin100, etc.)
- Agat series (agat, agat10, etc.)
- China Education Computers (cekc, ceckc, etc.)
- Apple II clones (laser12, superga2, etc.)
- TRS-80 Color Computer variants without dedicated WASM
- Most other non-Apple/non-Mac machines

### 💡 給下一個 Session 的提示
1. 測試各 emulator 能否正常啟動
2. 確認各 emulator 的 resolution 是否正確（目前統一 640x480）
3. 為沒有 WASM 的 emulator 顯示更清晰的 "unsupported" 提示
4. 可選：為每個 emulator 設定專屬 resolution（從 machine plist 的 resolution field 讀取）