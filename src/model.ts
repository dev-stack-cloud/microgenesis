export type Path = 'predator' | 'symbiote' | 'crystalline'
export type Quality = 'auto' | 'high' | 'low'
export type Screen = 'title' | 'playing' | 'pause' | 'settings' | 'help' | 'evolution' | 'result'
export type ActorKind = 'player' | 'scavenger' | 'hunter' | 'colony' | 'crown'
export type NodeKind = 'core' | 'tissue' | 'spine' | 'veil' | 'prism'
export type ResourceKind = 'energy' | 'biomass' | 'catalyst'
export type EffectKind = 'feed' | 'bond' | 'dash' | 'hit' | 'pulse' | 'break' | 'victory' | 'hazard'
export type Point = { x: number; y: number }

export interface Settings { volume: number; quality: Quality; muted: boolean }
export interface Records { bestTime: number; bestStage: number; wins: number }
export interface Mutation { id: string; path: Path; tier: number; name: string; description: string; trait: string; cost: number; available: boolean }
export interface RawInput { x: number; y: number; pointer: Point | null; absorb: boolean; bond: boolean; dash: boolean; ability: boolean }
export interface Input extends Omit<RawInput, 'pointer'> { aim: Point | null }
export interface UIActions {
  start: () => void
  resume: () => void
  pause: () => void
  title: () => void
  settings: () => void
  help: () => void
  back: () => void
  evolve: () => void
  mutate: (id: string) => void
  setSettings: (settings: Settings) => void
}

export interface BodyNode extends Point {
  id: number; parent: number; px: number; py: number; size: number
  hp: number; maxHp: number; age: number; flow: number; angle: number; length: number
  vx: number; vy: number; kind: NodeKind
}

export interface Actor extends Point {
  id: number; kind: ActorKind; px: number; py: number; vx: number; vy: number
  heading: number; hp: number; maxHp: number; energy: number; flash: number; charge: number; age: number
  path: Path | null; tier: number; nodes: BodyNode[]
  state: 'seek' | 'patrol' | 'pursue' | 'retreat' | 'guard' | 'windup'
  feed: number; intent: number; decision: number; cooldown: number; homeX: number; homeY: number; shield: number
}

export interface Resource extends Point { id: number; size: number; phase: number; amount: number; kind: ResourceKind; active: boolean }
export interface Effect extends Point { age: number; life: number; size: number; angle: number; kind: EffectKind }
export interface Hazard extends Point { radius: number; age: number; life: number; kind: 'acid' | 'wave' }
export interface WorldState {
  player: Actor; enemies: Actor[]; resources: Resource[]; time: number; phase: number
  effects: Effect[]; hazards: Hazard[]; outcome: 'active' | 'dead' | 'won'
  seed: number; bossId: number; objective: Point | null
  rng: number; nextId: number; biomass: number; catalysts: number; bonds: number; kills: number; collected: number; damageDone: number
  dash: number; dashTime: number; ability: number; drain: number; bloom: number; replenish: number; hint: number
  mutations: string[]; lost: number; repair: number; farthest: number
}

export interface HUDView {
  time: number; phase: number; energy: number; maxEnergy: number; biomass: number; catalysts: number; hp: number; maxHp: number
  nodes: number; kills: number; tier: number; evolution: number; bonds: number; heading: number; dash: number; ability: number
  path: Path | null; objective: string; tip: string; mutationReady: boolean; bossHp: number | null; bossBearing: number | null
  location: string; salinity: number; minimapX: number; minimapY: number
}
