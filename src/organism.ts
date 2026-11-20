import type { Actor, ActorKind, BodyNode, NodeKind, Path, WorldState } from './model.ts'

export const TAU = Math.PI * 2
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))
export const deltaAngle = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
export const sq = (x: number, y: number) => x * x + y * y
export const nodeKind = (path: Path | null): NodeKind => path === 'predator' ? 'spine' : path === 'symbiote' ? 'veil' : path === 'crystalline' ? 'prism' : 'tissue'

const nuclei: Record<ActorKind, [number, number]> = { player: [21, 100], scavenger: [12, 14], hunter: [21, 39], colony: [31, 68], crown: [59, 490] }
const material: Record<NodeKind, number> = { core: 0, tissue: 14, spine: 19, veil: 22, prism: 36 }

export function spawnActor(world: WorldState, kind: ActorKind, x: number, y: number, heading: number): Actor {
  const [size, hp] = nuclei[kind]
  const id = world.nextId++
  const core: BodyNode = { id: world.nextId++, parent: -1, x, y, px: x, py: y, vx: 0, vy: 0, size, hp, maxHp: hp, age: 3, flow: 1, angle: 0, length: 0, kind: 'core' }
  const actor: Actor = { id, kind, x, y, px: x, py: y, vx: 0, vy: 0, heading, hp, maxHp: hp, energy: kind === 'player' ? 76 : 75,
    flash: 0, charge: 0, age: 0, path: null, tier: 0, nodes: [core], state: 'seek', feed: 0, intent: heading,
    decision: 0, cooldown: 0, homeX: x, homeY: y, shield: 0 }
  const count = { player: 1, scavenger: 2, hunter: 4, colony: 6, crown: 11 }[kind]
  const tissue = kind === 'hunter' ? 'spine' : kind === 'colony' ? 'veil' : kind === 'crown' ? 'prism' : 'tissue'
  for (let i = 0; i < count; i++) {
    const parent = kind === 'crown' && i >= 6 ? actor.nodes[i - 5] : core
    appendNode(world, actor, tissue, heading + (kind === 'player' ? 2.55 : i * TAU / Math.min(count, 6)), parent, true)
  }
  return actor
}

export function appendNode(world: WorldState, actor: Actor, kind: NodeKind, absolute: number, parent: BodyNode, mature = false) {
  const large = actor.kind === 'crown'
  const size = (kind === 'tissue' ? 11 : kind === 'spine' ? 12 : kind === 'veil' ? 15 : 13) *
    (large ? 1.48 : 1) * (1 + actor.tier * .065)
  const length = parent.size * .62 + size * .8 + (large ? 20 : 9)
  const angle = deltaAngle(absolute, actor.heading)
  const x = parent.x + (mature ? Math.cos(absolute) * length : 0)
  const y = parent.y + (mature ? Math.sin(absolute) * length : 0)
  const hp = material[kind] * (large ? 1.7 : 1) * (1 + actor.tier * .1)
  const node: BodyNode = { id: world.nextId++, parent: parent.id, size, length, angle, x, y, px: x, py: y, vx: 0, vy: 0,
    kind, age: mature ? 3 : 0, hp, maxHp: hp, flow: 0 }
  actor.nodes.push(node)
  return node
}

export function branchAnchor(actor: Actor, angle: number) {
  let nearest = actor.nodes[0]
  let score = .35
  for (const node of actor.nodes.slice(1)) {
    const similarity = Math.cos(deltaAngle(angle, Math.atan2(node.y - actor.y, node.x - actor.x)))
    const biased = similarity + Math.min(105, Math.hypot(node.x - actor.x, node.y - actor.y)) * .004
    if (biased > score && node.age > .32 && Math.hypot(node.x - actor.x, node.y - actor.y) < 116) {
      nearest = node
      score = biased
    }
  }
  return nearest
}

export function integrateBody(actor: Actor, time: number, dt: number, fullness: number) {
  const core = actor.nodes[0]
  core.px = actor.px
  core.py = actor.py
  core.x = actor.x
  core.y = actor.y
  core.hp = actor.hp
  core.maxHp = actor.maxHp
  core.flow = fullness
  core.age += dt
  for (let i = 1; i < actor.nodes.length; i++) {
    const node = actor.nodes[i]
    let parent = core
    for (let p = i - 1; p >= 1; p--) {
      if (actor.nodes[p].id === node.parent) { parent = actor.nodes[p]; break }
    }
    const wave = Math.sin(time * 2.1 + node.id * .732) * (node.kind === 'prism' ? .075 : .21)
    const bend = actor.heading + node.angle + wave
    const extension = node.length * clamp(node.age * 1.44, 0, 1) * (1 + .042 * Math.sin(time * 3 - i))
    const tx = parent.x + Math.cos(bend) * extension - actor.vx * .069
    const ty = parent.y + Math.sin(bend) * extension - actor.vy * .069
    node.vx += ((tx - node.x) * 73 - node.vx * 12) * dt
    node.vy += ((ty - node.y) * 73 - node.vy * 12) * dt
    node.px = node.x
    node.py = node.y
    node.x += node.vx * dt
    node.y += node.vy * dt
    node.age += dt
    node.flow += (parent.flow * Math.max(.24, node.hp / node.maxHp) - node.flow) * .12
  }
}
