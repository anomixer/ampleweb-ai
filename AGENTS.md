# AmpleWeb Development Log

## Status: Active
## Project: AmpleWeb (MAME WASM Frontend)

### 📅 2026-05-03 Updates
- **UI & Feature Overhaul (AmpleWin Parity)**:
    - **Advanced Configuration Tabs**: Fully implemented modular tabs for **Video**, **CPU**, **A/V**, **Paths**, **Slots**, **Media**, and **Logs**.
    - **Video & UX Improvements**:
        - Integrated **BGFX Video Settings**: Added Video Method selection (Software, BGFX, OpenGL) with BGFX Backend (Auto, GLES, Vulkan) and Effects (CRT-Geom, Scanlines, etc.) support.
        - **Window Scaling**: Added CSS-transform based scaling (1x, 2x, 3x, 4x, Fit to Screen).
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

### 📅 2026-05-07 Updates (Current Session)
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
- **Media Format Compatibility**: Expanded automatic slot identification to include .woz, .2mg, and .hdv. .woz and standard image types default to lop1, while block-based images like .2mg and .hdv default to hard1.
- **Bug Fix (Restart ROM Errors)**: Fixed a race condition where clicking 'Restart' (which reloads the page) would fail to find device ROMs (like the Mouse card). This was caused by doLaunch relying on potentially stale machineConfig state during initialization. Now, doLaunch and etchAllRoms accept explicit configuration and slot parameters to ensure robust ROM resolution during both manual and automated boots.
