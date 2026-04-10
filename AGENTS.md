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

### What Doesn't Work Yet
- ❌ apple2e doesn't run — 239MB full `mame.wasm` is too large and unstable
- ❌ Need dedicated `apple2eonly` WASM build (much smaller, more stable)

### Key Insight (Session 3)
The **239MB full mame.wasm** is the root cause of most issues:
- Too large for practical web use (loading time, memory pressure)
- V8 function size limit issues
- C++ exception handling bugs specific to the full build
- The `apple2eonly` custom target in MameWasm will produce a ~10-20MB WASM

### Key Files
- `src/App.tsx` — Main app with machine tree, slot config, launch buttons
- `src/core/wasm_loader.ts` — WASM loader (preRun + addRunDependency, writes ZIP directly)
- `src/core/data_manager.ts` — Plist/XML parser
- `src/core/store.ts` — Zustand store (theme only)
- `src/styles/global.css` — Dark/light theme CSS
- `public/roms/apple2e.zip` — Apple IIe ROM set (142KB)
- `public/roms/a2diskiing.zip` — Disk II controller ROM
- `public/roms/votrsc01a.zip` — Votrax speech ROM
- `public/roms/d2fdc.zip` — Duo Disk floppy controller ROM

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
- [ ] **BLOCKED**: Build `apple2eonly` WASM (build.ps1 running on Windows)
- [ ] Test apple2e with dedicated WASM build

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

### 💡 給下一個 Session 的提示
1. 檢查 `build.ps1` 建置結果（可能已在背景完成）
2. 建置成功後，將 `mameapple2eonly.js` 和 `mameapple2eonly.wasm` 複製到 `AmpleWeb/public/wasm/`
3. 更新 `App.tsx` 中的 WASM 路徑從 `/wasm/mame.wasm` 改為 `/wasm/mameapple2eonly.wasm`
4. 用 `npm run dev` 測試 apple2e 啟動
5. 若建置失敗，可能需手動跑 `build.ps1` 互動模式（PowerShell 視窗中執行）