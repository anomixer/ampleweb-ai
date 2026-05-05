# AmpleWeb - Browser Port (Apple Emulator Frontend)

[English](README.md) | [繁體中文](README_tw.md)

This is a pure browser-based port of the macOS native [Ample](https://github.com/ksherlock/ample) project, bringing the premium Apple II and Macintosh emulation experience to any modern web browser. Powered by WASM and React.

![](screenshot.png)

> [!IMPORTANT]
> **Pure Client-Side**: AmpleWeb runs entirely in your browser. No backend, no server-side emulation, and zero installation required.

## 🍎 Ample (macOS) vs. AmpleWeb (Web) Comparison

| Feature | Ample (macOS Native) | AmpleWeb (Web) | Notes |
| :--- | :--- | :--- | :--- |
| **Language** | Objective-C (Cocoa) | **React + TypeScript (Vite)** | 1:1 UI replica using modern web standards |
| **Installation** | .dmg Image / Homebrew | **Zero Install (Web-based)** | Runs directly via URL |
| **MAME Integration** | Built-in Custom Core | **MAME WASM (Universal)** | High-performance Emscripten-compiled binary |
| **UI** | Native macOS Components | **Pixel-Perfect CSS Replica** | Includes **Dark/Light Mode** & Tab Persistence |
| **File System** | Native HFS/ProDOS Access | **VFS + Local Folder Mapping** | Support for mounting local folders via File System Access API |
| **Data Persistence** | Direct Disk Write | **Save-on-Eject Workflow** | Detects changes in VFS and prompts local save |
| **Video Support** | Metal / OpenGL / BGFX | **WebGL / BGFX WASM** | Full BGFX effects (CRT-Geom, Scanlines, etc.) |

## 🌟 Key Features

### 🍏 Faithful Experience (Feature Parity)
*   **Visual Precision**: Support for **Window 1x-4x** modes and **Full Screen** (Fit-to-Screen) scaling.
*   **Comprehensive Library**: Full support for **Apple I, II, III, and Macintosh** families with localized variants.
*   **Peripheral Support**: Supports auto-injection for **SCSI, CFFA2, and Disk II/III** interfaces. (Work in Progress, some peripherals may still show Missing ROM)
*   **Advanced Video**: Integrated **BGFX screen chains** for authentic retro visuals. (Work in Progress)

### 🌐 Web-Specific Features
*   **Local Directory Mapping (/share)**: Map any local host folder directly to the emulator's VFS for seamless data exchange.
*   **Save back to Local**: Modified virtual disk images are automatically detected and prompted for download upon ejection.
*   **Capture Persistence**: Export generated **AVI video** and **WAV audio** captures directly to your local device (avoid long recordings to prevent buffer overflow).
*   **Zero-Setup ROMs**: Multi-server failover engine for automatic firmware downloading and caching in IndexedDB.

### ⚠️ Known Limitations
*   **VGM Mod**: The "Generate VGM" feature is currently disabled as the specific MAME mod lacks a stable WASM port.
*   **Browser Limits**: Large AVI captures may exceed browser memory buffers if recorded for extended periods.

## 🛠️ Quick Start

### Prerequisites
-   A modern web browser ( **Chrome, Edge, or Opera** recommended for File System Access API support).
-   **Node.js** (only if running locally).

### Running Locally

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Launch Dev Server**:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` to start playing.

3.  **Prepare ROMs (Already provided, this feature is currently inactive)**:
    *   Click the **⚙️ Settings** icon in the sidebar.
    *   Ensure **Auto-download missing ROMs** is enabled.
    *   Select a machine and the app will handle the rest.

## 📂 Project Structure

| File/Directory | Description |
| :--- | :--- |
| **`src/App.tsx`** | Main application logic, UI layout, and state management. |
| **`src/core/wasm_loader.ts`** | MAME WASM bridge, VFS management, and boot argument builder. |
| **`src/core/store.ts`** | Zustand state store for settings and persistence. |
| **`src/styles/global.css`** | The custom CSS design system (the pixel-perfect replica). |
| **`public/roms/`** | Default directory for system firmware (cached in IndexedDB). |

## 📝 Acknowledgments

*   Original macOS version developer: [Kelvin Sherlock](https://github.com/ksherlock)
*   **Web Port Developers: anomixer + Antigravity**
*   **WASM Core**: Powered by [emularity-engine](https://github.com/internetarchive/emularity-engine) and custom MAME builds.

---
*Note: AmpleWeb is an independent project and is not affiliated with Apple Inc.*
