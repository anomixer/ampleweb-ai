# [AmpleWeb-AI](https://github.com/anomixer/ampleweb-ai) - 視覺 AI 代理版 (Apple 模擬器 + LLM)

[English](README.md) | [繁體中文](README_tw.md)

這是 **AmpleWeb** 的特化獨立版本，作為**視覺 AI 代理（LLM + Vision）**的實驗性平台。透過多模態大型語言模型（Gemini 3.5 Flash、GPT-4o-mini、Claude 3.5 Sonnet），AmpleWeb-AI 讓 AI 代理能「看見」模擬器畫面（例如執行中的 Apple IIe），自動閱讀螢幕文字並產生指令，在文字冒險遊戲（如 Zork）中自主行動。

## 🤖 視覺 AI 代理 — 運作原理

```
MAME WASM（Canvas 畫面）
    ↓  WebGL readPixels() + 垂直翻轉
  Base64 PNG 截圖
    ↓  多模態視覺 API（Gemini / GPT / Claude）
  文字指令（例如 "GO EAST"）
    ↓  DOM KeyboardEvent 序列（非同步，60ms/字元）
  Emscripten WASM 輸入
```

*   **解耦且非侵入式**：AI 層將 MAME WASM 視為完整的黑盒子。透過 WebGL 像素提取讀取畫面，透過 DOM 事件發送按鍵——完全不需修改 WASM 程式碼。
*   **WebGL 幀緩衝截圖**：在 MAME 啟動時攔截 canvas `getContext`，強制設定 `preserveDrawingBuffer: true`，再用 `gl.readPixels()` 直接從 GPU 幀緩衝提取原始像素並進行 Y 軸垂直翻轉修正。即使是 WebGL 渲染的畫面也能產生清晰、像素完美的截圖。
*   **非同步打字員**：每個按鍵依序發送（`keydown` → 延遲 → `keyup`），透過可設定的延遲避免 Emscripten 幀循環漏讀輸入。
*   **雙模式（影像視覺與低 Token 文字）**：支援 `Vision Mode`（傳送像素完美畫面截圖）與 `Text Mode`（直接從 WASM 虛擬記憶體讀取 Apple II 螢幕文字，無需外部 OCR，Token 消耗極低且速度極快）。
    *   *直接記憶體存取 (DMA 讀取)*：採用導出的 C 語言 helper API（`_emscripten_get_main_ram_wasm_offset` 與 `_emscripten_get_aux_ram_wasm_offset`）來抓取實體 Main 與 Aux RAM 指標在 WASM 線性記憶體中的精確偏移量。這使得前端能以 **100% 的絕對精度**與**零延遲**直接由 `HEAPU8` 讀取螢幕記憶體（`0x400` / `0x800`），徹底繞過不穩定的 Heap 指紋掃描。
    *   *進階 80 行自適應解耦解碼*：攻克了 80 行模式下左右字元成對顛倒（例如 `"ZORK I"` 被錯誤解碼為 `"I   R OKI"`) 的頑疾。採用**動態雙基底配對 (Dynamic Dual-Base Pairing)** 技術，自動分析並配對 Main 與 Aux RAM 在 Heap 中任意的記憶體基底，徹底擺脫相隔 65,536 位址差的脆弱假設。並採用**雙向自校正解碼 (Self-Correcting Way A/Way B Heuristics)**，同時嘗試奇偶數欄交錯拼合的兩種解碼方向，透過即時 `/[A-Za-z]/g` 計算英文字母密度，自動選擇拼寫最正確的結果。
    *   *Chatbot 式增量文字差分*：在 `Text Mode` 下，前端利用 **LCS 滾動行對齊與指令特徵定位演算法**，比對當前螢幕與前一輪文字的差異，**僅提取並發送全新印出的遊戲輸出內容**（如「Opening the mailbox reveals a leaflet.」而非重複傳送整頁房間描述）。這能大幅縮減 90% 以上的重複 Token 消耗，並保持極佳的上下文整潔度。

*   **思考鏈 (Chain-of-Thought, CoT) 決策**：在輸出指令前，先引導 AI 寫出 Reasoning 推理分析。預設的系統提示詞範本已更新為要求 LLM 輸出 `Reasoning:`（思考步驟）與 `Command:`（動作命令）。前端解析器會智慧解析多行回應並精確提取出 Command 部分打入模擬器，進而釋放 AI 在複雜謎題與方向迷失時的規劃推理能力，消除盲目猜測。
*   **支援豐富模型與自訂提供商**：支援 Gemini 3.5 Flash、GPT-4o-mini、Claude 3.5 Sonnet、NVIDIA NIM、**Groq**、Ollama Cloud、LM Studio (本地)、Ollama (本地) 以及自訂 Provider。
*   **可設定的對話歷史上限**：可自訂傳送給大模型的歷史記憶輪數（可調範圍 `0` 至 `20` 輪），徹底杜絕 AI 忘記前幾步而重複無效指令的「金魚腦」現象。
*   **API 過載自動重試**：`fetchWithRetry` 包裝器在收到 `503`/`429` 錯誤時，使用指數退避自動重試（最多 3 次），讓短暫的 API 流量尖峰不再讓 AI 循環崩潰。

---

## 🎮 AI 代理 — 詳細操作步驟教學

### 第一步：先啟動模擬器

啟用 AI 之前，您**必須**先讓模擬器運行起來：

1. 在**左側面板**，選擇一台機器（例如 `Apple //e (Enhanced)`）。
2. 在**右下方面板 → Media 分頁**，掛載遊戲磁碟（例如 Zork 的 .dsk 檔案）。可以點選 🌐 URL 按鈕直接從網址載入。
3. 點擊 **Launch** 按鈕。等待模擬器標頭出現 `● Running`（綠色徽章）。

> [!IMPORTANT]
> AI 只能在模擬器**正在執行**時運作。啟用按鈕在其他情況下都會呈現灰色（不可點擊）。

---

### 第二步：設定 AI 參數（右上面板 → "AI" 分頁）

點擊右上設定面板的 **AI** 分頁，您會看到以下設定：

| 設定項目 | 說明 | 預設值 |
| :--- | :--- | :--- |
| **AI Agent Status** | 🔴 已停用 / 🟢 已啟用 切換按鈕 | 已停用 |
| **Mode** | 選擇：`🖼️ Vision Mode`（傳送 base64 畫面截圖，耗費較多 Token）或 `📝 Text Mode (Low Token)`（直接讀取 WASM 內模擬器純文字緩衝區，消耗極少 Token 且價格極低） | Vision Mode |
| **Provider（提供商）** | 選擇：`Mock Simulator`、`Gemini 3.5 Flash`、`OpenAI GPT-4o-mini`、`Claude 3.5 Sonnet`、`NVIDIA NIM`、`Groq`、`Ollama Cloud`、`LM Studio (Local)`、`Ollama (Local)`、`Custom Provider` | Mock Simulator |
| **API Key** | 您的 LLM 提供商金鑰（僅存於瀏覽器本地，絕不外傳） | — |
| **API URL** | 所選提供商的 API 基礎網址（僅對 OpenAI 相容提供商顯示，可編輯） | *(自動填入)* |
| **Model（模型名稱）** | 向提供商 API 請求的模型名稱（僅對 OpenAI 相容提供商顯示，可編輯） | *(自動填入)* |
| **Tick Rate (sec)** | AI 多少秒截圖一次並決定下一個指令 | 15 |
| **Type Delay (ms)** | 每個字元按鍵之間的毫秒延遲（建議保持 60ms 以免 WASM 漏讀） | 60 |
| **Max Tokens** | LLM 回應的最大輸出 Token 數（若回應被截斷請調高此值） | 1000 |
| **History Limit** | 傳送給大模型的對話歷史（螢幕畫面狀態 + 做出指令）對話輪數限制，用以對抗 AI「金魚腦」（可設定 0 至 20 輪） | 5 |
| **System Prompt** | 給 AI 的自然語言說明（在玩什麼遊戲、如何回應等），會隨運作模式自動切換對應預設模板 | Zork 預設 |

#### 如何取得 API 金鑰

- **Gemini 3.5 Flash**（推薦 — 最快且最划算）：
  1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey)
  2. 點擊 **「建立 API 金鑰」** → 複製金鑰
  3. 貼到 **API Key** 欄位，並將 Provider 選為 **Gemini 3.5 Flash**

- **OpenAI GPT-4o-mini**：
  1. 前往 [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  2. 建立新金鑰並貼入。

- **Claude 3.5 Sonnet**：
  1. 前往 [console.anthropic.com](https://console.anthropic.com)
  2. 建立 API 金鑰並貼入。

- **Groq**（快速推理，有免費方案）：
  1. 前往 [console.groq.com](https://console.groq.com/keys)
  2. 建立 API 金鑰並貼入，Provider 選擇 **Groq**。

> [!NOTE]
> 所有 API 金鑰**僅**存於您瀏覽器的 `localStorage`。金鑰不會被提交至原始碼，也不會傳送至除您所選 LLM 提供商以外的任何第三方伺服器。

---

### 第三步：啟動 AI 代理

1. 點擊 **🔴 Disabled** 按鈕 — 它將切換為 **🟢 Enabled**。
2. 切換至**右下方面板 → "AI Agent" 分頁**監控執行狀況。

---

### 第四步：在「AI Agent」分頁監控執行

| 元素 | 顯示內容 |
| :--- | :--- |
| **狀態徽章** | `Idle`（灰色）→ `Thinking`（黃色）→ `Typing`（綠色）→ `Error`（紅色） |
| **視覺截圖預覽** | AI「看到」的即時畫面縮圖 — 目前模擬器的幀 |
| **執行記錄** | 時間戳記的每一步操作日誌：截圖、API 呼叫、收到指令、輸入字元、重試警告 |

**正常運行時的日誌看起來像這樣：**
```
[HH:MM:SS] AI Agent Enabled - Starting loop
[HH:MM:SS] Capturing emulator screen...
[HH:MM:SS] Calling LLM API (gemini)...
[HH:MM:SS] AI Command received: "OPEN MAILBOX"
[HH:MM:SS] Successfully typed command: "OPEN MAILBOX"
```

**若伺服器繁忙（503/429），重試系統會自動處理：**
```
[HH:MM:SS] [Retry] API returned 503 (busy/limit). Retrying in 1.5s... (Attempt 1/3)
[HH:MM:SS] [Retry] API returned 503 (busy/limit). Retrying in 3.8s... (Attempt 2/3)
[HH:MM:SS] AI Command received: "GO NORTH"
```

---

### 第五步：疑難排解

| 錯誤訊息 | 原因 | 解決方式 |
| :--- | :--- | :--- |
| `API key is required for gemini` | 未輸入 API 金鑰 | 在 API Key 欄位輸入您的金鑰 |
| `Gemini API error: 404` | 模型名稱或 endpoint 錯誤 | 更新至最新程式碼（模型已自動設定為 `gemini-3.5-flash`） |
| `Empty response from Gemini API` | `MAX_TOKENS` 過低（Gemini 3.5 的推理過程也會消耗 Token） | 將 **Max Tokens** 增加至 `1000` 或以上 |
| `AI 代理一直重複輸入 LOOK` | Canvas 為空白（WebGL 緩衝區被清除）— 需要最新的 AI 層程式碼 | `git pull` 並重新部署；`preserveDrawingBuffer` 修復可解決此問題 |
| `Error: Emulator canvas not found` | 模擬器未在執行中 | 先啟動模擬器，等待出現 `Running` 徽章 |
| `503 高流量`（未顯示重試） | 程式碼版本過舊，缺乏重試邏輯 | `git pull` 並重新部署以獲得自動重試支援 |

---

### 快速入門：Mock 模擬器（無需 API 金鑰）

想在不消耗 API 額度的情況下測試整個管線？

1. 將 **Provider** 設定為 **Mock Simulator**。
2. 將 **Tick Rate** 設定為 `5` 秒。
3. 啟用 AI。
4. 觀察 AI 自動依序執行預設的 Zork 腳本：`LOOK` → `OPEN MAILBOX` → `TAKE LEAFLET` → `READ LEAFLET` → `GO EAST` → `GO NORTH` → `GO WEST`...

這可以在使用真實 API 金鑰之前，驗證截圖擷取、按鍵注入與 AI 循環全部正常運作。

---

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
| **資料持久化** | 直接寫入磁碟 | **換磁片寫入本地防護** | 自動偵測 VFS 變更，並於退片、更換本地檔案或從網址載入時，主動提示儲存至本地 |
| **顯示支援** | Metal / OpenGL / BGFX | **WebGL / BGFX WASM** | 完整支援 BGFX 特效 (CRT-Geom, Scanlines 等) |
| **XML 配置檔 (.cfg)** | Plist / 原生 MAME .cfg | **解耦式 LocalStorage + VFS 映射** | 內建 **XML Configuration Editor**，支援即時編輯、本地導入/導出，且針對克隆機型（如 `macpd280` 與 `macpd280c`）採獨立解耦持久化儲存，防止配置污染。 |

## 🌟 核心功能

### 🍏 忠實體驗 (功能對等)
*   **精確縮放**：支援 **視窗 1x-4x** 模式、**Integer Fit (Sharp) 像素整數倍縮放** 與 **全螢幕** (Fit-to-Screen) 自動縮放。
*   **完美 1:1 像素 (Square Pixel) 支援**：解鎖並完整啟用「Square Pixel」功能，停用 aspect-ratio 比例校正並傳遞 `-nokeepaspect` 至 MAME WASM 核心，實現純淨 1:1 硬體原始像素網格渲染。
*   **完整機型**：全面支援 **Apple I, II, III 以及 Macintosh** 家族。
*   **多國語系**：完整支援 **Apple IIe/IIee/IIep** 等多國語言版本 (DE, FR, ES, SE, UK) 及其正確的字集與開機 Logo。
*   **周邊支援**：支援自動注入 **SCSI, CFFA2, 滑鼠卡 (Mouse card) 以及記憶體擴充卡 (Memory expansion)** 介面。
*   **動態 ROM 映射**：自動偵測並下載選定插槽所需的設備 ROM（例如 `a2mouse.zip`），解決之前因缺檔導致的啟動當機問題。
*   **進階視訊**：內建並全面啟用 **BGFX 濾鏡鏈**，提供最真實的復古視覺效果（如 CRT Geom、Scanlines 等掃描線特效，且完美相容硬體加速）。
*   **個性化介面**：完整支援 **深色/淺色模式** 切換，忠實還原 macOS 原生視覺美學。
*   **插槽配置一致性**：優化插槽初始化邏輯，確保在 UI 重新整理時能正確保留「空」(None) 的選取狀態，對齊 macOS 原生版與 Windows/Linux 版的高標準。

### 🌐 網頁版特有功能
*   **背景執行與音訊不中斷**：當瀏覽器視窗失去焦點（被擋在後面）時，模擬器依然可以持續運行並播放聲音。（注意：需拉出為獨立視窗，不可最小化或放在其他瀏覽器標籤頁後方，否則瀏覽器會強制暫停運行）。
*   **精美抽屜式收合設計 (Premium Collapsible Drawers)**：兩側邊欄（左：機器列表、右：設定面板）採用平滑 CSS 滑動動畫，搭配螢幕邊界懸浮的「抽屜拉環 (◀/▶)」，展開時自動嵌入抽屜邊緣，極具高階質感。
*   **全自由伸縮佈局 (Fully Resizable Workspace)**：右側設定面板內的「系統設定」與「插槽/媒體」兩區塊之間加入了上下拖曳拉桿，可以自由靈活地調整垂直佔比，完全不受螢幕大小限制。
*   **動態拖曳畫面同步 (Active Workspace Resizing)**：無縫同步手動拖拉側邊欄寬度的動作與 MAME WASM 引擎。手動調整左側邊欄或右側設定面板寬度時，會即時派發 `resize` 事件，確保模擬器畫面視口與滑鼠指標座標映射即時對齊。
*   **手機端懸浮遮罩抽屜與自適應收合 (Mobile Overlay Drawers & Auto-Collapse)**：手機端（寬度 <= 800px）重構為固定定位的懸浮遮罩抽屜，主畫面保持 100% 滿版全螢幕。視窗縮小時會**自動平滑收合兩側抽屜**，提供純淨舒適的初始視覺體驗。
*   **配置面板冗餘下拉框清理 (Clean Slots Grid)**：自動偵測並隱藏只有單一或無可選選項（`options.length <= 1`）的固定式主板插槽選單（例如 Apple IIgs 的 Disk Drives 控制器），轉換為清晰的分組標題，只保留下方可變動的子插槽，畫面極致簡潔。
*   **亮色模式高對比度優化 (Light Theme Contrast & Interactive Polish)**：修復全螢幕按鈕在亮色模式下的白色字體隱形問題，自動呈現動態高對比度主題色，並加入精細的滑鼠懸停與點擊縮放微動畫。
*   **本地目錄映射 (/share)**：可將電腦上的任何資料夾直接映射至模擬器的虛擬檔案系統，實現無縫資料交換。
*   **儲存回本地（換磁片/硬碟寫入防護）**：自動追蹤模擬器運行期間對虛擬磁碟或硬碟的任何寫入操作。不論是點擊**退片 (⏏️)**、選取**本地檔案 (📁)** 或是從**網址載入 (🌐)**，系統都會主動進行安全檢查並提示您先將修改儲存回本地檔案系統，完美防止資料意外遺失。
*   **媒體錄製匯出**：可將模擬器產出的 **AVI 影片** 與 **WAV 音訊** 直接匯出至您的本地裝置 (不要錄太久，以免瀏覽器記憶體緩衝區爆滿)。
*   **即時分享 & 網址完整持久化 (Deep Linking & URL Persistence)**：透過 URL 參數即可預先設定機型、插槽周邊與載入磁碟，支援自動開機功能 (URL結尾加上`&autoboot`)。啟動後網址列上的所有參數均完整保留（不會被刪減），支援直接點擊 F5 重新整理。點擊主介面標題旁的 **`🔗 Share`** 按鈕更可一鍵將當前包含雲端磁碟 URL 在內的所有完整配置複製至剪貼簿供他人一鍵開啟！
*   **URL 媒體載入**：支援透過 `?media=slotId:http://...` 參數，或使用 Media 分頁中新增的 **🌐 URL 按鈕** 直接從外部網址掛載磁片影像。
*   **自動 ZIP 解壓縮**：支援從網址或本地載入 `.zip` 格式的磁碟影像，系統會自動解壓並挑選有效的影像檔 (.dsk, .do, .po 等) 進行掛載。
*   **遞迴裝置依賴解析**：自動處理插槽周邊的子依賴關係（例如 `a2mouse` 需要 `m68705p3`）。
*   **設定持久化**：機器與插槽設定會自動儲存於本地。點擊「停止」或重新整理網頁時，目前的配置將完整保留，無須重新設定。
*   **內建控制鈕**：新增 **MAME UI (Scroll Lock)** 與 **MAME Menu (Tab)** 專用按鈕，方便使用者進入模擬器內部選單進行進階調整。
*   **零設定 ROMs**：內建多伺服器自動下載引擎，自動處理韌體下載並快取於瀏覽器的 IndexedDB 中。
*   **智慧型機器重設 (Intelligent Machine Reset)**：切換不同機器時自動清空先前的插槽設定與媒體掛載。這能確保環境純淨，防止從特定 URL 啟動後切換機器造成的「設定污染」。
*   **圓環載入圈 (Indeterminate Progress Spinner)**：徹底移除粗糙且會突變的 0% -> 100% 進度條，改用現代、平滑且不間斷旋轉的圓環加載動畫（Progress Spinner），提供極具高階質感的等待畫面。Canvas 從啟動起即固定於正確置中位置。
*   **音畫同步**：畫面與聲音現在同時出現。覆蓋層在 MAME Runtime 初始化（`onRuntimeInitialized`）的瞬間移除，與音效啟動時間完全一致，徹底消除先有聲音、後有畫面的 1–2 秒落差。
*   **內建 XML 配置編輯器 (Built-in XML Configuration Editor)**：可直接在瀏覽器 UI 介面上編輯與調整 MAME 底層低階系統配置 XML。具備語法自動保留、`<system name="...">` 標籤智慧校正自動對齊、啟動時動態對齊克隆機型驅動程式（例如 `macpd280` / `macpd280c`）的解耦獨立儲存功能，並提供單行等寬（**Read**, Save, Export, Import, Reset）居中對齊操作。
*   **Corsfix 贊助代理**：跨來源媒體下載由 [Corsfix](https://corsfix.com/) 提供技術支援。

## 🔗 即時分享 URL 參數規範

AmpleWeb 內建強大的網址參數映射引擎（Deep Linking），允許您預先配置並分享精準的模擬器運行環境、周邊插槽、外接磁碟媒體、視窗大小比例與著色器濾鏡特效。

### 核心驅動參數

| 參數鍵名 | 別名 / 替代字 | 預期值範例 | 說明 |
| :--- | :--- | :--- | :--- |
| **`m`** | — | 機器內部識別碼 (例如 `apple2ee`, `apple2gsr1`) | 設定要啟動的 Apple / Macintosh 主機系統類型。 |
| **`d`** | — | URL 編碼字串 (例如 `Apple+%2F%2Fe+%28enhanced%29`) | 設定 UI 頂部與列表中顯示的機器中文/英文友善名稱。 |
| **`s`** | — | 以逗號分隔的插槽配置值 (例如 `ramsize:64K,sl4:mouse,sl6:diskiing`) | 預先配置系統記憶體大小、滑鼠卡、磁碟卡或各式自訂插槽周邊。 |
| **`media`** | — | `slotId:網址` 或 `slotId:檔案名稱` | 直接掛載外部 URL 上的虛擬磁碟鏡像檔，支援 `.zip`、`.dsk`、`.2mg`、`.hdv`、`.woz` 等。 |
| **`extra`** 或 **`?extra`** | — | 原始 MAME OSD 引數串 (例如 `-port,:a2video:a2_video_config,3`) | 直接為模擬核心注入低階命令參數或硬體覆寫配置（支援拼接打錯 `&?extra=` 智慧相容防錯）。 |
| **`autoboot`** | — | 旗標或數值 (例如 `&autoboot` 或 `&autoboot=0` 或 `&autoboot=5`) | 觸發開機後自動啟動模擬器。支援自訂延遲秒數 `n` (0 ~ 10 秒)，`n=0` 或僅作為旗標（無數值）皆代表馬上啟動（在模擬器執行期間若點擊右側的「Stop」按鈕，系統會自動在重載前將此參數自網址列移除，以避免陷入重啟的無限循環）。 |

### 視訊與著色器（Shader）參數

您可以透過以下參數，在啟動時直接定義模擬器畫面的呈現效果。請注意，**選擇任何著色器特效時，系統會自動將顯示渲染引擎切換為 WebGL 硬體加速的 BGFX 模式**：

| 參數鍵名 | 別名 / 替代字 | 允許的可選值 | 說明 |
| :--- | :--- | :--- | :--- |
| **`windowMode`** | `window_mode`, `wm`, `w` | `1x`, `2x`, `3x`, `4x`, `fit`, `integer-fit` | **視窗縮放比例**。`fit` 為自適應寬度，`integer-fit` 為完美像素整數倍銳化縮放。 |
| **`videoShader`** | `video_shader`, `shader`, `effect`, `bgfxEffect`, `bgfx_effect` | `none`, `scanlines`, `crt-geom`, `crt-geom-deluxe`, `hq2x`, `lcd-grid` | **畫面著色器濾鏡**。參數值中的底線 `_` 與連字號 `-` 可完美互通。 |
| **`videoMethod`** | `video_method`, `vm` | `soft`, `bgfx`, `opengl` | **顯示渲染引擎後端**。 |

### 網址即時分享完整範例

為了讓您能直觀體驗網址配置的強大組合能力，以下提供了多款具體的主機啟動實例：

1. **Apple IIe Enhanced (搭載 BGFX CRT 掃描線特效、64K RAM、滑鼠卡、Video-7 RGB 與自動開機)：**
   ```
   https://anomixer.github.io/ample/?m=apple2ee&d=Apple+%2F%2Fe+%28enhanced%29&s=ramsize%3A64K%2Csl4%3Amouse%2Csl6%3Adiskiing%2Csl6%3Adiskiing%3A0%3A525%2Csl6%3Adiskiing%3A1%3A525%2Csl7%3Acffa202%2Caux%3Aext80%2Csl7%3Acffa202%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa202%3Acffa2_ata%3A1%3Ahdd&extra=-port,:a2video:a2_video_config,3&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot&w=fit&shader=crt-geom
   ```
   *(此網址展示了：以 `m` 指定機型、`s` 映射插槽、`extra` 注入低階 Video-7 配置、`media` 掛載雲端硬碟 ZIP 映像、`autoboot` 自動開機、`w` 自適應視窗，以及 `shader` 自動調用 WebGL BGFX 映像著色器)*

2. **Apple IIgs ROM 01 (搭載 1.25MB RAM、5.25/3.5 雙軟碟、CFFA2 大容量硬碟與自動開機)：**
   ```
   https://anomixer.github.io/ample/?m=apple2gsr1&d=Apple+IIgs+%28ROM01%29&s=ramsize%3A1280K%2Csmartport%3Afdc%3A0%3A525%2Csmartport%3Afdc%3A1%3A525%2Csmartport%3Afdc%3A2%3A35dd%2Csmartport%3Afdc%3A3%3A35dd%2Csl7%3Acffa2%2Csl7%3Acffa2%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa2%3Acffa2_ata%3A1%3Ahdd&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot
   ```

---

### ⚠️ 已知限制
*   **磁碟掛載限制**：因瀏覽器的 VFS 限制，磁碟掛載僅限於啟動機器之前。啟動後無法動態換片 (替代方案：開啟「Paths」標籤下的本地資料夾映射功能，再透過 MAME 內建 UI 手動從 `/share` 目錄掛載)。
*   **核心穩定性**：側邊欄標示**黃字**的機器因模擬核心核心限制，可能無法正常運作。
*   **音訊延遲**：聲音可能會有輕微延遲 (此為 MAME WASM 的限制)。
*   **執行速度**：受限於 WASM 核心架構，速度提升幅度有限，因此 CPU 調整至 500% 或 Max 可能無法達到預期速度。
*   **停用功能**：因相容性問題，目前禁用以下功能：Debug 與 Generate VGM。
*   **瀏覽器限制**：若錄製時間過長，大型 AVI 檔案可能會超出瀏覽器的記憶體緩衝區。

## 🛠️ 快速開始

### 1. 線上立即體驗 (推薦)

無需任何設定，直接在瀏覽器中暢享 80 年代的經典電腦體驗：
👉 **[主站入口](https://anomixer.github.io/ample/)**

我們為您預先配置了兩個包含 Apple II Desktop 系統的即時啟動網址：
*   **[立即體驗 Apple IIe (enhanced)](https://anomixer.github.io/ample/?m=apple2ee&d=Apple+%2F%2Fe+%28enhanced%29&s=ramsize%3A64K%2Csl4%3Amouse%2Csl6%3Adiskiing%2Csl6%3Adiskiing%3A0%3A525%2Csl6%3Adiskiing%3A1%3A525%2Csl7%3Acffa202%2Caux%3Aext80%2Csl7%3Acffa202%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa202%3Acffa2_ata%3A1%3Ahdd&extra=-port,:a2video:a2_video_config,3&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot&windowMode=fit&videoMethod=bgfx)** (搭載 Video-7 RGB 顯卡、BGFX 硬體加速與自動開機)
*   **[立即體驗 Apple IIgs (ROM01)](https://anomixer.github.io/ample/?m=apple2gsr1&d=Apple+IIgs+%28ROM01%29&s=ramsize%3A1280K%2Csmartport%3Afdc%3A0%3A525%2Csmartport%3Afdc%3A1%3A525%2Csmartport%3Afdc%3A2%3A35dd%2Csmartport%3Afdc%3A3%3A35dd%2Csl7%3Acffa2%2Csl7%3Acffa2%3Acffa2_ata%3A0%3Ahdd%2Csl7%3Acffa2%3Acffa2_ata%3A1%3Ahdd&media=hard1:https://github.com/a2stuff/a2d/releases/download/v1.6-alpha2/A2DeskTop-1.6-alpha2-en.zip&autoboot)** (搭載 1.25MB 記憶體、CFFA2 硬碟控制器與自動開機)

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
