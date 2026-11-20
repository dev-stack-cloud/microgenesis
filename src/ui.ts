import './style.css'
import type { HUDView, Mutation, Path, Records, Screen, Settings, UIActions } from './model.ts'
import { tierTimes, tiersRequire } from './progression.ts'

const paths: Path[] = ['predator', 'symbiote', 'crystalline']
const lineages: Record<Path, { label: string; role: string; colors: [string, string] }> = {
  predator: { label: 'Predator', role: 'Assault', colors: ['#ff916f', '#ffe1a9'] },
  symbiote: { label: 'Symbiote', role: 'Sustain', colors: ['#80bc62', '#dcffab'] },
  crystalline: { label: 'Crystalline', role: 'Defense', colors: ['#68c2d3', '#ceffff'] },
}

const romans = ['—', 'I', 'II', 'III', 'IV']
const dialogScreens = ['pause', 'settings', 'help', 'evolution', 'result'] as const
const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'
type SimpleAction = 'start' | 'resume' | 'pause' | 'title' | 'settings' | 'help' | 'back' | 'evolve'
type Preview = { context: CanvasRenderingContext2D; path: Path; tier: number }

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing interface element #${id}`)
  return found as T
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const entry = document.createElement(tag)
  if (className) entry.className = className
  if (text) entry.textContent = text
  return entry
}

function write(element: HTMLElement, value: string | number): void {
  const text = String(value)
  if (element.textContent !== text) element.textContent = text
}

function fill(element: HTMLElement, fraction: number, meter = false): void {
  const level = Math.round(Math.max(0, Math.min(1, fraction)) * 100)
  const value = String(level / 100)
  if (element.style.getPropertyValue('--fill') === value) return
  element.style.setProperty('--fill', value)
  if (meter) element.setAttribute('aria-valuenow', String(level))
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function phaseLabel(phase: number): string {
  return romans[phase] ?? String(phase)
}

function drawPreview(preview: Preview, time: number): void {
  const { context: ctx, path, tier } = preview
  const [base, glint] = lineages[path].colors
  const count = path === 'symbiote' ? 6 : path === 'predator' ? 5 : 7
  const tilt = path === 'symbiote' ? 0.1 : path === 'predator' ? -0.37 : -0.11
  ctx.clearRect(0, 0, 182, 100)
  ctx.save()
  ctx.translate(91, 51)
  ctx.rotate(Math.sin(time * 0.85) * .09 + tilt)
  for (let branch = 0; branch < count; branch++) {
    const angle = branch * Math.PI * 2 / count
    ctx.save()
    ctx.rotate(angle + Math.sin(time * 1.6 + branch) * .05)
    const length = 34 + (branch % 3) * 4 + tier * 1.25
    const sway = Math.sin(time * 2.1 + branch * 1.3) * 3
    if (path === 'predator') {
      ctx.beginPath()
      ctx.moveTo(3, -5)
      ctx.bezierCurveTo(length * .5, -20, length * .89, -9, length + 3, -18 + sway)
      ctx.bezierCurveTo(length + 2, -3, length * .68, 2, length * .55, 3)
      ctx.bezierCurveTo(length * .61, 6, length * .48, 7, length * .39, 4)
      ctx.quadraticCurveTo(13, 15, 3, 6)
      ctx.closePath()
    } else if (path === 'symbiote') {
      ctx.beginPath()
      ctx.moveTo(3, -4)
      ctx.bezierCurveTo(length * .45, -17, length * .76, -17 + sway, length + 1, -5 + sway)
      ctx.bezierCurveTo(length * .98, 8 + sway, length * .62, 15, 3, 5)
      ctx.closePath()
    } else {
      ctx.beginPath()
      ctx.moveTo(4, -4)
      ctx.lineTo(length * .52, -12)
      ctx.lineTo(length - 1, -8)
      ctx.lineTo(length + 4, -2)
      ctx.lineTo(length * .81, 8)
      ctx.lineTo(length * .36, 10)
      ctx.closePath()
    }
    const material = ctx.createLinearGradient(0, 8, length, -12)
    material.addColorStop(0, base + '22')
    material.addColorStop(0.72, base + '61')
    material.addColorStop(1, glint + 'bb')
    ctx.fillStyle = material
    ctx.strokeStyle = base + 'bb'
    ctx.lineWidth = .65
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, 0)
    if (path === 'crystalline') {
      ctx.lineTo(length * .58, -3)
      ctx.lineTo(length + 2, -2)
      ctx.moveTo(length * .58, -3)
      ctx.lineTo(length * .52, -12)
      ctx.moveTo(length * .58, -3)
      ctx.lineTo(length * .81, 8)
    } else {
      ctx.bezierCurveTo(length * .38, 4, length * .75, -6, length * .94, -3 + sway)
      ctx.moveTo(length * .52, -1.5)
      ctx.quadraticCurveTo(length * .63, -5, length * .66, -12)
    }
    ctx.strokeStyle = glint + '95'
    ctx.lineWidth = .54
    ctx.stroke()

    const progress = (time * .55 + branch * .31) % 1
    ctx.beginPath()
    ctx.arc(7 + progress * length * .87, Math.sin(progress * Math.PI * 1.1) * -2, 1 + progress * .6, 0, Math.PI * 2)
    ctx.fillStyle = glint
    ctx.shadowBlur = 5
    ctx.shadowColor = glint
    ctx.fill()
    ctx.restore()
  }

  const pulse = Math.sin(time * 2.2) * .8
  ctx.beginPath()
  ctx.moveTo(14 + pulse, 0)
  for (let ring = 1; ring <= 50; ring++) {
    const angle = ring / 50 * Math.PI * 2
    const radius = 13 + Math.cos(angle * 5 + time) * 1.3 + pulse
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  ctx.closePath()
  ctx.strokeStyle = base
  ctx.lineWidth = 1
  const nucleus = ctx.createRadialGradient(-3, -4, 0, 0, 0, 14)
  nucleus.addColorStop(0, glint)
  nucleus.addColorStop(.34, base + 'ee')
  nucleus.addColorStop(.67, base + '43')
  nucleus.addColorStop(1, base + '1a')
  ctx.fillStyle = nucleus
  ctx.shadowBlur = 12
  ctx.shadowColor = base
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 0.65
  ctx.fillStyle = glint
  for (let granule = 0; granule < 17; granule++) {
    const angle = granule * 2.4 + time * .1
    const radius = Math.sqrt(granule / 17) * 11
    ctx.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius, .8, .8)
  }
  ctx.restore()
}

export class GameUI {
  private readonly root = byId('interface')
  private readonly title = byId('title-screen')
  private readonly hud = byId('hud')
  private readonly dialogs = byId('dialogs')
  private readonly panels = {
    pause: byId('pause-screen'),
    settings: byId('settings-screen'),
    help: byId('help-screen'),
    evolution: byId('evolution-screen'),
    result: byId('result-screen'),
  }
  private readonly begin = byId<HTMLButtonElement>('begin-culture')
  private readonly continueButton = byId<HTMLButtonElement>('continue-culture')
  private readonly titleRecord = byId('title-record')
  private readonly error = byId('loading-error')
  private readonly volume = byId<HTMLInputElement>('master-volume')
  private readonly volumePercent = byId('volume-percent')
  private readonly muted = byId<HTMLInputElement>('audio-muted')
  private readonly quality = byId<HTMLSelectElement>('graphics-quality')
  private readonly tree = byId('mutation-tree')
  private readonly evolutionInstruction = byId('evolution-instruction')
  private readonly evolutionGate = byId('evolution-gate')
  private readonly evolutionCatalysts = byId('evolution-catalysts')
  private readonly phase = byId('hud-phase')
  private readonly location = byId('hud-location')
  private readonly time = byId('hud-time')
  private readonly energy = byId('hud-energy')
  private readonly hp = byId('hud-hp')
  private readonly energyMeter = byId('energy-meter')
  private readonly hpMeter = byId('hp-meter')
  private readonly biomass = byId('hud-biomass')
  private readonly catalysts = byId('hud-catalysts')
  private readonly threat = byId('hud-threat')
  private readonly mapPlayer = byId('map-player')
  private readonly objective = byId('hud-objective')
  private readonly tip = byId('hud-tip')
  private readonly evolutionMeter = byId('evolution-meter')
  private readonly evolveButton = byId('evolve-button')
  private readonly evolveStatus = byId('evolve-status')
  private readonly lineage = byId('hud-lineage')
  private readonly dashMeter = byId('dash-meter')
  private readonly abilityMeter = byId('ability-meter')
  private readonly crown = byId('crown-health')
  private readonly bossMeter = byId('boss-meter')
  private readonly bearing = byId('crown-pointer')
  private current: Screen = 'title'
  private returnTo: HTMLElement | null = null
  private hasRun = false
  private readings = { time: 0, bonds: 0, catalysts: 0 }
  private previews: Preview[] = []
  private previewFrame = 0
  private previewTime = 0
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor(private readonly actions: UIActions) {
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button')
      if (!button || button.disabled) return
      const id = button.dataset.mutation
      if (id) {
        this.actions.mutate(id)
        return
      }
      const action = button.dataset.action as SimpleAction | undefined
      if (action) this.actions[action]()
    })

    const reportSettings = () => this.actions.setSettings({
      volume: Number(this.volume.value) / 100,
      quality: this.quality.value as Settings['quality'],
      muted: this.muted.checked,
    })
    this.volume.addEventListener('input', reportSettings)
    this.quality.addEventListener('change', reportSettings)
    this.muted.addEventListener('change', reportSettings)

    this.dialogs.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return
      const panel = this.activeDialog()
      if (!panel) return
      const targets = panel.querySelectorAll<HTMLElement>(selector)
      const first = targets[0]
      const last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    })
  }

  show(screen: Screen): void {
    if (this.current === 'title' && screen !== 'title') {
      this.returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    if (screen === 'playing' || screen === 'pause') this.hasRun = true
    if (screen === 'title' || screen === 'result') this.hasRun = false
    this.current = screen
    this.root.dataset.screen = screen
    const modal = this.activeDialog()
    this.title.hidden = this.hasRun || screen === 'result'
    this.title.inert = modal !== null
    this.hud.hidden = !this.hasRun
    this.hud.inert = screen !== 'playing'
    this.dialogs.hidden = modal === null

    for (const name of dialogScreens) this.panels[name].hidden = name !== screen
    if (modal) {
      this.dialogs.scrollTop = 0
      modal.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
    } else if (screen === 'playing') {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    } else if (screen === 'title' && this.returnTo && this.title.contains(this.returnTo)) {
      this.returnTo.focus({ preventScroll: true })
    }

    if (screen === 'evolution') this.startPreviews()
    else this.stopPreviews()
  }

  update(view: HUDView): void {
    this.readings.time = view.time
    this.readings.bonds = view.bonds
    this.readings.catalysts = view.catalysts
    write(this.phase, `Phase ${phaseLabel(view.phase + 1)}`)
    write(this.location, view.location)
    write(this.time, clock(view.time))
    write(this.energy, `${Math.ceil(view.energy)} / ${Math.floor(view.maxEnergy)}`)
    write(this.hp, `${Math.ceil(view.hp)} / ${Math.floor(view.maxHp)}`)
    fill(this.energyMeter, view.energy / view.maxEnergy, true)
    fill(this.hpMeter, view.hp / view.maxHp, true)
    write(this.biomass, Math.floor(view.biomass))
    write(this.catalysts, Math.floor(view.catalysts))
    write(this.evolutionCatalysts, Math.floor(view.catalysts))
    write(this.threat, `${Math.round(view.salinity * 100)}%`)
    write(this.objective, view.objective)
    write(this.tip, view.tip)
    this.tip.hidden = view.tip === ''
    write(this.lineage, view.path ? `${lineages[view.path].label} ${phaseLabel(view.tier)}` : 'Progenitor')
    write(this.evolveStatus, view.mutationReady ? 'Mutation ready' : 'Evolution')
    this.evolveButton.classList.toggle('is-ready', view.mutationReady)
    fill(this.dashMeter, view.dash)
    fill(this.abilityMeter, view.ability)
    fill(this.evolutionMeter, view.evolution)

    this.mapPlayer.style.left = `${(50 + view.minimapX * 45).toFixed(1)}%`
    this.mapPlayer.style.top = `${(50 + view.minimapY * 45).toFixed(1)}%`
    this.crown.hidden = view.bossHp === null
    if (view.bossHp !== null) fill(this.bossMeter, view.bossHp, true)
    this.bearing.hidden = view.bossBearing === null
    if (view.bossBearing !== null) this.bearing.style.setProperty('--angle', `${view.bossBearing.toFixed(3)}rad`)
  }

  setSettings(settings: Settings): void {
    const percent = Math.round(settings.volume * 100)
    if (Number(this.volume.value) !== percent) this.volume.value = String(percent)
    write(this.volumePercent, `${percent}%`)
    this.muted.checked = settings.muted
    this.quality.value = settings.quality
  }

  setMenu(canContinue: boolean, records: Records): void {
    this.continueButton.hidden = !canContinue
    this.begin.classList.toggle('secondary', canContinue)
    this.begin.firstChild!.textContent = canContinue ? 'New culture ' : 'Begin culture '
    this.begin.disabled = false
    write(this.titleRecord.querySelector<HTMLElement>('b')!, records.bestTime > 0 ? clock(records.bestTime) : '—')
    const wins = byId('title-wins')
    wins.hidden = records.wins === 0
    write(wins, records.wins === 1 ? '1 successful culture' : `${records.wins} successful cultures`)
  }

  setResult(won: boolean, view: HUDView, records: Records): void {
    this.panels.result.dataset.won = String(won)
    write(byId('result-kicker'), won ? 'Culture stabilized' : 'Culture terminated')
    write(byId('result-title'), won ? 'Crown dissolved' : 'Specimen lost')
    write(byId('result-description'), won
      ? 'The Crown colony has broken apart. Your organism is the dominant life form in the culture.'
      : 'The nucleus has ruptured and its branches have dispersed.')
    write(byId('result-time'), clock(view.time))
    write(byId('result-bonds'), view.bonds)
    write(byId('result-tier'), view.path ? `${lineages[view.path].label} ${phaseLabel(view.tier)}` : 'Progenitor')
    write(byId('result-best'), clock(records.bestTime))
    write(byId('result-phase'), records.bestStage > 3 ? 'Complete' : phaseLabel(records.bestStage + 1))
    write(byId('result-wins'), records.wins)
  }

  showEvolution(path: Path | null, tier: number, choices: Mutation[]): void {
    this.stopPreviews()
    this.tree.textContent = ''
    this.previews = []
    const nextTier = tier + 1
    const upcoming = choices.find(choice => (!path || choice.path === path) && choice.tier === nextTier)
    let instruction = 'Choose a lineage for this culture. The first mutation determines which adaptations you can develop.'
    if (path) {
      const name = lineages[path].label.toLowerCase()
      instruction = upcoming ? `Your ${name} lineage is set.` : `All ${name} mutations are active.`
    }
    write(this.evolutionInstruction, instruction)
    const gates: string[] = []
    if (upcoming && !upcoming.available) {
      const bondsNeeded = Math.max(0, tiersRequire[nextTier] - this.readings.bonds)
      const catalystsNeeded = Math.ceil(Math.max(0, upcoming.cost - this.readings.catalysts))
      if (bondsNeeded) gates.push(`form ${bondsNeeded} more ${bondsNeeded === 1 ? 'bond' : 'bonds'}`)
      if (catalystsNeeded) gates.push(`collect ${catalystsNeeded} more ${catalystsNeeded === 1 ? 'catalyst' : 'catalysts'}`)
      if (tierTimes[nextTier] > this.readings.time) gates.push(`survive to ${clock(tierTimes[nextTier])}`)
    }
    write(this.evolutionGate, gates.length ? `To unlock tier ${phaseLabel(nextTier)}, ${gates.join(' · ')}.` : '')
    this.evolutionGate.hidden = gates.length === 0
    for (const lineage of paths) {
      const spec = lineages[lineage]
      const selected = lineage === path
      const column = el('section', `mutation-lineage${selected ? ' is-chosen' : ''}`)
      column.dataset.path = lineage
      const preview = el('div', 'mutation-preview')
      preview.setAttribute('aria-hidden', 'true')
      const canvas = el('canvas')
      canvas.width = 364
      canvas.height = 200
      const context = canvas.getContext('2d')
      if (context) {
        context.scale(2, 2)
        const illustration = { context, path: lineage, tier: selected ? Math.min(3, tier + 1) : 1 }
        this.previews.push(illustration)
        drawPreview(illustration, 0)
      }
      preview.append(canvas)

      const title = el('h3', 'lineage-title', spec.label)
      title.append(el('span', '', selected ? 'Active' : spec.role))
      const nodes = el('div', 'mutation-nodes')
      for (const mutation of choices.filter((choice) => choice.path === lineage)) {
        const unlocked = selected && mutation.tier <= tier
        const next = (!path || selected) && mutation.tier === tier + 1
        const button = el('button', 'mutation-node')
        button.type = 'button'
        button.dataset.mutation = mutation.id
        button.disabled = !mutation.available
        button.title = mutation.description
        button.classList.toggle('is-available', mutation.available)
        button.classList.toggle('is-unlocked', unlocked)
        const cost = unlocked ? 'Active' : `${mutation.cost} CAT`
        const catalystText = mutation.cost === 1 ? '1 catalyst' : `${mutation.cost} catalysts`
        button.setAttribute('aria-label', `${mutation.name}, ${unlocked ? 'active' : catalystText}. ${mutation.description}`)
        button.append(el('i'), el('b', '', mutation.name), el('small', '', cost))
        if (next) button.append(el('p', '', mutation.trait))
        nodes.append(button)
      }
      column.append(preview, title, nodes)
      this.tree.append(column)
    }
    if (this.current === 'evolution') this.startPreviews()
  }

  setLoadingError(message: string): void {
    write(this.error, message)
    this.error.hidden = false
    this.begin.disabled = true
    this.continueButton.hidden = true
  }

  private activeDialog(): HTMLElement | null {
    return this.current === 'title' || this.current === 'playing' ? null : this.panels[this.current]
  }

  private readonly animatePreviews = (now: number): void => {
    if (this.current !== 'evolution') return
    if (now - this.previewTime > 30) {
      for (const preview of this.previews) drawPreview(preview, now * 0.001)
      this.previewTime = now
    }
    this.previewFrame = requestAnimationFrame(this.animatePreviews)
  }

  private startPreviews(): void {
    if (!this.previewFrame && !this.reducedMotion.matches && this.previews.length > 0) {
      this.previewFrame = requestAnimationFrame(this.animatePreviews)
    }
  }

  private stopPreviews(): void {
    cancelAnimationFrame(this.previewFrame)
    this.previewFrame = 0
  }
}
