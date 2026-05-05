# AmpleWeb Development Log

## Status: Active
## Project: AmpleWeb (MAME WASM Frontend)

### Recent Updates (2026-05-05)
- **Filesystem & Data Persistence**:
    - **Disk Save Workflow**: Implemented an intelligent "Save back to local" prompt when ejecting modified media. The app now tracks file modification times (`mtime`) within the WASM VFS to detect changes and triggers `showSaveFilePicker` (or fallback download) for data persistence.
    - **Capture Persistence (AVI/WAV)**: Added support for exporting media captures. When disabling AVI or WAV recording while the emulator is running, the app automatically checks the `/snap` or root VFS directories and prompts the user to save the generated files.
    - **VFS Infrastructure**: Updated the WASM loader to automatically initialize a `/snap` directory for MAME snapshots/AVI captures.
- **UI/UX & Interaction Refinement**:
    - **Compact Media Layout**: Optimized the Media tab spacing by reducing group margins and adjusting slot gaps for a more streamlined, professional appearance.
    - **Visual Polish**: Removed redundant custom toggle tracks in favor of clean browser checkboxes. Added descriptive instruction hints to the A/V tab regarding recording behavior and WASM memory limits.
    - **Interaction Fixes**: Resolved a bug where the same disk image could not be re-inserted immediately after ejection by resetting the file input value on change.
- **Stability & Logic**:
    - **State Synchronization Fix**: Resolved a critical issue where emulator settings (Video, CPU, A/V, Paths) would sometimes fail to apply on launch due to missing dependencies in the `launchMame` callback.
    - **Branch Management**: Project branch officially renamed and set as the default branch: `ampleweb`.

### Previous Updates (2026-05-04)
- **UI/UX Refinement & Interaction**:
    - **Double-Click to Launch**: Implemented double-click interaction on the machine list, allowing users to bypass the "Launch" button for faster access.
    - **UI Tab Persistence**: Added `localStorage` synchronization for both System (Video/CPU/Paths) and Machine (Slots/Media/Logs) tab selections, preserving the user's workspace layout across reloads.
    - **Full-Screen Optimization**: Refactored full-screen handling to use native CSS `:fullscreen` rules. The emulator canvas now correctly expands to fill the screen (Fit-to-Screen) while maintaining aspect ratio via `object-fit: contain`. Standardized the toggle button text to white for clarity.
- **Bug Fixes & Stability**:
    - **Selection Logic Correction**: Fixed a typo in `models.plist` where the `Apple IIe (platinum)` group was incorrectly assigned the `apple2p` value, causing a selection conflict with the Apple ][+ machine. Corrected it to `apple2ep` to ensure distinct family highlighting.
    - **WASM Audio Restored**: Fixed an issue where disk drive sound effects were missing. Now correctly passes the sample file list to the WASM loader during initialization.
    - **Crash Prevention**: Resolved a "black screen" failure caused by a missing destructuring of the `onLaunch` prop in the recursive tree components.

### Previous Updates (2026-05-03)
- **UI & Feature Overhaul (AmpleWin Parity)**:
    - **Advanced Configuration Tabs**: Fully implemented modular tabs for **Video**, **CPU**, **A/V**, **Paths**, **Slots**, **Media**, and **Logs**.
    - **Video & UX Improvements**:
        - Integrated **BGFX Video Settings**: Added Video Method selection (Software, BGFX, OpenGL) with BGFX Backend (Auto, GLES, Vulkan) and Effects (CRT-Geom, Scanlines, etc.) support.
        - **Window Scaling**: Added CSS-transform based scaling (1x, 2x, 3x, 4x, Fit to Screen).
        - **Mouse Capture**: Implemented Pointer Lock API (Hold Esc to release).
        - **Square Pixel**: Added UI toggle (disabled/greyed out per design).
    - **Audio & Media Enhancements**:
        - **Disk Sound Effects**: Implemented loading of floppy drive audio samples from `/samples/floppy/`.
        - **Peripheral ROMs**: Added support for **a2scsi** (SCSI) and **a2cffa2** (CompactFlash) auxiliary ROMs for the Apple II family.
        - **Granular Media Management**: Restored and improved the **Media Tab**. Media drives are now grouped by physical type (5.25" Floppies, 3.5" Floppies, Hard Drives, CD-ROMs) to match AmpleWin.
        - **Media Auto-Eject**: Implemented intelligent media ejection when switching between hardware families (e.g., Apple II to Macintosh or Apple III) to prevent boot crashes.
        - **Iconic Controls**: Restored 📁 (Choose) and ⏏️ (Eject) iconography for media slots.
    - **Path Mapping & Persistence**:
        - **Local Folder Mapping (/share)**: Since WASM MAME does not support the native `-shared_directory` flag (often used for Booti card USB emulation), we implemented recursive synchronization using the File System Access API. Mapped folders appear as `/share` in the VFS, allowing for dynamic hot-swapping via MAME's File Manager.
        - **Robust Permission Handling**: Moved directory re-authorization logic to the `handleLaunch` user-gesture context. This ensures that browsers correctly prompt for permission when restarting after a page refresh.
        - **Auto-Launch Reconnection Pause**: Implemented a safeguard where auto-launch (from URL params) will pause and prompt for a manual "Launch" if a mapped directory requires reconnection, preventing silent synchronization failures.
    - **Comprehensive ROM Mapping & Dependency Fixes**:
        - Resolved missing ROM errors for Macintosh LC (520/550/575/475), II (cx, FDHD, ci), and SE (30, FDHD) families by correcting parent ROM dependencies (e.g., adding `maclc.zip`, `macii.zip`, `macse.zip`).
        - Fixed incorrect driver mapping for Mac IIci/IIcx/IIfx to ensure they are recognized as Macintosh systems rather than defaulting to Apple IIe.
    - **Localized Driver Refinement (Apple IIe Family)**:
        - Finalized international variant mappings for IIe/IIee/IIep (ES, FR, SE, DE, UK) to preserve correct localized boot logos and Enhanced/Platinum hardware features.
        - Standardized UK variants to use the `apple2ee` core to match common ROM set availability.
    - **Expanded Peripheral & Auxiliary ROM Support**:
        - Added auto-injection for `a1cass` (Apple I Cassette), `a3fdc` (Disk III FDC), and `apple2e` (Enhanced Character ROM).
        - Expanded auxiliary ROM loading to include the Macintosh family, enabling Apple IIe PDS cards to work within Mac emulations.
        - Broadened `isApple2Family` detection to cover over 30+ additional clones and variant machine names.
    - **Power & State Management**:
        - Introduced a dedicated **Stop** button that performs a clean page reload without auto-launching, effectively "powering off" the virtual hardware. **Restart** performs a full power cycle (reload with auto-launch) to ensure MAME's global state is completely reset, which is necessary for stable WASM execution.
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