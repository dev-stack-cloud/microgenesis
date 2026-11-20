import type { Actor, ActorKind, Effect, EffectKind, HUDView, Input, Mutation, Point, Resource, ResourceKind, WorldState } from './model.ts'
import { appendNode, branchAnchor, clamp, deltaAngle, integrateBody, nodeKind, spawnActor, sq, TAU } from './organism.ts'
import { getChoices, tierTimes, tiersRequire, traits } from './progression.ts'
import { SpatialGrid } from './spatial.ts'

export const STEP = 1 / 60
export const DISH = 2190
export const NURSERY_SEED = 0x1a57e34
export const CROWN_TIME = 568
export const CROWN_SITE = { x: 1050, y: -732 }
const resourceCap = 720
const phaseTimes = [0, 145, 330, CROWN_TIME]
const names = ['Inoculation', 'Competition', 'Acidification', 'The Crown']
const danger = [0, .24, .54, .88]
const enemyKinds = ['scavenger', 'hunter', 'colony'] as const
const resourceFood = { energy: 11, biomass: 8, catalyst: 1 }
const maxEnergyFor = (actor: Actor) => 100 + actor.tier * 10 + Math.min(40, (actor.nodes.length - 2) * 3)

export class Simulation {
  world: WorldState
  readonly events: (EffectKind | 'mutate' | 'defeat')[] = []
  private readonly food = new SpatialGrid<Resource>(112)
  private readonly nearby: Resource[] = []
  private readonly recycledEffects: Effect[] = []
  private lastPhase = 0

  constructor(seed: number, snapshot?: WorldState) {
    this.world = {
      player: null as unknown as Actor, enemies: [], resources: [], effects: [], hazards: [], time: 0, phase: 0,
      outcome: 'active', seed, rng: seed >>> 0 || 1, nextId: 1, bossId: 0, objective: null, biomass: 0, catalysts: 0,
      bonds: 0, kills: 0, collected: 0, damageDone: 0, dash: 0, dashTime: 0, ability: 0, drain: 0, bloom: 1, replenish: 1,
      hint: -10, mutations: [], lost: 0, repair: 0, farthest: 0,
    }
    if (snapshot) {
      this.world = snapshot
      this.lastPhase = snapshot.phase
      return
    }
    this.world.player = spawnActor(this.world, 'player', 0, 0, 0)
    this.spawnFood(48, -28, 'energy', 15)
    this.spawnFood(77, 17, 'biomass', 12)
    this.spawnFood(109, -19, 'catalyst', 1)
    this.spawnFood(-36, 61, 'energy', 13)
    this.spawnFood(139, 86, 'biomass', 11)
    this.spawnFood(-92, -42, 'biomass', 11)
    for (let i = 0; i < 26; i++) this.scatterFood(0, 0, 176, i % 3 ? 'energy' : 'biomass', 155)
    for (let i = 0; i < 59; i++) {
      const a = this.random() * TAU
      const r = Math.sqrt(this.random()) * 1810 + 190
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      for (let j = 0; j < 8; j++) this.scatterFood(x, y, 170, j === 0 && i % 2 === 0 ? 'catalyst' : undefined)
    }
    this.world.enemies.push(spawnActor(this.world, 'scavenger', 234, -178, 2))
    this.world.enemies.push(spawnActor(this.world, 'scavenger', -277, 186, -1))
    this.world.enemies.push(spawnActor(this.world, 'hunter', 410, 210, -2.4))
    this.world.enemies.push(spawnActor(this.world, 'colony', -462, -360, 0))
    for (let i = 0; i < 21; i++) this.spawnEnemy(enemyKinds[i % 3], 620)
  }

  static restore(payload: unknown) {
    if (!validSnapshot(payload)) return null
    return new Simulation(payload.seed, payload)
  }

  private random() {
    let x = this.world.rng
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.world.rng = x >>> 0
    return this.world.rng / 4294967296
  }

  private spawnEnemy(kind: ActorKind, minimum: number) {
    const a = this.random() * TAU
    const r = minimum + this.random() * (DISH - 170 - minimum)
    this.world.enemies.push(spawnActor(this.world, kind, Math.cos(a) * r, Math.sin(a) * r, this.random() * TAU))
  }

  private spawnFood(x: number, y: number, kind: ResourceKind, amount = resourceFood[kind]) {
    const resources = this.world.resources
    const node = kind === 'catalyst'
    const size = node ? 7 + this.random() * 2.1 : kind === 'energy' ? 3.8 + this.random() * 3.6 : 5.7 + this.random() * 4.8
    const spec = { id: this.world.nextId++, x, y, kind, amount, size, phase: this.random() * TAU, active: true }
    if (resources.length < resourceCap) resources.push(spec)
    else {
      const old = resources.find(resource => !resource.active)
      if (old) Object.assign(old, spec)
    }
  }

  private scatterFood(x: number, y: number, range: number, kind?: ResourceKind, offset = 0) {
    const a = this.random() * TAU
    const r = Math.sqrt(this.random()) * range + offset
    const tx = x + Math.cos(a) * r
    const ty = y + Math.sin(a) * r
    if (sq(tx, ty) >= (DISH - 35) ** 2) return
    const chance = this.random()
    this.spawnFood(tx, ty, kind ?? (chance < .60 ? 'energy' : chance < .96 ? 'biomass' : 'catalyst'))
  }

  private effect(kind: EffectKind, x: number, y: number, size: number, angle = 0, sound = true) {
    const { effects } = this.world
    if (effects.length < 100) {
      const e = this.recycledEffects.pop() ?? { kind, x, y, size, angle, age: 0, life: 0 }
      e.kind = kind
      e.x = x
      e.y = y
      e.size = size
      e.angle = angle
      e.age = 0
      e.life = kind === 'victory' ? 5 : kind === 'dash' ? .38 : kind === 'pulse' ? .7 : kind === 'hazard' ? 1.35 : .53
      effects.push(e)
    }
    if (sound && this.events.length < 12) this.events.push(kind)
  }

  step(input: Input) {
    const w = this.world
    if (w.outcome !== 'active') return
    const p = w.player
    w.time += STEP
    w.phase = w.time >= phaseTimes[3] ? 3 : w.time >= phaseTimes[2] ? 2 : w.time >= phaseTimes[1] ? 1 : 0
    if (w.phase !== this.lastPhase) {
      this.lastPhase = w.phase
      this.effect('hazard', p.x, p.y, 180)
    }
    if (w.phase === 3 && !w.bossId) this.crown()
    for (let i = w.effects.length - 1; i >= 0; i--) {
      const effect = w.effects[i]
      effect.age += STEP
      if (effect.age >= effect.life) {
        this.recycledEffects.push(effect)
        w.effects[i] = w.effects[w.effects.length - 1]
        w.effects.pop()
      }
    }
    this.food.clear()
    for (const resource of w.resources) if (resource.active) this.food.insert(resource)
    this.playerTick(input)
    for (const enemy of w.enemies) if (enemy.hp > 0) this.enemyTick(enemy)
    this.contacts()
    this.medium()
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      const enemy = w.enemies[i]
      if (enemy.hp > 0) continue
      w.enemies.splice(i, 1)
      if (enemy.kind === 'crown') {
        if (p.hp <= 0) continue
        w.outcome = 'won'
        this.effect('victory', enemy.x, enemy.y, 350)
      } else {
        this.effect('break', enemy.x, enemy.y, 23, 0, sq(enemy.x - p.x, enemy.y - p.y) < 500 ** 2)
        this.scatterFood(enemy.x, enemy.y, 39, enemy.kind === 'scavenger' ? 'energy' : 'catalyst')
        this.scatterFood(enemy.x, enemy.y, 23, 'biomass')
        this.scatterFood(enemy.x, enemy.y, 36, 'energy')
      }
    }
    if (p.hp <= 0) {
      w.outcome = 'dead'
      this.events.push('defeat')
    }
    integrateBody(p, w.time, STEP, p.energy / maxEnergyFor(p))
    w.farthest = Math.max(w.farthest, Math.hypot(p.x, p.y))
  }

  private playerTick(input: Input) {
    const w = this.world
    const p = w.player
    const t = traits(p.path, p.tier)
    const mass = p.nodes.length - 2
    const energyCap = maxEnergyFor(p)
    const endurance = p.energy > 5 ? p.energy > 18 ? 1 : .86 : .65
    const movement = Math.min(1, Math.hypot(input.x, input.y))
    const direction = input.aim ? Math.atan2(input.aim.y - p.y, input.aim.x - p.x) :
      movement > .08 ? Math.atan2(input.y, input.x) : p.heading
    const desired = movement > .08 && !input.absorb ? Math.atan2(input.y, input.x) : direction
    p.heading += deltaAngle(desired, p.heading) * 6.1 * STEP
    const thrust = 873 * t.speed * endurance / (1 + Math.max(0, mass) * .045)
    p.vx += input.x * thrust * STEP
    p.vy += input.y * thrust * STEP
    w.dash = Math.max(0, w.dash - STEP)
    w.ability = Math.max(0, w.ability - STEP)
    w.dashTime = Math.max(0, w.dashTime - STEP)
    if (input.dash && w.dash <= 0 && p.energy >= 8) {
      const angle = movement > .12 ? Math.atan2(input.y, input.x) : direction
      p.vx += Math.cos(angle) * 378 * t.impulse
      p.vy += Math.sin(angle) * 378 * t.impulse
      p.shield = .37
      w.dash = 1.43
      w.dashTime = .37
      p.energy -= 8
      this.effect('dash', p.x, p.y, 64, angle)
    }
    this.move(p, w.dashTime > 0 ? 1.93 : 4.65)
    if (input.absorb) this.absorb(input.aim, t.feeding)
    if (input.bond) this.bond(direction)
    if (input.ability) this.discharge(direction, t)
    const cost = (.13 + movement * .36 + (input.absorb ? .105 : 0)) * (p.path === 'symbiote' ? .70 : 1)
    const basal = p.energy < 22 ? .97 : p.energy < 45 ? .68 : .31
    p.energy = clamp(p.energy + (basal - cost + (p.path === 'symbiote' ? p.tier * .32 : 0)) * STEP, 0, energyCap)
    if (p.path === 'symbiote' && p.tier >= 2) w.biomass = Math.min(160, w.biomass + (.12 + .045 * p.tier) * STEP)
    if (p.energy > 12 && p.flash <= .02) {
      p.hp = Math.min(p.maxHp, p.hp + (p.path === 'symbiote' ? 1.3 + p.tier * .60 : .74) * STEP)
      for (const n of p.nodes) if (n.kind !== 'core') n.hp = Math.min(n.maxHp, n.hp + (p.path === 'symbiote' ? 1.5 : .65) * STEP)
    }
    w.repair = Math.max(0, w.repair - STEP)
    if (w.lost && w.biomass >= 5 && p.energy >= 17 && !w.repair) {
      this.grow(p.heading + Math.PI * .63 + w.bonds * 2.4, true)
      w.lost--
      w.repair = p.path === 'symbiote' ? 3.8 : 7.5
    }
  }

  private move(actor: Actor, friction: number) {
    actor.px = actor.x
    actor.py = actor.y
    const drag = Math.exp(-friction * STEP)
    actor.vx *= drag
    actor.vy *= drag
    actor.x += actor.vx * STEP
    actor.y += actor.vy * STEP
    const r = Math.hypot(actor.x, actor.y)
    if (r > DISH - 25) {
      const nx = actor.x / r
      const ny = actor.y / r
      actor.x = nx * (DISH - 25)
      actor.y = ny * (DISH - 25)
      const outward = Math.max(0, actor.vx * nx + actor.vy * ny)
      actor.vx -= nx * outward * 1.4
      actor.vy -= ny * outward * 1.4
    }
    actor.age += STEP
    actor.flash = Math.max(0, actor.flash - STEP)
    actor.shield = Math.max(0, actor.shield - STEP)
    actor.cooldown = Math.max(0, actor.cooldown - STEP)
  }

  private absorb(aim: Point | null, feeding: number) {
    const w = this.world
    const p = w.player
    const range = (136 + Math.min(24, p.nodes.length * 2)) * feeding
    for (const food of this.food.query(p.x, p.y, range, this.nearby)) {
      if (!food.active) continue
      const x = p.x - food.x
      const y = p.y - food.y
      const d = Math.hypot(x, y)
      if (d >= range) continue
      if (d < 18) {
        this.consume(food)
        continue
      }
      const focus = aim ? clamp(((aim.x - p.x) * -x + (aim.y - p.y) * -y) / (Math.hypot(aim.x - p.x, aim.y - p.y) * d || 1), -.4, 1) : 0
      const attraction = (53 + (1 - d / range) * 240) * (1 + focus * .38) * feeding * STEP / d
      food.x += x * attraction
      food.y += y * attraction
    }
  }

  private consume(food: Resource) {
    const w = this.world
    food.active = false
    w.collected++
    if (food.kind === 'energy') w.player.energy = Math.min(maxEnergyFor(w.player), w.player.energy + food.amount)
    if (food.kind === 'biomass') w.biomass = Math.min(160, w.biomass + food.amount)
    if (food.kind === 'catalyst') w.catalysts = Math.min(24, w.catalysts + food.amount)
    this.effect('feed', food.x, food.y, food.kind === 'catalyst' ? 27 : 13)
  }

  private bond(direction: number) {
    const { player: p } = this.world
    if (p.energy < 4 || p.nodes.length >= 15) return
    let found: Resource | undefined
    let distance = 86 ** 2
    for (const food of this.food.query(p.x, p.y, 86, this.nearby)) {
      if (!food.active || food.kind !== 'biomass') continue
      const next = sq(p.x - food.x, p.y - food.y)
      if (next < distance) { found = food; distance = next }
    }
    if (found) {
      direction = Math.atan2(found.y - p.y, found.x - p.x)
      this.consume(found)
    }
    this.grow(direction)
  }

  private grow(direction: number, repair = false) {
    const w = this.world
    const p = w.player
    const price = repair ? 5 : 7 + Math.floor(Math.max(0, p.nodes.length - 3) * .5)
    if (w.biomass < price || p.nodes.length >= 15) return
    w.biomass -= price
    p.energy = Math.max(0, p.energy - (repair ? 3 : 4))
    const parent = branchAnchor(p, direction)
    const crowded = p.nodes.filter(node => node.parent === parent.id).length
    const a = direction + (crowded % 2 ? -1 : 1) * Math.min(.83, crowded * .34)
    appendNode(w, p, nodeKind(p.path), a, parent)
    if (!repair) w.bonds++
    this.effect('bond', parent.x, parent.y, 36, direction)
  }

  private discharge(direction: number, t: ReturnType<typeof traits>) {
    const w = this.world
    const p = w.player
    const cost = p.path === 'symbiote' ? 9 : 11
    if (w.ability > 0 || p.energy < cost) return
    p.energy -= cost
    w.ability = p.path === 'crystalline' ? 2.35 : 2.75
    p.shield = p.path === 'symbiote' ? .70 + p.tier * .16 : .15
    this.effect('pulse', p.x, p.y, t.range, direction)
    if (p.path === 'symbiote') p.hp = Math.min(p.maxHp, p.hp + p.tier * 2.3)
    for (const e of w.enemies) {
      if (e.hp <= 0 || sq(e.x - p.x, e.y - p.y) > (t.range + 130) ** 2) continue
      const ox = Math.cos(direction)
      const oy = Math.sin(direction)
      let struck = false
      for (const node of e.nodes) {
        const x = node.x - p.x
        const y = node.y - p.y
        const dot = x * ox + y * oy
        const cross = Math.abs(y * ox - x * oy)
        const width = 22 + dot * (p.path === 'crystalline' ? .13 : .28)
        if (dot < -12 || dot > t.range + node.size || cross > width + node.size) continue
        this.damage(e, node.x, node.y, t.power, e.kind === 'crown' && e.state === 'retreat' ? 1.42 : 1)
        w.damageDone += t.power
        const knock = e.kind === 'crown' ? 15 : 94
        e.vx += ox * knock
        e.vy += oy * knock
        if (p.path === 'predator') this.siphon(e, 2 + p.tier)
        struck = true
        break
      }
      if (struck && e.hp <= 0) w.kills++
    }
  }

  private enemyTick(e: Actor) {
    const w = this.world
    const p = w.player
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy)
    e.decision -= STEP
    if (e.kind === 'crown') {
      this.crownMind(e, d, Math.atan2(dy, dx))
      return
    }
    const dangerRange = e.kind === 'hunter' ? 340 + 38 * w.phase : e.kind === 'colony' ? 190 : 182
    if (d < dangerRange && e.kind !== 'scavenger' && (e.kind === 'hunter' || sq(p.x - e.homeX, p.y - e.homeY) < 226 ** 2)) {
      e.state = e.hp / e.maxHp < .25 ? 'retreat' : e.kind === 'hunter' ? 'pursue' : 'guard'
      e.intent = Math.atan2(dy, dx) + (e.state === 'retreat' ? Math.PI * .78 : 0)
    } else if (d < dangerRange && e.kind === 'scavenger') {
      e.state = 'retreat'
      e.intent = Math.atan2(dy, dx) + Math.PI + Math.sin(w.time * 2 + e.id) * .64
    } else if (e.decision <= 0) {
      e.decision = .26 + (e.id % 17) * .018
      this.forage(e)
    }
    const drive = e.kind === 'hunter' ? e.state === 'pursue' ? 560 + 58 * w.phase : 194 : e.kind === 'colony' ? 105 : e.state === 'retreat' ? 546 : 251
    e.heading += deltaAngle(e.intent, e.heading) * STEP * (e.kind === 'colony' ? 2.7 : 5)
    e.vx += Math.cos(e.heading) * drive * STEP
    e.vy += Math.sin(e.heading) * drive * STEP
    this.move(e, 4.1)
    const reach = e.nodes[0].size + 12
    const found = this.food.query(e.x, e.y, reach, this.nearby)
    for (const food of found) {
      if (!food.active || food.kind === 'catalyst' || sq(e.x - food.x, e.y - food.y) >= reach ** 2) continue
      food.active = false
      e.feed += food.kind === 'biomass' ? 2 : 1
      e.hp = Math.min(e.maxHp, e.hp + 3)
      e.energy = Math.min(100, e.energy + 10)
      if (d < 420) this.effect('feed', food.x, food.y, 9, 0, false)
    }
    if (e.feed >= 5 && e.nodes.length < (e.kind === 'colony' ? 13 : 9)) {
      e.feed -= 5
      const a = e.heading + e.nodes.length * 2.399
      appendNode(w, e, e.kind === 'hunter' ? 'spine' : e.kind === 'colony' ? 'veil' : 'tissue', a, branchAnchor(e, a))
      e.maxHp += 3
      e.hp += 3
      if (d < 480) this.effect('bond', e.x, e.y, 24, 0, false)
    }
    e.energy = e.energy > 36 ? Math.max(36, e.energy - STEP * 1.15) : Math.min(36, e.energy + STEP * 2.4)
    integrateBody(e, w.time, STEP, e.energy / 100)
  }

  private forage(e: Actor) {
    const leashed = e.kind === 'colony'
    const wander = leashed && sq(e.homeX - e.x, e.homeY - e.y) > 142 ** 2
    let target: Point | undefined
    let nearest = 315 ** 2
    if (!wander) {
      for (const food of this.food.query(e.x, e.y, 315, this.nearby)) {
        if (!food.active || food.kind === 'catalyst' || (leashed && sq(food.x - e.homeX, food.y - e.homeY) > 178 ** 2)) continue
        const d = sq(food.x - e.x, food.y - e.y)
        if (d < nearest) { nearest = d; target = food }
      }
    }
    if (target) {
      e.intent = Math.atan2(target.y - e.y, target.x - e.x)
      e.state = 'seek'
    } else {
      e.state = 'patrol'
      if (wander) e.intent = Math.atan2(e.homeY - e.y, e.homeX - e.x)
      else e.intent += Math.sin(e.id * 2 + this.world.time * .43) * .38 + (this.random() - .5) * .31
    }
  }

  private crown() {
    const w = this.world
    const e = spawnActor(w, 'crown', CROWN_SITE.x, CROWN_SITE.y, 2.5)
    e.state = 'guard'
    e.decision = 2
    e.path = 'crystalline'
    e.tier = 3
    w.bossId = e.id
    w.objective = { ...CROWN_SITE }
    w.enemies.push(e)
    for (let i = 0; i < 56; i++) this.scatterFood(e.x, e.y, 350, i % 6 ? 'energy' : 'catalyst', 140)
    this.effect('hazard', e.x, e.y, 302)
  }

  private crownMind(e: Actor, d: number, heading: number) {
    const w = this.world
    const p = w.player
    const home = sq(e.x - e.homeX, e.y - e.homeY)
    const engaged = d < 510
    if (!engaged && home > 42 ** 2) e.intent = Math.atan2(e.homeY - e.y, e.homeX - e.x)
    else if (e.state === 'retreat') e.intent = heading + Math.PI * .54
    else e.intent = heading
    let force = engaged ? 142 : home > 42 ** 2 ? 132 : 0
    if (e.state === 'windup') {
      e.charge = Math.min(1, e.charge + STEP / 1.36)
      force = 0
      if (e.charge >= 1) {
        e.state = 'retreat'
        e.decision = 1.95
        e.charge = 0
        w.hazards.push({ x: e.x, y: e.y, radius: 305, age: 0, life: 1.36, kind: 'wave' })
        w.hazards.push({ x: p.x + p.vx * .19, y: p.y + p.vy * .19, radius: 81, age: 0, life: 5.7, kind: 'acid' })
        this.effect('hazard', e.x, e.y, 310)
      }
    } else {
      if (e.state === 'retreat' && e.decision <= 0) {
        e.state = 'pursue'
        e.decision = e.hp < e.maxHp * .44 ? 1.95 : 2.9
      }
      if (e.state !== 'retreat' && e.decision <= 0 && d < 390) e.state = 'windup'
      if (d < 100 && e.state !== 'retreat') force *= .32
    }
    e.heading += deltaAngle(e.intent, e.heading) * STEP * 1.8
    e.vx += Math.cos(e.heading) * force * STEP
    e.vy += Math.sin(e.heading) * force * STEP
    this.move(e, 3.2)
    integrateBody(e, w.time, STEP, .6 + e.charge * .4)
    if (w.objective) {
      w.objective.x = e.x
      w.objective.y = e.y
    }
  }

  private contacts() {
    const w = this.world
    const p = w.player
    for (const enemy of w.enemies) {
      if (enemy.hp <= 0 || sq(enemy.x - p.x, enemy.y - p.y) > 230 ** 2) continue
      let contact: { x: number; y: number; spine: boolean } | undefined
      for (const a of p.nodes) {
        if (a.age < .28) continue
        for (const b of enemy.nodes) {
          if (b.age < .28 || sq(a.x - b.x, a.y - b.y) > ((a.size + b.size) * .95) ** 2) continue
          contact = { x: a.x, y: a.y, spine: a.kind === 'spine' }
          break
        }
        if (contact) break
      }
      if (!contact) continue
      const angle = Math.atan2(p.y - enemy.y, p.x - enemy.x)
      const x = Math.cos(angle)
      const y = Math.sin(angle)
      const aggressive = w.dashTime > 0 || (contact.spine && p.path === 'predator')
      p.vx += x * 13
      p.vy += y * 13
      enemy.vx -= x * 11
      enemy.vy -= y * 11
      if (enemy.cooldown > 0) continue
      enemy.cooldown = aggressive ? .5 : .74
      const index = enemy.kind === 'crown' ? 15 : enemy.kind === 'colony' ? 8 : enemy.kind === 'hunter' ? 10 : 2.6
      if (aggressive) {
        const damage = (w.dashTime > 0 ? 21 : 8) + (p.path === 'predator' ? p.tier * 8 : 0)
        this.damage(enemy, contact.x, contact.y, damage)
        if (enemy.hp <= 0) w.kills++
        w.damageDone += damage
        if (p.path === 'predator') this.siphon(enemy, 4 + p.tier * 2)
      }
      if (p.shield <= 0 && enemy.hp > 0) {
        this.damage(p, contact.x, contact.y, index * (1 + w.phase * .13))
        p.vx += x * index * 11
        p.vy += y * index * 11
      }
    }
    // Rivals also interact beyond the camera. Stripe pairs across ticks to bound cost.
    const offset = Math.floor(w.time / STEP) % 12
    for (let i = offset; i < w.enemies.length; i += 12) {
      const e = w.enemies[i]
      if (e.kind !== 'hunter' || e.hp <= 0 || e.cooldown > 0) continue
      for (const prey of w.enemies) {
        if (prey.kind !== 'scavenger' || prey.hp <= 0 || sq(e.x - prey.x, e.y - prey.y) >= 39 ** 2) continue
        prey.intent = Math.atan2(prey.y - e.y, prey.x - e.x)
        prey.state = 'retreat'
        this.damage(prey, e.x, e.y, 4.5, 1, false)
        e.cooldown = 1
        e.feed++
        break
      }
    }
  }

  private siphon(enemy: Actor, amount: number) {
    const player = this.world.player
    const transferred = Math.min(amount, enemy.energy, Math.max(0, maxEnergyFor(player) - player.energy))
    enemy.energy -= transferred
    player.energy += transferred
  }

  damage(actor: Actor, x: number, y: number, raw: number, vulnerability = 1, sound = true) {
    const w = this.world
    const p = w.player
    if (actor.hp <= 0) return
    let closest = actor.nodes[0]
    let distance = Infinity
    for (const node of actor.nodes) {
      if (node.age < .21) continue
      const d = Math.hypot(x - node.x, y - node.y) - node.size * .35
      if (d < distance) { distance = d; closest = node }
    }
    let force = raw * vulnerability
    if (actor === p) force *= traits(p.path, p.tier).armor * (p.shield > 0 ? .36 : 1)
    actor.flash = .32
    if (closest.kind === 'core') actor.hp = Math.max(0, actor.hp - force)
    else {
      closest.hp -= force
      actor.hp = Math.max(0, actor.hp - force * (actor.kind === 'crown' ? .37 : .24))
      if (closest.hp <= 0) {
        const removed = new Set([closest.id])
        for (const node of actor.nodes) if (removed.has(node.parent)) removed.add(node.id)
        actor.nodes = actor.nodes.filter(node => !removed.has(node.id))
        if (actor === p) w.lost = Math.min(14, w.lost + removed.size)
        this.effect('break', closest.x, closest.y, 43, 0, sound)
      }
    }
    this.effect('hit', closest.x, closest.y, 18 + raw * .45, 0, sound)
  }

  private medium() {
    const w = this.world
    const p = w.player
    w.replenish -= STEP
    w.bloom -= STEP
    if (w.replenish <= 0) {
      const active = w.resources.reduce((count, food) => count + Number(food.active), 0)
      if (active < 570) {
        for (let i = 0; i < 6; i++) {
          const a = this.random() * TAU
          const r = 145 + this.random() * 300
          this.scatterFood(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 93, i < 4 ? 'energy' : undefined)
        }
        const a = this.random() * TAU
        const r = Math.sqrt(this.random()) * (DISH - 175)
        for (let i = 0; i < 11; i++) this.scatterFood(Math.cos(a) * r, Math.sin(a) * r, 154)
      }
      if (w.enemies.length < 21 + w.phase * 2) {
        this.spawnEnemy(enemyKinds[Math.floor(this.random() * 3)], 660)
      }
      w.replenish = 4.2
    }
    if (w.phase >= 2 && w.bloom <= 0) {
      const a = this.random() * TAU
      const r = 27 + this.random() * 175
      const x = p.x + Math.cos(a) * r
      const y = p.y + Math.sin(a) * r
      const radius = 46 + this.random() * (w.phase === 3 ? 43 : 26)
      w.hazards.push({ x, y, radius, age: 0, life: 7.5 + this.random() * 3, kind: 'acid' })
      this.effect('hazard', x, y, radius)
      w.bloom = w.phase === 3 ? 4.2 : 7.8
    }
    if (w.phase === 3 && w.time > CROWN_TIME + 245) {
      // Overtime pressure is gradual, leaving room for a recovery attempt.
      p.energy = Math.max(0, p.energy - Math.min(2.5, (w.time - CROWN_TIME - 245) * .023) * STEP)
    }
    w.drain = Math.max(0, w.drain - STEP)
    const r = Math.hypot(p.x, p.y)
    let exposed = r > DISH - 120
    for (let i = w.hazards.length - 1; i >= 0; i--) {
      const h = w.hazards[i]
      h.age += STEP
      if (h.age >= h.life) {
        w.hazards.splice(i, 1)
        continue
      }
      const dist = Math.hypot(p.x - h.x, p.y - h.y)
      if (h.kind === 'acid' && h.age > 1.28 && dist < h.radius) exposed = true
      if (h.kind === 'wave') {
        const front = h.radius * h.age / h.life
        if (Math.abs(dist - front) < 18 && !w.drain && !p.shield) {
          this.damage(p, p.x, p.y, 22)
          p.vx += (p.x - h.x) / (dist || 1) * 147
          p.vy += (p.y - h.y) / (dist || 1) * 147
          w.drain = .65
        }
      }
    }
    if (exposed && !w.drain && !p.shield) {
      this.damage(p, p.x, p.y, 6 + w.phase * 1.3)
      p.energy = Math.max(0, p.energy - (3 + w.phase))
      w.drain = .76
    }
  }

  choices() { return getChoices(this.world) }

  mutate(id: string) {
    const choice = this.choices().find(option => option.id === id && option.available)
    if (!choice || this.world.outcome !== 'active') return false
    this.applyMutation(choice)
    return true
  }

  private applyMutation(choice: Mutation) {
    const w = this.world
    const p = w.player
    p.path = choice.path
    p.tier = choice.tier
    w.catalysts -= choice.cost
    w.mutations.push(choice.id)
    const specialized = nodeKind(p.path)
    const resistance = specialized === 'prism' ? 36 : specialized === 'veil' ? 22 : 19
    for (const node of p.nodes) {
      if (node.kind === 'core') continue
      node.kind = specialized
      node.size *= 1.12
      node.length *= 1.10
      node.maxHp = resistance + p.tier * 5
      node.hp = node.maxHp
    }
    p.maxHp += specialized === 'prism' ? 14 : specialized === 'veil' ? 11 : 8
    p.hp = Math.min(p.maxHp, p.hp + 19)
    p.nodes[0].size += p.tier === 1 ? 3 : 2
    p.energy = Math.min(maxEnergyFor(p), p.energy + 24)
    for (let i = 0; i < 2 && p.nodes.length < 15; i++) {
      const a = p.heading + (i === 0 ? -.84 : 1.2) + p.tier * .52
      appendNode(w, p, specialized, a, p.tier === 1 ? p.nodes[0] : branchAnchor(p, a))
    }
    this.effect('bond', p.x, p.y, 111, 0, false)
    this.events.push('mutate')
  }

  view(): HUDView {
    const w = this.world
    const p = w.player
    const nextTier = p.tier + 1
    const next = nextTier <= 3 ? Math.min(w.catalysts / nextTier, w.bonds / tiersRequire[nextTier], tierTimes[nextTier] ? w.time / tierTimes[nextTier] : 1, 1) : 1
    const objective = w.outcome === 'won' ? 'Crown colony dissolved' : w.outcome === 'dead' ? 'Nucleus ruptured' :
      w.phase === 3 ? 'Neutralize the Crown colony' : w.phase === 2 ? 'Survive the acidification' :
      w.phase === 1 ? 'Adapt to the competing organisms' : p.path ? 'Grow your lineage' : next >= 1 ? 'Open the evolution tree' :
      w.bonds ? 'Find amber catalyst crystals' : 'Absorb nutrients and form a bond'
    const tip = w.outcome !== 'active' ? '' : w.collected < 2 ? 'Hold left click or Absorb to draw in nutrients.' :
      !w.bonds ? 'Press E or Bond to add a branch with biomass.' :
      !p.path && next >= 1 ? 'Spend a catalyst to choose your lineage.' :
      w.phase === 3 ? 'Follow the Crown signal. Dash through its pulse or stay beyond the wave.' :
      w.phase === 2 ? 'Leave amber-edged acid pools before they become corrosive.' : 'Explore nutrient pockets. Discharge energy at approaching rivals.'
    const boss = w.bossId ? w.enemies.find(e => e.id === w.bossId) : undefined
    return {
      time: w.time, phase: w.phase, energy: p.energy, maxEnergy: maxEnergyFor(p), biomass: w.biomass, catalysts: w.catalysts,
      hp: p.hp, maxHp: p.maxHp, nodes: p.nodes.length, kills: w.kills, tier: p.tier, evolution: next, bonds: w.bonds,
      heading: p.heading, dash: 1 - w.dash / 1.43, ability: 1 - w.ability / (p.path === 'crystalline' ? 2.35 : 2.75),
      path: p.path, objective, tip, mutationReady: nextTier <= 3 && next >= 1, bossHp: boss ? boss.hp / boss.maxHp : null,
      bossBearing: boss ? Math.atan2(boss.y - p.y, boss.x - p.x) : null, location: names[w.phase],
      salinity: danger[w.phase], minimapX: p.x / DISH, minimapY: p.y / DISH,
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numeric(record: Record<string, unknown>, names: string) {
  return names.split(' ').every(key => typeof record[key] === 'number' && Number.isFinite(record[key]) && Math.abs(record[key] as number) < 1e10)
}

function validSnapshot(input: unknown): input is WorldState {
  if (!isRecord(input) || input.outcome !== 'active') return false
  if (!numeric(input, 'time phase seed rng nextId bossId biomass catalysts bonds kills collected damageDone dash dashTime ability drain bloom replenish hint lost repair farthest')) return false
  if (!Array.isArray(input.enemies) || input.enemies.length > 36 || !Array.isArray(input.resources) || input.resources.length > resourceCap) return false
  if (!Array.isArray(input.hazards) || input.hazards.length > 30 || !Array.isArray(input.effects) || input.effects.length > 100) return false
  if (!Array.isArray(input.mutations) || input.mutations.length > 3 || !input.mutations.every(id => /^(predator|symbiote|crystalline)-[123]$/.test(String(id)))) return false
  if (input.objective !== null && (!isRecord(input.objective) || !numeric(input.objective, 'x y'))) return false
  if (typeof input.phase !== 'number' || input.phase < 0 || input.phase > 3 || !Number.isInteger(input.phase) || (input.time as number) < 0) return false
  const path = (v: unknown) => v === null || ['predator', 'symbiote', 'crystalline'].includes(v as string)
  const crowns = input.enemies.filter(e => isRecord(e) && e.kind === 'crown')
  if (input.phase === 3 ? crowns.length !== 1 || crowns[0].id !== input.bossId || !(Number(crowns[0].hp) > 0) :
    crowns.length > 0 || input.bossId !== 0) return false
  const allIds = new Set<number>()
  const idLimit = input.nextId as number
  const uniqueId = (id: unknown) => {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || id >= idLimit || allIds.has(id)) return false
    allIds.add(id)
    return true
  }
  const actors = [input.player, ...input.enemies]
  for (const [index, actor] of actors.entries()) {
    if (!isRecord(actor) || !numeric(actor, 'id x y px py vx vy heading hp maxHp energy flash charge age tier feed intent decision cooldown homeX homeY shield') ||
      (index === 0 ? actor.kind !== 'player' : !['scavenger', 'hunter', 'colony', 'crown'].includes(actor.kind as string)) ||
      !path(actor.path) || !uniqueId(actor.id)) return false
    if (!['seek', 'patrol', 'pursue', 'retreat', 'guard', 'windup'].includes(actor.state as string) ||
      !Number.isInteger(actor.tier) || (actor.tier as number) < 0 || (actor.tier as number) > 3 ||
      Math.hypot(actor.x as number, actor.y as number) > DISH + 1 || (actor.hp as number) < 0 || (actor.maxHp as number) <= 0) return false
    if (!Array.isArray(actor.nodes) || !actor.nodes.length || actor.nodes.length > 15) return false
    const ids = new Set()
    for (const [i, node] of actor.nodes.entries()) {
      if (!isRecord(node) || !numeric(node, 'id parent x y px py size hp maxHp age flow angle length vx vy') || !uniqueId(node.id) ||
        (i === 0 ? node.kind !== 'core' || node.parent !== -1 : !['tissue', 'spine', 'veil', 'prism'].includes(node.kind as string) || !ids.has(node.parent)) ||
        ids.has(node.id) || (node.size as number) <= 0 || (node.maxHp as number) <= 0) return false
      ids.add(node.id)
    }
  }
  if (!input.resources.every(r => isRecord(r) && numeric(r, 'id x y size phase amount') && uniqueId(r.id) && typeof r.active === 'boolean' &&
    ['energy', 'biomass', 'catalyst'].includes(r.kind as string) && (r.size as number) > 0 && (r.amount as number) > 0)) return false
  if (!input.hazards.every(h => isRecord(h) && numeric(h, 'x y radius age life') && (h.kind === 'acid' || h.kind === 'wave') && (h.life as number) > 0 && (h.radius as number) > 0)) return false
  return input.effects.every(e => isRecord(e) && numeric(e, 'x y age life size angle') && (e.life as number) > 0 &&
    ['feed', 'bond', 'dash', 'hit', 'pulse', 'break', 'victory', 'hazard'].includes(e.kind as string))
}

