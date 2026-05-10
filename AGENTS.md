# AmpleWeb Development Log

## Status: Active
## Project: AmpleWeb (MAME WASM Frontend)
# AmpleWeb Development Log

## Status: Active
## Project: AmpleWeb (MAME WASM Frontend)

### 📅 2026-05-03 Updates
- **UI & Feature Overhaul (AmpleWin Parity)**:
    - **Advanced Configuration Tabs**: Fully implemented modular tabs for **Video**, **CPU**, **A/V**, **Paths**, **Slots**, **Media**, and **Logs**.
    - **Video & UX Improvements**:
        - Integrated **BGFX Video Settings**: Added Video Method selection (Software, BGFX, OpenGL) with BGFX Backend (Auto, GLES, Vulkan) and Effects (CRT-Geom, Scanlines, etc.) support.
        - **Window Scaling**: Support for **Window 1x-4x** modes and **Full Screen** (Fit-to-Screen) scaling. Uses **MutationObserver-based Integer Scaling** to ensure pixel-perfect rendering without artifacting.
        - **Collapsible UI**: Fully **Collapsible Sidebars** (Left: Machine list, Right: Settings) with quick-access `☰` and `⚙️` toggle buttons.
        - **Mobile Optimized**: Responsive layout that automatically stacks and optimizes for touch devices and small screens.
        - **Mouse Capture**: Implemented Pointer Lock API (Hold Esc to release).
    - **Audio & Media Enhancements**:
        - **Disk Sound Effects**: Implemented loading of floppy drive audio samples.
        - **Peripheral ROMs**: Added support for **a2scsi** (SCSI) and **a2cffa2** (CompactFlash) auxiliary ROMs.
        - **Granular Media Management**: Drive groups by physical type (5.25", 3.5", HD, CD).
        - **Media Auto-Eject**: Intelligent ejection when switching hardware families.
    - **Path Mapping & Persistence**:
        - **Local Folder Mapping (/share)**: Implemented recursive synchronization using the File System Access API.
        - **Robust Permission Handling**: Directory re-authorization logic in `handleLaunch`.
    - **ROM Mapping & Stability**:
        - Resolved missing ROM errors for Macintosh LC, II, and SE families.
        - Standardized international variant mappings for IIe family (ES, FR, SE, DE, UK).
    - **CPU & Engine Logic**:
        - Added Speed Throttling (100% to 500%, or No Throttle) and Rewind support.
    - **Zustand Persistence**: Migrated all settings to a persistent store (`ample-app-storage-v2`).

### 📅 2026-05-04 Updates
- **UI/UX Refinement & Interaction**:
    - **Double-Click to Launch**: Faster access by bypassing the Launch button.
    - **UI Tab Persistence**: `localStorage` synchronization for System and Machine tabs.
    - **Full-Screen Optimization**: Native CSS `:fullscreen` rules with aspect-ratio preservation.
- **Bug Fixes & Stability**:
    - **Selection Logic Correction**: Fixed `apple2p` vs `apple2ep` conflict.
    - **WASM Audio Restored**: Fixed missing disk drive sound effects.
    - **Crash Prevention**: Resolved "black screen" failure in recursive tree components.

### 📅 2026-05-05 Updates
- **Automated ROM Management**:
    - **Multi-threaded CLI Downloader**: Created `rom_manager_cli.py` (50-thread concurrency) with dual-source failover.
    - **PowerShell Wrapper**: Developed `download_roms.ps1` with interactive menu and specialized patches.
    - **One-Click Boot Integration**: `AmpleWeb.bat/sh` automatically triggers downloader for missing ROMs.
- **Node.js Server Refinement**:
    - **Modern Node.js Compatibility**: Fixed `DeprecationWarning [DEP0190]` and `spawn EINVAL` on Windows (Node v24+).
- **Filesystem & Data Persistence**:
    - **Disk Save Workflow**: Intelligent "Save back to local" prompt via WASM VFS `mtime` detection.
    - **Capture Persistence (AVI/WAV)**: Automatic export prompts for generated media captures.
- **UI/UX & Interaction Refinement**:
    - **Compact Media Layout**: Optimized spacing and adjusted slot gaps for a professional appearance.
    - **Visual Polish**: Replaced custom toggle tracks with clean browser checkboxes.

### 📅 2026-05-07 Updates
- **ROM & WASM Stability**:
    - Fixed `mametiny.wasm` 404 error and implemented **Dynamic Slot ROM Fetching**.
    - **Recursive Device Dependencies**: Implemented `DEVICE_DEPENDENCIES` table for automatic sub-ROM resolution (e.g., a2mouse needing m68705p3).
- **Media & External Resources**:
    - **ZIP Disk Support**: Integrated JSZip for automatic extraction of .zip disk images from URLs and local files.
    - **URL Media UI**: Added a 🌐 button in media settings for direct URL insertion.
    - **CORS Proxy Strategy**: Standardized on **proxy.corsfix.com** (with fallback logic) to support downloads from restricted sources like GitHub.
- **UX & Control Improvements**:
    - Added dedicated **MAME UI (ScrlLk)** and **MAME Menu (Tab)** buttons.
    - **Logo Reset**: Clicking the 'AmpleWeb' logo clears persistent settings and returns home.
    - **Sponsorship UI**: Acknowledged **Corsfix** sponsorship on the welcome screen with theme-aware SVG logo and links.
- **Stability & Bug Fixes**:
    - Fixed sidebar layout overflow and "blank screen" rendering issues.
    - Resolved duplicate identifier `theme` error in `App.tsx`.
    - Corrected slot validation to prevent "Unknown slot option" crashes during machine switching.
- **Deep Linking & Boot Stability (Session 2)**:
    - **Hierarchical Slot Parsing**: Fixed lastIndexOf(':') bug in URL parameter parsing to support deep slot paths (e.g., sl7:cffa2:cffa2_ata:0:hdd).
    - **Robust Media URL Support**: Fixed colon truncation in media parameters; added automatic slot assignment for ID-less URLs (e.g., .zip defaults to hard1).
    - **URL State Synchronization**: After successful download, the browser address bar is automatically updated from a long URL to a clean media=slot:filename format using history.replaceState.
    - **Initialization Race Condition Fix**: Introduced isInitializing state to prevent the UI Sync to URL mechanism from clobbering deep link parameters with stale store data during the initial boot sequence.
    - **Demo Link Optimization**: Updated README.md and README_tw.md with a stabilized Apple II Desktop cloud demo link utilizing the new CFFA2/HDD mapping.
- **UX & Machine Switching Optimization**: 
    - **Aggressive State Clearing**: Modified doSelectMachine to always reset mediaFiles and slotValues when manually switching between different machines. This prevents incompatible configuration remnants (e.g., from a URL-based Apple IIgs session) from breaking subsequent machine launches.
    - **Code Cleanup**: Removed obsolete family-tracking logic (prevFamilyRef) in favor of explicit machine name comparison for state resets.
- **Media Format Compatibility**: Expanded automatic slot identification to include .woz, .2mg, and .hdv. .woz and standard image types default to flop1, while block-based images like .2mg and .hdv default to hard1.
- **Bug Fix (Restart ROM Errors)**: Fixed a race condition where clicking 'Restart' (which reloads the page) would fail to find device ROMs (like the Mouse card). This was caused by doLaunch relying on potentially stale machineConfig state during initialization. Now, doLaunch and fetchAllRoms accept explicit configuration and slot parameters to ensure robust ROM resolution during both manual and automated boots.
- **Mobile UX & Pixel-Perfect Fixes**: Addressed feedback from inexorabletash.
    - **Mobile Responsiveness**: Implemented a responsive layout that stacks vertically on screens under 800px.
    - **Collapsible Sidebars**: Added visibility toggles (`isLeftSidebarOpen`, `isRightSidebarOpen`) with `☰` and `⚙️` buttons to provide more space for the emulator area.
    - **UI Stability**: Added automatic `resize` event dispatching when toggling lanes to ensure MAME/SDL correctly recalculates the viewport and mouse scaling.

### 📅 2026-05-09 Updates (Current Session)
- **Pixel-Perfect Scaling Fix**:
    - Replaced hardcoded resolution scaling with a **MutationObserver** that dynamically tracks the actual canvas intrinsic dimensions set by MAME.
    - This ensures CSS width/height are always exact integer multiples of the internal resolution, completely resolving the vertical/horizontal pixel striping artifacts (pixel artifacting) reported on mobile and desktop.
- **Collapsible UI Enhancements**:
    - Finalized the **Collapsible Lane Design** for both left (Machine List) and right (Settings/Slots) panels.
    - Integrated quick-toggle buttons in the machine header to allow users to maximize the emulator workspace.
- **Bug Fixes**:
    - Fixed a JSX syntax error (mismatched tags) in `App.tsx` introduced during sidebar refactoring.
    - Verified build stability with `tsc -b && vite build`.

### 📅 2026-05-10 Updates
- **Emulator Canvas Jump + Audio/Video Sync Fix**:
    - **Root Cause (canvas jump)**: The canvas was being appended to `.emulator-container` (the flex column root) by `wasm_loader.ts`, making it the last flex child and pushing it to the bottom. When `onReady` fired (after a 2-second timeout), the canvas was `appendChild`-ed into `canvasContainerRef` — this DOM move was the visual "jump" users saw.
    - **Fix (positioning)**: Added `id="canvas-host"` to `canvasContainerRef` div. `wasm_loader.ts` now prioritises `#canvas-host` over `.emulator-container` as the initial canvas destination, so the canvas is in the correct centered position from the start. Canvas container uses `flex: 1` (not `height: 100%`) for stable flex sizing.
    - **Root Cause (audio/video desync)**: `setLaunchState('running')` was called in `onReady` (2-second timeout after MAME starts), while MAME's audio began in `onRuntimeInitialized`. The `emulator-placeholder` overlay covered the canvas during this 2-second gap, causing sound to play with no visible screen.
    - **Fix (sync)**: Added `onStart` callback to `WasmLoaderOptions`, fired inside `onRuntimeInitialized` — the exact moment MAME's game loop begins (audio + video together). `setLaunchState('running')` now happens in `onStart`, removing the overlay in sync with audio. `emulator-placeholder` changed to `position: absolute` overlay so the canvas container (`#canvas-host`) is always `display: flex` and never needs a display toggle.
