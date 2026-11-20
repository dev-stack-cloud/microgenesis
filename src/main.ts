import { GameAudio } from './audio.ts'
import { GameControls } from './controls.ts'
import type { Point, Screen, Settings } from './model.ts'
import { GameRenderer } from './renderer.ts'
import { NURSERY_SEED, Simulation, STEP } from './simulation.ts'
import { readRecords, readRun, readSettings, storeRun, updateRecords, updateSettings } from './storage.ts'
import { GameUI } from './ui.ts'

const host = document.querySelector<HTMLElement>('#viewport')
if (!host) throw new Error('Game viewport missing')

const renderer = new GameRenderer()
const audio = new GameAudio()
let settings = readSettings()
let records = readRecords()
let saved = readRun()
let run: Simulation | null = null
let mode: Screen = 'title'
let fromOverlay: Screen = 'title'
let ready = false
let clock = 0
let last = 0
let lastHUD = -1
let lastSave = 0
let finalMoment = 0
let aim: Point | null = null

const ui = new GameUI({
  start: () => start(false),
  resume: () => mode === 'title' ? start(true) : show('playing'),
  pause: togglePause,
  title: toTitle,
  settings: () => overlay('settings'),
  help: () => overlay('help'),
  back: back,
  evolve: evolve,
  mutate: id => {
    if (mode !== 'evolution' || !run?.mutate(id)) return
    playEvents()
    storeRun(run.world)
    show('playing')
  },
  setSettings: applySettings,
})
const controls = new GameControls(host, {
  pause: togglePause,
  evolve,
  zoom: delta => { if (mode === 'playing') renderer.zoom(delta) },
})
controls.setEnabled(false)

applySettings(settings, false)
ui.show('title')

function show(screen: Screen) {
  mode = screen
  clock = 0
  aim = null
  controls.clear()
  controls.setEnabled(screen === 'playing')
  ui.show(screen)
  if (screen === 'playing') {
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (run) ui.update(run.view())
  }
}

function applySettings(value: Settings, persist = true) {
  settings = value
  audio.setVolume(value.volume)
  audio.setMuted(value.muted)
  if (persist) {
    updateSettings(settings)
    if (!value.muted) void audio.unlock()
  }
  ui.setSettings(value)
  if (ready) renderer.setQuality(value.quality)
}

function start(continuing: boolean) {
  if (!ready) return
  void audio.unlock().then(() => audio.play('start'))
  const rawSeed = new URLSearchParams(location.search).get('seed')
  const chosen = rawSeed !== null && /^\d{1,10}$/.test(rawSeed) ? Number(rawSeed) >>> 0 : NURSERY_SEED
  run = continuing ? saved : new Simulation(chosen)
  if (!run) return
  saved = null
  storeRun(run.world)
  renderer.resetCamera()
  lastSave = run.world.time
  lastHUD = -1
  finalMoment = 0
  show('playing')
}

function toTitle() {
  if (run?.world.outcome === 'active') {
    storeRun(run.world)
    saved = run
  }
  run = null
  finalMoment = 0
  audio.setThreat(0)
  ui.setMenu(Boolean(saved), records)
  show('title')
}

function togglePause() {
  if (mode === 'playing' && run?.world.outcome === 'active') {
    storeRun(run.world)
    show('pause')
  } else if (mode === 'pause') show('playing')
  else if (mode === 'settings' || mode === 'help' || mode === 'evolution') back()
}

function overlay(screen: 'settings' | 'help') {
  fromOverlay = mode
  show(screen)
}

function evolve() {
  if (mode !== 'playing' || !run || run.world.outcome !== 'active') return
  storeRun(run.world)
  ui.update(run.view())
  ui.showEvolution(run.world.player.path, run.world.player.tier, run.choices())
  show('evolution')
}

function back() {
  if (mode === 'evolution') show('playing')
  else if (mode === 'settings' || mode === 'help') show(fromOverlay)
}

function playEvents() {
  if (!run) return
  for (const event of run.events) audio.play(event)
  run.events.length = 0
}

function finish() {
  if (!run) return
  const won = run.world.outcome === 'won'
  records = {
    bestTime: Math.max(records.bestTime, run.world.time),
    bestStage: Math.max(records.bestStage, won ? 4 : run.world.phase),
    wins: records.wins + Number(won),
  }
  updateRecords(records)
  storeRun(null)
  ui.update(run.view())
  controls.setEnabled(false)
  audio.setThreat(0)
  finalMoment = won ? 3.8 : 1.05
}

function frame(timestamp: number) {
  const dt = last ? Math.min(.10, Math.max(0, (timestamp - last) / 1000)) : 0
  last = timestamp
  if (mode === 'playing' && run?.world.outcome === 'active') {
    clock += dt
    while (clock >= STEP) {
      const raw = controls.sample()
      aim = raw.pointer ? renderer.screenToWorld(raw.pointer.x, raw.pointer.y) : null
      run.step({ x: raw.x, y: raw.y, aim, absorb: raw.absorb, bond: raw.bond, dash: raw.dash, ability: raw.ability })
      clock -= STEP
      if (run.world.outcome !== 'active') {
        finish()
        break
      }
    }
    playEvents()
    if (run.world.time - lastHUD >= .095) {
      const view = run.view()
      ui.update(view)
      if (run.world.outcome === 'active') audio.setThreat(view.salinity + (view.bossHp !== null ? .12 : 0))
      lastHUD = run.world.time
    }
    if (run.world.time - lastSave >= 6 && run.world.outcome === 'active') {
      storeRun(run.world)
      lastSave = run.world.time
    }
  } else if (mode === 'playing' && run && finalMoment > 0) {
    finalMoment -= dt
    for (const effect of run.world.effects) effect.age += dt
    if (finalMoment <= 0) {
      ui.setResult(run.world.outcome === 'won', run.view(), records)
      show('result')
    }
  }
  renderer.draw(run?.world ?? null, Math.min(1, clock / STEP), dt, aim, mode !== 'playing' && mode !== 'title')
  requestAnimationFrame(frame)
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing' && run?.world.outcome === 'active') togglePause()
  if (!document.hidden) last = 0
})
window.addEventListener('pagehide', () => { if (run?.world.outcome === 'active') storeRun(run.world) })
renderer.init(host).then(() => {
  ready = true
  ui.setMenu(Boolean(saved), records)
  renderer.setQuality(settings.quality)
  renderer.resetCamera()
  document.documentElement.dataset.engine = 'ready'
  requestAnimationFrame(frame)
}).catch(error => {
  console.error(error)
  ui.setLoadingError('WebGL could not start. Enable hardware acceleration in your browser, then reload to begin.')
})
