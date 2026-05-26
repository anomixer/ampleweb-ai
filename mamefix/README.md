# MAME WASM 核心修改紀錄 (MAME WASM Core Customizations)

本目錄存放了針對 MAME WASM 核心進行的自訂修改原始碼。這些修改是為了解決 Apple IIe 80-Column 模式下，因記憶體分頁 Bank-switching 限制導致無法跨分頁讀取 Auxiliary RAM (偶數欄位字元)，進而造成文字螢幕解析空格亂碼的世紀 Bug。

透過這些修改，我們在 MAME C++ 核心層實現了 **100% 精準度、0 延遲** 的實體記憶體直接存取 (Direct Memory Access, DMA) 機制。

---

## 📂 修改檔案清單與說明

### 1. [src/mame/apple/apple2video.h](src/mame/apple/apple2video.h)
- **修改目的**：公開視訊裝置內部所使用的 Main 與 Aux RAM 物理指標。
- **修改內容**：
  在 `class a2_video_device` 的 `public:` 區段加入存取器 (Getters)，以便從外部直接讀取這兩個指標：
  ```cpp
  u8 *get_ram_ptr() const { return m_ram_ptr; }
  u8 *get_aux_ptr() const { return m_aux_ptr; }
  ```

### 2. [src/emu/machine.h](src/emu/machine.h)
- **修改目的**：在 `running_machine` 類別中宣告用於 Emscripten 的物理 RAM 讀取成員函數。
- **修改內容**：
  在 `#if defined(__EMSCRIPTEN__)` 區塊下宣告 Direct RAM 讀取函數：
  ```cpp
  uint8_t emscripten_read_main_ram(uint32_t addr);
  uint32_t emscripten_read_main_ram_bulk(uint32_t start_addr, uint32_t length, uint8_t *out_buf);
  uint8_t emscripten_read_aux_ram(uint32_t addr);
  uint32_t emscripten_read_aux_ram_bulk(uint32_t start_addr, uint32_t length, uint8_t *out_buf);
  ```

### 3. [src/emu/machine.cpp](src/emu/machine.cpp)
- **修改目的**：實現動態 Aux RAM 指標搜尋演算法，並提供 C/C++ 物理記憶體直讀 APIs 與指標偏移量導出。
- **修改內容**：
  - **`find_aux_ram_ptr`**：搜尋活躍的輔助記憶體指標。
    1. 優先嘗試從 `a2_video_device` (tag `"a2video"`) 提取指針。
    2. 若為 null，使用 `device_enumerator` 動態掃描所有子設備，定位實作了 `device_a2eauxslot_card_interface` 的卡片設備 (例如 Extended 80-Column Card) 並獲取其虛擬 VRAM 指標。
    3. 安全 fallback 回通用 `ram_device` 的後半段空間（適用於 Apple IIc 等 128KB 母板型號）。
  - **直讀 APIs**：實作 `emscripten_read_main_ram`、`emscripten_read_aux_ram` 及其 `bulk` 大量讀取函數。
  - **C 語言導出偏移量 (`extern "C"`)**：
    實作 `emscripten_get_main_ram_wasm_offset` 與 `emscripten_get_aux_ram_wasm_offset`，將 C++ 指標（在 WebAssembly 中等同於 WASM 線性記憶體 offset）直接回傳給 JavaScript 端的 `HEAPU8`，實現最直接、最快速的零延遲 DMA 讀取。

### 4. [scripts/genie.lua](scripts/genie.lua)
- **修改目的**：將編譯後的 C 語言 API 導出，以便 JavaScript 可以透過 `Module` 物件呼叫。
- **修改內容**：
  在 `-s EXPORTED_FUNCTIONS` 清單中手動新增以下兩個自訂 API 導出：
  ```lua
  '_emscripten_get_main_ram_wasm_offset',
  '_emscripten_get_aux_ram_wasm_offset'
  ```

---

## 🚀 重新編譯與部署指南

如果您修改了本目錄下的檔案並希望將其套用回 `MameWasm` 專案中重新編譯，請參考以下步驟（假設 `MameWasm` 與本專案位於同一個父目錄下）：

1. **複製檔案回 MAME 目錄**：
   將 `mamefix/` 目錄下的檔案覆蓋回 `MameWasm/mame/` 的對應路徑。
2. **清除 Linker 快取**：
   在 Windows 下編譯時，為避免 `emar` 靜態庫封裝器重複追加 symbol 造成的 Linker 錯誤，在編譯前必須先手動刪除舊的 `libemu.a`：
   ```powershell
   Remove-Item -Path "MameWasm/mame/build/asmjs/bin/libemu.a" -ErrorAction SilentlyContinue
   ```
3. **執行增量編譯**：
   切換至 `MameWasm/` 目錄並執行：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\build.ps1 -Subtarget ample
   ```
4. **壓縮與發布**：
   編譯成功後，將生成之 `mameample.wasm` 進行 gzip 最高等級壓縮後放至 `ampleweb-ai/public/wasm/mame.wasm.gz`，並將 `mameample.js` 複製覆蓋 `mame.js` 即可。
