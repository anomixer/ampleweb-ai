export interface ModelEntry {
  description: string
  value: string
  children?: ModelEntry[]
}

export interface RomEntry {
  value: string
  description: string
}

export interface SlotOption {
  value: string
  description: string
  default?: boolean
  intValue?: number
  devname?: string
  media?: Record<string, number>
  disabled?: boolean
}

export interface Slot {
  name: string
  description: string
  options: SlotOption[]
}

export interface DeviceSlot {
  name: string
  options: SlotOption[]
}

export interface Device {
  name: string
  slots: DeviceSlot[]
}

export interface SoftwareFilter {
  name: string
  filter?: string
}

export interface MachineConfig {
  value: string
  description: string
  media: Record<string, number>
  resolution: [number, number]
  slots: Slot[]
  devices?: Device[]
  software?: (string | SoftwareFilter)[]
}

export interface SoftwareItem {
  name: string
  description: string
  compatibility?: string
}

export interface SoftwareList {
  description: string
  items: SoftwareItem[]
}

export interface SoftwareListResult {
  name: string
  description: string
  items: SoftwareItem[]
}

export class DataManager {
  private models: ModelEntry[] = []
  private roms: RomEntry[] = []
  private machineCache = new Map<string, MachineConfig>()
  private softwareCache = new Map<string, SoftwareList>()

  async loadModels(): Promise<ModelEntry[]> {
    if (this.models.length > 0) return this.models
    const text = await fetch('/resources/models.plist').then(r => r.text())
    this.models = this.parseModelsPlist(text)
    return this.models
  }

  async loadRoms(): Promise<RomEntry[]> {
    if (this.roms.length > 0) return this.roms
    const text = await fetch('/resources/roms.plist').then(r => r.text())
    this.roms = this.parseRomsPlist(text)
    return this.roms
  }

  async loadMachine(name: string): Promise<MachineConfig | null> {
    if (this.machineCache.has(name)) return this.machineCache.get(name)!
    try {
      const text = await fetch(`/resources/${name}.plist`).then(r => {
        if (!r.ok) return null
        return r.text()
      })
      if (!text) return null
      const config = this.parseMachinePlist(text)
      if (config) this.machineCache.set(name, config)
      return config
    } catch {
      return null
    }
  }

  async loadSoftwareLists(software: (string | SoftwareFilter)[]): Promise<SoftwareListResult[]> {
    const results: SoftwareListResult[] = []
    for (const item of software) {
      let xmlFile: string
      let filterVal: string | undefined

      if (typeof item === 'string') {
        xmlFile = item
      } else {
        xmlFile = item.name
        filterVal = item.filter
      }

      if (!xmlFile.endsWith('.xml')) xmlFile += '.xml'

      const listName = xmlFile.replace('.xml', '')
      const cached = this.softwareCache.get(xmlFile)
      if (cached) {
        const filteredItems = filterVal
          ? cached.items.filter(i => !i.compatibility || i.compatibility.split(',').includes(filterVal))
          : cached.items
        results.push({ name: listName, description: cached.description, items: filteredItems })
      } else {
        try {
          const text = await fetch(`/resources/software/${xmlFile}`).then(r => {
            if (!r.ok) return null
            return r.text()
          })
          if (text) {
            const list = this.parseSoftwareXml(text)
            this.softwareCache.set(xmlFile, list)
            const filteredItems = filterVal
              ? list.items.filter(i => !i.compatibility || i.compatibility.split(',').includes(filterVal))
              : list.items
            results.push({ name: listName, description: list.description, items: filteredItems })
          }
        } catch {
          results.push({ name: listName, description: '', items: [] })
        }
      }
    }
    return results
  }

  getFlatMachines(models: ModelEntry[]): { name: string; description: string }[] {
    const flat: { name: string; description: string }[] = []
    const walk = (entries: ModelEntry[]) => {
      for (const entry of entries) {
        if (entry.value) {
          flat.push({ name: entry.value, description: entry.description })
        }
        if (entry.children) {
          walk(entry.children)
        }
      }
    }
    walk(models)
    return flat
  }

  private parseModelsPlist(text: string): ModelEntry[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const plist = doc.querySelector('plist')
    if (!plist) return []
    const root = plist.firstElementChild
    if (!root || root.tagName !== 'array') return []
    return this.parseArray(root) as ModelEntry[]
  }

  private parseRomsPlist(text: string): RomEntry[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const plist = doc.querySelector('plist')
    if (!plist) return []
    const root = plist.firstElementChild
    if (!root || root.tagName !== 'array') return []
    return this.parseArray(root) as RomEntry[]
  }

  private parseMachinePlist(text: string): MachineConfig | null {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const plist = doc.querySelector('plist')
    if (!plist) return null
    const root = plist.firstElementChild
    if (!root || root.tagName !== 'dict') return null
    const dict = this.parseDict(root)
    return {
      value: dict['value'] as string || '',
      description: dict['description'] as string || '',
      media: (dict['media'] as Record<string, number>) || {},
      resolution: (dict['resolution'] as [number, number]) || [0, 0],
      slots: (dict['slots'] as Slot[]) || [],
      devices: dict['devices'] as Device[] | undefined,
      software: dict['software'] as (string | SoftwareFilter)[] | undefined,
    }
  }

  private parseSoftwareXml(text: string): SoftwareList {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const root = doc.documentElement
    const description = root.getAttribute('description') || ''
    const items: SoftwareItem[] = []
    const softwareEls = root.querySelectorAll('software')
    for (const el of softwareEls) {
      const name = el.getAttribute('name') || ''
      const desc = el.getAttribute('description') || ''
      const compat = el.getAttribute('compatibility') || undefined
      if (name) {
        items.push({ name, description: desc, compatibility: compat })
      }
    }
    return { description, items }
  }

  private parseArray(el: Element): any[] {
    const result: any[] = []
    for (const child of Array.from(el.children)) {
      if (child.tagName === 'dict') {
        result.push(this.parseDict(child))
      } else if (child.tagName === 'string') {
        result.push(child.textContent || '')
      } else if (child.tagName === 'array') {
        result.push(this.parseArray(child))
      } else if (child.tagName === 'integer') {
        result.push(parseInt(child.textContent || '0', 10))
      } else if (child.tagName === 'true') {
        result.push(true)
      } else if (child.tagName === 'false') {
        result.push(false)
      }
    }
    return result
  }

  private parseDict(el: Element): Record<string, any> {
    const result: Record<string, any> = {}
    const children = Array.from(el.children)
    for (let i = 0; i < children.length; i += 2) {
      const keyEl = children[i]
      const valEl = children[i + 1]
      if (keyEl.tagName !== 'key' || !valEl) continue
      const key = keyEl.textContent || ''
      switch (valEl.tagName) {
        case 'dict':
          result[key] = this.parseDict(valEl)
          break
        case 'array':
          result[key] = this.parseArray(valEl)
          break
        case 'string':
          result[key] = valEl.textContent || ''
          break
        case 'integer':
          result[key] = parseInt(valEl.textContent || '0', 10)
          break
        case 'true':
          result[key] = true
          break
        case 'false':
          result[key] = false
          break
      }
    }
    return result
  }
}

export const dataManager = new DataManager()
