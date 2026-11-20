import type { Records, Settings, WorldState } from './model.ts'
import { Simulation } from './simulation.ts'

const prefix = 'microgenesis.v1.'
export const defaults: Settings = { volume: .62, quality: 'auto', muted: false }
export const emptyRecords: Records = { bestTime: 0, bestStage: 0, wins: 0 }

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(prefix + key) ?? 'null') } catch { return null }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(prefix + key)
    else localStorage.setItem(prefix + key, JSON.stringify(value))
  } catch {
    // Private browsing, user settings and storage limits can disable persistence.
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function validNumber(value: unknown, lower: number, upper: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(upper, Math.max(lower, value)) : fallback
}

export function readSettings(): Settings {
  const stored = record(read('settings'))
  return {
    volume: validNumber(stored.volume, 0, 1, defaults.volume),
    quality: stored.quality === 'high' || stored.quality === 'low' ? stored.quality : 'auto',
    muted: stored.muted === true,
  }
}

export function readRecords(): Records {
  const stored = record(read('records'))
  return {
    bestTime: validNumber(stored.bestTime, 0, Number.MAX_SAFE_INTEGER, 0),
    bestStage: Math.floor(validNumber(stored.bestStage, 0, 4, 0)),
    wins: Math.floor(validNumber(stored.wins, 0, Number.MAX_SAFE_INTEGER, 0)),
  }
}

export const updateSettings = (settings: Settings) => write('settings', settings)
export const updateRecords = (records: Records) => write('records', records)
export const storeRun = (world: WorldState | null) => write('run', world?.outcome === 'active' ? world : null)
export const readRun = () => Simulation.restore(read('run'))
