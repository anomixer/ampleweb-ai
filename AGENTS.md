# AmpleWeb Development Log

## Status: Active
## Project: AmpleWeb (MAME WASM Frontend)

### Recent Updates (2026-05-03)
- **UI & Feature Overhaul (AmpleWin Parity)**:
    - **Advanced Configuration Tabs**: Fully implemented modular tabs for **Video**, **CPU**, **A/V**, **Paths**, **Slots**, **Media**, and **Logs**.
    - **Video & UX Improvements**:
        - Integrated **BGFX Video Settings**: Added Video Method selection (Software, BGFX, OpenGL) with BGFX Backend (Auto, GLES, Vulkan) and Effects (CRT-Geom, Scanlines, etc.) support.
        - **Window Scaling**: Added CSS-transform based scaling (1x, 2x, 3x, 4x, Fit to Screen).
        - **Mouse Capture**: Implemented Pointer Lock API (Hold Esc to release).
        - **Square Pixel**: Added UI toggle (disabled/greyed out per design).
    - **Audio & Media Enhancements**:
        - **Disk Sound Effects**: Implemented loading of floppy drive audio samples from `/samples/floppy/`. Added `-samples` and `-samplepath` engine support.
        - **Granular Media Management**: Restored and improved the **Media Tab**. Media drives are now grouped by physical type (5.25" Floppies, 3.5" Floppies, Hard Drives, CD-ROMs) to match AmpleWin.
        - **Media Auto-Eject**: Implemented intelligent media ejection when switching between hardware families (e.g., Apple II to Macintosh or Apple III) to prevent boot crashes.
        - **Iconic Controls**: Restored 📁 (Choose) and ⏏️ (Eject) iconography for media slots.
    - **Sidebar & UX Polish**:
        - **Machine Highlighting**: Added visual warning (yellow text) in the sidebar for unstable machine models (PowerBook series, mprof3).
        - **Visibility Fixes**: Updated dark theme tokens to ensure setting hints are legible.
        - **Critical Warnings**: Added red-highlighted status messages for non-functional machines.
    - **CPU & Engine Logic**:
        - Added Speed Throttling (100% to 500%, or No Throttle) and Rewind support.
        - Disabled Debug toggle in UI to match stable build requirements.
    - **Path Mapping**:
        - Implemented Local Directory Mapping UI using File System Access API for mapping folders to MAME's `/share` VFS.
- **Stability & Internal Architecture**:
    - **Zustand Persistence**: Migrated all settings to a persistent store (`ample-app-storage-v2`).
    - **Robust State Handling**: Added safety guards and optional chaining to prevent "blank screen" failures during WASM initialization and store rehydration.
    - **Media VFS Hooks**: Updated `wasm_loader.ts` to support injecting multiple media types and audio samples into the virtual filesystem.
- **UX Fixes**:
    - Improved visibility of "Slow Boot" notifications and UI hint text in Dark Mode.
    - Fixed `ReferenceError` when switching to the Media tab.