# AmpleWeb Development Log

## Status: Active
## Project: AmpleWeb (MAME WASM Frontend)

### Recent Updates (2026-05-03)
- **UI Modernization & Feature Parity**:
    - Reorganized the machine configuration panel into a modular multi-tab interface: **Video**, **CPU**, **A/V**, **Paths**, **Slots**, **Media**, and **Logs**.
    - **Video Features**:
        - Added **Window Mode** scaling (1x, 2x, 3x, 4x, Fit to Screen) using CSS transforms.
        - Integrated **Mouse Capture** via the Pointer Lock API (Hold Esc to release).
        - Added **Video Method** selection (Software, BGFX, OpenGL).
        - Added **BGFX Backend** (OpenGL, GLES, Vulkan) and **Screen Effects** (Scanlines, CRT-Geom, HQ2X, etc.).
        - Added **Square Pixel** toggle (aspect ratio correction).
    - **CPU Features**:
        - Added **Speed Throttling** (100% to 500%, or No Throttle).
        - Added **Rewind** support.
        - Disabled **Debug** toggle as per user request.
    - **A/V Features**:
        - Added toggles for generating **AVI** and **WAV** recordings.
        - Added **Disk Sound Effects** (audio samples).
    - **Paths Features**:
        - Implemented **Local Directory Mapping** UI using the browser's File System Access API to map a local folder to MAME's `/share` VFS path.
- **Stability & Persistence**:
    - Integrated all new configuration settings into a persistent Zustand store (`ample-app-storage-v2`).
    - Implemented safety checks and optional chaining in `App.tsx` to prevent blank screen crashes during state rehydration.
- **UX Improvements**:
    - Implemented "Slow Boot" notifications for PowerBook/Duo series.
    - Improved visibility of UI hint text in Dark Mode.