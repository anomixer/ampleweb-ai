import React, { useState, useEffect, useRef, useCallback } from 'react'
import { dataManager, type ModelEntry, type MachineConfig } from './core/data_manager'
import {
  loadMameWasm,
  buildMameArgs,
  fetchRom,
  type MameWasmModule,
  type RomFile,
  type MediaFile,
} from './core/wasm_loader'
import { useStore } from './core/store'

/**
 * Emulator type → WASM file info.
 * Maps Ample's emulator values to the correct WASM file and MAME driver.
 */
const EMULATOR_WASM_MAP: Record<string, { wasm: string; js: string; driver: string }> = {
  // Dedicated emularity builds (each WASM = one emularity config)
  apple2e: { wasm: 'apple2e.wasm', js: 'apple2e.js', driver: 'apple2e' },
  apple2ee: { wasm: 'apple2e.wasm', js: 'apple2e.js', driver: 'apple2ee' },
  mac128: { wasm: 'mac128.wasm', js: 'mac128.js', driver: 'mac128k' },
  maciici: { wasm: 'maciici.wasm', js: 'maciici.js', driver: 'maciici' },
  mc10: { wasm: 'mc10.wasm', js: 'mc10.js', driver: 'mc10' },
  // MAME-wrapped builds (full MAME with specific driver)
  apple2: { wasm: 'mameapple2.wasm', js: 'mameapple2.js', driver: 'apple2p' },
  apple2gs: { wasm: 'apple2gs.wasm', js: 'apple2gs.js', driver: 'apple2gs' },
  apple3: { wasm: 'apple3.wasm', js: 'apple3.js', driver: 'apple3' },
  mac: { wasm: 'mac.wasm', js: 'mac.js', driver: 'mac' },
  coco: { wasm: 'coco.wasm', js: 'coco.js', driver: 'coco' },
  coco3: { wasm: 'coco3.wasm', js: 'coco3.js', driver: 'coco3' },
  trs80: { wasm: 'trs80.wasm', js: 'trs80.js', driver: 'trs80' },
  // NOTE: st WASM is Stadium Hero (arcade), NOT Atari ST. No Atari ST support.
  // NOTE: mac128.wasm only supports mac128k + macplus + macse drivers (per emularity config).
  c64: { wasm: 'c64.wasm', js: 'c64.js', driver: 'c64' },
  // Universal and Tiny engines
  mame: { wasm: 'mame.wasm.gz', js: 'mame.js', driver: 'apple2e' },
  mametiny: { wasm: 'mametiny.wasm', js: 'mametiny.js', driver: 'apple2' },
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
  // Mac II family → mac.wasm
  macii: 'macii',
  maciihmu: 'macii',
  mac2fdhd: 'macii',
  maciix: 'maciix',
  maciifx: 'maciifx',
  maciicx: 'macii',
  maciisi: 'maciisi',
  maciivx: 'maciivx',
  maciivi: 'maciivi',
  // Mac Quadra → mac.wasm
  macqd605: 'macqd605',
  macqd610: 'macqd610',
  macqd630: 'macqd630',
  macqd650: 'macqd650',
  macqd700: 'macqd700',
  macqd800: 'macqd800',
  macqd900: 'macqd900',
  macqd950: 'macqd950',
  // Mac LC/Performa → mac.wasm
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
  // Mac Portable → mac.wasm
  macprtb: 'macprtb',
  macpb100: 'macpb100',
  macpb140: 'macpb140',
  macpb145: 'macpb140',
  macpb145b: 'macpb140',
  macpb160: 'macpb160',
  macpb165: 'macpb160',
  macpb165c: 'macpb160',
  macpb170: 'macpb140',
  macpb180: 'macpb160',
  macpb180c: 'macpb180c',
  // Mac Duo → mac.wasm
  macpd210: 'macpd210',
  macpd230: 'macpd210',
  macpd250: 'macpd210',
  macpd270c: 'macpd270c',
  macpd280: 'macpd280',
  macpd280c: 'macpd280',
  // Mac Classic → mac.wasm
  macclasc: 'macclasc',
  macclas2: 'macclas2',
  maccclas: 'maccclas',
  // apple2e* variants (Platinum models use apple2e.wasm but use apple2e driver)
  apple2ep: 'apple2ee',
  apple2epuk: 'apple2eeuk',
  apple2epde: 'apple2ee',
  apple2epfr: 'apple2ee',
  apple2epes: 'apple2ee',
  apple2epse: 'apple2ee',
  // apple2c* variants (also use apple2e.wasm)
  apple2c: 'apple2c',
  apple2c0: 'apple2c0',
  apple2c1: 'apple2c1',
  apple2c2: 'apple2c2',
  apple2c3: 'apple2c3',
  apple2c4: 'apple2c4',
  apple2cp: 'apple2cp',
  apple2cm: 'apple2cm',
  apple2che: 'apple2che',
  // apple2ee* variants (Enhanced models fallback to apple2ee/uk)
  apple2ee: 'apple2ee',
  apple2eeuk: 'apple2eeuk',
  apple2eede: 'apple2ee',
  apple2eese: 'apple2ee',
  apple2eefr: 'apple2ee',
  // base variants (Original fallback to apple2e)
  apple2euk: 'apple2euk',
  apple2ede: 'apple2e',
  apple2ese: 'apple2e',
  apple2efr: 'apple2e',
  apple2ees: 'apple2ees',
  // apple2 (original) and variants
  apple2: 'apple2',
  apple2p: 'apple2p',
  apple2jp: 'apple2jp',
  // Apple IIc
  apple2c: 'apple2c',
  apple2c0: 'apple2c0',
  apple2c1: 'apple2c1',
  apple2c2: 'apple2c2',
  apple2c3: 'apple2c3',
  apple2c4: 'apple2c4',
  apple2cp: 'apple2cp',
  apple2cm: 'apple2cm',
  apple2che: 'apple2che',
  apple2cde: 'apple2cde',
  apple2cfr: 'apple2cfr',
  apple2cse: 'apple2cse',
  apple2cuk: 'apple2cuk',
  apple2ede: 'apple2ede',
  apple2ese: 'apple2ese',
  apple2efr: 'apple2efr',
  apple2euk: 'apple2euk',
  apple2es: 'apple2es',
  // Enhanced
  apple2eefr: 'apple2eefr',
  apple2eede: 'apple2eede',
  apple2eese: 'apple2eese',
  apple2eeuk: 'apple2eeuk',
  apple2ees: 'apple2ees',
  // Platinum
  apple2epfr: 'apple2epfr',
  apple2epde: 'apple2epde',
  apple2epse: 'apple2epse',
  apple2epuk: 'apple2epuk',
  // Apple II Clones
  albert: 'albert',
  am100: 'am100',
  basis108: 'basis108',
  hkc8800a: 'hkc8800a',
  prav82: 'prav82',
  prav8m: 'prav8m',
  // CEC variants
  cec2000: 'cec2000',
  cece: 'cece',
  cecg: 'cecg',
  ceci: 'ceci',
  cecm: 'cecm',
  // Franklin Ace variants
  ace100: 'ace100',
  ace500: 'ace500',
  ace1000: 'ace1000',
  ace2200: 'ace2200',
  // Education / Other Clones
  mprof3: 'mprof3',
  zijini: 'zijini',
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
  // BBC / Other 8-bit
  bbcb: 'bbcb',
  bbca: 'bbca',
  bbcm: 'bbcm',
  electron: 'electron',
  dragon32: 'dragon32',
  dragon64: 'dragon64',
  oric1: 'oric1',
  // TRS-80 / CoCo / C64 / MC-10
  trs80: 'trs80',
  trs80l2: 'trs80l2',
  coco: 'coco',
  coco3: 'coco3',
  c64: 'c64',
  mc10: 'mc10',
  apple1: 'apple1',
  apple2gs: 'apple2gs',
  apple2gsr0: 'apple2gsr0',
  apple2gsr1: 'apple2gsr1',
  apple2gsr3: 'apple2gs',
  apple3: 'apple3',
  // Macintosh family
  mac128k: 'mac128k',
  mac512k: 'mac512k',
  mac512ke: 'mac512ke',
  macplus: 'macplus',
  macse: 'macse',
  macsefd: 'macsefd',
  macse30: 'macse30',
  maciici: 'maciici',
  macii: 'macii',
  maciihmu: 'maciihmu',
  maciix: 'maciix',
  maciifx: 'maciifx',
  maciicx: 'maciicx',
  maciisi: 'maciisi',
  maciivx: 'maciivx',
  maciivi: 'maciivi',
  macqd605: 'macqd605',
  macqd610: 'macqd610',
  macqd630: 'macqd630',
  macqd650: 'macqd650',
  macqd700: 'macqd700',
  macqd800: 'macqd800',
  macqd900: 'macqd900',
  macqd950: 'macqd950',
  maclc: 'maclc',
  maclc2: 'maclc2',
  maclc3: 'maclc3',
  maclc3p: 'maclc3p',
  maclc520: 'maclc520',
  maclc550: 'maclc550',
  maclc575: 'maclc575',
  macpb100: 'macpb100',
  macpb140: 'macpb140',
  macpb145: 'macpb145',
  macpb145b: 'macpb145b',
  macpb160: 'macpb160',
  macpb165: 'macpb165',
  macpb165c: 'macpb165c',
  macpb170: 'macpb170',
  macpb180: 'macpb180',
  macpb180c: 'macpb180c',
  macpd210: 'macpd210',
  macpd230: 'macpd230',
  macpd250: 'macpd250',
  macpd270c: 'macpd270c',
  macpd280: 'macpd280',
  macpd280c: 'macpd280c',
  macclasc: 'macclasc',
  macclas2: 'macclas2',
  maccclas: 'maccclas',
  mactv: 'mactv',
  macprtb: 'macprtb',
  mac2fdhd: 'mac2fdhd',
  macct610: 'macct610',
  macct650: 'macct650',
  maclc475: 'maclc475',
  // More Clones
  am64: 'am64',
  craft2p: 'craft2p',
  dodo: 'dodo',
  elppa: 'elppa',
  ivelultr: 'ivelultr',
  maxxi: 'maxxi',
  microeng: 'microeng',
  uniap2en: 'uniap2en',
  uniap2pt: 'uniap2pt',
  prav8c: 'prav8c',
  tk3000: 'tk3000',
  zijini: 'zijini',
}



/** Lightweight file existence check (synchronous, checks browser cache). */
const _wasmCache: Record<string, boolean> = {}
function _wasmExists(filename: string): boolean {
  const url = `/wasm/${filename}`
  if (!(url in _wasmCache)) {
    _wasmCache[url] = false
    fetch(url, { method: 'HEAD' })
      .then(r => { _wasmCache[url] = r.ok })
      .catch(() => { _wasmCache[url] = false })
  }
  return _wasmCache[url]
}

/**
 * Get the WASM info for an emulator type, falling back to available.
 */
function getWasmForEmulator(emulator: string, machineName: string): { wasm: string; js: string; driver: string } | null {
  // Direct match from EMULATOR_WASM_MAP
  const info = EMULATOR_WASM_MAP[emulator]
  if (info) return info
  // Fallback for early Apple machines if emulator lookup failed
  if (machineName === 'apple1' || machineName === 'apple2' || machineName === 'apple2p' || machineName === 'apple2jp') {
    return EMULATOR_WASM_MAP['mametiny'] || EMULATOR_WASM_MAP['apple2']
  }
  if (emulator === 'apple2e') return EMULATOR_WASM_MAP['apple2e']
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
  bbcbp: 'bbcbp.zip',
  bbcbp128: 'bbcbp128.zip;bbcbp.zip',
  bbcm: 'bbcm.zip',
  bbcmc: 'bbcmc.zip',
  bbcmt: 'bbcmt.zip;bbc_tube_65c102.zip;saa5050.zip;bbcm.zip',
  c64: 'c64.zip',
  c64c: 'c64c.zip;c64.zip',
  cec2000: 'cec2000.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  cece: 'cece.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  cecg: 'cecg.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  ceci: 'ceci.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  cecm: 'cecm.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  coco: 'coco.zip',
  coco2b: 'coco2b.zip;coco.zip',
  coco2bh: 'coco2bh.zip;coco.zip',
  coco3: 'coco3.zip;coco.zip',
  coco3h: 'coco3h.zip;coco.zip',
  coco3p: 'coco3p.zip;coco.zip',
  cocoh: 'cocoh.zip;coco.zip',
  craft2p: 'craft2p.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  d64plus: 'd64plus.zip;dragon32.zip',
  dodo: 'dodo.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2.zip',
  dragon200: 'dragon200.zip;dragon32.zip',
  dragon200e: 'dragon200e.zip;dragon32.zip',
  dragon32: 'dragon32.zip',
  dragon64: 'dragon64.zip;dragon32.zip',
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
  mac2fdhd: 'mac2fdhd.zip;nb_mdc824.zip;adbmodem.zip',
  mac512k: 'mac512k.zip;mackbd_m0110.zip;mackbd_m0120.zip;mac128k.zip',
  mac512ke: 'mac512ke.zip;mackbd_m0110.zip;mackbd_m0120.zip;macplus.zip',
  maccclas: 'maccclas.zip;adbmodem.zip;cuda.zip',
  macclas2: 'macclas2.zip;egret.zip',
  macclasc: 'macclasc.zip;adbmodem.zip;cuda.zip',
  macct610: 'macct610.zip;macqd800.zip;adbmodem.zip',
  macct650: 'macct650.zip;macqd800.zip;adbmodem.zip',
  macii: 'macii.zip;nb_mdc824.zip;adbmodem.zip',
  maciici: 'maciici.zip;egret.zip;nb_mdc824.zip;adbmodem.zip',
  maciicx: 'maciicx.zip;nb_mdc824.zip;adbmodem.zip;mac2fdhd.zip',
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
  maclc475: 'maclc475.zip;macqd605.zip;cuda.zip',
  maclc520: 'maclc520.zip;cuda.zip',
  maclc550: 'maclc550.zip;maclc520.zip;cuda.zip',
  maclc575: 'maclc575.zip;macqd605.zip;cuda.zip',
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
  macse30: 'macse30.zip;mac2fdhd.zip;nb_mdc824.zip;adbmodem.zip',
  macsefd: 'macsefd.zip;adbmodem.zip',
  mactv: 'mactv.zip;adbmodem.zip;cuda.zip',
  maxxi: 'maxxi.zip;d2fdc.zip;votrsc01a.zip;a2diskiing.zip;apple2e.zip',
  mc10: 'mc10.zip',
  megast: 'megast.zip;st.zip',
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
  st: 'st.zip',
  tanodr64: 'tanodr64.zip;dragon32.zip',
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
  apple2: '560x384',
  apple2e: '560x384',
  apple2gs: '704x462',
  apple3: '560x384',
  mac128: '512x342',
  maciici: '640x480',
  mac: '640x480',
  maclc: '512x384',
  macqd: '640x480',
  macpb: '640x400',
  coco: '320x240',
  coco3: '640x480',
  trs80: '384x192',
  c64: '384x272',
  mc10: '372x243',
  mametiny: '560x384',
}

function App() {
  const { theme, toggleTheme } = useStore()
  const [models, setModels] = useState<ModelEntry[]>([])
  const [selectedMachine, setSelectedMachine] = useState<{ name: string; description: string } | null>(null)
  const [machineConfig, setMachineConfig] = useState<MachineConfig | null>(null)
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  const [wasmModule, setWasmModule] = useState<MameWasmModule | null>(null)
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [wasmProgress, setWasmProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<LogLine[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [search, setSearch] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [configWidth, setConfigWidth] = useState(450)
  const [isConfigResizing, setIsConfigResizing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [romSettings, setRomSettings] = useState({ autoDownload: false, downloadServers: [] as string[] })
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [configTab, setConfigTab] = useState<'slots' | 'media' | 'logs'>('slots')
  const [mediaFiles, setMediaFiles] = useState<Record<string, File | null>>({})
  const logEndRef = useRef<HTMLDivElement>(null)
  const hasAutoLaunched = useRef(false)

  // Detect available WASM on mount (legacy display only)
  const [wasmTarget] = useState(() => {
    for (const [emu, info] of Object.entries(EMULATOR_WASM_MAP)) {
      if (_wasmExists(info.wasm)) return emu
    }
    return 'none'
  })





  // ── Sidebar resize ──
  useEffect(() => {
    if (!isSidebarResizing) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(200, Math.min(500, e.clientX))
      setSidebarWidth(w)
    }
    const onUp = () => setIsSidebarResizing(false)
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
    }
    const onUp = () => setIsConfigResizing(false)
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
        const option = s.options?.find(o => o.value === val) || s.options?.find(o => o.default)
        if (option) {
          next[fullPath] = option.value
          // Avoid trailing colon if option.value is empty
          const nextPrefix = option.value ? `${fullPath}:${option.value}` : fullPath
          if (Array.isArray(option.slots)) walk(option.slots, nextPrefix)
          if (option.devname && devices) {
            const dev = devices.find(d => d.name === option.devname)
            if (dev && Array.isArray(dev.slots)) walk(dev.slots, nextPrefix)
          }
        }
      })
    }
    walk(slots, parentPath)
    return next
  }, [])

  const doSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
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
  }, [fillSlotDefaults])

  const handleSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
    doSelectMachine(machine)
  }, [doSelectMachine])

  const fetchAllRoms = useCallback(async (machineName: string, effectiveDriver: string): Promise<RomFile[]> => {
    const romFiles: RomFile[] = []

    // 1. Main machine ROM — look up from DRIVER_ROM_MAP
    const rawMapValue = DRIVER_ROM_MAP[machineName] || (machineName.startsWith('apple2gs') ? DRIVER_ROM_MAP['apple2gs_shared'] : null)
    const romFilesToFetch = rawMapValue ? rawMapValue.split(';') : [machineName + '.zip']

    for (const romFile of romFilesToFetch) {
      try {
        const url = `/roms/${romFile}`
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
    ]
    if (driverName.startsWith('apple2') || driverName === 'apple2p') {
      for (const aux of auxRoms) {
        try {
          const resp = await fetch(`/roms/${aux.zipName}.zip`)
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

    return romFiles
  }, [addLog])

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
    if (!machineConfig) return {}

    const counts: Record<string, number> = {}
    const typeMap: Record<string, string> = {
      'floppy_5_25': 'flop',
      'floppy_3_5': 'flop',
      'hard': 'hard',
      'cdrom': 'cdrom',
      'cass': 'cass',
      'cassette': 'cass'
    }

    // Include root media
    Object.entries(machineConfig.media).forEach(([mameType, count]) => {
      const brief = typeMap[mameType] || mameType
      counts[brief] = (counts[brief] || 0) + count
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
        if (!selectedValue) return

        const option = slot.options?.find(o => o.value === selectedValue)
        if (option) {
          if (option.media) {
            Object.entries(option.media).forEach(([mameType, count]) => {
              const brief = typeMap[mameType] || mameType
              counts[brief] = (counts[brief] || 0) + count
            })
          }
          const nextPath = selectedValue ? `${fullPath}:${selectedValue}` : fullPath
          if (Array.isArray(option.slots)) {
            collectMedia(option.slots, nextPath)
          }
          if (option.devname && machineConfig.devices) {
            const dev = machineConfig.devices.find(d => d.name === option.devname)
            if (dev && Array.isArray(dev.slots)) {
              collectMedia(dev.slots, nextPath)
            }
          }
        }
      })
    }

    collectMedia(machineConfig.slots)

    // Force 5.25" floppy drives for CEC machines
    if (selectedMachine?.name.startsWith('cec')) {
      counts['flop'] = Math.max(counts['flop'] || 0, 2)
    }

    return counts
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
    mediaParam?: Record<string, File | null>
  ) => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)

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

    // Use emulator-appropriate resolution
    const resolution = DEFAULT_RESOLUTIONS[emulator] ?? '640x480'
    // Resolve MAME driver name (e.g. mac128k → mac)
    const mameDriver = DRIVER_MAP[machine.name] ?? wasmInfo.driver

    // Step 1: fetch ROMs
    setLaunchState('fetching-rom')
    setStatusText('Fetching ROM...')

    let romFiles: RomFile[] = []
    try {
      romFiles = await fetchAllRoms(machine.name, mameDriver)
    } catch (e) {
      addLog(`ROM fetch failed: ${e}`, true)
    }

    // Step 2: load WASM
    setLaunchState('loading-wasm')
    const wasmUrl = `/wasm/${wasmInfo.wasm}`
    addLog(`Using /wasm/${wasmInfo.wasm} (emulator: ${emulator}, driver: ${wasmInfo.driver})`, false)

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

    for (const [path, value] of Object.entries(finalSlots)) {
      if (path === 'ramsize') {
        ramsizeArg = value
        continue
      }
      // If it's a media drive slot (like sl6:0), don't pass as a slot argument
      // MAME usually handles these via -flop1, etc.
      if (isMediaSlot(path)) continue

      filteredSlots[path] = value
    }

    const args = buildMameArgs(mameDriver, {
      slots: filteredSlots,
      extraArgs: [
        '-verbose',
        ...(ramsizeArg ? ['-ramsize', ramsizeArg] : []),
        '-resolution', resolution,
        '-rompath', romPathArg,
        ...(mediaList.map(m => [`-${m.type}`, `/media/${m.name}`]).flat())
      ]
    })
    addLog(`args: ${args.join(' ')}`, false)

    try {
      const mod = await loadMameWasm(wasmUrl, {
        driverArgs: args,
        romFiles,
        mediaFiles: mediaList,
        romPath: '/roms',
        jsUrl: `/wasm/${wasmInfo.js}`,
        onProgress: (loaded, total) => {
          if (total > 0) {
            const pct = Math.round((loaded / total) * 100)
            setWasmProgress(pct)
            setStatusText(`Loading... ${pct}%`)
          }
        },
        onError: (err) => {
          let msg = err
          if (err.includes('Failed to fetch') || err.includes('404')) {
            msg += `\nPlace the correct WASM in public/wasm/`
          }
          setErrorText(msg)
          setLaunchState('error')
          addLog(`Error: ${msg}`, true)
        },
        onLog: addLog,
        onReady: (m) => {
          setWasmModule(m)
          setLaunchState('running')
          setStatusText('')

          requestAnimationFrame(() => {
            const c = document.getElementById('canvas') as HTMLCanvasElement | null
            if (c && canvasContainerRef.current) {
              canvasContainerRef.current.innerHTML = ''
              canvasContainerRef.current.appendChild(c)
              c.style.display = ''
            }
          })
        },
      })
      setWasmModule(mod)
    } catch (e: any) {
      const msg = e.message || String(e)
      setErrorText(msg)
      setLaunchState('error')
      addLog(`Fatal: ${msg}`, true)
    }
  }, [wasmTarget, addLog, fetchAllRoms, mediaFiles, slotValues])

  const handleLaunch = useCallback(async () => {
    if (!selectedMachine) return

    // If already running, refresh the whole page to ensure a clean state
    if (wasmModule) {
      const url = new URL(window.location.href)
      url.searchParams.set('m', selectedMachine.name)
      url.searchParams.set('d', selectedMachine.description)
      url.searchParams.set('launch', '1')
      window.location.href = url.toString()
      return
    }

    doLaunch(selectedMachine)
  }, [selectedMachine, wasmModule, doLaunch])

  useEffect(() => {
    const init = async () => {
      const data = await dataManager.loadModels()
      setModels(data)

      // Restore selection from URL
      const params = new URLSearchParams(window.location.search)
      const m = params.get('m')
      const d = params.get('d')

      let machineToLaunch: { name: string; description: string } | null = null
      if (m && d) {
        machineToLaunch = { name: m, description: d }
        // Restore machine config and slots
        const config = await dataManager.loadMachine(machineToLaunch.name)
        setMachineConfig(config)
        let slots: Record<string, string> = {}
        const slotsParam = params.get('s')
        if (slotsParam) {
          try {
            slotsParam.split(',').forEach(p => {
              const [k, v] = p.split(':')
              if (k && v) slots[k] = v
            })
          } catch { }
        }

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

        if (findPath(data, m, [])) {
          setExpandedNodes(prev => new Set([...prev, ...path]))
        }

        // 3. Restore media from IndexedDB
        let restoredMedia: Record<string, File | null> = {}
        const mediaParam = params.get('media')
        if (mediaParam) {
          const pairs = mediaParam.split(',')
          for (const p of pairs) {
            const [id, name] = p.split(':')
            if (id && name) {
              const file = await dataManager.loadMedia(id)
              if (file) restoredMedia[id] = file
            }
          }
          setMediaFiles(restoredMedia)
        }

        // 4. Trigger launch logic
        if (params.get('launch') === '1' && !hasAutoLaunched.current) {
          hasAutoLaunched.current = true
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete('launch')
          window.history.replaceState({}, '', newUrl.toString())
          doLaunch(machineToLaunch, slots, restoredMedia)
        }
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Mount only

  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Sync selection to URL (without reloading)
  useEffect(() => {
    if (selectedMachine) {
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

      // Sync media filenames
      const mediaStrings = Object.entries(mediaFiles)
        .filter(([_, f]) => !!f)
        .map(([k, f]) => `${k}:${f!.name}`)
        .join(',')
      if (mediaStrings) url.searchParams.set('media', mediaStrings)
      else url.searchParams.delete('media')

      window.history.replaceState({}, '', url.toString())
    }
  }, [selectedMachine, slotValues, mediaFiles])

  /**
   * Test launch — no ROMs, just load the WASM runtime.
   */
  const handleTestLaunch = useCallback(async () => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)
    setLaunchState('loading-wasm')

    // Use apple2e for test
    const wasmInfo = getWasmForEmulator('apple2e')
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
        onReady: (mod) => {
          setWasmModule(mod)
          setLaunchState('running')
          requestAnimationFrame(() => {
            const c = document.getElementById('canvas') as HTMLCanvasElement | null
            if (c && canvasContainerRef.current) {
              canvasContainerRef.current.innerHTML = ''
              canvasContainerRef.current.appendChild(c)
              c.style.display = ''
            }
          })
        },
      })
    } catch (e: any) {
      setErrorText(e.message || String(e))
      setLaunchState('error')
      addLog(`Fatal: ${e}`, true)
    }
  }, [wasmTarget, addLog])

  /**
   * Strip TorrentZip footer (40 bytes: 36-byte SHA256 + PK\x07\x08 sig)
   * so MAME's ZIP parser can read the file.
   */
  const stripTorrentZip = (data: Uint8Array): Uint8Array => {
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

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isLoading = launchState === 'fetching-rom' || launchState === 'loading-wasm'

  return (
    <div className={`app ${theme}`}>
      {/* ── Left Sidebar ── */}
      <div className="sidebar" style={{ width: sidebarWidth, flexShrink: 0, minWidth: '200px' }}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <span className="sidebar-logo">🍎</span>
            <span>AmpleWeb</span>
          </div>
          <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
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
                <span className="settings-toggle-track" />
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
        className={`resize-handle ${isSidebarResizing ? 'active' : ''}`}
        onMouseDown={() => setIsSidebarResizing(true)}
      />

      {/* ── Right Main Panel ── */}
      <div className="main" style={{ minWidth: 0 }}>
        {selectedMachine ? (
          <div className="machine-panel">
            {/* Machine header */}
            <div className="machine-header">
              <div>
                <h2 className="machine-title">{selectedMachine.description}</h2>
                <code className="machine-id">{selectedMachine.name}</code>
              </div>
              <div className="header-badges">
                {launchState === 'running' && (
                  <span className="badge badge-running">● Running</span>
                )}
                {launchState === 'error' && (
                  <span className="badge badge-error">● Error</span>
                )}
              </div>
            </div>

            {/* Progress bar (top of panel, before layout split) */}
            {isLoading && (
              <div className="progress-wrap">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${wasmProgress}%` }} />
                </div>
                <span className="progress-label">{statusText}</span>
              </div>
            )}

            {/* Error banner */}
            {errorText && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <pre>{errorText}</pre>
              </div>
            )}

            {/* Content row: emulator + config side by side */}
            <div className="content-row">
              {/* Left: emulator canvas */}
              <div className="emulator-area">
                <div className={`emulator-container ${launchState === 'running' ? 'active' : ''}`}>
                  <div
                    ref={canvasContainerRef}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: launchState === 'running' ? 'flex' : 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  />

                  {launchState !== 'running' && (
                    <div className="emulator-placeholder">
                      {launchState === 'idle' && (
                        <div className="welcome-inner">
                          <div className="welcome-badge">MAME {selectedMachine.name}</div>
                          <p>Press Launch to start emulation</p>
                        </div>
                      )}
                      {isLoading && (
                        <div className="loading-indicator">
                          <div className="spinner" />
                          <p>{statusText}</p>
                        </div>
                      )}
                      {launchState === 'error' && (
                        <div className="error-state">
                          <span className="error-icon">❌</span>
                          <p>Emulation failed</p>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfigTab('logs')}>View Log</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Config Resize Handle ── */}
              <div
                className={`resize-handle ${isConfigResizing ? 'active' : ''}`}
                onMouseDown={() => setIsConfigResizing(true)}
              />

              {/* Config area */}
              <div className="config-area" style={{ width: configWidth ?? 450 }}>
                <div className="tab-header">
                  <button
                    className={`tab-btn ${configTab === 'slots' ? 'active' : ''}`}
                    onClick={() => setConfigTab('slots')}
                  >
                    Slots
                  </button>
                  <button
                    className={`tab-btn ${configTab === 'media' ? 'active' : ''}`}
                    onClick={() => setConfigTab('media')}
                  >
                    Media
                  </button>
                  <button
                    className={`tab-btn ${configTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setConfigTab('logs')}
                  >
                    Logs
                  </button>
                </div>

                <div className="tab-content">
                  {configTab === 'slots' && (
                    <div className="section no-border">
                      {machineConfig ? (
                        <div className="slot-grid">
                          {(() => {
                            const renderSlots = (sList: Slot[], depth = 0, pathPrefix = '') => {
                              if (!Array.isArray(sList)) return null
                              return sList.map((slot, idx) => {
                                let fullPath = slot.name
                                if (pathPrefix) {
                                  fullPath = (pathPrefix.endsWith(':') || slot.name.startsWith(':'))
                                    ? `${pathPrefix}${slot.name}`.replace(/:+/g, ':')
                                    : `${pathPrefix}:${slot.name}`
                                }

                                const selectedValue = slotValues[fullPath] || ''
                                const selectedOption = slot.options?.find(o => o.value === selectedValue)

                                const nextPath = selectedValue ? `${fullPath}:${selectedValue}` : fullPath

                                return (
                                  <React.Fragment key={`${fullPath}-${depth}-${idx}`}>
                                    <div className="slot-row" style={{ paddingLeft: depth * 16 }}>
                                      <label className="slot-label" title={fullPath}>
                                        {depth > 0 ? '↳ ' : ''}{slot.description}
                                      </label>
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
                                        {slot.options?.map((opt, i) => (
                                          <option key={i} value={opt.value} disabled={opt.disabled}>
                                            {opt.description}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    {Array.isArray(selectedOption?.slots) && renderSlots(selectedOption.slots, depth + 1, nextPath)}
                                    {selectedOption?.devname && machineConfig?.devices && (() => {
                                      const dev = machineConfig.devices.find(d => d.name === selectedOption.devname)
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

                  {configTab === 'media' && (
                    <div className="section no-border">
                      <div className="media-grid">
                        {machineConfig && Object.entries(getEffectiveMedia()).map(([type, count]) => (
                          Array.from({ length: count }).map((_, i) => {
                            const mediaId = `${type}${i + 1}`
                            const label = `${type.toUpperCase()} ${i + 1}`
                            return (
                              <div key={mediaId} className="media-row">
                                <label className="media-label">{label}</label>
                                <div className="media-input-wrap">
                                  <span className="media-filename">
                                    {mediaFiles[mediaId]?.name || 'Empty'}
                                  </span>
                                  <button className="btn btn-ghost btn-icon" onClick={() => document.getElementById(`file-${mediaId}`)?.click()} title="Select File">
                                    📁
                                  </button>
                                  {mediaFiles[mediaId] && (
                                    <button
                                      className="btn btn-ghost btn-icon"
                                      onClick={() => {
                                        setMediaFiles(prev => {
                                          const next = { ...prev }
                                          delete next[mediaId]
                                          return next
                                        })
                                        dataManager.clearMedia(mediaId)
                                      }}
                                      title="Eject"
                                    >
                                      ⏏️
                                    </button>
                                  )}
                                  <input
                                    type="file"
                                    id={`file-${mediaId}`}
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null
                                      setMediaFiles(prev => ({ ...prev, [mediaId]: file }))
                                      if (file) {
                                        dataManager.saveMedia(mediaId, file)
                                      } else {
                                        dataManager.clearMedia(mediaId)
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })
                        ))}
                        {(!machineConfig || Object.keys(getEffectiveMedia()).length === 0) && (
                          <p className="empty-hint">No media drives available.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {configTab === 'logs' && (
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
                </div>

                <div className="launch-footer">
                  <button
                    className="btn btn-primary btn-large"
                    onClick={handleLaunch}
                    disabled={isLoading}
                  >
                    {isLoading ? '⏳' : wasmModule ? '🔄' : '🚀'} {isLoading ? 'Loading...' : wasmModule ? 'Restart' : 'Launch'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="welcome">
            <div className="welcome-icon">🍎</div>
            <h2>AmpleWeb</h2>
            <p>Browser-based Apple II &amp; Macintosh emulation</p>
            {wasmTarget && (
              <p style={{ fontSize: '12px', opacity: 0.5 }}>
                WASM target: {wasmTarget}
              </p>
            )}
            <p className="welcome-sub">Select a machine from the sidebar to begin</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Minimal ZIP parser: extract specific files from a ZIP archive.
 * Handles standard ZIP and TorrentZip (PK\x07\x08 footer stripped).
 */
function parseZip(data: Uint8Array, wanted: string[]): Record<string, Uint8Array> {
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

    const compSize = view.getUint32(pos + 20, true)
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

/**
 * Create a minimal ZIP in memory from a map of filename -> content.
 * Uses stored (no-compression) method.
 */
function createZip(entries: Record<string, Uint8Array>): Uint8Array {
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

/**
 * CRC32 lookup table and computation.
 */
const _crc32Table: number[] = (() => {
  const table: number[] = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = _crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

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
  filter,
}: {
  models: ModelEntry[]
  expanded: Set<string>
  selected: { name: string; description: string } | null
  onToggle: (id: string) => void
  onSelect: (machine: { name: string; description: string }) => void
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
  filter,
  depth,
}: {
  entry: ModelEntry
  expanded: Set<string>
  selected: { name: string; description: string } | null
  onToggle: (id: string) => void
  onSelect: (machine: { name: string; description: string }) => void
  filter: string
  depth: number
}) {
  const hasChildren = !!(entry.children && entry.children.length > 0)
  const id = `${entry.description}${entry.value ?? ''}`

  if (filter && !matchesFilter(entry, filter)) return null

  const isExpanded = filter ? matchesFilter(entry, filter) : expanded.has(id)
  const isSelected = selected?.name === entry.value && !!entry.value
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
      >
        <div className="tree-item-content">
          {hasChildren ? (
            <span className="tree-arrow">{isExpanded ? '▾' : '▸'}</span>
          ) : (
            <span className="tree-dot"></span>
          )}
          <span className="tree-label">{entry.description}</span>
        </div>
        {entry.value && !hasChildren && (
          <code className="tree-id">{entry.value}</code>
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
              filter={filter}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}