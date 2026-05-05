# AmpleWeb - 網頁移植版 (Apple 模擬器前端)

[English](README.md) | [繁體中文](README_tw.md)

這是 macOS 原生 [Ample](https://github.com/ksherlock/ample) 專案的純網頁移植版本，將頂級的 Apple II 與 Macintosh 模擬體驗帶入任何現代瀏覽器。由 WASM 與 React 驅動。

![](screenshot.png)

> [!IMPORTANT]
> **純用戶端運作**：AmpleWeb 完全在您的瀏覽器中執行。無需後端、無需伺服器端模擬，且完全免安裝。

## 🍎 Ample (macOS) vs. AmpleWeb (Web) 比較

| 特性 | Ample (macOS 原生) | AmpleWeb (網頁版) | 備註 |
| :--- | :--- | :--- | :--- |
| **開發語言** | Objective-C (Cocoa) | **React + TypeScript (Vite)** | 使用現代網頁標準 1:1 復刻 UI |
| **安裝方式** | .dmg 映像檔 / Homebrew | **免安裝 (網頁式)** | 透過網址直接執行 |
| **MAME 整合** | 內建自訂核心 | **MAME WASM (通用型)** | 高效能 Emscripten 編譯二進位檔 |
| **介面 UI** | 原生 macOS 元件 | **像素級 CSS 復刻** | 包含 **深/淺色模式** 與分頁狀態記憶 |
| **檔案系統** | 原生 HFS/ProDOS 存取 | **VFS + 本地資料夾映射** | 支援透過 File System Access API 掛載本地資料夾 |
| **資料持久化** | 直接寫入磁碟 | **退片即儲存流程** | 自動偵測 VFS 變更並提示儲存至本地 |
| **顯示支援** | Metal / OpenGL / BGFX | **WebGL / BGFX WASM** | 完整支援 BGFX 特效 (CRT-Geom, Scanlines 等) |

## 🌟 核心功能

### 🍏 忠實體驗 (功能對等)
*   **精確縮放**：支援 **視窗 1x-4x** 模式與 **全螢幕** (Fit-to-Screen) 自動縮放。
*   **完整機型**：全面支援 **Apple I, II, III 以及 Macintosh** 家族及其各國語系變體。
*   **周邊支援**：支援自動注入 **SCSI, CFFA2, 以及 Disk II/III** 介面。 (有些週邊仍會顯示Missing ROM，本功能完善中)
*   **進階視訊**：內建 **BGFX 濾鏡鏈**，提供最真實的復古視覺效果。 (施工中 WIP)

### 🌐 網頁版特有功能
*   **本地目錄映射 (/share)**：可將電腦上的任何資料夾直接映射至模擬器的虛擬檔案系統，實現無縫資料交換。
*   **變更自動回存**：自動偵測虛擬磁碟映像檔的修改，並在退片時主動提示下載回本機。
*   **媒體錄製匯出**：可將模擬器產出的 **AVI 影片** 與 **WAV 音訊** 直接匯出至您的本地裝置 (不要錄太久，以免buffer滿)。
*   **零設定 ROMs**：內建多伺服器自動下載引擎，自動處理韌體下載並快取於瀏覽器的 IndexedDB 中。

### ⚠️ 已知限制
*   **VGM Mod**：目前停用「產生 VGM」功能，因為該特定的 MAME 修正版尚無穩定的 WASM 移植。
*   **瀏覽器限制**：若錄製時間過長，大型 AVI 檔案可能會超出瀏覽器的記憶體緩衝區。

## 🛠️ 快速開始

### 事前準備
-   現代網頁瀏覽器 (建議使用 **Chrome, Edge 或 Opera** 以獲得最佳的本地檔案存取支援)。
-   **Node.js** (僅在本地開發環境運行時需要)。

### 本地執行步驟

1.  **安裝依賴項目**：
    ```bash
    npm install
    ```

2.  **啟動開發伺服器**：
    ```bash
    npm run dev
    ```
    開啟 `http://localhost:5173` 即可開始使用。

3.  **準備 ROMs (已提供，此功能暫無作用)**：
    *   點擊側邊欄的 **⚙️ 設定** 圖示。
    *   確保已開啟 **Auto-download missing ROMs**。
    *   選擇任何機型，程式將自動處理後續作業。

## 📂 專案結構

| 檔案 / 目錄 | 說明 |
| :--- | :--- |
| **`src/App.tsx`** | 主要應用程式邏輯、介面佈局與狀態管理。 |
| **`src/core/wasm_loader.ts`** | MAME WASM 橋接器、虛擬檔案系統管理與啟動參數建構。 |
| **`src/core/store.ts`** | 使用 Zustand 建立的狀態商店，處理設定與持久化。 |
| **`src/styles/global.css`** | 自訂 CSS 設計系統 (像素級 UI 復刻的核心)。 |
| **`public/roms/`** | 系統韌體預設存放處 (將快取至 IndexedDB)。 |

## 📝 致謝

*   macOS 原生版開發者：[Kelvin Sherlock](https://github.com/ksherlock)
*   **網頁移植版開發者：anomixer + Antigravity**
*   **WASM 核心**：採用 [emularity-engine](https://github.com/internetarchive/emularity-engine) 與自訂 MAME 建置版本。

---
*註：AmpleWeb 為獨立開發專案，與 Apple Inc. 無關。*
