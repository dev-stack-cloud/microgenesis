import { CROWN_SITE, NURSERY_SEED, Simulation, STEP } from '../src/simulation.ts'
import type { Actor, Input, Point, WorldState } from '../src/model.ts'

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const idle: Input = { x: 0, y: 0, aim: null, absorb: false, bond: false, dash: false, ability: false }

export function pilot(run: Simulation, tick: number): Input {
  const w = run.world
  const p = w.player
  const next = p.tier + 1
  const boss = w.enemies.find(e => e.kind === 'crown')
  const threat = w.enemies.reduce<Actor | undefined>((closest, e) => e.kind !== 'hunter' || (closest && dist(p, closest) < dist(p, e)) ? closest : e, undefined)
  const hungry = p.energy < 30 || p.hp < 39
  let target: Point = CROWN_SITE
  let best = Infinity
  const wish = hungry ? 'energy' : w.catalysts < next && p.tier < 3 ? 'catalyst' : w.biomass < 25 ? 'biomass' : 'energy'
  for (const food of w.resources) {
    if (!food.active) continue
    const score = dist(p, food) + (wish === food.kind ? 0 : 325) + Math.max(0, Math.hypot(food.x, food.y) - 1690) * 2
    if (score < best) {
      best = score
      target = food
    }
  }
  let aim: Point = target
  let x = 0
  let y = 0
  let fire = false
  let dash = false
  const steer = (dx: number, dy: number, weight: number) => {
    const length = Math.hypot(dx, dy) || 1
    x += dx / length * weight
    y += dy / length * weight
  }
  if (boss && !hungry) {
    const d = dist(boss, p)
    const dx = boss.x - p.x
    const dy = boss.y - p.y
    aim = boss
    fire = d < 342
    if (d > 307) steer(dx, dy, 1.2)
    if (d < 273) steer(-dx, -dy, 1.5)
    if (d < 350) steer(dy, -dx, .68)
  } else {
    const d = dist(target, p)
    if (d > (w.time < 4 ? 152 : 62)) steer(target.x - p.x, target.y - p.y, 1.25)
    if (threat && dist(threat, p) < 230) {
      aim = threat
      fire = p.energy > 28
      if (dist(threat, p) < 128) steer(p.x - threat.x, p.y - threat.y, 1.7)
      if (dist(threat, p) < 81 && !w.dash && p.energy >= 12 && w.time > 5) dash = true
    }
  }
  if (Math.hypot(p.x, p.y) > 1850) steer(-p.x, -p.y, 2.4)
  for (const hazard of w.hazards) {
    const dx = p.x - hazard.x
    const dy = p.y - hazard.y
    const d = Math.hypot(dx, dy)
    if (hazard.kind === 'acid' && d < hazard.radius + 22) steer(dx, dy, 2.8)
    if (hazard.kind === 'wave' && d < hazard.radius && Math.abs(d - hazard.radius * hazard.age / hazard.life) < 44 && w.dash <= 0 && p.energy >= 14) {
      steer(dx, dy, 1.9)
      dash = true
    }
  }
  const speed = Math.hypot(x, y)
  return {
    x: x / Math.max(1, speed), y: y / Math.max(1, speed), aim, absorb: true,
    bond: (tick === 160 || (tick % 180 === 0 && w.biomass >= 8 && w.bonds < 9)),
    dash, ability: fire && w.ability <= 0,
  }
}

export function completeRun(capture?: (key: string, world: WorldState) => void) {
  const run = new Simulation(NURSERY_SEED)
  const seen = new Set<string>()
  const checkpoint = (key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    capture?.(key, structuredClone(run.world))
  }
  for (let tick = 0; tick < 60 * 900 && run.world.outcome === 'active'; tick++) {
    const choice = run.choices().find(option => option.available && option.path === 'crystalline')
    if (choice) run.mutate(choice.id)
    const input = pilot(run, tick)
    const boss = run.world.enemies.find(e => e.kind === 'crown')
    const atFinalShot = capture && input.ability && boss && boss.hp < 100 ? structuredClone(run.world) : null
    run.step(input)
    if (atFinalShot && run.world.outcome === 'won') capture?.('last-shot', atFinalShot)
    const w = run.world
    run.events.length = 0
    if (w.player.tier === 2 && w.player.nodes.length >= 9) checkpoint('developed')
    if (w.phase === 3 && w.enemies.some(e => e.kind === 'crown' && dist(e, w.player) < 330)) checkpoint('encounter')
    if (w.player.hp < 19) checkpoint('low-health')
    if (w.enemies.some(e => e.kind === 'crown' && e.hp < 32 && e.hp > 0)) checkpoint('finisher')
  }
  return run
}
