/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { dataManager, type ModelEntry, type MachineConfig, type Slot, type Device, type SlotOption } from './core/data_manager'
import {
  loadMameWasm,
  buildMameArgs,
  fetchRom,
  getVirtualFile,
  getVirtualFileStat,
  type MameWasmModule,
  type RomFile,
  type MediaFile,
} from './core/wasm_loader'
import { useStore, type VideoSettings } from './core/store'
import { captureScreen, sendTextCommand, callRealLLM, callMockLLM, resetMockController } from './ai/ai_controller'
import { DEFAULT_SYSTEM_PROMPT, ADVENTURE_PROMPT_PRESETS } from './ai/ai_prompt'
const BASE_URL = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'


function getDefaultCfgTemplate(mameDriver: string): string {
  return `<?xml version="1.0"?>
<mameconfig version="10">
    <system name="${mameDriver}">
        <input>
        </input>
    </system>
</mameconfig>`
}

function updateSystemNameInXml(xml: string, mameDriver: string): string {
  return xml.replace(/<system\s+name\s*=\s*['"][^'"]*['"]>/i, `<system name="${mameDriver}">`)
}

function injectPortsIntoXml(xml: string, ports: Record<string, string>): string {
  let result = xml
  if (!result.includes('<input>')) {
    if (result.includes('</system>')) {
      result = result.replace('</system>', '    <input>\n        </input>\n    </system>')
    } else {
      return xml // Fallback if XML is corrupted
    }
  }
  for (const [tag, value] of Object.entries(ports)) {
    const tagEscaped = tag.replace(/[^a-zA-Z0-9]/g, '\\$&')
    // Super robust regex matching port node with any attributes order, quotes, spaces, self-closing or not
    const regex = new RegExp(`<port\\s+[^>]*tag\\s*=\\s*['"]${tagEscaped}['"][^>]*\\/?>|<port\\s+tag\\s*=\\s*['"]${tagEscaped}['"][^>]*\\/?>`, 'i')
    const newPortNode = `<port tag="${tag}" type="CONFIG" mask="7" defvalue="0" value="${value}" />`
    if (regex.test(result)) {
      result = result.replace(regex, newPortNode)
    } else {
      result = result.replace('<input>', `<input>\n            ${newPortNode}`)
    }
  }
  return result
}


/**
 * Emulator type → WASM file info.
 * Maps Ample's emulator values to the correct WASM file and MAME driver.
 */
const EMULATOR_WASM_MAP: Record<string, { wasm: string; js: string; driver: string }> = {
  // Universal MAME 0.287 engine (supports all 150+ variants)
  mame: { wasm: 'mame.wasm.gz', js: 'mame.js', driver: 'apple2e' },
}

/**
 * Machine name → MAME driver name mapping.
 * mac128.wasm supports: mac128k, macplus, macse.
 * maciici.wasm supports: maciici.
 * mac.wasm supports: ALL Mac variants (macii, maciix, maciicx, maciisi, maciivx, maciivi, macqd*, maclc*, macpb*, macpd*, macclasc, macclas2, maccclas, mactv, macct6, macxl, macprtb).
 */
const DRIVER_MAP: Record<string, string> = {
  mac128k: 'mac128k',
  mac512k: 'mac128k',
  mac512ke: 'mac128k',
  macplus: 'macplus',
  macse: 'macse',
  macsefd: 'macse',
  macse30: 'macse30',
  macxl: 'mac',
  // Mac II family
  macii: 'macii',
  maciihmu: 'macii',
  mac2fdhd: 'macii',
  maciix: 'maciix',
  maciifx: 'maciifx',
  maciici: 'maciici',
  maciicx: 'macii',
  maciisi: 'maciisi',
  maciivi: 'maciivi',
  maciivx: 'maciivx',
  // Mac Quadra
  macqd605: 'macqd605',
  macqd610: 'macqd610',
  macqd630: 'macqd630',
  macqd650: 'macqd650',
  macqd700: 'macqd700',
  macqd800: 'macqd800',
  macqd900: 'macqd900',
  macqd950: 'macqd950',
  // Mac LC/Performa
  maclc: 'maclc',
  maclc2: 'maclc2',
  maclc3: 'maclc3',
  maclc3p: 'maclc3',
  maclc475: 'maclc',
  maclc520: 'maclc520',
  maclc550: 'maclc520',
  maclc575: 'maclc520',
  maclc580: 'maclc520',
  macct610: 'macqd610',
  macct650: 'macqd650',
  mactv: 'mactv',
  // Mac Portable/PowerBook
  macprtb: 'macprtb',
  macpb100: 'macpb100',
  macpb140: 'macpb140',
  macpb145: 'macpb140',
  macpb145b: 'macpb140',
  macpb160: 'macpb160',
  macpb165: 'macpb165',
  macpb165c: 'macpb165c',
  macpb170: 'macpb170',
  macpb180: 'macpb180',
  macpb180c: 'macpb180c',
  // Mac Duo
  macpd210: 'macpd210',
  macpd230: 'macpd210',
  macpd250: 'macpd210',
  macpd270c: 'macpd270c',
  macpd280: 'macpd280',
  macpd280c: 'macpd280',
  // Mac Classic
  macclasc: 'macclasc',
  macclas2: 'macclas2',
  maccclas: 'maccclas',
  // Apple II Clones
  albert: 'albert',
  am100: 'am100',
  am64: 'am64',
  basis108: 'basis108',
  craft2p: 'craft2p',
  dodo: 'dodo',
  elppa: 'elppa',
  hkc8800a: 'hkc8800a',
  ivelultr: 'ivelultr',
  maxxi: 'maxxi',
  microeng: 'microeng',
  prav82: 'prav82',
  prav8c: 'prav8c',
  prav8d: 'prav8d',
  prav8m: 'prav8m',
  tk3000: 'tk3000',
  uniap2en: 'uniap2en',
  uniap2pt: 'uniap2pt',
  zijini: 'zijini',
  // CEC variants
  cec2000: 'cec2000',
  cece: 'cece',
  cecg: 'cecg',
  ceci: 'ceci',
  cecm: 'cecm',
  // Franklin Ace
  ace100: 'ace100',
  ace500: 'ace500',
  ace1000: 'ace1000',
  ace2200: 'ace2200',
  // Other Clones
  mprof3: 'mprof3',
  laser128: 'laser128',
  laser3k: 'laser3k',
  laser2c: 'laser2c',
  laser128o: 'laser128o',
  las128ex: 'las128ex',
  las128e2: 'las128e2',
  space84: 'space84',
  agat7: 'agat7',
  agat9: 'agat9',
  // Atari ST
  st: 'st',
  megast: 'megast',
  spectred: 'spectred',
  // Oric
  oric1: 'oric1',
  orica: 'orica',
  telstrat: 'telstrat',
  // BBC / Acorn
  bbcb: 'bbcb',
  bbca: 'bbca',
  bbcm: 'bbcm',
  bbcb_de: 'bbcb_de',
  bbcb_no: 'bbcb_no',
  bbcb_us: 'bbcb_us',
  bbcbp: 'bbcbp',
  bbcbp128: 'bbcbp128',
  bbcmc: 'bbcmc',
  bbcmt: 'bbcmt',
  electron: 'electron',
  // Dragon series
  dragon32: 'dragon32',
  dragon64: 'dragon64',
  dragon200: 'dragon200',
  dragon200e: 'dragon200e',
  d64plus: 'd64plus',
  dgnalpha: 'dgnalpha',
  tanodr64: 'tanodr64',
  dragon64h: 'dragon64',
  tanodr64h: 'tanodr64',
  // Tandy / TRS-80 / CoCo
  trs80: 'trs80',
  trs80l2: 'trs80l2',
  coco: 'coco',
  coco2b: 'coco2b',
  coco2bh: 'coco2bh',
  cocoh: 'cocoh',
  coco3: 'coco3',
  coco3p: 'coco3p',
  coco3h: 'coco3h',
  mc10: 'mc10',
  // Commodore
  c64: 'c64',
  c64c: 'c64c',
  // Apple family fallbacks
  apple1: 'apple1',
  apple2: 'apple2',
  apple2p: 'apple2p',
  apple2jp: 'apple2jp',
  apple2e: 'apple2e',
  apple2euk: 'apple2e',
  apple2ede: 'apple2ede',
  apple2ese: 'apple2ese',
  apple2efr: 'apple2efr',
  apple2ees: 'apple2ees',
  apple2ee: 'apple2ee',
  apple2eeuk: 'apple2ee',
  apple2eede: 'apple2ee',
  apple2eese: 'apple2ee',
  apple2eefr: 'apple2ee',
  apple2ep: 'apple2ee',
  apple2epuk: 'apple2ee',
  apple2epde: 'apple2ee',
  apple2epfr: 'apple2ee',
  apple2epes: 'apple2ee',
  apple2epse: 'apple2ee',
  apple2c: 'apple2c',
  apple2c0: 'apple2c0',
  apple2c1: 'apple2c1',
  apple2c2: 'apple2c2',
  apple2c3: 'apple2c3',
  apple2c4: 'apple2c4',
  apple2cp: 'apple2cp',
  apple2cm: 'apple2cm',
  apple2che: 'apple2che',
  apple2cde: 'apple2c',
  apple2cfr: 'apple2c',
  apple2cse: 'apple2c',
  apple2cuk: 'apple2c',
  apple2gs: 'apple2gs',
  apple2gsr0: 'apple2gsr0',
  apple2gsr1: 'apple2gsr1',
  apple3: 'apple3',
}

/** Machines known to have a very slow hardware initialization/boot process. */
const SLOW_BOOT_MACHINES = [
  'macpd210', 'macpd230', 'macpd250', 'macpd270c', 'macpd280', 'macpd280c', // PowerBook Duo
  'macpb140', 'macpb145', 'macpb170' // Early PowerBooks
]

/** Machines known to have boot issues or are extremely unstable in MAME WASM. */
const NOT_WORKING_MACHINES = [
  'macpb160', 'macpb165', 'macpb165c', 'macpb180', 'macpb180c'
];

/**
 * Device dependencies extracted from MAME XML
 */
const DEVICE_DEPENDENCIES: Record<string, string[]> = {
  'a2diskiing': ['d2fdc'],
  'a2grafex': ['upd7220'],
  'a2mockbd': ['votrsc01a'],
  'a2mouse': ['m68705p3'],
  'a2surance': ['d2fdc'],
  'diskii13': ['d2fdc'],
  'sweetalk': ['votrsc01a'],
  'votraxtnt': ['votrsc01a'],
  'serial_votraxtnt': ['votraxtnt', 'votrsc01a'],
  'ie15_terminal': ['ie15_device', 'ie15kbd'],
  'isa_mpu401': ['mpu401'],
  'number_9_rev': ['upd7220'],
}

const FLOPPY_SAMPLES = [
  '35_seek_12ms.wav', '35_seek_20ms.wav', '35_seek_2ms.wav', '35_seek_6ms.wav',
  '35_spin_empty.wav', '35_spin_end.wav', '35_spin_loaded.wav',
  '35_spin_start_empty.wav', '35_spin_start_loaded.wav', '35_step_1_1.wav',
  '525_seek_12ms.wav', '525_seek_20ms.wav', '525_seek_2ms.wav', '525_seek_6ms.wav',
  '525_spin_empty.wav', '525_spin_end.wav', '525_spin_loaded.wav',
  '525_spin_start_empty.wav', '525_spin_start_loaded.wav', '525_step_1_1.wav'
];

/** Lightweight file existence check (synchronous, checks browser cache). */
const _wasmCache: Record<string, boolean> = {}
function _wasmExists(filename: string): boolean {
  const url = `${BASE_URL}wasm/${filename}`
  if (!(url in _wasmCache)) {
    _wasmCache[url] = false
    fetch(url, { method: 'HEAD' })
      .then(r => { _wasmCache[url] = r.ok })
      .catch(() => { _wasmCache[url] = false })
  }
  return _wasmCache[url]
}

async function fetchAllSamples(): Promise<RomFile[]> {
  const results: RomFile[] = []
  for (const filename of FLOPPY_SAMPLES) {
    try {
      const url = `${BASE_URL}samples/floppy/${filename}`
      const resp = await fetch(url)
      if (resp.ok) {
        const data = new Uint8Array(await resp.arrayBuffer())
        results.push({ name: `floppy/${filename}`, driver: 'floppy', data })
      }
    } catch (e) {
      console.warn(`Failed to fetch sample ${filename}:`, e)
    }
  }
  return results
}

/**
 * Get the WASM info for an emulator type, falling back to available.
 */
function getWasmForEmulator(emulator: string, _machineName: string): { wasm: string; js: string; driver: string } | null {
  // Direct match from EMULATOR_WASM_MAP (mame.wasm is the default)
  const info = EMULATOR_WASM_MAP[emulator] || EMULATOR_WASM_MAP['mame']
  if (info) return info
  return null
}

type LaunchState = 'idle' | 'fetching-rom' | 'loading-wasm' | 'running' | 'error'

interface LogLine {
  text: string
  isError: boolean
  ts: number
}

/**
 * Driver name → ROM ZIP filename mapping.
 * MAME needs the correct BIOS ROM for each driver.
 */
const DRIVER_ROM_MAP: Record<string, string> = {
  ace100: 'ace100.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  ace1000: 'ace1000.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  ace2200: 'ace2200.zip;apple2e.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  ace500: 'ace500.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  agat7: 'agat7.zip;agat7_flop.zip;d2fdc.zip',
  agat9: 'agat9.zip;d2fdc.zip;agat_fdc.zip;agat9_flop.zip',
  albert: 'albert.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  am100: 'am100.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;am100kbd.zip;apple2.zip',
  am64: 'am64.zip;d2fdc.zip;votrsc01a.zip;a2tk10.zip;a2diskiing.zip;apple2.zip',
  apple1: 'apple1.zip',
  apple2: 'apple2.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2c: 'apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2c0: 'apple2c0.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2c3: 'apple2c3.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2c4: 'apple2c4.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2cp: 'apple2cp.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2e: 'apple2e.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  apple2ede: 'apple2ede.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  apple2ee: 'apple2ee.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  apple2eede: 'apple2eede.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2eefr: 'apple2eefr.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2ees: 'apple2ees.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2eese: 'apple2eese.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2eeuk: 'apple2eeuk.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2efr: 'apple2efr.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  apple2ep: 'apple2ep.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2epde: 'apple2epde.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2epfr: 'apple2epfr.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2epse: 'apple2epse.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2epuk: 'apple2epuk.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2ee.zip;apple2e.zip',
  apple2ese: 'apple2ese.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  apple2euk: 'apple2euk.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  apple2gs: 'apple2gs.zip',
  apple2gsr0: 'apple2gsr0.zip;apple2gs.zip',
  apple2gsr1: 'apple2gsr1.zip;apple2gs.zip',
  apple2jp: 'apple2jp.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  apple2p: 'apple2p.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  apple3: 'apple3.zip',
  basis108: 'basis108.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  bbca: 'bbca.zip;bbcb.zip;saa5050.zip;bbc_acorn8271.zip',
  bbcb: 'bbcb.zip;saa5050.zip;bbc_acorn8271.zip',
  bbcb_de: 'bbcb_de.zip;saa5050.zip;bbc_acorn8271.zip;bbcb.zip',
  bbcb_no: 'bbcb_no.zip;saa5050.zip;bbc_acorn8271.zip;bbcb.zip',
  bbcb_us: 'bbcb_us.zip;saa5050.zip;bbc_acorn8271.zip;bbcb.zip',
  bbcbp: 'bbcbp.zip;saa5050.zip',
  bbcbp128: 'bbcbp128.zip;bbcbp.zip;saa5050.zip',
  bbcm: 'bbcm.zip;saa5050.zip',
  bbcmc: 'bbcmc.zip;saa5050.zip',
  bbcmt: 'bbcmt.zip;bbc_tube_65c102.zip;saa5050.zip;bbcm.zip',
  c64: 'c64.zip;c1541.zip',
  c64c: 'c64c.zip;c64.zip;c1541.zip',
  cec2000: 'cec2000.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  cece: 'cece.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  cecg: 'cecg.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  ceci: 'ceci.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  cecm: 'cecm.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  coco: 'coco.zip;coco_fdc.zip',
  coco2b: 'coco2b.zip;coco.zip;coco_fdc.zip',
  coco2bh: 'coco2bh.zip;coco.zip;coco_fdc.zip',
  coco3: 'coco3.zip;coco.zip;coco_fdc.zip',
  coco3h: 'coco3h.zip;coco.zip;coco_fdc.zip',
  coco3p: 'coco3p.zip;coco.zip;coco_fdc.zip',
  cocoh: 'cocoh.zip;coco.zip;coco_fdc.zip',
  craft2p: 'craft2p.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  d64plus: 'd64plus.zip;dragon32.zip;dragon_fdc.zip',
  dodo: 'dodo.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  dragon200: 'dragon200.zip;dragon32.zip;dragon_fdc.zip',
  dragon200e: 'dragon200e.zip;dragon32.zip;dragon_fdc.zip',
  dragon32: 'dragon32.zip;dragon_fdc.zip',
  dragon64: 'dragon64.zip;dragon32.zip;dragon_fdc.zip',
  electron: 'electron.zip;electron_plus3.zip;electron_plus1.zip',
  elppa: 'elppa.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  hkc8800a: 'hkc8800a.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  ivelultr: 'ivelultr.zip;d2fdc.zip;votrsc01a.zip;ivelultrkb.zip;a2diskiing.zip;apple2.zip',
  las128e2: 'las128e2.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  las128ex: 'las128ex.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  laser128: 'laser128.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  laser128o: 'laser128o.zip;apple2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip',
  laser2c: 'laser2c.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  laser3k: 'laser3k.zip;d2fdc.zip;a2diskiing.zip;apple2e.zip',
  mac128k: 'mac128k.zip;mackbd_m0110.zip;mackbd_m0120.zip',
  mac2fdhd: 'mac2fdhd.zip;macii.zip;nb_mdc824.zip;adbmodem.zip',
  mac512k: 'mac512k.zip;mackbd_m0110.zip;mackbd_m0120.zip;mac128k.zip',
  mac512ke: 'mac512ke.zip;mackbd_m0110.zip;mackbd_m0120.zip;macplus.zip;mac128k.zip',
  maccclas: 'maccclas.zip;adbmodem.zip;cuda.zip',
  macclas2: 'macclas2.zip;egret.zip',
  macclasc: 'macclasc.zip;adbmodem.zip;cuda.zip',
  macct610: 'macct610.zip;macqd800.zip;adbmodem.zip',
  macct650: 'macct650.zip;macqd800.zip;adbmodem.zip',
  macii: 'macii.zip;nb_mdc824.zip;adbmodem.zip',
  maciici: 'maciici.zip;egret.zip;nb_mdc824.zip;adbmodem.zip',
  maciicx: 'maciicx.zip;macii.zip;nb_mdc824.zip;adbmodem.zip;mac2fdhd.zip',
  maciifx: 'maciifx.zip;egret.zip;nb_mdc824.zip;adbmodem.zip',
  maciihmu: 'maciihmu.zip;nb_mdc824.zip;adbmodem.zip;macii.zip',
  maciisi: 'maciisi.zip;egret.zip',
  maciivi: 'maciivi.zip;maciivx.zip;egret.zip',
  maciivx: 'maciivx.zip;egret.zip',
  maciix: 'maciix.zip;nb_mdc824.zip;adbmodem.zip;mac2fdhd.zip',
  maclc: 'maclc.zip;egret.zip',
  maclc2: 'maclc2.zip;egret.zip',
  maclc3: 'maclc3.zip;egret.zip',
  maclc3p: 'maclc3p.zip;maclc3.zip;egret.zip',
  maclc475: 'maclc475.zip;maclc.zip;egret.zip;macqd605.zip;cuda.zip',
  maclc520: 'maclc520.zip;maclc.zip;cuda.zip',
  maclc550: 'maclc550.zip;maclc520.zip;maclc.zip;cuda.zip',
  maclc575: 'maclc575.zip;maclc520.zip;maclc.zip;macqd605.zip;cuda.zip',
  macpb100: 'macpb100.zip',
  macpb140: 'macpb140.zip',
  macpb145: 'macpb145.zip;macpb140.zip',
  macpb145b: 'macpb145b.zip;macpb140.zip',
  macpb160: 'macpb160.zip',
  macpb165: 'macpb165.zip;macpb160.zip',
  macpb165c: 'macpb165c.zip;macpb180c.zip',
  macpb170: 'macpb170.zip;macpb140.zip',
  macpb180: 'macpb180.zip;macpb160.zip',
  macpb180c: 'macpb180c.zip',
  macpd210: 'macpd210.zip;m68hc05pge.zip',
  macpd230: 'macpd230.zip;macpd210.zip;m68hc05pge.zip',
  macpd250: 'macpd250.zip;macpd210.zip;m68hc05pge.zip',
  macpd270c: 'macpd270c.zip;m68hc05pge.zip',
  macpd280: 'macpd280.zip;m68hc05pge.zip',
  macpd280c: 'macpd280c.zip;macpd280.zip;m68hc05pge.zip',
  macplus: 'macplus.zip;mackbd_m0110.zip;mackbd_m0120.zip;mackbd_m0110a.zip',
  macprtb: 'macprtb.zip',
  macqd605: 'macqd605.zip;cuda.zip',
  macqd610: 'macqd610.zip;macqd800.zip;adbmodem.zip',
  macqd650: 'macqd650.zip;macqd800.zip;adbmodem.zip',
  macqd700: 'macqd700.zip;adbmodem.zip',
  macqd800: 'macqd800.zip;adbmodem.zip',
  macqd900: 'macqd900.zip;egret.zip',
  macqd950: 'macqd950.zip;egret.zip',
  macse: 'macse.zip;adbmodem.zip',
  macse30: 'macse30.zip;mac2fdhd.zip;macii.zip;nb_mdc824.zip;adbmodem.zip',
  macsefd: 'macsefd.zip;macse.zip;adbmodem.zip',
  mactv: 'mactv.zip;adbmodem.zip;cuda.zip',
  maxxi: 'maxxi.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  mc10: 'mc10.zip',
  megast: 'megast.zip;st.zip;st_kbd.zip',
  microeng: 'microeng.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  mprof3: 'mprof3.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  oric1: 'oric1.zip',
  orica: 'orica.zip;oric1.zip',
  prav82: 'prav82.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  prav8c: 'prav8c.zip;d2fdc.zip;prav8ckb.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  prav8d: 'prav8d.zip;oric1.zip',
  prav8m: 'prav8m.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  space84: 'space84.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  spectred: 'spectred.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  st: 'st.zip;st_kbd.zip',
  tanodr64: 'tanodr64.zip;dragon32.zip;sdtandy_fdc.zip',
  telstrat: 'telstrat.zip;oric1.zip',
  tk3000: 'tk3000.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  trs80: 'trs80.zip',
  trs80l2: 'trs80l2.zip',
  uniap2en: 'uniap2en.zip;d2fdc.zip;uniap2ti.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  uniap2pt: 'uniap2pt.zip;d2fdc.zip;uniap2ti.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  zijini: 'zijini.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  // Special overrides
  apple2gs_shared: 'apple2gs.zip;apple2c.zip',
}

/**
 * Default resolution per emulator type.
 * Each emularity WASM has a native resolution from its config.
 * For MAME-wrapped builds, these are used as -resolution flags.
 */
const DEFAULT_RESOLUTIONS: Record<string, string> = {
  // Families
  apple2: '560x384',
  apple3: '560x384',
  apple1: '560x384',
  mac: '640x480',
  tandy: '320x240',
  atarist: '640x400',
  acorn: '640x512',
  commodore: '384x272',
  oric: '240x224',
  
  // Specific Drivers / Machines
  apple2gs: '704x462',
  mac128k: '512x342',
  mac128: '512x342',
  macplus: '512x342',
  macse: '512x342',
  maclc: '512x384',
  maclc2: '512x384',
  maclc3: '512x384',
  maclc520: '640x480',
  macqd: '640x480',
  macpb: '640x400',
  macpb100: '640x400',
  macpb140: '640x400',
  macprtb: '640x400',
  maciici: '640x480',
  maciisi: '640x480',
  maciivi: '640x480',
  maciivx: '640x480',
  
  coco: '320x240', 
  coco3: '640x480',
  trs80: '384x192',
  c64: '384x272',
  mc10: '372x243',
  mametiny: '640x480',
}

function App() {
  const {
    theme,
    toggleTheme,
    romSettings,
    setRomSettings,
    sidebarWidth,
    setSidebarWidth,
    configWidth,
    setConfigWidth,
    videoSettings,
    setVideoSettings,
    cpuSettings,
    setCpuSettings,
    avSettings,
    setAvSettings,
    pathSettings,
    setPathSettings,
    selectedMachine,
    setSelectedMachine,
    slotValues,
    setSlotValues,
    lastMedia,
    setLastMedia
  } = useStore()

  const [models, setModels] = useState<ModelEntry[]>([])
  const [machineConfig, setMachineConfig] = useState<MachineConfig | null>(null)
  const [wasmModule, setWasmModule] = useState<MameWasmModule | null>(null)
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [wasmProgress, setWasmProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<LogLine[]>([])
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ample_media_urls') || '{}')
    } catch {
      return {}
    }
  })

  const saveMediaUrl = useCallback((id: string, url: string) => {
    setMediaUrls(prev => {
      const next = { ...prev, [id]: url }
      localStorage.setItem('ample_media_urls', JSON.stringify(next))
      return next
    })
  }, [])

  const removeMediaUrl = useCallback((id: string) => {
    setMediaUrls(prev => {
      const next = { ...prev }
      delete next[id]
      localStorage.setItem('ample_media_urls', JSON.stringify(next))
      return next
    })
  }, [])

  const [showLogs, setShowLogs] = useState(false)
  const [search, setSearch] = useState('')
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [isConfigResizing, setIsConfigResizing] = useState(false)
  const [configTopHeight, setConfigTopHeight] = useState(() => {
    const saved = localStorage.getItem('ample-config-top-height')
    return saved ? parseInt(saved, 10) : 320
  })
  const [isConfigVResizing, setIsConfigVResizing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => window.innerWidth > 800)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => window.innerWidth > 800)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [systemTab, setSystemTab] = useState<'video' | 'cpu' | 'av' | 'paths' | 'config' | 'ai'>(() => {
    return (localStorage.getItem('ample-system-tab') as any) || 'video'
  })

  // ── AI Agent States ──
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'claude' | 'mock'>(() => {
    return (localStorage.getItem('ample-ai-provider') as any) || 'mock'
  })
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('ample-ai-apikey') || '')
  const [aiSystemPrompt, setAiSystemPrompt] = useState(() => localStorage.getItem('ample-ai-prompt') || DEFAULT_SYSTEM_PROMPT)
  const [aiTickRate, setAiTickRate] = useState(() => {
    const saved = localStorage.getItem('ample-ai-tickrate')
    return saved ? parseInt(saved, 10) : 10
  })
  const [aiCharDelay, setAiCharDelay] = useState(() => {
    const saved = localStorage.getItem('ample-ai-chardelay')
    return saved ? parseInt(saved, 10) : 60
  })

  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'typing' | 'error'>('idle')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLastScreenshot, setAiLastScreenshot] = useState<string | null>(null)
  const [aiLogs, setAiLogs] = useState<Array<{ text: string; ts: number }>>([])
  
  const aiTimerRef = useRef<any>(null)
  const aiIsProcessingRef = useRef(false)

  const [editorCfgText, setEditorCfgText] = useState('')

  const currentMameDriver = selectedMachine
    ? (DRIVER_MAP[selectedMachine.name] || selectedMachine.name)
    : 'apple2ee'

  const currentMachineName = selectedMachine
    ? selectedMachine.name
    : 'apple2ee'

  useEffect(() => {
    let saved = localStorage.getItem('ample_cfg_' + currentMachineName) || getDefaultCfgTemplate(currentMachineName)
    // Ensure the system name matches the user-visible machine name in UI & localStorage
    saved = updateSystemNameInXml(saved, currentMachineName)
    
    // Parse URL parameters for port overrides on load, accommodating both 'extra' and potential malformed '&?extra' keys
    const urlParams = new URLSearchParams(window.location.search)
    const extraParam = urlParams.get('extra') || urlParams.get('?extra')
    const extraArgsFromUrl: string[] = []
    if (extraParam) {
      try {
        extraParam.split(',').forEach(arg => {
          const trimmed = arg.trim()
          if (trimmed) extraArgsFromUrl.push(trimmed)
        })
      } catch (e) {}
    }

    const portsToInject: Record<string, string> = {}
    let idx = 0
    while (idx < extraArgsFromUrl.length) {
      const arg = extraArgsFromUrl[idx]
      if (arg === '-port') {
        if (idx + 2 < extraArgsFromUrl.length) {
          const tag = extraArgsFromUrl[idx + 1]
          const val = extraArgsFromUrl[idx + 2]
          portsToInject[tag] = val
          idx += 3
        } else {
          idx += 1
        }
      } else if (arg === '-monitor' || arg === '-cfg') {
        if (idx + 1 < extraArgsFromUrl.length) {
          const monitorVal = extraArgsFromUrl[idx + 1].toLowerCase()
          let valStr = '3'
          if (monitorVal === 'video7' || monitorVal === 'video-7' || monitorVal === '3' || monitorVal.includes('video7') || monitorVal === 'rgb') {
            valStr = '3'
          } else if (monitorVal === 'color' || monitorVal === '0') {
            valStr = '0'
          } else if (monitorVal === 'mono' || monitorVal === 'monochrome' || monitorVal === 'green' || monitorVal === '1') {
            valStr = '1'
          } else if (monitorVal === 'amber' || monitorVal === '2') {
            valStr = '2'
          } else if (!isNaN(Number(monitorVal))) {
            valStr = monitorVal
          }
          
          portsToInject[':a2video:a2_video_config'] = valStr
          idx += 2
        } else {
          idx += 1
        }
      } else {
        idx++
      }
    }

    if (Object.keys(portsToInject).length > 0) {
      let mergedCfg = injectPortsIntoXml(saved, portsToInject)
      // Ensure the system name matches currentMachineName after URL ports injection
      mergedCfg = updateSystemNameInXml(mergedCfg, currentMachineName)
      localStorage.setItem('ample_cfg_' + currentMachineName, mergedCfg)
      setEditorCfgText(mergedCfg)
      
      // Keep the extra parameter in the URL query string for persistence/sharing as requested
    } else {
      // Ensure the corrected XML is saved back to localStorage under currentMachineName for seamless synchronization
      localStorage.setItem('ample_cfg_' + currentMachineName, saved)
      setEditorCfgText(saved)
    }
  }, [currentMachineName, currentMameDriver])
  const [machineTab, setMachineTab] = useState<'slots' | 'media' | 'logs' | 'ai'>(() => {
    return (localStorage.getItem('ample-machine-tab') as any) || 'slots'
  })


  // Persist tabs
  useEffect(() => {
    localStorage.setItem('ample-system-tab', systemTab)
  }, [systemTab])

  useEffect(() => {
    localStorage.setItem('ample-machine-tab', machineTab)
  }, [machineTab])

  // Persistence of AI settings
  useEffect(() => {
    localStorage.setItem('ample-ai-provider', aiProvider)
  }, [aiProvider])

  useEffect(() => {
    localStorage.setItem('ample-ai-apikey', aiApiKey)
  }, [aiApiKey])

  useEffect(() => {
    localStorage.setItem('ample-ai-prompt', aiSystemPrompt)
  }, [aiSystemPrompt])

  useEffect(() => {
    localStorage.setItem('ample-ai-tickrate', String(aiTickRate))
  }, [aiTickRate])

  useEffect(() => {
    localStorage.setItem('ample-ai-chardelay', String(aiCharDelay))
  }, [aiCharDelay])

  // Helper to add AI logs
  const addAiLog = useCallback((text: string) => {
    setAiLogs(prev => [...prev.slice(-49), { text, ts: Date.now() }])
  }, [])

  // AI Agent Main Logic
  const runAiTick = useCallback(async () => {
    if (aiIsProcessingRef.current) return
    const canvas = document.getElementById('canvas') as HTMLCanvasElement | null
    if (!canvas) {
      addAiLog('Error: Emulator canvas not found')
      return
    }

    try {
      aiIsProcessingRef.current = true
      setAiStatus('thinking')
      setAiError(null)
      addAiLog('Capturing emulator screen...')
      
      const imgData = captureScreen(canvas)
      setAiLastScreenshot(imgData)

      if (!imgData) {
        throw new Error('Screenshot returned empty data')
      }

      addAiLog(`Calling LLM API (${aiProvider})...`)
      let command = ''

      if (aiProvider === 'mock') {
        command = await callMockLLM()
      } else {
        if (!aiApiKey) {
          throw new Error(`API key is required for ${aiProvider}`)
        }
        command = await callRealLLM(aiProvider, aiApiKey, aiSystemPrompt, imgData)
      }

      if (!command) {
        addAiLog('AI returned empty command. Skipping typing.')
        setAiStatus('idle')
        aiIsProcessingRef.current = false
        return
      }

      addAiLog(`AI Command received: "${command}"`)
      setAiStatus('typing')

      await sendTextCommand(command, canvas, aiCharDelay)
      addAiLog(`Successfully typed command: "${command}"`)
      setAiStatus('idle')
    } catch (e: any) {
      console.error('[AI Tick Error]', e)
      const errorMsg = e.message || String(e)
      setAiError(errorMsg)
      setAiStatus('error')
      addAiLog(`Error: ${errorMsg}`)
    } finally {
      aiIsProcessingRef.current = false
    }
  }, [launchState, aiProvider, aiApiKey, aiSystemPrompt, aiCharDelay, addAiLog])

  // AI Loop Effect
  useEffect(() => {
    if (aiEnabled && launchState === 'running') {
      addAiLog('AI Agent Enabled - Starting loop')
      if (aiProvider === 'mock') {
        resetMockController()
      }

      // Initial tick
      const initialTimer = setTimeout(() => {
        runAiTick()
      }, 1000)

      // Interval ticks
      aiTimerRef.current = setInterval(() => {
        runAiTick()
      }, aiTickRate * 1000)

      return () => {
        clearTimeout(initialTimer)
        if (aiTimerRef.current) {
          clearInterval(aiTimerRef.current)
          aiTimerRef.current = null
        }
        addAiLog('AI Agent Disabled - Loop stopped')
        setAiStatus('idle')
      }
    } else {
      if (aiTimerRef.current) {
        clearInterval(aiTimerRef.current)
        aiTimerRef.current = null
      }
      setAiStatus('idle')
    }
  }, [aiEnabled, launchState, aiTickRate, runAiTick, aiProvider, addAiLog])


  // Collapse sidebars when transitioning to mobile mode (<= 800px)
  useEffect(() => {
    let prevWidth = window.innerWidth
    const handleResize = () => {
      const currentWidth = window.innerWidth
      if (currentWidth <= 800 && prevWidth > 800) {
        setIsLeftSidebarOpen(false)
        setIsRightSidebarOpen(false)
      }
      prevWidth = currentWidth
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Force MAME to recalculate window/canvas scaling when sidebars toggle
  useEffect(() => {
    // Wait a brief moment for DOM layout to settle
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [isLeftSidebarOpen, isRightSidebarOpen])

  const [mediaFiles, setMediaFiles] = useState<Record<string, File | null>>({})
  const logEndRef = useRef<HTMLDivElement>(null)
  const localDirHandleRef = useRef<any>(null)
  const hasAutoLaunched = useRef(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const mountTimeRef = useRef<number>(0)

  const getMachineFamily = useCallback((machineName: string): string => {
    const lowerName = machineName.toLowerCase();

    // Apple II & Clones
    if (['apple3', 'apple1', 'apple2', 'apple', 'ace', 'basis', 'cec', 'agat', 'prav8', 'laser', 'tk2000', 'f108', 'space84', 'albert', 'mprof3'].some(f => lowerName.startsWith(f))) {
      if (lowerName.startsWith('apple3')) return 'apple3';
      if (lowerName.startsWith('apple1')) return 'apple1';
      return 'apple2'; // General Apple II / Clones
    }

    if (lowerName.startsWith('mac')) return 'mac';
    if (['coco', 'trs80', 'mc10', 'dragon'].some(f => lowerName.startsWith(f))) return 'tandy';
    if (['st', 'megast', 'spectred'].some(f => lowerName.startsWith(f))) return 'atarist';
    if (['bbc', 'electron'].some(f => lowerName.startsWith(f))) return 'acorn';
    if (lowerName.startsWith('c64') || lowerName.startsWith('c128') || lowerName.startsWith('vic20')) return 'commodore';
    if (['oric', 'telstrat'].some(f => lowerName.startsWith(f))) return 'oric';

    return 'other';
  }, []);

  // Detect available WASM on mount (legacy display only)
  const [wasmTarget] = useState(() => {
    for (const [emu, info] of Object.entries(EMULATOR_WASM_MAP)) {
      if (_wasmExists(info.wasm)) return emu
    }
    return 'none'
  })

  // ── Canvas Scaling ──
  useEffect(() => {
    if (!videoSettings || launchState !== 'running') return
    const c = document.getElementById('canvas') as HTMLCanvasElement | null
    if (!c) return

    const applyScale = (shouldDispatch = false) => {
      if (videoSettings.windowMode === 'fit') {
        c.style.width = '100%'
        c.style.height = '100%'
        c.style.objectFit = 'contain'
        c.style.transform = ''
        c.style.imageRendering = 'auto' // Smooth for high-res fit
        if (shouldDispatch) {
          window.dispatchEvent(new Event('resize'))
        }
        return
      }

      let baseW = c.width
      let baseH = c.height

      if (machineConfig?.resolution && machineConfig.resolution[0] > 0) {
        baseW = machineConfig.resolution[0]
        baseH = machineConfig.resolution[1]
      }

      let scale = 1
      if (videoSettings.windowMode === 'integer-fit') {
        const container = canvasContainerRef.current
        if (container && baseW > 0 && baseH > 0) {
          const containerW = container.clientWidth
          const containerH = container.clientHeight
          const scaleW = Math.floor(containerW / baseW)
          const scaleH = Math.floor(containerH / baseH)
          scale = Math.max(1, Math.min(scaleW, scaleH))
        }
      } else {
        scale = parseInt(videoSettings.windowMode) || 1
      }

      if (baseW > 0 && baseH > 0) {
        c.style.width = `${baseW * scale}px`
        c.style.height = `${baseH * scale}px`
        c.style.objectFit = 'contain'
        c.style.transform = ''
        c.style.imageRendering = 'pixelated' // Sharp for fixed scale
        if (shouldDispatch) {
          window.dispatchEvent(new Event('resize'))
        }
      }
    }

    // Handle window resize events
    const onWindowResize = () => {
      if (videoSettings.windowMode === 'fit' || videoSettings.windowMode === 'integer-fit') {
        applyScale(true)
      }
    }

    // Apply immediately and dispatch ONCE when mode changes
    applyScale(true)

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && (m.attributeName === 'width' || m.attributeName === 'height')) {
          applyScale(false)
        }
      }
    })

    observer.observe(c, { attributes: true })
    window.addEventListener('resize', onWindowResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
      c.style.width = ''
      c.style.height = ''
      c.style.objectFit = ''
      c.style.transform = ''
      c.style.imageRendering = ''
    }
  }, [videoSettings?.windowMode, launchState, machineConfig])

  // ── Mouse Capture ──
  useEffect(() => {
    if (!videoSettings || !videoSettings.captureMouse || launchState !== 'running') return
    const c = document.getElementById('canvas') as HTMLCanvasElement | null
    if (!c) return

    const onClick = () => {
      try { c.requestPointerLock() } catch (e) { console.warn('Pointer lock failed:', e) }
    }
    c.addEventListener('mousedown', onClick)
    return () => c.removeEventListener('mousedown', onClick)
  }, [videoSettings?.captureMouse, launchState])

  // ── Sidebar resize ──
  useEffect(() => {
    if (!isSidebarResizing) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(200, Math.min(500, e.clientX))
      setSidebarWidth(w)
      window.dispatchEvent(new Event('resize'))
    }
    const onUp = () => {
      setIsSidebarResizing(false)
      window.dispatchEvent(new Event('resize'))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isSidebarResizing])

  // ── Config area resize ──
  useEffect(() => {
    if (!isConfigResizing) return
    const onMove = (e: MouseEvent) => {
      // config width from right edge of viewport
      const rightEdge = window.innerWidth - e.clientX
      const w = Math.max(200, Math.min(800, rightEdge))
      setConfigWidth(w)
      window.dispatchEvent(new Event('resize'))
    }
    const onUp = () => {
      setIsConfigResizing(false)
      window.dispatchEvent(new Event('resize'))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isConfigResizing])

  // ── Config area vertical resize ──
  useEffect(() => {
    if (!isConfigVResizing) return
    const onMove = (e: MouseEvent) => {
      // The config-area spans the full height of the window, so clientY is the exact height needed.
      const h = Math.max(150, e.clientY)
      setConfigTopHeight(Math.min(window.innerHeight - 200, h))
    }
    const onUp = () => {
      setIsConfigVResizing(false)
      localStorage.setItem('ample-config-top-height', String(configTopHeight))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isConfigVResizing, configTopHeight])

  const addLog = useCallback((text: string, isError: boolean) => {
    setLogs(prev => {
      const next = [...prev, { text, isError, ts: Date.now() }]
      return next.length > 500 ? next.slice(next.length - 500) : next
    })
  }, [])

  const fillSlotDefaults = useCallback((slots: Slot[], currentValues: Record<string, string>, devices?: Device[], parentPath = '') => {
    const next = { ...currentValues }
    const walk = (sList: Slot[], pathPrefix = '') => {
      if (!Array.isArray(sList)) return
      sList.forEach(s => {
        let fullPath = s.name
        if (pathPrefix) {
          fullPath = s.name.startsWith(':') ? `${pathPrefix}${s.name}` : `${pathPrefix}:${s.name}`
        }

        let val = next[fullPath]
        const option = s.options?.find((o: SlotOption) => o.value === val) || s.options?.find((o: SlotOption) => o.default)
        if (option) {
          next[fullPath] = option.value
          // Avoid trailing colon if option.value is empty
          const nextPrefix = option.value ? `${fullPath}:${option.value}` : fullPath
          if (Array.isArray(option.slots)) walk(option.slots, nextPrefix)
          if (option.devname && devices) {
            const dev = devices.find((d: Device) => d.name === option.devname)
            if (dev && Array.isArray(dev.slots)) walk(dev.slots, nextPrefix)
          }
        }
      })
    }
    walk(slots, parentPath)
    return next
  }, [])

  const doSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
    setAiEnabled(false)
    if (selectedMachine && selectedMachine.name !== machine.name) {

      // Clear all media and custom slots if switching machines
      setMediaFiles({})
      for (let i = 1; i <= 16; i++) {
        dataManager.clearMedia(`flop${i}`)
        dataManager.clearMedia(`hard${i}`)
        dataManager.clearMedia(`cdrom${i}`)
      }
      addLog(`Machine changed to ${machine.name}: Media and slot settings reset`, false)
    }

    setSelectedMachine(machine)
    setErrorText(null)
    setStatusText('')
    setLaunchState('idle')
    const config = await dataManager.loadMachine(machine.name)
    setMachineConfig(config)
    if (config) {
      const defaults = fillSlotDefaults(config.slots, {}, config.devices)
      setSlotValues(defaults)
    }
  }, [fillSlotDefaults, selectedMachine, addLog])

  const handleSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
    doSelectMachine(machine)
  }, [doSelectMachine])

  const fetchAllRoms = useCallback(async (machineName: string, effectiveDriver: string, configOverride?: MachineConfig | null, slotsOverride?: Record<string, string>): Promise<RomFile[]> => {
    const romFiles: RomFile[] = []

    // 1. Main machine ROM — look up from DRIVER_ROM_MAP
    const rawMapValue = DRIVER_ROM_MAP[machineName] || (machineName.startsWith('apple2gs') ? DRIVER_ROM_MAP['apple2gs_shared'] : null)
    const romFilesToFetch = rawMapValue ? rawMapValue.split(';') : [machineName + '.zip']

    for (const romFile of romFilesToFetch) {
      try {
        const url = `${BASE_URL}roms/${romFile}`
        // We associate the ROM with effectiveDriver so MAME (running as effectiveDriver) can find it
        const rom = await fetchRom(url, effectiveDriver, romFile)

        // TorrentZip check
        if (rom.data.length >= 48) {
          const raw = rom.data
          const end = raw.length
          const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
          if (view.getUint32(end - 4, true) === 0x506b0708) {
            const cleaned = new Uint8Array(end - 40)
            cleaned.set(raw.subarray(0, end - 40))
            rom.data = cleaned
          }
        }
        romFiles.push(rom)
        addLog(`ROM: ${romFile} (${(rom.data.length / 1024).toFixed(0)} KB)`, false)
      } catch {
        // Fallback: try auto-download servers if configured
        if (romSettings.autoDownload && romSettings.downloadServers.length > 0) {
          let found = false
          for (const server of romSettings.downloadServers) {
            try {
              const downloadUrl = server.replace('{filename}', romFile)
              addLog(`Attempting download: ${downloadUrl}`, false)
              const rom = await fetchRom(downloadUrl, effectiveDriver, romFile)
              romFiles.push(rom)
              addLog(`Downloaded: ${romFile} from ${server}`, false)
              found = true
              break
            } catch {
              continue
            }
          }
          if (!found) addLog(`ROM not found: ${romFile}`, true)
        } else {
          addLog(`ROM not found: ${romFile}`, true)
        }
      }
    }

    const driverName = machineName

    // 2. Auxiliary ROMs for Apple II family (apple2, apple2p, apple2e*)
    // MAME needs sc01a.bin (votrax), 341-0027-a.p5 (a2diskiing), 341-0028-a.rom (d2fdc)
    // These are separate ROM sets. MAME identifies ROM sets by the ZIP filename.
    // MAME looks for a ZIP containing a file with the ROM set name (e.g., "votrax")
    // We need to create a ZIP with the file named after the ROM set, not the original filename.
    const auxRoms: Array<{ romSet: string; zipName: string; files: string[] }> = [
      { romSet: 'votrax', zipName: 'votrsc01a', files: ['sc01a.bin'] },
      { romSet: 'a2diskiing', zipName: 'a2diskiing', files: ['341-0027-a.p5'] },
      { romSet: 'd2fdc', zipName: 'd2fdc', files: ['341-0028-a.rom'] },
      { romSet: 'a2scsi', zipName: 'a2scsi', files: ['341-0437-a.bin'] },
      { romSet: 'a2cffa2', zipName: 'a2cffa2', files: ['cffa20eec02.bin'] },
      { romSet: 'a2cffa02', zipName: 'a2cffa02', files: ['cffa20ee02.bin'] },
      { romSet: 'apple2e', zipName: 'apple2e', files: ['342-0133-a.chr'] },
      { romSet: 'a3fdc', zipName: 'd2fdc', files: ['341-0028-a.rom'] },
      { romSet: 'a1cass', zipName: 'a1cass', files: ['apple-a3.3'] },
    ]
    // Broad check for Apple II/III family and clones
    const isApple2Family = driverName.startsWith('apple1') ||
      driverName.startsWith('apple2') ||
      driverName.startsWith('apple3') ||
      ['albert', 'am100', 'am64', 'basis108', 'craft2p', 'dodo', 'elppa', 'hkapple', 'mprof3', 'space84', 'spectre', 'tk2000', 'tk3000',
        'maxxi', 'hkc8800a', 'ivelultr', 'microeng', 'prav82', 'prav8c', 'prav8d', 'prav8m', 'uniap2en', 'uniap2pt', 'zijini',
        'cec2000', 'cece', 'cecg', 'ceci', 'cecm', 'ace100', 'ace500', 'ace1000', 'ace2200'].includes(driverName)

    const isMacFamily = driverName.startsWith('mac')

    if (isApple2Family || isMacFamily) {
      for (const aux of auxRoms) {
        try {
          const resp = await fetch(`${BASE_URL}roms/${aux.zipName}.zip`)
          if (resp.ok) {
            const data = new Uint8Array(await resp.arrayBuffer())
            // Directly push the ZIP with the expected MAME name (romSet)
            romFiles.push({
              driver: aux.romSet,
              name: `${aux.romSet}.zip`,
              data
            })
            addLog(`Aux: ${aux.romSet}.zip added`, false)
          }
        } catch {
          addLog(`Aux ROM skipped (optional): ${aux.zipName}.zip`, false)
        }
      }
    }

    // 3. Dynamic Slot ROMs - Check selected slots for additional devices
    const currentConfig = configOverride ?? machineConfig
    const currentSlotValues = slotsOverride ?? slotValues

    if (currentConfig) {
      const addedSlotRoms = new Set<string>()
      
      const checkSlots = (slots: Slot[], currentValues: Record<string, string>) => {
        for (const slot of slots) {
          const selectedValue = currentValues[slot.name]
          if (selectedValue) {
            const option = slot.options.find(o => o.value === selectedValue)
            if (option && option.devname) {
              addedSlotRoms.add(option.devname)
            }
            if (option && option.slots) {
              checkSlots(option.slots, currentValues)
            }
          }
        }
      }

      checkSlots(currentConfig.slots, currentSlotValues)
      if (currentConfig.devices) {
        currentConfig.devices.forEach(dev => checkSlots(dev.slots, currentSlotValues))
      }

      // 3.1 Handle Recursive Device Dependencies
      const finalDeviceList = new Set<string>()
      const resolveDeps = (devs: Set<string>) => {
        devs.forEach(d => {
          if (!finalDeviceList.has(d)) {
            finalDeviceList.add(d)
            const subDeps = DEVICE_DEPENDENCIES[d]
            if (subDeps) {
              subDeps.forEach(sd => finalDeviceList.add(sd))
            }
          }
        })
      }
      resolveDeps(addedSlotRoms)

      for (const devName of finalDeviceList) {
        try {
          addLog(`Slot ROM: ${devName}.zip requested...`, false)
          const url = `${BASE_URL}roms/${devName}.zip`
          const rom = await fetchRom(url, effectiveDriver, `${devName}.zip`)
          romFiles.push(rom)
          addLog(`Slot ROM: ${devName}.zip added`, false)
        } catch {
          // If not in local /roms, try auto-download servers
          if (romSettings.autoDownload && romSettings.downloadServers.length > 0) {
            let found = false
            for (const server of romSettings.downloadServers) {
              try {
                const downloadUrl = server.replace('{filename}', `${devName}.zip`)
                const rom = await fetchRom(downloadUrl, effectiveDriver, `${devName}.zip`)
                romFiles.push(rom)
                addLog(`Slot ROM Downloaded: ${devName}.zip from ${server}`, false)
                found = true
                break
              } catch { continue }
            }
            if (!found) addLog(`Slot ROM not found: ${devName}.zip`, false)
          } else {
            addLog(`Slot ROM skipped (missing): ${devName}.zip`, false)
          }
        }
      }
    }

    return romFiles
  }, [addLog, machineConfig, slotValues, romSettings])

  /**
   * Determine which emulator type a machine belongs to.
   * Maps machine driver names to emulator WASM files.
   */
  function getEmulatorForMachine(machineName: string): string | null {
    // We now use a unified MAME 0.287 engine ('mame.wasm') for all machines
    // to ensure ROM mapping consistency across all 150+ variants.
    const families = [
      'apple', 'ace', 'basis', 'cec', 'agat', 'prav8', 'laser', 'tk2000', 'f108', 'space84', 'albert', // Apple II / Clones
      'mac', // Macintosh
      'coco', 'trs80', 'dragon', 'mc10', // Tandy / TRS-80 / Dragon
      'st', 'megast', 'spectred', // Atari ST
      'bbc', 'electron', // Acorn
      'c64', // Commodore
      'oric', 'telstrat' // Oric
    ];

    const lowerName = machineName.toLowerCase();
    if (families.some(family => lowerName.startsWith(family))) {
      return 'mame';
    }

    // Final fallback: use the universal MAME engine for everything else
    return 'mame';
  }

  /**
   * Calculate effective media drives based on current machine config and slot selections.
   */
  const getEffectiveMedia = useCallback(() => {
    if (!machineConfig) return []

    const typeMap: Record<string, string> = {
      'floppy_5_25': '5.25" Floppy',
      'floppy_3_5': '3.5" Floppy',
      'hard': 'Hard Drive',
      'cdrom': 'CD-ROM',
      'cass': 'Cassette',
      'cassette': 'Cassette'
    }

    const mameBrief: Record<string, string> = {
      'floppy_5_25': 'flop',
      'floppy_3_5': 'flop',
      'hard': 'hard',
      'cdrom': 'cdrom',
      'cass': 'cass',
      'cassette': 'cass'
    }

    const results: { id: string; type: string; label: string; group: string }[] = []
    const briefCounts: Record<string, number> = {}

    const addMedia = (mameType: string, count: number) => {
      const brief = mameBrief[mameType] || 'media'
      const group = typeMap[mameType] || mameType
      for (let i = 0; i < count; i++) {
        const index = (briefCounts[brief] || 0) + 1
        briefCounts[brief] = index
        results.push({
          id: `${brief}${index}`,
          type: mameType,
          label: `${group} ${index}`,
          group: group
        })
      }
    }

    // Include root media
    Object.entries(machineConfig.media || {}).forEach(([mameType, count]) => {
      addMedia(mameType, count)
    })

    const collectMedia = (slots: Slot[], pathPrefix = '') => {
      if (!Array.isArray(slots)) return
      slots.forEach(slot => {
        let fullPath = slot.name
        if (pathPrefix) {
          fullPath = (pathPrefix.endsWith(':') || slot.name.startsWith(':'))
            ? `${pathPrefix}${slot.name}`.replace(/:+/g, ':')
            : `${pathPrefix}:${slot.name}`
        }

        const selectedValue = slotValues[fullPath]
        // Use undefined check instead of falsy check to allow empty string values
        if (selectedValue === undefined) return

        const option = slot.options?.find((o: SlotOption) => o.value === selectedValue)
        if (option) {
          if (option.media) {
            Object.entries(option.media).forEach(([mameType, count]: [string, number]) => {
              addMedia(mameType, count)
            })
          }
          const nextPath = selectedValue ? `${fullPath}:${selectedValue}` : fullPath
          if (Array.isArray(option.slots)) {
            collectMedia(option.slots, nextPath)
          }
          if (option.devname && machineConfig.devices) {
            const dev = machineConfig.devices.find((d: Device) => d.name === option.devname)
            if (dev && Array.isArray(dev.slots)) {
              collectMedia(dev.slots, nextPath)
            }
          }
        }
      })
    }

    collectMedia(machineConfig.slots)

    // Force 5.25" floppy drives for CEC machines if they didn't appear
    if (selectedMachine?.name.startsWith('cec') && !results.some(r => r.type === 'floppy_5_25')) {
      addMedia('floppy_5_25', 2)
    }

    return results
  }, [machineConfig, slotValues, selectedMachine])

  /**
   * Main launch sequence:
   * 1. determine emulator type from machine
   * 2. fetch ROM ZIP files
   * 3. load the correct WASM (per-emulator)
   * 4. preRun writes ZIPs to VFS → MAME auto-starts
   */
  const doLaunch = useCallback(async (
    machine: { name: string; description: string },
    slotsParam?: Record<string, string>,
    mediaParam?: Record<string, File | null>,
    configParam?: MachineConfig | null
  ) => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)
    mountTimeRef.current = Date.now()

    // Clear old canvas if it exists
    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = ''
    }

    // Step 0: determine emulator type
    const emulator = getEmulatorForMachine(machine.name)
    if (!emulator) {
      setErrorText(`No emulator support for machine: ${machine.name}`)
      setLaunchState('error')
      addLog(`Error: no emulator for ${machine.name}`, true)
      return
    }

    const wasmInfo = getWasmForEmulator(emulator, machine.name)
    if (!wasmInfo) {
      setErrorText(`No WASM file available for ${emulator}.\nPlace ${emulator}.wasm or ${machine.name}.wasm in public/wasm/`)
      setLaunchState('error')
      addLog(`Error: no WASM for ${emulator} / ${machine.name}`, true)
      return
    }

    // Use emulator-appropriate resolution with hierarchical lookup
    const machineFamily = getMachineFamily(machine.name)
    const driverName = DRIVER_MAP[machine.name] || ''
    const resolution = DEFAULT_RESOLUTIONS[machine.name] || 
                       DEFAULT_RESOLUTIONS[driverName] || 
                       DEFAULT_RESOLUTIONS[machineFamily] || 
                       '640x480'
    
    // Resolve MAME driver name (e.g. mac128k → mac)
    const mameDriver = driverName || wasmInfo.driver

    // Step 1: fetch ROMs
    setLaunchState('fetching-rom')
    setStatusText('Fetching ROM...')

    let romFiles: RomFile[] = []
    try {
      romFiles = await fetchAllRoms(machine.name, mameDriver, configParam, slotsParam)
    } catch (e) {
      addLog(`ROM fetch failed: ${e}`, true)
    }

    // Step 2: load WASM
    setLaunchState('loading-wasm')
    const wasmUrl = `${BASE_URL}wasm/${wasmInfo.wasm}`
    addLog(`Using ${BASE_URL}wasm/${wasmInfo.wasm} (emulator: ${emulator}, driver: ${wasmInfo.driver})`, false)

    // 3. Prepare media files
    const finalMedia = mediaParam ?? mediaFiles
    const mediaList: MediaFile[] = []
    for (const [id, file] of Object.entries(finalMedia)) {
      if (file) {
        try {
          const data = await readFileAsArrayBuffer(file)
          mediaList.push({
            name: file.name,
            data,
            type: id, // e.g. "flop1"
          })
        } catch (e) {
          console.error(`Failed to read media file ${file.name}:`, e)
        }
      }
    }

    // 3b. Fetch samples if enabled
    let sampleList: RomFile[] = []
    if (avSettings?.diskSound) {
      setStatusText('Fetching samples...')
      sampleList = await fetchAllSamples()
      addLog(`Fetched ${sampleList.length} sound samples`, false)
    }

    // 4. Build MAME args
    const finalSlots = slotsParam ?? slotValues

    // Build a rompath that includes all fetched ZIPs so MAME can find regional files
    const romPaths = romFiles.map(rf => `/roms/${rf.name}`)
    romPaths.push('/roms')
    const romPathArg = romPaths.join(';')

    // Separate generic slots from special parameters like ramsize and media drives
    const filteredSlots: Record<string, string> = {}
    let ramsizeArg: string | null = null

    // We need to traverse the machine config to know which "slots" are actually slots
    const isMediaSlot = (path: string) => {
      // If the path ends with a numeric subslot (like :0, :1, :2, :3) it's a media drive.
      // Also catch anything ending in :[digit]
      return /:[0-9]+$/.test(path)
    }

    const defaultSlots = (configParam ?? machineConfig)
      ? fillSlotDefaults((configParam ?? machineConfig)!.slots, {}, (configParam ?? machineConfig)!.devices)
      : {}

    for (const [path, value] of Object.entries(finalSlots)) {
      if (path === 'ramsize') {
        ramsizeArg = value
        continue
      }
      // If it's a media drive slot (like sl6:0), don't pass as a slot argument
      // MAME usually handles these via -flop1, etc.
      if (isMediaSlot(path)) continue

      // KEY FIX: If slot value is empty (""), only pass it to MAME if the slot's default
      // was NOT empty. This prevents disabling MAME's critical internal default motherboard devices
      // (like 'smartport' on apple2gs or floppy controllers) when they default to empty in the UI plist.
      if (value === '') {
        const defaultValue = defaultSlots[path] || ''
        if (defaultValue === '') {
          continue
        }
      }

      filteredSlots[path] = value
    }

    // Read arbitrary extra MAME parameters from URL (e.g. ?extra=-monitor,video7)
    const urlParams = new URLSearchParams(window.location.search)
    const extraParam = urlParams.get('extra') || urlParams.get('?extra')
    const extraArgsFromUrl: string[] = []
    if (extraParam) {
      try {
        extraParam.split(',').forEach(arg => {
          const trimmed = arg.trim()
          if (trimmed) extraArgsFromUrl.push(trimmed)
        })
      } catch (e) {}
    }

    const portsToInject: Record<string, string> = {}
    let idx = 0
    while (idx < extraArgsFromUrl.length) {
      const arg = extraArgsFromUrl[idx]
      if (arg === '-port') {
        if (idx + 2 < extraArgsFromUrl.length) {
          const tag = extraArgsFromUrl[idx + 1]
          const val = extraArgsFromUrl[idx + 2]
          portsToInject[tag] = val
          extraArgsFromUrl.splice(idx, 3)
        } else {
          extraArgsFromUrl.splice(idx, 1)
        }
      } else if (arg === '-monitor' || arg === '-cfg') {
        if (idx + 1 < extraArgsFromUrl.length) {
          const monitorVal = extraArgsFromUrl[idx + 1].toLowerCase()
          let valStr = '3'
          if (monitorVal === 'video7' || monitorVal === 'video-7' || monitorVal === '3' || monitorVal.includes('video7') || monitorVal === 'rgb') {
            valStr = '3'
          } else if (monitorVal === 'color' || monitorVal === '0') {
            valStr = '0'
          } else if (monitorVal === 'mono' || monitorVal === 'monochrome' || monitorVal === 'green' || monitorVal === '1') {
            valStr = '1'
          } else if (monitorVal === 'amber' || monitorVal === '2') {
            valStr = '2'
          } else if (!isNaN(Number(monitorVal))) {
            valStr = monitorVal
          } else {
            valStr = monitorVal.startsWith('-') ? '3' : '3'
          }
          
          portsToInject[':a2video:a2_video_config'] = valStr

          if (!extraArgsFromUrl[idx + 1].startsWith('-')) {
            extraArgsFromUrl.splice(idx, 2)
          } else {
            extraArgsFromUrl.splice(idx, 1)
          }
        } else {
          extraArgsFromUrl.splice(idx, 1)
        }
      } else {
        idx++
      }
    }

    let savedCfg = localStorage.getItem('ample_cfg_' + machine.name) || getDefaultCfgTemplate(mameDriver)
    // Ensure the system name is fully aligned with mameDriver before writing to VFS
    savedCfg = updateSystemNameInXml(savedCfg, mameDriver)
    const finalCfgContent = updateSystemNameInXml(injectPortsIntoXml(savedCfg, portsToInject), mameDriver)
    const cfgFiles: Array<{ name: string; data: string }> = [
      {
        name: `${mameDriver}.cfg`,
        data: finalCfgContent
      }
    ]

    console.log('[App.tsx] extraParam is:', extraParam)
    console.log('[App.tsx] parsed extraArgsFromUrl:', extraArgsFromUrl)
    console.log('[App.tsx] generated cfgFiles:', cfgFiles)

    const currentVideoSettings = useStore.getState().videoSettings
    const args = buildMameArgs(mameDriver, {
      slots: filteredSlots,
      cpuSpeed: cpuSettings?.speed,
      debug: false, // Disabled as requested
      rewind: cpuSettings?.rewind,
      aviWrite: avSettings?.generateAvi,
      wavWrite: avSettings?.generateWav,
      videoMethod: currentVideoSettings?.videoMethod,
      bgfxBackend: currentVideoSettings?.bgfxBackend,
      bgfxEffect: currentVideoSettings?.bgfxEffect,
      keepAspect: currentVideoSettings?.keepAspect,
      diskSound: avSettings?.diskSound,
      extraArgs: [
        '-verbose',
        '-cfg_directory', 'cfg',
        ...(ramsizeArg ? ['-ramsize', ramsizeArg] : []),
        '-resolution', resolution,
        '-rompath', romPathArg,
        ...(mediaList.map(m => [`-${m.type}`, `/media/${m.name}`]).flat()),
        ...extraArgsFromUrl
      ]
    })
    addLog(`args: ${args.join(' ')}`, false)
    console.log('[WasmLoader] Launching with localDirHandle:', pathSettings?.mapLocalDir ? localDirHandleRef.current : 'null (mapLocalDir is false or handle missing)')

    // Crucial: Request permission HERE (user gesture context) before WASM starts
    if (pathSettings?.mapLocalDir && localDirHandleRef.current) {
      try {
        const handle = localDirHandleRef.current as FileSystemDirectoryHandle
        const permission = await (handle as any).queryPermission({ mode: 'readwrite' })
        if (permission !== 'granted') {
          addLog(`Requesting permission for local directory: ${handle.name}`, false)
          const result = await (handle as any).requestPermission({ mode: 'readwrite' })
          if (result !== 'granted') {
            addLog(`Permission denied for local directory: ${handle.name}`, true)
          }
        }
      } catch (e: any) {
        console.error('Permission request failed:', e)
        addLog(`Permission error: ${e.message}`, true)
      }
    }

    try {
      /* const _module = */ await loadMameWasm(wasmUrl, {
        driverArgs: args,
        romFiles: romFiles,
        mediaFiles: mediaList,
        sampleFiles: sampleList,
        cfgFiles: cfgFiles,
        jsUrl: `${BASE_URL}wasm/${wasmInfo.js}`,
        localDirHandle: pathSettings?.mapLocalDir ? localDirHandleRef.current : undefined,
        onProgress: (loaded, total) => {
          if (total > 0) {
            const pct = Math.round((loaded / total) * 100)
            setWasmProgress(pct)
            setStatusText(`Loading machine... ${pct}%`)
          }
        },
        onError: (err) => {
          setErrorText(err)
          setLaunchState('error')
          addLog(`Error: ${err}`, true)
        },
        onLog: addLog,
        // onStart fires in onRuntimeInitialized — the exact moment MAME starts
        // its game loop (audio + video together). Reveal canvas here for sync.
        onStart: () => {
          setLaunchState('running')
        },
        onReady: (m) => {
          // Canvas is already in #canvas-host from wasm_loader init; appendChild is idempotent.
          // Do NOT set width/height here — the canvas scaling effect (MutationObserver) owns
          // all size management. Setting 100% here would override the correct 1x pixel size.
          if (m.canvas && canvasContainerRef.current) {
            canvasContainerRef.current.appendChild(m.canvas)
            m.canvas.style.display = 'block'
          }

          // VFS Diagnostic Check
          try {
            const FS = (window as any).FS
            if (FS) {
              const cwd = FS.cwd ? FS.cwd() : '/'
              console.log('[VFS Diagnostic] Current working directory (FS.cwd()):', cwd)
              
              const absPath = `/cfg/${mameDriver}.cfg`
              const relPath = `cfg/${mameDriver}.cfg`
              const cwdAbsPath = `${cwd}/cfg/${mameDriver}.cfg`
              
              console.log('[VFS Diagnostic] Absolute path exists?', FS.analyzePath(absPath).exists)
              console.log('[VFS Diagnostic] Relative path exists?', FS.analyzePath(relPath).exists)
              console.log('[VFS Diagnostic] CWD absolute path exists?', FS.analyzePath(cwdAbsPath).exists)

              if (FS.analyzePath(relPath).exists) {
                const content = FS.readFile(relPath, { encoding: 'utf8' })
                console.log('[VFS Diagnostic] Content of relative cfg:', content)
              } else if (FS.analyzePath(absPath).exists) {
                const content = FS.readFile(absPath, { encoding: 'utf8' })
                console.log('[VFS Diagnostic] Content of absolute cfg:', content)
              } else if (FS.analyzePath(cwdAbsPath).exists) {
                const content = FS.readFile(cwdAbsPath, { encoding: 'utf8' })
                console.log('[VFS Diagnostic] Content of CWD absolute cfg:', content)
              }
            } else {
              console.warn('[VFS Diagnostic] FS object not found on window!')
            }
          } catch (e) {
            console.error('[VFS Diagnostic] Error performing diagnostic:', e)
          }

          setWasmModule(m)
          if (NOT_WORKING_MACHINES.includes(machine.name)) {
            setStatusText('This machine may not work...')
          } else if (SLOW_BOOT_MACHINES.includes(machine.name)) {
            setStatusText('This takes longer time to boot...')
            setTimeout(() => setStatusText(''), 10000)
          } else {
            setStatusText('')
          }
        }
      })
    } catch (e: any) {
      const msg = e.message || String(e)
      setErrorText(msg)
      setLaunchState('error')
      addLog(`Fatal: ${msg}`, true)
    }
  }, [wasmTarget, addLog, fetchAllRoms, mediaFiles, slotValues, videoSettings, cpuSettings, avSettings, pathSettings])

  const handleLaunch = useCallback(async () => {
    if (!selectedMachine) return

    // If local mapping is enabled but handle is missing (e.g. after refresh), 
    // force reconnect now while we still have the user gesture context!
    if (pathSettings?.mapLocalDir && !localDirHandleRef.current) {
      addLog('Local directory mapping enabled but folder needs reconnection...', false)
      try {
        // @ts-ignore
        const handle = await window.showDirectoryPicker()
        setPathSettings({ mapLocalDir: true, localDirPath: handle.name })
        localDirHandleRef.current = handle
        addLog(`Reconnected: ${handle.name}`, false)
      } catch (e: any) {
        addLog(`Failed to reconnect folder: ${e.message}`, true)
        // If we were auto-launching, we can't show picker, so we just log error.
        // But if this was a manual click, the user sees why it didn't start.
        return // Abort launch
      }
    }

    // If already running, refresh the whole page to ensure a clean state
    if (wasmModule) {
      const url = new URL(window.location.href)
      url.searchParams.set('m', selectedMachine.name)
      url.searchParams.set('d', selectedMachine.description)
      url.searchParams.set('autoboot', '0')
      window.location.href = url.toString()
      return
    }

    doLaunch(selectedMachine, slotValues, mediaFiles, machineConfig)
  }, [selectedMachine, wasmModule, doLaunch, pathSettings, localDirHandleRef, addLog, slotValues, mediaFiles, machineConfig])

  const handleStop = useCallback(() => {
    // Reloading is the most reliable way to reset MAME WASM state.
    // Before reloading, strip the 'autoboot' parameter from the URL
    // so it doesn't immediately boot back up after the page refresh.
    const url = new URL(window.location.href)
    url.searchParams.delete('autoboot')
    window.location.href = url.toString()
  }, [])

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setSelectedMachine(null)
    setSlotValues({})
    setLastMedia({})
    setMediaFiles({})
    // Navigate to root without parameters
    window.location.href = BASE_URL
  }, [setSelectedMachine, setSlotValues, setLastMedia, setMediaFiles])

  const handleZipFile = async (file: File): Promise<File> => {
    if (!file.name.toLowerCase().endsWith('.zip')) return file
    // @ts-ignore
    const JSZip = window.JSZip
    if (!JSZip) {
      addLog('JSZip not loaded yet, skipping unzip', true)
      return file
    }
    try {
      addLog(`Unzipping ${file.name}...`, false)
      const zip = await JSZip.loadAsync(file)
      const diskExts = ['.dsk', '.do', '.po', '.nib', '.2mg', '.hdv', '.img', '.woz', '.chd', '.iso', '.toast']
      let diskFile: any = null
      let diskName = ''

      zip.forEach((relativePath: string, file: any) => {
        if (!diskFile && !file.dir) {
          const lower = relativePath.toLowerCase()
          if (diskExts.some(ext => lower.endsWith(ext))) {
            diskFile = file
            diskName = relativePath.split('/').pop() || 'disk.dsk'
          }
        }
      })

      if (diskFile) {
        const content = await diskFile.async('blob')
        addLog(`Extracted: ${diskName}`, false)
        return new File([content], diskName)
      } else {
        addLog('No disk image found in ZIP, using raw ZIP', true)
        return file
      }
    } catch (e: any) {
      addLog(`Zip error: ${e.message}`, true)
      return file
    }
  }

  const saveFileToLocal = useCallback(async (filename: string, data: Uint8Array) => {
    try {
      // @ts-ignore
      if ((window as any).showSaveFilePicker) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
        })
        const writable = await handle.createWritable()
        await writable.write(data)
        await writable.close()
        addLog(`Saved ${filename} to local filesystem`, false)
      } else {
        const blob = new Blob([data], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        addLog(`Downloaded ${filename}`, false)
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addLog(`Save failed: ${e.message}`, true)
      }
      throw e
    }
  }, [addLog])

  const checkAndPromptSaveDisk = useCallback(async (slotId: string): Promise<boolean> => {
    const file = mediaFiles[slotId]
    if (!file) return true

    if (launchState === 'running') {
      const virtualPath = `/media/${file.name}`
      const stat = getVirtualFileStat(virtualPath)
      
      if (stat) {
        const data = getVirtualFile(virtualPath)
        if (data) {
          const mtime = stat.mtime?.getTime ? stat.mtime.getTime() : (Number(stat.mtime) * 1000)
          if (mtime > mountTimeRef.current) {
            const save = window.confirm(`Disk "${file.name}" has been modified. Save back to local before changing/ejecting?`)
            if (save) {
              try {
                await saveFileToLocal(file.name, data)
                addLog(`Saved modified disk "${file.name}" back to local successfully.`, false)
                return true
              } catch (e: any) {
                if (e.name !== 'AbortError') {
                  addLog(`Save failed: ${e.message}`, true)
                  const continueAnyway = window.confirm(`Failed to save disk. Abandon changes and proceed?`)
                  return continueAnyway
                } else {
                  return false
                }
              }
            } else {
              const abandon = window.confirm(`Abandon changes and proceed?`)
              return abandon
            }
          }
        }
      }
    }
    return true
  }, [mediaFiles, launchState, saveFileToLocal, addLog])

  const handleEject = useCallback(async (slotId: string) => {
    const proceed = await checkAndPromptSaveDisk(slotId)
    if (!proceed) return

    setMediaFiles(prev => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
    dataManager.clearMedia(slotId)
    removeMediaUrl(slotId)
  }, [checkAndPromptSaveDisk, removeMediaUrl])

  const handleInsertUrl = useCallback(async (id: string) => {
    const proceed = await checkAndPromptSaveDisk(id)
    if (!proceed) return

    const url = prompt('Enter disk image URL (supports .zip, .dsk, .do, .po, etc.):')
    if (!url || !url.trim()) return

    try {
      addLog(`Downloading media from URL: ${url}...`, false)
      let resp: Response | null = null
      
      try {
        resp = await fetch(url)
      } catch (e) {}

      if (!resp || !resp.ok) {
        addLog(`Direct fetch failed (CORS?), trying corsfix...`, false)
        try {
          resp = await fetch(`https://proxy.corsfix.com/?${url}`)
        } catch (e) { resp = null }
      }
      
      if (!resp || !resp.ok) throw new Error(`Fetch failed: ${resp?.status || 'Network Error'}`)
      const blob = await resp.blob()
      const filename = url.split('/').pop() || 'downloaded_disk.dsk'
      let file = new File([blob], filename)
      if (filename.toLowerCase().endsWith('.zip')) {
        file = await handleZipFile(file)
      }
      setMediaFiles(prev => ({ ...prev, [id]: file }))
      await dataManager.saveMedia(id, file)
      saveMediaUrl(id, url)
      addLog(`Inserted from URL: ${file.name}`, false)
    } catch (e: any) {
      addLog(`Failed to download media: ${e.message}`, true)
      alert(`Failed to download media: ${e.message}`)
    }
  }, [addLog, handleZipFile, checkAndPromptSaveDisk, saveMediaUrl])

  const handleCopyShareUrl = useCallback(async () => {
    try {
      if (!selectedMachine) return
      const url = new URL(window.location.origin + window.location.pathname)
      url.searchParams.set('m', selectedMachine.name)
      url.searchParams.set('d', selectedMachine.description)

      // Sync slots
      const slotStrings = Object.entries(slotValues)
        .filter(([_, v]) => !!v)
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
      if (slotStrings) url.searchParams.set('s', slotStrings)

      // Sync media (URLs or filenames)
      const mediaStrings = Object.entries(mediaFiles)
        .filter(([_, f]) => !!f)
        .map(([k, f]) => {
          const sourceUrl = mediaUrls[k]
          if (sourceUrl) return `${k}:${sourceUrl}`
          return `${k}:${f!.name}`
        })
        .join(',')
      if (mediaStrings) url.searchParams.set('media', mediaStrings)

      // Sync video/shader configurations
      if (videoSettings) {
        if (videoSettings.windowMode) url.searchParams.set('windowMode', videoSettings.windowMode)
        if (videoSettings.videoMethod) url.searchParams.set('videoMethod', videoSettings.videoMethod)
        if (videoSettings.bgfxEffect && videoSettings.bgfxEffect !== 'none') {
          url.searchParams.set('videoShader', videoSettings.bgfxEffect)
        }
      }

      // Add extra arguments if present in original URL or active
      const originalParams = new URLSearchParams(window.location.search)
      const extra = originalParams.get('extra') || originalParams.get('?extra')
      if (extra) {
        url.searchParams.set('extra', extra)
      }

      // Automatically append autoboot if they want to share a running/configured setup
      url.searchParams.set('autoboot', '')

      // Clean up valueless parameter suffix '=' in final string
      let finalUrl = url.toString()
      finalUrl = finalUrl.replace(/([?&])autoboot=(&|$)/g, '$1autoboot$2')

      // Copy to clipboard
      await navigator.clipboard.writeText(finalUrl)
      addLog(`Copied shareable URL to clipboard!`, false)
      alert(`Copied shareable URL to clipboard!\n\n${finalUrl}`)
    } catch (e: any) {
      addLog(`Failed to copy share URL: ${e.message}`, true)
      alert(`Failed to copy share URL: ${e.message}`)
    }
  }, [selectedMachine, slotValues, mediaFiles, mediaUrls, videoSettings, launchState, addLog])

  const handleMameUIToggle = useCallback(() => {
    // Send ScrollLock key to toggle MAME UI mode
    const canvas = document.getElementById('canvas')
    if (canvas instanceof HTMLElement) {
      canvas.focus()
    }
    const target = canvas || document
    const opts = {
      key: 'ScrollLock',
      code: 'ScrollLock',
      keyCode: 145,
      which: 145,
      bubbles: true,
      cancelable: true
    }
    target.dispatchEvent(new KeyboardEvent('keydown', opts))
    setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent('keyup', opts))
    }, 50)
    addLog('Sent ScrollLock (MAME UI Toggle)', false)
  }, [addLog])

  const handleMameMenu = useCallback(() => {
    // Send Tab key to canvas to open MAME menu
    const canvas = document.getElementById('canvas')
    if (canvas instanceof HTMLElement) {
      canvas.focus()
    }
    const target = canvas || document
    const opts = {
      key: 'Tab',
      code: 'Tab',
      keyCode: 9,
      which: 9,
      bubbles: true,
      cancelable: true
    }
    target.dispatchEvent(new KeyboardEvent('keydown', opts))
    setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent('keyup', opts))
    }, 50)
    addLog('Sent Tab (MAME Menu)', false)
  }, [addLog])

  const handleToggleCapture = (type: 'avi' | 'wav', enable: boolean) => {
    // Synchronously update state to keep checkbox responsive
    if (type === 'avi') setAvSettings({ generateAvi: enable })
    else setAvSettings({ generateWav: enable })

    // Handle asynchronous saving separately
    if (!enable && launchState === 'running') {
      (async () => {
        const filename = type === 'avi' ? 'output.avi' : 'output.wav'
        const virtualPath = type === 'avi' ? `/snap/${filename}` : `/${filename}`
        const data = getVirtualFile(virtualPath)
        if (data && data.length > 0) {
          const save = window.confirm(`Capture file "${filename}" found. Save back to local?`)
          if (save) {
            await saveFileToLocal(filename, data)
          }
        }
      })()
    }
  }

  useEffect(() => {
    const init = async () => {
      const data = await dataManager.loadModels()
      setModels(data)

      // Restore selection from URL
      const params = new URLSearchParams(window.location.search)
      const m = params.get('m')
      const d = params.get('d')

      // Parse video settings from URL overrides if present
      const wmParam = params.get('windowMode') || params.get('window_mode') || params.get('wm') || params.get('w')
      const shaderParam = params.get('videoShader') || params.get('video_shader') || params.get('shader') || params.get('effect') || params.get('bgfxEffect') || params.get('bgfx_effect')
      const vmParam = params.get('videoMethod') || params.get('video_method') || params.get('vm')

      const videoOverrides: Partial<VideoSettings> = {}

      if (wmParam) {
        const val = wmParam.toLowerCase()
        if (['1x', '2x', '3x', '4x', 'fit', 'integer-fit'].includes(val)) {
          videoOverrides.windowMode = val as any
        }
      }

      if (shaderParam) {
        const val = shaderParam.toLowerCase()
        const validEffects = ['none', 'scanlines', 'crt-geom', 'crt-geom-deluxe', 'hq2x', 'lcd-grid']
        const normalizedVal = val.replace(/_/g, '-')
        if (validEffects.includes(normalizedVal)) {
          videoOverrides.bgfxEffect = normalizedVal as any
          if (normalizedVal !== 'none') {
            videoOverrides.videoMethod = 'bgfx'
          }
        }
      }

      if (vmParam) {
        const val = vmParam.toLowerCase()
        if (['soft', 'bgfx', 'opengl'].includes(val)) {
          videoOverrides.videoMethod = val as any
        }
      }

      if (Object.keys(videoOverrides).length > 0) {
        setVideoSettings(videoOverrides)
        addLog(`Applied video settings overrides from URL: ${JSON.stringify(videoOverrides)}`, false)
      }

      let machineToLaunch: { name: string; description: string } | null = null
      let slots: Record<string, string> = {}

      if (m && d) {
        machineToLaunch = { name: m, description: d }
        const slotsParam = params.get('s')
        if (slotsParam) {
          try {
            slotsParam.split(',').forEach(p => {
              const lastColon = p.lastIndexOf(':')
              if (lastColon !== -1) {
                const k = p.substring(0, lastColon)
                const v = p.substring(lastColon + 1)
                slots[k] = v
              }
            })
          } catch { }
        }
      } else if (selectedMachine) {
        // Fallback to persistent store if URL is empty
        machineToLaunch = selectedMachine
        slots = slotValues
      }

      if (machineToLaunch) {
        // Restore machine config and slots
        const config = await dataManager.loadMachine(machineToLaunch.name)
        setMachineConfig(config)
        
        if (config) {
          slots = fillSlotDefaults(config.slots, slots, config.devices)
          setSlotValues(slots)
        }
        setSelectedMachine(machineToLaunch)

        // 2. Auto-expand tree to show selected machine
        const path: string[] = []
        const findPath = (nodes: ModelEntry[], target: string, ancestors: string[]): boolean => {
          for (const node of nodes) {
            const id = `${node.description}${node.value ?? ''}`
            const isMatch = node.value?.trim() === target.trim()
            const hasChildren = !!(node.children && node.children.length > 0)

            if (isMatch && !hasChildren) {
              path.push(...ancestors)
              return true
            }

            if (hasChildren) {
              if (findPath(node.children!, target, [...ancestors, id])) {
                return true
              }
              // If we didn't find it in children but the parent matches, we can fall back to it
              if (isMatch) {
                path.push(...ancestors)
                return true
              }
            }
          }
          return false
        }

        if (findPath(data, machineToLaunch.name, [])) {
          setExpandedNodes(prev => new Set([...prev, ...path]))
        }

        // 3. Restore media from IndexedDB or URL (prioritize URL param, then store)
        let restoredMedia: Record<string, File | null> = {}
        const mediaParam = params.get('media')
        
        if (mediaParam) {
          const pairs = mediaParam.split(',')
          for (const p of pairs) {
            const protocolIndex = p.indexOf('://')
            const firstColon = p.indexOf(':')
            let id = ''
            let nameOrUrl = ''

            if (protocolIndex !== -1 && (firstColon === -1 || firstColon === protocolIndex)) {
              // No ID before protocol, or no colon at all (URL-only)
              nameOrUrl = p
              // Default to hard1 for most images, or flop1 for others
              const lower = p.toLowerCase()
              if (lower.endsWith('.dsk') || lower.endsWith('.po') || lower.endsWith('.do') || lower.endsWith('.nib') || lower.endsWith('.woz')) {
                id = 'flop1'
              } else {
                id = 'hard1'
              }
            } else if (firstColon !== -1) {
              id = p.substring(0, firstColon)
              nameOrUrl = p.substring(firstColon + 1)
            }

            if (id && nameOrUrl) {
              if (nameOrUrl.startsWith('http')) {
                // Download from URL
                try {
                  addLog(`Downloading media from URL: ${nameOrUrl}...`, false)
                  let resp: Response | null = null
                  
                  try {
                    resp = await fetch(nameOrUrl)
                  } catch (e) {}

                  if (!resp || !resp.ok) {
                    addLog(`Direct fetch failed (CORS?), trying corsfix...`, false)
                    try {
                      resp = await fetch(`https://proxy.corsfix.com/?${nameOrUrl}`)
                    } catch (e) { resp = null }
                  }

                  if (!resp || !resp.ok) throw new Error(`Fetch failed: ${resp?.status || 'Network Error'}`)
                  const blob = await resp.blob()
                  const filename = nameOrUrl.split('/').pop() || 'downloaded_disk.dsk'
                  let file = new File([blob], filename)
                  if (filename.toLowerCase().endsWith('.zip')) {
                    file = await handleZipFile(file)
                  }
                  restoredMedia[id] = file
                  if (id) await dataManager.saveMedia(id, file)
                  addLog(`Downloaded and saved: ${filename}`, false)
                  
                  // Store the download URL in mediaUrls for persistence and share links
                  saveMediaUrl(id, nameOrUrl)
                } catch (e: any) {
                  addLog(`Failed to download media from URL: ${e.message}`, true)
                }
              } else {
                // Load from IndexedDB
                const file = await dataManager.loadMedia(id)
                if (file) restoredMedia[id] = file
              }
            }
          }
        } else if (lastMedia && Object.keys(lastMedia).length > 0) {
          // Fallback to store
          for (const id of Object.keys(lastMedia)) {
            const file = await dataManager.loadMedia(id)
            if (file) restoredMedia[id] = file
          }
        }
        setMediaFiles(restoredMedia)

        // 4. Trigger launch logic
        const hasAutoboot = params.has('autoboot')
        const shouldLaunch = hasAutoboot
        
        if (shouldLaunch && !hasAutoLaunched.current) {
          hasAutoLaunched.current = true

          // Parse delay value from autoboot=n (0 to 10 seconds). Defaults to 0 seconds if just a flag (immediate launch).
          let delaySeconds = 0
          if (hasAutoboot) {
            const val = params.get('autoboot')
            if (val !== null && val !== '') {
              const parsed = parseInt(val, 10)
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
                delaySeconds = parsed
              }
            }
          }

          // If mapping is enabled, we CANNOT auto-launch because we need a user gesture for the folder.
          // handleLaunch will be called by the user clicking the "Launch" button which should be 
          // visible because we set the state.
          if (pathSettings?.mapLocalDir && !localDirHandleRef.current) {
            addLog('Auto-launch paused: Local directory needs reconnection. Please click Launch.', false)
            setStatusText('Reconnection required for local directory...')
          } else {
            if (delaySeconds > 0) {
              addLog(`Autoboot sequence initiated (${delaySeconds}s delay)...`, false)
              setLaunchState('fetching-rom')
              setStatusText(`Autoboot in ${delaySeconds} sec...`)
              let timeLeft = delaySeconds
              const timer = setInterval(() => {
                timeLeft--
                if (timeLeft > 0) {
                  setStatusText(`Autoboot in ${timeLeft} sec...`)
                } else {
                  clearInterval(timer)
                  doLaunch(machineToLaunch!, slots, restoredMedia, config)
                }
              }, 1000)
            } else {
              doLaunch(machineToLaunch!, slots, restoredMedia, config)
            }
          }
        }
      }
      setIsInitializing(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])


  // Sync selection to URL (without reloading)
  useEffect(() => {
    if (!isInitializing && selectedMachine) {
      const url = new URL(window.location.href)
      url.searchParams.set('m', selectedMachine.name)
      url.searchParams.set('d', selectedMachine.description)

      // Sync slots
      const slotStrings = Object.entries(slotValues)
        .filter(([_, v]) => !!v)
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
      if (slotStrings) url.searchParams.set('s', slotStrings)
      else url.searchParams.delete('s')

      // Sync media (only sync if it's a small URL or a filename)
      const mediaStrings = Object.entries(mediaFiles)
        .filter(([_, f]) => !!f)
        .map(([k, f]) => {
           // We can't easily sync large file data in URL, so we just sync the name or a source URL if we had one.
           // For now, syncing the name is enough for IndexedDB restoration.
           return `${k}:${f!.name}`
        })
        .join(',')
      if (mediaStrings) url.searchParams.set('media', mediaStrings)
      else url.searchParams.delete('media')

      let finalUrl = url.toString()
      finalUrl = finalUrl.replace(/([?&])autoboot=(&|$)/g, '$1autoboot$2')
      window.history.replaceState({}, '', finalUrl)
    }
  }, [selectedMachine, slotValues, mediaFiles])

  // Sync media to store for persistence across reloads
  useEffect(() => {
    const mapping: Record<string, string> = {}
    Object.entries(mediaFiles).forEach(([id, file]) => {
      if (file) mapping[id] = file.name
    })
    setLastMedia(mapping)
  }, [mediaFiles, setLastMedia])

  /**
   * Full-screen toggle for the emulator
   */
  const toggleFullScreen = useCallback(() => {
    const container = canvasContainerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen().catch(err => {
        addLog(`Fullscreen error: ${err.message}`, true)
      })
    }
  }, [addLog])

  /**
   * Test launch — no ROMs, just load the WASM runtime.
  /*
  const _handleTestLaunch = useCallback(async () => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)
    setLaunchState('loading-wasm')

    const wasmInfo = getWasmForEmulator('apple2e', 'apple2e')
    if (!wasmInfo) {
      setErrorText('No WASM file available')
      setLaunchState('error')
      return
    }

    const wasmUrl = `/wasm/${wasmInfo.wasm}`
    addLog(`Test: /wasm/${wasmInfo.wasm}`, false)

    const args = buildMameArgs('apple2e', {
      video: 'soft',
      resolution: '640x480',
      extraArgs: ['-verbose'],
    })

    try {
      await loadMameWasm(wasmUrl, {
        driverArgs: args,
        romFiles: [],
        jsUrl: `/wasm/${wasmInfo.js}`,
        onProgress: (loaded, total) => {
          if (total > 0) {
            const pct = Math.round((loaded / total) * 100)
            setWasmProgress(pct)
            setStatusText(`Loading... ${pct}%`)
          }
        },
        onError: (err) => {
          addLog(`Error: ${err}`, true)
          setLaunchState('error')
        },
        onLog: addLog,
        onReady: (m) => {
          if (m.canvas && canvasContainerRef.current) {
            canvasContainerRef.current.innerHTML = ''
            canvasContainerRef.current.appendChild(m.canvas)
            m.canvas.style.display = 'block'
            m.canvas.style.width = '100%'
            m.canvas.style.height = '100%'
            m.canvas.style.objectFit = 'contain'
          }
          setWasmModule(m)
          setLaunchState('running')
        },
      })
    } catch (e: any) {
      setErrorText(e.message || String(e))
      setLaunchState('error')
      addLog(`Fatal: ${e}`, true)
    }
  }, [wasmTarget, addLog])
  */

  /**
   * Strip TorrentZip footer (40 bytes: 36-byte SHA256 + PK\x07\x08 sig)
   * so MAME's ZIP parser can read the file.
  /*
  const _stripTorrentZip = (data: Uint8Array): Uint8Array => {
    if (data.length < 48) return data
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const end = data.length
    if (view.getUint32(end - 4, true) === 0x506b0708) {
      const cleaned = new Uint8Array(end - 40)
      cleaned.set(data.subarray(0, end - 40))
      return cleaned
    }
    return data
  }
  */

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isLoading = launchState === 'fetching-rom' || launchState === 'loading-wasm' || 
    (launchState === 'running' && !!statusText && wasmProgress < 100)

  return (
    <div className={`app ${theme}`}>
      {/* ── Left Drawer Toggle ── */}
      <div 
        className={`drawer-toggle left-toggle ${isLeftSidebarOpen ? 'embedded' : ''}`}
        onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        title={isLeftSidebarOpen ? "Hide Machine List" : "Show Machine List"}
        style={{
          left: isLeftSidebarOpen ? `${sidebarWidth - 16}px` : '0px',
        }}
      >
        {isLeftSidebarOpen ? '◀' : '▶'}
      </div>

      {/* ── Right Drawer Toggle ── */}
      {selectedMachine && (
        <div 
          className={`drawer-toggle right-toggle ${isRightSidebarOpen ? 'embedded' : ''}`}
          onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
          title={isRightSidebarOpen ? "Hide Settings Panel" : "Show Settings Panel"}
          style={{
            right: isRightSidebarOpen ? `${(configWidth ?? 320) - 16}px` : '0px',
          }}
        >
          {isRightSidebarOpen ? '▶' : '◀'}
        </div>
      )}

      {/* ── Left Sidebar ── */}
      <div 
        className={`sidebar ${!isLeftSidebarOpen ? 'collapsed' : ''}`} 
        style={{ 
          width: sidebarWidth, 
          marginLeft: isLeftSidebarOpen ? 0 : -sidebarWidth,
          flexShrink: 0, 
          minWidth: isLeftSidebarOpen ? '200px' : '0px',
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <div className="sidebar-header">
          <a href={BASE_URL} className="sidebar-title" onClick={handleReset}>
            <span className="sidebar-logo">🍎</span>
            <span>AmpleWeb</span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <a 
              href="https://github.com/anomixer/ample/tree/ampleweb/AmpleWeb" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="github-btn"
              title="View on GitHub"
            >
              <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            </a>
            <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className="search-box-wrap">
          <input
            className="search-box"
            placeholder="Search machines..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="machine-tree-container">
          <MachineTree
            models={models}
            expanded={expandedNodes}
            selected={selectedMachine}
            onToggle={toggleNode}
            onSelect={handleSelectMachine}
            onLaunch={handleLaunch}
            filter={search.toLowerCase()}
          />
        </div>

        {/* ROM Settings Panel */}
        {showSettings && (
          <div className="settings-panel">
            <div className="section-heading">
              <span>🌐 ROM Download Settings</span>
              <button className="log-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-section">
              <label className="settings-label">Auto-download missing ROMs</label>
              <label className="settings-toggle-wrap">
                <input
                  type="checkbox"
                  checked={romSettings.autoDownload}
                  onChange={e => setRomSettings(s => ({ ...s, autoDownload: e.target.checked }))}
                />
              </label>
              <p className="settings-hint">
                When enabled, missing ROMs will be downloaded from configured servers and cached in IndexedDB.
              </p>
            </div>
            <div className="settings-section">
              <label className="settings-label">Download Servers (one per line, {`{filename}`} = filename)</label>
              <textarea
                className="settings-textarea"
                rows={6}
                value={romSettings.downloadServers.join('\n')}
                onChange={e => setRomSettings(s => ({ ...s, downloadServers: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="https://example.com/{filename}"
              />
              <p className="settings-hint">
                Servers are tried in order. Add custom servers below.
              </p>
            </div>
            <div className="settings-section">
              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  const url = prompt('Enter server URL (use {filename} as placeholder):')
                  if (url && !romSettings.downloadServers.includes(url)) {
                    setRomSettings(s => ({ ...s, downloadServers: [...s.downloadServers, url] }))
                  }
                }}
              >
                + Add Server
              </button>
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          {wasmTarget && (
            <code style={{ fontSize: '9px', opacity: 0.6 }}>
              wasm:{wasmTarget}
            </code>
          )}
          {models.length > 0 && ` · ${models.length} groups`}
          <button className="theme-btn" onClick={() => setShowSettings(v => !v)} title="ROM Settings" style={{ marginLeft: 'auto' }}>
            ⚙️
          </button>
        </div>
      </div>
      
      {/* ── Sidebar Resize Handle ── */}
      <div
        className={`resize-handle ${isSidebarResizing ? 'active' : ''} ${!isLeftSidebarOpen ? 'collapsed' : ''}`}
        onMouseDown={() => isLeftSidebarOpen && setIsSidebarResizing(true)}
      />

      {/* ── Right Main Panel ── */}
      <div className="main">
        {selectedMachine ? (
          <>
            <div className="machine-panel">
            {/* Machine header */}
            <div className="machine-header">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div>
                  <h2 className="machine-title">{selectedMachine.description}</h2>
                  <code className="machine-id">{selectedMachine.name}</code>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  style={{
                    marginLeft: '12px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--text1)',
                    height: '24px',
                  }}
                  onClick={handleCopyShareUrl}
                  title="Copy shareable URL for this configuration"
                >
                  🔗 Share
                </button>
              </div>
              <div className="header-badges" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                {launchState === 'running' && (
                  <>
                    {statusText && (
                      <span className={`badge ${statusText.includes('longer time') ? 'badge-warning' : 'badge-error'}`} style={{ marginRight: '6px' }}>
                        ⚠️ {statusText}
                      </span>
                    )}
                    <button 
                      className="badge badge-running" 
                      onClick={toggleFullScreen}
                      title="Full Screen"
                      style={{ cursor: 'pointer', border: 'none', marginRight: '6px' }}
                    >
                      📺 Full Screen
                    </button>
                    <span className="badge badge-running">● Running</span>
                  </>
                )}
                {launchState === 'error' && (
                  <span className="badge badge-error">● Error</span>
                )}
              </div>
            </div>

            {/* Error banner */}
            {errorText && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <pre>{errorText}</pre>
              </div>
            )}

            {/* Emulator Area */}
              {/* Left: emulator canvas */}
              <div className="emulator-area">
                <div className={`emulator-container ${launchState === 'running' ? 'active' : ''} mode-${videoSettings?.windowMode || 'fit'}`}>
                  {/* Progress bar — position:absolute overlay, never shifts layout */}
                  {isLoading && (
                    <div className="progress-container">
                      <div className="progress-wrap" style={{ maxWidth: '320px', margin: '0 auto' }}>
                        <div className="progress-spinner" />
                        <span className={`progress-label ${statusText.includes('longer time') ? 'highlight' : ''} ${statusText.includes('may not work') ? 'highlight-error' : ''}`}>{statusText}</span>
                      </div>
                    </div>
                  )}

                  {/* Canvas container — always display:flex so MAME renders immediately
                      in sync with audio. Placeholder overlays on top until running. */}
                  <div
                    id="canvas-host"
                    ref={canvasContainerRef}
                    style={{
                      flex: 1,
                      width: '100%',
                      minHeight: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  />

                  {/* Placeholder — position:absolute overlay on top of canvas.
                      Disappears when running so the already-rendering canvas is revealed. */}
                  {launchState !== 'running' && (
                    <div
                      className="emulator-placeholder"
                      style={{ position: 'absolute', inset: 0 }}
                    >
                      {(launchState === 'idle' || launchState === 'fetching-rom' || launchState === 'loading-wasm') && (
                        <div className="welcome-inner">
                          <div className="welcome-badge">MAME {selectedMachine.name}</div>
                          <p>Press Launch to start emulation</p>
                        </div>
                      )}
                      {launchState === 'error' && (
                        <div className="error-state">
                          <span className="error-icon">❌</span>
                          <p>Emulation failed</p>
                          <button className="btn btn-ghost btn-sm" onClick={() => setMachineTab('logs')}>View Log</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          {/* ── Config Resize Handle & Area ── */}
          <div
            className={`resize-handle ${isConfigResizing ? 'active' : ''} ${!isRightSidebarOpen ? 'collapsed' : ''}`}
            onMouseDown={() => isRightSidebarOpen && setIsConfigResizing(true)}
          />

          {/* Config area (Full height) */}
          <div 
            className={`config-area ${!isRightSidebarOpen ? 'collapsed' : ''}`} 
            style={{ 
              width: configWidth ?? 320,
              marginRight: isRightSidebarOpen ? 0 : -(configWidth ?? 320),
              transition: 'margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Top Frame: System Settings */}
            <div className="config-frame top" style={{ flex: `0 0 ${configTopHeight}px` }}>
              <div className="frame-header">
                <button className={`tab-btn ${systemTab === 'video' ? 'active' : ''}`} onClick={() => setSystemTab('video')}>Video</button>
                <button className={`tab-btn ${systemTab === 'cpu' ? 'active' : ''}`} onClick={() => setSystemTab('cpu')}>CPU</button>
                <button className={`tab-btn ${systemTab === 'av' ? 'active' : ''}`} onClick={() => setSystemTab('av')}>A/V</button>
                <button className={`tab-btn ${systemTab === 'paths' ? 'active' : ''}`} onClick={() => setSystemTab('paths')}>Paths</button>
                <button className={`tab-btn ${systemTab === 'config' ? 'active' : ''}`} onClick={() => setSystemTab('config')}>Config</button>
                <button className={`tab-btn ${systemTab === 'ai' ? 'active' : ''}`} onClick={() => setSystemTab('ai')}>AI</button>
              </div>
              <div className="frame-content">
                {systemTab === 'video' && (
                  <div className="section no-border">
                    <div className="slot-grid">
                      <div className="slot-row">
                        <label className="slot-label">Window Mode</label>
                        <select className="slot-select" value={videoSettings?.windowMode || '1x'} onChange={e => setVideoSettings({ windowMode: e.target.value as any })}>
                          <option value="1x">1x (Native)</option>
                          <option value="2x">2x</option>
                          <option value="3x">3x</option>
                          <option value="4x">4x</option>
                          <option value="fit">Fit to Screen</option>
                          <option value="integer-fit">Integer Fit (Sharp)</option>
                        </select>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Capture Mouse</label>
                        <label className="settings-toggle-wrap">
                          <input type="checkbox" checked={!!videoSettings?.captureMouse} onChange={e => setVideoSettings({ captureMouse: e.target.checked })} />
                        </label>
                        <span className="settings-hint">Lock cursor on click, hold Esc to release</span>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Square Pixel</label>
                        <label className="settings-toggle-wrap">
                          <input type="checkbox" checked={!videoSettings?.keepAspect} onChange={e => setVideoSettings({ keepAspect: !e.target.checked })} />
                        </label>
                        <span className="settings-hint">Requires restart to take effect</span>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Disk Sound Effects</label>
                        <label className="settings-toggle-wrap">
                          <input type="checkbox" checked={!!avSettings?.diskSound} onChange={e => setAvSettings({ diskSound: e.target.checked })} />
                        </label>
                        <span className="settings-hint">Requires restart to take effect</span>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Video Shader</label>
                        <select
                          className="slot-select"
                          value={videoSettings?.videoMethod || 'soft'}
                          onChange={e => setVideoSettings({ videoMethod: e.target.value as any })}
                        >
                          <option value="soft">Software</option>
                          <option value="bgfx">BGFX (Hardware Accel)</option>
                        </select>
                      </div>
                      {videoSettings?.videoMethod === 'bgfx' && (
                        <>
                          <div className="slot-row">
                            <label className="slot-label">BGFX Backend</label>
                            <select className="slot-select" value={videoSettings?.bgfxBackend || 'auto'} onChange={e => setVideoSettings({ bgfxBackend: e.target.value as any })}>
                              <option value="auto">Auto</option>
                              <option value="opengl">OpenGL</option>
                              <option value="gles">OpenGLES</option>
                              <option value="vulkan">Vulkan</option>
                            </select>
                          </div>
                          <div className="slot-row">
                            <label className="slot-label">Effect</label>
                            <select className="slot-select" value={videoSettings?.bgfxEffect || 'none'} onChange={e => setVideoSettings({ bgfxEffect: e.target.value as any })}>
                              <option value="none">None</option>
                              <option value="scanlines">Scanlines</option>
                              <option value="crt-geom">CRT Geom</option>
                              <option value="crt-geom-deluxe">CRT Geom Deluxe</option>
                              <option value="hq2x">HQ2X</option>
                              <option value="lcd-grid">LCD Grid</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {systemTab === 'cpu' && (
                  <div className="section no-border">
                    <div className="slot-grid">
                      <div className="slot-row">
                        <label className="slot-label">Speed</label>
                        <select className="slot-select" value={cpuSettings?.speed || '100'} onChange={e => setCpuSettings({ speed: e.target.value as any })}>
                          <option value="100">100% (Normal)</option>
                          <option value="200">200%</option>
                          <option value="300">300%</option>
                          <option value="400">400%</option>
                          <option value="500">500%</option>
                          <option value="nothrottle">No Throttle (Max)</option>
                        </select>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Debug</label>
                        <label className="settings-toggle-wrap" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                          <input type="checkbox" disabled checked={false} />
                        </label>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Rewind</label>
                        <label className="settings-toggle-wrap">
                          <input type="checkbox" checked={!!cpuSettings?.rewind} onChange={e => setCpuSettings({ rewind: e.target.checked })} />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {systemTab === 'av' && (
                  <div className="section no-border">
                    <div className="slot-grid">
                      <div className="slot-row">
                        <label className="slot-label">Generate AVI</label>
                        <label className="settings-toggle-wrap">
                          <input type="checkbox" checked={!!avSettings?.generateAvi} onChange={e => handleToggleCapture('avi', e.target.checked)} />
                        </label>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Generate WAV</label>
                        <label className="settings-toggle-wrap">
                          <input type="checkbox" checked={!!avSettings?.generateWav} onChange={e => handleToggleCapture('wav', e.target.checked)} />
                        </label>
                      </div>
                      <div className="slot-row">
                        <label className="slot-label">Generate VGM</label>
                        <label className="settings-toggle-wrap" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                          <input type="checkbox" disabled />
                        </label>
                      </div>
                      <p className="settings-hint" style={{ marginTop: 8 }}>
                        Recording starts on launch. Uncheck while running to save the virtual file to your device. 
                        Note: Excessive recording length may cause WASM memory overflow.
                      </p>
                    </div>
                  </div>
                )}

                {systemTab === 'paths' && (
                  <div className="section no-border">
                    <div className="slot-grid">
                      <div className="slot-row">
                        <label className="slot-label">Map Local Directory</label>
                        <button
                          className={`btn ${pathSettings?.localDirPath && !localDirHandleRef.current ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                          onClick={async () => {
                            try {
                              // @ts-ignore
                              const handle = await window.showDirectoryPicker()
                              setPathSettings({ mapLocalDir: true, localDirPath: handle.name })
                              localDirHandleRef.current = handle
                            } catch (e) {
                              console.error('Directory picker failed:', e)
                            }
                          }}
                        >
                          {pathSettings?.localDirPath ? (
                            localDirHandleRef.current ? `Mapped: ${pathSettings.localDirPath}` : `Reconnect: ${pathSettings.localDirPath} (Required)`
                          ) : 'Select Folder...'}
                        </button>
                      </div>
                      {pathSettings?.localDirPath && (
                        <div className="slot-row">
                          <button className="btn btn-ghost btn-sm" onClick={() => setPathSettings({ mapLocalDir: false, localDirPath: null })}>Remove Mapping</button>
                        </div>
                      )}
                      <p className="settings-hint" style={{ marginTop: 8 }}>
                        AmpleWeb (WASM) does not support -shared_directory (USB flash emulation for Booti cards).
                        Use this to map a local folder to /share for hot-swapping disk images. Restart Required.
                        Once set, Restart/Stop the machine, then Launch again and Reconnect when prompted to take effect.
                      </p>
                    </div>
                  </div>
                )}

                {systemTab === 'config' && (
                  <div className="section no-border" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
                    <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <label className="slot-label" style={{ marginBottom: '4px', minWidth: 'auto', maxWidth: 'none', whiteSpace: 'normal', overflow: 'visible' }}>XML Configuration Editor</label>
                      <textarea
                        className="slot-select"
                        disabled={launchState !== 'idle'}
                        style={{
                          flex: '1 1 auto',
                          fontFamily: 'Consolas, Monaco, monospace',
                          fontSize: '11px',
                          whiteSpace: 'pre',
                          overflow: 'auto',
                          resize: 'none',
                          lineHeight: '1.4',
                          width: '100%',
                          minHeight: '150px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          color: '#e2e8f0',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          padding: '8px',
                          opacity: launchState !== 'idle' ? 0.5 : 1,
                          cursor: launchState !== 'idle' ? 'not-allowed' : 'text'
                        }}
                        value={editorCfgText}
                        onChange={e => setEditorCfgText(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={launchState !== 'running'}
                        style={{
                          flex: '1 1 0px',
                          minWidth: '0px',
                          whiteSpace: 'nowrap',
                          padding: '4px 6px',
                          fontSize: '11px',
                          justifyContent: 'center',
                          opacity: launchState !== 'running' ? 0.4 : 1,
                          cursor: launchState !== 'running' ? 'not-allowed' : 'pointer'
                        }}
                        onClick={() => {
                          try {
                            const FS = (window as any).FS
                            if (!FS) {
                              addLog('Emulator filesystem (FS) is not available. Launch the emulator first!', true)
                              alert('Emulator filesystem (FS) is not available. Please launch the emulator first!')
                              return
                            }
                            
                            const relPath = `cfg/${currentMameDriver}.cfg`
                            const absPath = `/cfg/${currentMameDriver}.cfg`
                            let fileData: string | null = null

                            if (FS.analyzePath(relPath).exists) {
                              fileData = FS.readFile(relPath, { encoding: 'utf8' })
                            } else if (FS.analyzePath(absPath).exists) {
                              fileData = FS.readFile(absPath, { encoding: 'utf8' })
                            } else {
                              const cwd = FS.cwd ? FS.cwd() : '/'
                              const cwdAbsPath = `${cwd}/cfg/${currentMameDriver}.cfg`
                              if (FS.analyzePath(cwdAbsPath).exists) {
                                fileData = FS.readFile(cwdAbsPath, { encoding: 'utf8' })
                              }
                            }

                            if (!fileData) {
                              addLog(`Could not find live config file for ${currentMameDriver} in virtual filesystem. Modify settings in emulator first!`, true)
                              alert(`Could not find live config file for ${currentMameDriver} in virtual filesystem. Modify settings in emulator first!`)
                              return
                            }

                            setEditorCfgText(fileData)
                            addLog(`Successfully loaded live config from VFS: /cfg/${currentMameDriver}.cfg`, false)
                          } catch (err: any) {
                            addLog(`Failed to read configuration from VFS: ${err.message || err}`, true)
                          }
                        }}
                      >
                        Read
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={launchState !== 'idle'}
                        style={{
                          flex: '1 1 0px',
                          minWidth: '0px',
                          whiteSpace: 'nowrap',
                          padding: '4px 6px',
                          fontSize: '11px',
                          justifyContent: 'center',
                          opacity: launchState !== 'idle' ? 0.4 : 1,
                          cursor: launchState !== 'idle' ? 'not-allowed' : 'pointer'
                        }}
                        onClick={() => {
                          const corrected = updateSystemNameInXml(editorCfgText, currentMachineName)
                          localStorage.setItem('ample_cfg_' + currentMachineName, corrected)
                          setEditorCfgText(corrected)
                          addLog(`Saved custom configuration for ${currentMachineName} to localStorage`, false)
                        }}
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={launchState !== 'running'}
                        style={{
                          flex: '1 1 0px',
                          minWidth: '0px',
                          whiteSpace: 'nowrap',
                          padding: '4px 6px',
                          fontSize: '11px',
                          justifyContent: 'center',
                          opacity: launchState !== 'running' ? 0.4 : 1,
                          cursor: launchState !== 'running' ? 'not-allowed' : 'pointer'
                        }}
                        onClick={async () => {
                          try {
                            const FS = (window as any).FS
                            if (!FS) {
                              addLog('Emulator filesystem (FS) is not available. Launch the emulator first!', true)
                              return
                            }
                            
                            const relPath = `cfg/${currentMameDriver}.cfg`
                            const absPath = `/cfg/${currentMameDriver}.cfg`
                            let fileData: string | null = null

                            if (FS.analyzePath(relPath).exists) {
                              fileData = FS.readFile(relPath, { encoding: 'utf8' })
                            } else if (FS.analyzePath(absPath).exists) {
                              fileData = FS.readFile(absPath, { encoding: 'utf8' })
                            } else {
                              const cwd = FS.cwd ? FS.cwd() : '/'
                              const cwdAbsPath = `${cwd}/cfg/${currentMameDriver}.cfg`
                              if (FS.analyzePath(cwdAbsPath).exists) {
                                fileData = FS.readFile(cwdAbsPath, { encoding: 'utf8' })
                              }
                            }

                            if (!fileData) {
                              addLog(`Could not find live config file for ${currentMameDriver} in virtual filesystem. Modify settings in emulator first!`, true)
                              return
                            }

                            const blob = new Blob([fileData], { type: 'text/xml' })
                            const url = URL.createObjectURL(blob)
                            const link = document.createElement('a')
                            link.href = url
                            link.download = `${currentMameDriver}.cfg`
                            document.body.appendChild(link)
                            link.click()
                            document.body.removeChild(link)
                            URL.revokeObjectURL(url)
                            addLog(`Exported live configuration to ${currentMameDriver}.cfg`, false)
                          } catch (err: any) {
                            addLog(`Failed to export configuration: ${err.message || err}`, true)
                          }
                        }}
                      >
                        Export
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={launchState !== 'idle'}
                        style={{
                          flex: '1 1 0px',
                          minWidth: '0px',
                          whiteSpace: 'nowrap',
                          padding: '4px 6px',
                          fontSize: '11px',
                          justifyContent: 'center',
                          opacity: launchState !== 'idle' ? 0.4 : 1,
                          cursor: launchState !== 'idle' ? 'not-allowed' : 'pointer'
                        }}
                        onClick={() => {
                          const fileInput = document.createElement('input')
                          fileInput.type = 'file'
                          fileInput.accept = '.cfg,text/xml,application/xml'
                          fileInput.onchange = (e: any) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onload = (evt) => {
                                const text = evt.target?.result as string
                                if (text) {
                                  setEditorCfgText(text)
                                  addLog(`Imported configuration file: ${file.name}`, false)
                                }
                              }
                              reader.readAsText(file)
                            }
                          }
                          fileInput.click()
                        }}
                      >
                        Import
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={launchState !== 'idle'}
                        style={{
                          flex: '1 1 0px',
                          minWidth: '0px',
                          whiteSpace: 'nowrap',
                          padding: '4px 6px',
                          fontSize: '11px',
                          justifyContent: 'center',
                          opacity: launchState !== 'idle' ? 0.4 : 1,
                          cursor: launchState !== 'idle' ? 'not-allowed' : 'pointer'
                        }}
                        onClick={() => {
                          localStorage.removeItem('ample_cfg_' + currentMachineName)
                          const defaultTemplate = getDefaultCfgTemplate(currentMachineName)
                          setEditorCfgText(defaultTemplate)
                          addLog(`Reset configuration for ${currentMachineName} to defaults`, false)
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}

                {systemTab === 'ai' && (
                  <div className="section no-border" style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', height: '100%', padding: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                      <label className="slot-label" style={{ fontWeight: 600, fontSize: '13px', color: 'var(--green)' }}>🤖 AI Control Layer</label>
                      <button
                        className={`btn btn-sm ${aiEnabled ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '4px 10px', fontSize: '11px', minWidth: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => {
                          if (launchState !== 'running' && !aiEnabled) {
                            alert('AI Agent can only be started when the emulator is running!');
                            return;
                          }
                          setAiEnabled(!aiEnabled);
                        }}
                      >
                        {aiEnabled ? '🟢 Enabled' : '🔴 Disabled'}
                      </button>
                    </div>

                    <div className="slot-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="slot-row">
                        <label className="slot-label">Provider</label>
                        <select
                          className="slot-select"
                          value={aiProvider}
                          onChange={e => setAiProvider(e.target.value as any)}
                        >
                          <option value="mock">Mock Simulator</option>
                          <option value="gemini">Gemini 2.5 Flash</option>
                          <option value="openai">OpenAI GPT-4o-mini</option>
                          <option value="claude">Claude 3.5 Sonnet</option>
                        </select>
                      </div>

                      {aiProvider !== 'mock' && (
                        <div className="slot-row">
                          <label className="slot-label">API Key</label>
                          <input
                            type="password"
                            className="slot-select"
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(0, 0, 0, 0.2)',
                              color: 'var(--text1)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              fontSize: '11px'
                            }}
                            placeholder={`Enter ${aiProvider.toUpperCase()} Key`}
                            value={aiApiKey}
                            onChange={e => setAiApiKey(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="slot-row">
                        <label className="slot-label">Tick Rate (sec)</label>
                        <input
                          type="number"
                          className="slot-select"
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            color: 'var(--text1)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            width: '80px'
                          }}
                          min={2}
                          max={120}
                          value={aiTickRate}
                          onChange={e => setAiTickRate(Math.max(2, parseInt(e.target.value, 10) || 5))}
                        />
                      </div>

                      <div className="slot-row">
                        <label className="slot-label">Type Delay (ms)</label>
                        <input
                          type="number"
                          className="slot-select"
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            color: 'var(--text1)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            width: '80px'
                          }}
                          min={10}
                          max={500}
                          value={aiCharDelay}
                          onChange={e => setAiCharDelay(Math.max(10, parseInt(e.target.value, 10) || 50))}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <label className="slot-label" style={{ fontWeight: 500 }}>System Prompt</label>
                          <select
                            className="slot-select"
                            style={{ width: 'auto', padding: '2px 4px', fontSize: '10px' }}
                            onChange={e => {
                              const found = ADVENTURE_PROMPT_PRESETS.find(p => p.id === e.target.value);
                              if (found) setAiSystemPrompt(found.prompt);
                            }}
                            defaultValue="zork"
                          >
                            <option value="zork">Zork Presets</option>
                            <option value="general">General Presets</option>
                          </select>
                        </div>
                        <textarea
                          className="slot-select"
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '10px',
                            lineHeight: '1.3',
                            height: '110px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            color: '#e2e8f0',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            padding: '6px',
                            resize: 'none'
                          }}
                          value={aiSystemPrompt}
                          onChange={e => setAiSystemPrompt(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`resize-handle-h ${isConfigVResizing ? 'active' : ''}`}
              onMouseDown={() => setIsConfigVResizing(true)}
            />

            {/* Bottom Frame: Machine Configuration */}
            <div className="config-frame">
              <div className="frame-header">
                <button className={`tab-btn ${machineTab === 'slots' ? 'active' : ''}`} onClick={() => setMachineTab('slots')}>Slots</button>
                <button className={`tab-btn ${machineTab === 'media' ? 'active' : ''}`} onClick={() => setMachineTab('media')}>Media</button>
                <button className={`tab-btn ${machineTab === 'logs' ? 'active' : ''}`} onClick={() => setMachineTab('logs')}>Logs</button>
                <button className={`tab-btn ${machineTab === 'ai' ? 'active' : ''}`} onClick={() => setMachineTab('ai')}>AI Agent</button>

              </div>
              <div className="frame-content">
                {machineTab === 'slots' && (
                  <div className="section no-border">
                    {machineConfig ? (
                      <div className="slot-grid">
                        {(() => {
                          const renderSlots = (sList: Slot[], depth = 0, pathPrefix = ''): React.ReactNode => {
                            if (!Array.isArray(sList)) return null
                            return sList.map((slot, idx) => {
                              let fullPath = slot.name
                              if (pathPrefix) {
                                fullPath = (pathPrefix.endsWith(':') || slot.name.startsWith(':'))
                                  ? `${pathPrefix}${slot.name}`.replace(/:+/g, ':')
                                  : `${pathPrefix}:${slot.name}`
                              }

                              const selectedValue = slotValues[fullPath] || ''
                              const selectedOption = slot.options?.find((o: SlotOption) => o.value === selectedValue)

                              const nextPath = selectedValue ? `${fullPath}:${selectedValue}` : fullPath

                              const hasMultipleOptions = Array.isArray(slot.options) && slot.options.length > 1;

                              return (
                                <React.Fragment key={`${fullPath}-${depth}-${idx}`}>
                                  <div className="slot-row" style={{ paddingLeft: depth * 16 }}>
                                    <label className="slot-label" title={fullPath} style={!hasMultipleOptions ? { fontWeight: 600, opacity: 0.85 } : undefined}>
                                      {depth > 0 ? '↳ ' : ''}{slot.description}
                                    </label>
                                    {hasMultipleOptions && (
                                      <select
                                        className="slot-select"
                                        value={selectedValue}
                                        onChange={e => {
                                          const newVal = e.target.value
                                          setSlotValues(prev => {
                                            const next = { ...prev, [fullPath]: newVal }
                                            return fillSlotDefaults(machineConfig!.slots, next, machineConfig!.devices)
                                          })
                                        }}
                                      >
                                        {slot.options?.map((opt: SlotOption, i: number) => (
                                          <option key={i} value={opt.value} disabled={opt.disabled}>
                                            {opt.description}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  {Array.isArray(selectedOption?.slots) && renderSlots(selectedOption.slots, depth + 1, nextPath)}
                                  {selectedOption?.devname && machineConfig?.devices && (() => {
                                    const dev = machineConfig.devices.find((d: Device) => d.name === selectedOption.devname)
                                    return dev && Array.isArray(dev.slots) && renderSlots(dev.slots, depth + 1, nextPath)
                                  })()}
                                </React.Fragment>
                              )
                            })
                          }
                          return renderSlots(machineConfig.slots)
                        })()}
                      </div>
                    ) : (
                      <p className="empty-hint">No slots available for this machine.</p>
                    )}
                  </div>
                )}

                {machineTab === 'media' && (
                  <div className="section no-border">
                    <div className="media-grid">
                      {(() => {
                        const mediaItems = getEffectiveMedia()
                        if (mediaItems.length === 0) {
                          return <p className="empty-hint">No media drives available for current configuration.</p>
                        }

                        // Group by group name
                        const groups: Record<string, typeof mediaItems> = {}
                        mediaItems.forEach(item => {
                          if (!groups[item.group]) groups[item.group] = []
                          groups[item.group].push(item)
                        })

                        return Object.entries(groups).map(([groupName, items]) => (
                          <div key={groupName} className="media-group-wrap">
                            <h4 className="media-group-title">{groupName}</h4>
                            {items.map(item => (
                              <div key={item.id} className="media-row">
                                <label className="media-label">{item.label}</label>
                                <div className="media-input-wrap">
                                  <span className="media-filename">
                                    {mediaFiles[item.id]?.name || 'Empty'}
                                  </span>
                                  <div className="media-actions">
                                    <button className="btn btn-ghost btn-icon" onClick={() => fileInputRefs.current[item.id]?.click()} title="Select Local File">
                                      📁
                                    </button>
                                    <button className="btn btn-ghost btn-icon" onClick={() => handleInsertUrl(item.id)} title="Insert from URL">
                                      🌐
                                    </button>
                                    {mediaFiles[item.id] && (
                                      <button className="btn btn-ghost btn-icon" onClick={() => handleEject(item.id)} title="Eject">
                                        ⏏️
                                      </button>
                                    )}
                                  </div>
                                  <input
                                    type="file"
                                    ref={el => { fileInputRefs.current[item.id] = el }}
                                    style={{ display: 'none' }}
                                    onChange={async e => {
                                      if (e.target.files && e.target.files[0]) {
                                        const proceed = await checkAndPromptSaveDisk(item.id)
                                        if (!proceed) {
                                          e.target.value = ''
                                          return
                                        }
                                        let file = e.target.files[0]
                                        if (file.name.toLowerCase().endsWith('.zip')) {
                                          file = await handleZipFile(file)
                                        }
                                        setMediaFiles(prev => ({ ...prev, [item.id]: file }))
                                        dataManager.saveMedia(item.id, file)
                                        removeMediaUrl(item.id)
                                      }
                                      // Clear value to allow re-selecting same file after eject
                                      e.target.value = ''
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                {machineTab === 'logs' && (
                  <div className="log-panel-inline">
                    <div className="log-body">
                      {logs.length === 0 && (
                        <span className="log-empty">No log output yet.</span>
                      )}
                      {logs.map((l, i) => (
                        <div key={i} className={`log-line ${l.isError ? 'log-err' : ''}`}>
                          {l.text}
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                    <div className="log-footer">
                      <button className="log-btn" onClick={() => setLogs([])}>Clear Log</button>
                    </div>
                  </div>
                )}

                {machineTab === 'ai' && (
                  <div className="section no-border" style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', padding: '10px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>Status:</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          color: '#fff',
                          background:
                            aiStatus === 'thinking' ? '#f59e0b' :
                            aiStatus === 'typing' ? '#10b981' :
                            aiStatus === 'error' ? '#ef4444' : '#6b7280'
                        }}
                      >
                        {aiStatus === 'thinking' ? 'Thinking' :
                         aiStatus === 'typing' ? 'Typing' :
                         aiStatus === 'error' ? 'Error' : 'Idle'}
                      </span>
                    </div>

                    {aiError && (
                      <div style={{ padding: '6px 8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', fontSize: '11px', color: '#ef4444' }}>
                        <strong>Error:</strong> {aiError}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>Vision Screen Capture:</span>
                      <div style={{
                        width: '100%',
                        height: '110px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}>
                        {aiLastScreenshot ? (
                          <img
                            src={aiLastScreenshot}
                            alt="AI Last Screenshot"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text3)' }}>No screenshot captured yet</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '100px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>Agent Execution Log:</span>
                        <button
                          className="log-btn"
                          style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '10px' }}
                          onClick={() => setAiLogs([])}
                        >
                          Clear
                        </button>
                      </div>
                      <div style={{
                        flex: '1 1 auto',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        padding: '6px',
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        overflowY: 'auto',
                        lineHeight: '1.4',
                        height: '110px'
                      }}>
                        {aiLogs.length === 0 ? (
                          <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>Logs will appear here during execution...</span>
                        ) : (
                          aiLogs.map((log, idx) => (
                            <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '2px', marginBottom: '2px' }}>
                              <span style={{ color: 'var(--text3)', marginRight: '4px' }}>[{new Date(log.ts).toLocaleTimeString()}]</span>
                              <span style={{ color: log.text.includes('Error') ? '#ef4444' : log.text.includes('typed') ? 'var(--green)' : 'var(--text1)' }}>{log.text}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Config Footer: Launch Controls */}
            <div className="config-footer">
              {launchState === 'running' ? (
                <>
                  <div className="btn-group-row" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                      className="btn btn-primary btn-large"
                      onClick={handleLaunch}
                      style={{ flex: 1 }}
                      title="Restart"
                    >
                      <span style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 4px', borderRadius: '4px', marginRight: '6px' }}>🔄</span> Restart
                    </button>
                    <button
                      className="btn btn-primary btn-large"
                      onClick={handleStop}
                      style={{ flex: 1 }}
                      title="Stop"
                    >
                      <span style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 4px', borderRadius: '4px', marginRight: '6px' }}>⏹️</span> Stop
                    </button>
                  </div>
                  <div className="btn-group-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={handleMameUIToggle}
                      style={{ flex: '1 1 120px', fontSize: '11px', whiteSpace: 'nowrap', padding: '6px 4px' }}
                      title="Toggle MAME UI Mode (Scroll Lock)"
                    >
                      ⌨️ MAME UI (ScrlLk)
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleMameMenu}
                      style={{ flex: '1 1 120px', fontSize: '11px', whiteSpace: 'nowrap', padding: '6px 4px' }}
                      title="MAME Internal Menu (Tab)"
                    >
                      ⌨️ MAME Menu (Tab)
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-primary btn-large"
                  onClick={handleLaunch}
                  disabled={isLoading}
                  style={{ width: '100%' }}
                >
                  {isLoading ? '⏳' : '🍎'} {isLoading ? 'Launch' : 'Launch'}
                </button>
              )}
            </div>
            </div>
          </>
      ) : (
          <div className="welcome">
            <img src={`${BASE_URL}icon-256.png`} className="welcome-icon" alt="Ample Logo" />
            <h2>AmpleWeb</h2>
            <div className="welcome-author">
              by <a href="https://github.com/anomixer/ample/tree/ampleweb/AmpleWeb" target="_blank" rel="noopener noreferrer">anomixer</a>
            </div>
            <p>Browser-based Apple II &amp; Macintosh emulation</p>
            <p className="welcome-sub">Select a machine from the sidebar to begin</p>
            <p className="welcome-sub" style={{ color: theme === 'dark' ? '#fff' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              CORS Proxy sponsored by <img src={`${BASE_URL}corsfix.svg`} alt="Corsfix Logo" style={{ height: '16px' }} /> <a href="https://corsfix.com/" target="_blank" rel="noopener noreferrer" style={{ color: theme === 'dark' ? '#fff' : '#000', textDecoration: 'underline' }}>Corsfix</a>
            </p>
            <div className="welcome-port-link">
              For macOS, Windows, Linux port, click <a href="https://github.com/ksherlock/ample" target="_blank" rel="noopener noreferrer">HERE</a>.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/*
function _parseZip(data: Uint8Array, wanted: string[]): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {}
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // Find End of Central Directory
  let eocdOffset = -1
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) return result

  const cdOffset = view.getUint32(eocdOffset + 16, true)
  const cdEntries = view.getUint16(eocdOffset + 10, true)

  let pos = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break

    // const compSize = view.getUint32(pos + 20, true)
    const uncompSize = view.getUint32(pos + 24, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localHdrOffset = view.getUint32(pos + 42, true)
    const method = view.getUint16(pos + 10, true)

    const name = new TextDecoder().decode(data.subarray(pos + 46, pos + 46 + nameLen))
    const baseName = name.split('/').pop() || name

    if (!wanted.includes(baseName)) {
      pos += 46 + nameLen + extraLen + commentLen + 6
      continue
    }

    const lhNameLen = view.getUint16(localHdrOffset + 26, true)
    const lhExtraLen = view.getUint16(localHdrOffset + 28, true)
    const lhDataOffset = localHdrOffset + 30 + lhNameLen + lhExtraLen
    const fileData = data.subarray(lhDataOffset, lhDataOffset + uncompSize)

    if (method === 0) {
      result[baseName] = fileData
    } else if (method === 8) {
      console.warn(`[App] ${name} is deflated — cannot decompress in browser`)
    }
    pos += 46 + nameLen + extraLen + commentLen + 6
  }
  return result
}
*/

/*
function _createZip(entries: Record<string, Uint8Array>): Uint8Array {
  const encoder = new TextEncoder()
  const fileNames = Object.keys(entries)
  let dataOffset = 0
  for (const [name, data] of Object.entries(entries)) {
    dataOffset += 30 + encoder.encode(name).length + data.length
  }

  const cdSize = fileNames.reduce((s, n) => s + 46 + encoder.encode(n).length, 0)
  const totalSize = dataOffset + cdSize + 22
  const zip = new Uint8Array(totalSize)
  const view = new DataView(zip.buffer)
  let pos = 0

  // Local file headers + data
  for (const name of fileNames) {
    const data = entries[name]
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    view.setUint32(pos, 0x04034b50, true); pos += 4
    view.setUint16(pos, 20, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint32(pos, crc, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint16(pos, nameBytes.length, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    zip.set(nameBytes, pos); pos += nameBytes.length
    zip.set(data, pos); pos += data.length
  }

  // Central directory
  const cdStart = pos
  for (const name of fileNames) {
    const data = entries[name]
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    let off = 0
    for (let i = 0; i < fileNames.indexOf(name); i++) {
      off += 30 + encoder.encode(Object.keys(entries)[i]).length + entries[Object.keys(entries)[i]].length
    }
    view.setUint32(pos, 0x02014b50, true); pos += 4
    view.setUint16(pos, 20, true); pos += 2
    view.setUint16(pos, 20, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint32(pos, crc, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint16(pos, nameBytes.length, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint32(pos, 0, true); pos += 4
    view.setUint32(pos, off, true); pos += 4
    zip.set(nameBytes, pos); pos += nameBytes.length
  }

  // End of central directory
  view.setUint32(pos, 0x06054b50, true); pos += 4
  view.setUint16(pos, 0, true); pos += 2
  view.setUint16(pos, 0, true); pos += 2
  view.setUint16(pos, fileNames.length, true); pos += 2
  view.setUint16(pos, fileNames.length, true); pos += 2
  view.setUint32(pos, cdSize, true); pos += 4
  view.setUint32(pos, cdStart, true); pos += 4
  view.setUint16(pos, 0, true); pos += 2

  return zip
}
*/

/**
 * CRC32 lookup table and computation.
 */
/*
const _crc32Table: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()
*/

/*
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = _crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
*/

/** Read File as Uint8Array */
async function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default App

/* ─── Machine Tree Components ─── */

function MachineTree({
  models,
  expanded,
  selected,
  onToggle,
  onSelect,
  onLaunch,
  filter,
}: {
  models: ModelEntry[]
  expanded: Set<string>
  selected: { name: string; description: string } | null
  onToggle: (id: string) => void
  onSelect: (machine: { name: string; description: string }) => void
  onLaunch: () => void
  filter: string
}) {
  return (
    <ul className="machine-tree">
      {models.map(m => (
        <TreeItem
          key={`${m.description}${m.value ?? ''}`}
          entry={m}
          expanded={expanded}
          selected={selected}
          onToggle={onToggle}
          onSelect={onSelect}
          onLaunch={onLaunch}
          filter={filter}
          depth={0}
        />
      ))}
    </ul>
  )
}

function matchesFilter(entry: ModelEntry, filter: string): boolean {
  if (!filter) return true
  if (entry.description.toLowerCase().includes(filter)) return true
  if (entry.value?.toLowerCase().includes(filter)) return true
  if (entry.children?.some(c => matchesFilter(c, filter))) return true
  return false
}

function TreeItem({
  entry,
  expanded,
  selected,
  onToggle,
  onSelect,
  onLaunch,
  filter,
  depth,
}: {
  entry: ModelEntry
  expanded: Set<string>
  selected: { name: string; description: string } | null
  onToggle: (id: string) => void
  onSelect: (machine: { name: string; description: string }) => void
  onLaunch: () => void
  filter: string
  depth: number
}) {
  const hasChildren = !!(entry.children && entry.children.length > 0)
  const id = `${entry.description}${entry.value ?? ''}`

  if (filter && !matchesFilter(entry, filter)) return null

  const isExpanded = filter ? matchesFilter(entry, filter) : expanded.has(id)
  const isSelected = selected?.name === entry.value && !!entry.value
  const isWarning = entry.value && (NOT_WORKING_MACHINES.includes(entry.value) || entry.value === 'mprof3')
  const itemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected])

  return (
    <li>
      <div
        ref={itemRef}
        className={`tree-item${isSelected ? ' selected' : ''}${hasChildren ? ' group' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (hasChildren) onToggle(id)
          if (entry.value) onSelect({ name: entry.value, description: entry.description })
        }}
        onDoubleClick={() => {
          if (entry.value && !hasChildren) onLaunch()
        }}
      >
        <div className="tree-item-content">
          {hasChildren ? (
            <span className="tree-arrow">{isExpanded ? '▾' : '▸'}</span>
          ) : (
            <span className="tree-dot"></span>
          )}
          <span className={`tree-label${isWarning ? ' warning' : ''}`}>{entry.description}</span>
        </div>
        {entry.value && !hasChildren && (
          <code className={`tree-id${isWarning ? ' warning' : ''}`}>{entry.value}</code>
        )}
      </div>

      {hasChildren && isExpanded && (
        <ul className="tree-children">
          {entry.children!.map(child => (
            <TreeItem
              key={`${child.description}${child.value ?? ''}`}
              entry={child}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
              onLaunch={onLaunch}
              filter={filter}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}