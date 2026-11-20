import type { Mutation, Path, WorldState } from './model.ts'

const tree: Omit<Mutation, 'available'>[] = [
  { id: 'predator-1', path: 'predator', tier: 1, name: 'Razor Bloom', trait: 'Contact damage · faster thrust', description: 'Grow serrated feeding spines. Striking a rival transfers part of its energy into your nucleus.', cost: 1 },
  { id: 'predator-2', path: 'predator', tier: 2, name: 'Raptorial Fork', trait: 'Long spines · stronger impulses', description: 'Fork the attacking branches and extend the reach of your impulse collision.', cost: 2 },
  { id: 'predator-3', path: 'predator', tier: 3, name: 'Apex Crown', trait: 'Crown of barbs · major leech', description: 'Branch tips develop barbed hooks and drain considerably more energy on contact.', cost: 3 },
  { id: 'symbiote-1', path: 'symbiote', tier: 1, name: 'Mutualist Veil', trait: 'Wider feeding field · repair', description: 'Extend branching veils that capture distant nutrients and restore the nucleus.', cost: 1 },
  { id: 'symbiote-2', path: 'symbiote', tier: 2, name: 'Luminous Garden', trait: 'Passive reserves · stronger veil', description: 'Cultivate light-producing partners that supply biomass and divert incoming damage.', cost: 2 },
  { id: 'symbiote-3', path: 'symbiote', tier: 3, name: 'Living Canopy', trait: 'Rapid repair · protective pulse', description: 'Connect the veils into a canopy. Discharge now feeds the repair network as it repels rivals.', cost: 3 },
  { id: 'crystalline-1', path: 'crystalline', tier: 1, name: 'Prism Mantle', trait: 'Armor · focused discharge', description: 'Refract stored energy through dense facets. You gain armor and fire a narrower, stronger discharge.', cost: 1 },
  { id: 'crystalline-2', path: 'crystalline', tier: 2, name: 'Refractive Lattice', trait: 'Longer discharge · durable nodes', description: 'Grow faceted lateral shields and focus the discharge across a greater distance.', cost: 2 },
  { id: 'crystalline-3', path: 'crystalline', tier: 3, name: 'Obsidian Choir', trait: 'Heavy armor · piercing resonance', description: 'Layer the crystals into a resilient shell capable of a deeply penetrating discharge.', cost: 3 },
]

export const tierTimes = [0, 0, 80, 205]
export const tiersRequire = [0, 1, 3, 5]

export function getChoices(world: WorldState): Mutation[] {
  const { path, tier } = world.player
  return tree.map(choice => ({
    ...choice,
    available: (!path || choice.path === path) && choice.tier === tier + 1 &&
      world.time >= tierTimes[choice.tier] && world.bonds >= tiersRequire[choice.tier] && world.catalysts >= choice.cost,
  }))
}

export function traits(path: Path | null, tier: number) {
  return {
    speed: path === 'predator' ? 1.10 + tier * .05 : path === 'crystalline' ? .9 - tier * .015 : 1,
    armor: path === 'crystalline' ? 1 - tier * .16 : path === 'symbiote' ? 1 - tier * .09 : 1,
    feeding: path === 'symbiote' ? 1.20 + tier * .17 : 1,
    impulse: path === 'predator' ? 1 + tier * .14 : 1,
    range: path === 'crystalline' ? 245 + tier * 35 : 230 + tier * 7,
    power: path === 'crystalline' ? 31 + tier * 10 : path === 'predator' ? 26 + tier * 5 : 24 + tier * 4,
  }
}
