# [AmpleWeb](https://github.com/anomixer/ample/tree/ampleweb/AmpleWeb) - 網頁移植版 (Apple 模擬器前端)

[English](README.md) | [繁體中文](README_tw.md)

這是 macOS 原生 [Ample](https://github.com/ksherlock/ample) 專案的純網頁移植版本，將頂級的 Apple II 與 Macintosh 模擬體驗帶入任何現代瀏覽器。由 WASM 與 React 驅動。提供使用者無須安裝應用程式與ROM檔案、直接在瀏覽器暢享 198x-199x年代的電腦使用體驗。

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
*   **完整機型**：全面支援 **Apple I, II, III 以及 Macintosh** 家族。
*   **多國語系**：完整支援 **Apple IIe/IIee/IIep** 等多國語言版本 (DE, FR, ES, SE, UK) 及其正確的字集與開機 Logo。
*   **周邊支援**：支援自動注入 **SCSI, CFFA2, 滑鼠卡 (Mouse card) 以及記憶體擴充卡 (Memory expansion)** 介面。
*   **動態 ROM 映射**：自動偵測並下載選定插槽所需的設備 ROM（例如 `a2mouse.zip`），解決之前因缺檔導致的啟動當機問題。
*   **進階視訊**：內建 **BGFX 濾鏡鏈**，提供最真實的復古視覺效果。 (施工中 WIP)
*   **個性化介面**：完整支援 **深色/淺色模式** 切換，忠實還原 macOS 原生視覺美學。

### 🌐 網頁版特有功能
*   **本地目錄映射 (/share)**：可將電腦上的任何資料夾直接映射至模擬器的虛擬檔案系統，實現無縫資料交換。
*   **變更自動回存**：自動偵測虛擬磁碟映像檔的修改，並在退片時主動提示下載回本機。
*   **媒體錄製匯出**：可將模擬器產出的 **AVI 影片** 與 **WAV 音訊** 直接匯出至您的本地裝置 (不要錄太久，以免瀏覽器記憶體緩衝區爆滿)。
*   **即時分享 (Deep Linking)**：透過 URL 參數即可預先設定機型、插槽周邊與載入磁碟，支援自動開機功能 (URL結尾加上`&autoboot`)，非常適合教學展示與快速體驗。
*   **URL 媒體載入**：支援透過 `?media=slotId:http://...` 參數，或使用 Media 分頁中新增的 **🌐 URL 按鈕** 直接從外部網址掛載磁片影像。
*   **自動 ZIP 解壓縮**：支援從網址或本地載入 `.zip` 格式的磁碟影像，系統會自動解壓並挑選有效的影像檔 (.dsk, .do, .po 等) 進行掛載。
*   **遞迴裝置依賴解析**：自動處理插槽周邊的子依賴關係（例如 `a2mouse` 需要 `m68705p3`）。
*   **設定持久化**：機器與插槽設定會自動儲存於本地。點擊「停止」或重新整理網頁時，目前的配置將完整保留，無須重新設定。
*   **內建控制鈕**：新增 **MAME UI (Scroll Lock)** 與 **MAME Menu (Tab)** 專用按鈕，方便使用者進入模擬器內部選單進行進階調整。
*   **零設定 ROMs**：內建多伺服器自動下載引擎，自動處理韌體下載並快取於瀏覽器的 IndexedDB 中。
*   **智慧型機器重設 (Intelligent Machine Reset)**：切換不同機器時自動清空先前的插槽設定與媒體掛載。這能確保環境純淨，防止從特定 URL 啟動後切換機器造成的「設定污染」。
*   **Corsfix 贊助代理**：跨來源媒體下載由 [Corsfix](https://corsfix.com/) 提供技術支援。

### ⚠️ 已知限制
*   **磁碟掛載限制**：因瀏覽器的 VFS 限制，磁碟掛載僅限於啟動機器之前。啟動後無法動態換片 (替代方案：開啟「Paths」標籤下的本地資料夾映射功能，再透過 MAME 內建 UI 手動從 `/share` 目錄掛載)。
*   **核心穩定性**：側邊欄標示**黃字**的機器因模擬核心核心限制，可能無法正常運作。
*   **音訊延遲**：聲音可能會有輕微延遲 (此為 MAME WASM 的限制)。
*   **執行速度**：受限於 WASM 核心架構，速度提升幅度有限，因此 CPU 調整至 500% 或 Max 可能無法達到預期速度。
*   **停用功能**：因相容性問題，目前禁用以下功能：Debug, Square Pixel, Video Method, Generate VGM。
*   **瀏覽器限制**：若錄製時間過長，大型 AVI 檔案可能會超出瀏覽器的記憶體緩衝區。

## 🛠️ 快速開始

### 1. 線上立即體驗 (推薦)

無需任何設定，直接在瀏覽器中暢享 80 年代的經典電腦體驗：
👉 **[https://anomixer.github.io/ample/](https://anomixer.github.io/ample/)**


雲端直接載入 Apple II Desktop：
👉 **[點我立即體驗](https://anomixer.github.io/ample/?m=apple2gsr1&d=Apple+IIgs+%28ROM01%29&s=ramsize%3A1280K%2Csmartport%3Afdc%3A0%3A525%2Csmartport%3Afdc%3A1%3A525%2Csmartport%3Afdc%3A2%3A35dd%2Csmartport%3Afdc%3A3%3A35dd%2Csl7%3Acffa2%2Csl7%3Acffa2%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa2%3Acffa2_ata%3A1%3Ahdd&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot)**

---

### 2. 本地執行步驟 (開發者/離線使用)

#### 事前準備
-   現代網頁瀏覽器 (建議使用 **Chrome, Edge 或 Opera** 以獲得最佳的本地檔案存取支援)。
-   **Node.js** (僅在本地執行時需要)。

1.  **一鍵啟動 (推薦)**：
    *   **Windows**: 點擊執行 `AmpleWeb.bat`
    *   **Linux/macOS**: 執行 `./AmpleWeb.sh` (需先執行 `chmod +x AmpleWeb.sh`)
    此腳本會自動檢查環境、安裝必要元件、下載ROMs，並啟動伺服器。

2.  **手動啟動 (適合開發者)**：
    *   安裝依賴：`npm install`
    *   下載 ROMS：執行 `download_roms.ps1`
        - 系統會偵測 `public/roms` 是否有缺檔，自動啟動高效能的多執行緒 **ROM 下載器**。
        - 您可以手動選擇來源 (CallApple, MDK 等) 或自定義 URL。
        - 下載後的 `.zip` 檔案會存放在 `public/roms`，以便前端 WASM 直接讀取。
    *   (非必要) 若要重建 `public/wasm/mame.wasm.gz`，可使用 [MameWasm](https://github.com/anomixer/MameWasm) 專案來建置，再用壓縮軟體轉成 .gz。
    *   啟動伺服器：`npm run dev` 或 `node server.js`
    開啟 `http://localhost:5173` 即可開始使用。

## 📂 專案結構

| 檔案 / 目錄 | 說明 |
| :--- | :--- |
| **`AmpleWeb.bat / .sh`** | **一鍵啟動腳本**。自動檢查環境、安裝依賴、下載 ROM 並啟動伺服器。 |
| **`download_roms.ps1`** | **ROM 下載器**。具備交互式選單、來源切換與自動修補邏輯的 PowerShell 腳本。 |
| **`rom_manager_cli.py`** | **下載引擎核心**。基於 Python 的多執行緒 (50-threads) 下載工具，支援 Failover。 |
| **`server.js`** | **本地開發伺服器**。處理 npm 安裝、環境準備並自動開啟瀏覽器。 |
| **`src/App.tsx`** | 主要應用程式邏輯、介面佈局與狀態管理。 |
| **`src/core/wasm_loader.ts`** | MAME WASM 橋接器、VFS 虛擬檔案系統管理與啟動參數建構。 |
| **`public/roms/`** | 系統韌體預設存放處 (ROM 下載目標路徑，會快取至 IndexedDB)。 |
| **`public/wasm/`** | **MAME WASM 核心**。包含 `mame.wasm.gz` 及其載入腳本。 |
| **`public/samples/`** | **音效採樣**。例如磁碟機運轉聲 (`floppy/*.wav`)。 |
| **`public/resources/`** | **介面資源**。包含機器圖示、品牌標誌與 UI 素材。 |

## 📝 致謝

*   macOS 原生版開發者：[Kelvin Sherlock](https://github.com/ksherlock)
*   **網頁移植版開發者：anomixer + Antigravity**
*   **WASM 核心**：採用 [emularity-engine](https://github.com/internetarchive/emularity-engine) 與自訂 MAME 建置版本。

---
*免責聲明：AmpleWeb 是一個獨立的開源專案，與 Apple Inc. 或本專案提及之任何其他公司均無任何隸屬、授權、維護或背書關係。所有產品及公司名稱均為其各自持有人的商標™或註冊®商標。*
