import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Simulation, STEP, NURSERY_SEED, CROWN_TIME } from '../src/simulation.ts'
import type { Input } from '../src/model.ts'

const idle: Input = { x: 0, y: 0, aim: null, absorb: false, bond: false, dash: false, ability: false }

test('the same seed and input stream replay exactly', () => {
  const a = new Simulation(NURSERY_SEED)
  const b = new Simulation(NURSERY_SEED)
  for (let i = 0; i < 540; i++) {
    const input = { ...idle, x: Math.sin(i / 85), y: Math.cos(i / 90), absorb: true, bond: i % 60 === 0 }
    a.step(input)
    b.step(input)
  }
  assert.deepEqual(a.world, b.world)
  assert.notEqual(a.world.player.x, 0)
  assert.ok(a.world.player.nodes[0].id > 0)
})

test('the nursery supplies biomass, a bond and a first mutation through play', () => {
  const { run, input } = collectInNursery()
  assert.ok(run.world.collected >= 3)
  assert.ok(run.world.bonds >= 1)
  const options = run.choices()
  assert.equal(options.filter(choice => choice.available).length, 3)
  assert.equal(run.mutate('symbiote-1'), true)
  assert.equal(run.mutate('predator-1'), false)
  run.step(input)
  assert.ok(run.world.player.nodes.some(node => node.kind === 'veil'))
})

test('a damaged branch disconnects its descendants and healed tissue can regenerate', () => {
  const { run } = collectInNursery()
  const player = run.world.player
  const branch = player.nodes[1]
  assert.ok(branch)
  run.damage(player, branch.x, branch.y, 17)
  assert.ok(run.world.lost > 0)
  const truncated = player.nodes.length
  player.energy = 90
  run.world.biomass = 20
  for (let i = 0; i < 60 * 12; i++) run.step(idle)
  assert.ok(player.nodes.length > truncated)
  for (const node of player.nodes.slice(1)) assert.ok(player.nodes.some(parent => parent.id === node.parent))
})

test('saved state restores random generation and simulation continuity', () => {
  const { run, input } = collectInNursery()
  run.mutate('crystalline-1')
  const resumed = Simulation.restore(JSON.parse(JSON.stringify(run.world)))
  assert.ok(resumed)
  for (let i = 0; i < 300; i++) {
    const move = { ...input, x: .8, y: -.6, dash: i === 2 }
    run.step(move)
    resumed.step(move)
  }
  assert.deepEqual(resumed.world, run.world)
  assert.equal(Simulation.restore({ seed: 3, time: 30 }), null)
})

test('a corrupted Crown save is rejected instead of loading an unwinnable run', () => {
  const run = new Simulation(NURSERY_SEED)
  run.world.time = CROWN_TIME - STEP / 2
  run.step(idle)
  const state = structuredClone(run.world)
  state.enemies = state.enemies.filter(actor => actor.id !== state.bossId)
  assert.ok(!Simulation.restore(state))
})

test('predator discharge transfers energy out of a surviving rival', () => {
  const { run } = collectInNursery()
  assert.equal(run.mutate('predator-1'), true)
  const enemy = run.world.enemies.find(actor => actor.kind === 'colony')!
  const player = run.world.player
  player.x = enemy.x - 145
  player.y = enemy.y
  player.energy = 45
  const before = enemy.energy
  run.step({ ...idle, aim: { x: enemy.x, y: enemy.y }, ability: true })
  assert.ok(enemy.energy < before - 2)
  assert.ok(enemy.hp > 0)
})

test('the final colony arrives on schedule and takes damage from actual discharge controls', () => {
  const { run } = collectInNursery()
  run.mutate('crystalline-1')
  // Skip the already tested opening clock and bring the same evolved organism to the encounter.
  run.world.time = CROWN_TIME - STEP / 2
  run.step(idle)
  const crown = run.world.enemies.find(enemy => enemy.id === run.world.bossId)
  assert.ok(crown)
  run.world.player.x = crown.x - 210
  run.world.player.y = crown.y
  run.step({ ...idle, aim: { x: crown.x, y: crown.y }, ability: true })
  assert.ok(crown.hp < crown.maxHp)
})

function collectInNursery() {
  const run = new Simulation(NURSERY_SEED)
  const input = { ...idle, aim: { x: 68, y: 5 }, absorb: true }
  for (let i = 0; i < 240; i++) run.step({ ...input, bond: i === 175 })
  return { run, input }
}

test('a full deterministic culture reaches victory within the intended run length', async () => {
  const { completeRun } = await import('./autopilot.ts')
  const run = completeRun()
  assert.equal(run.world.outcome, 'won')
  assert.ok(run.world.time >= 600 && run.world.time <= 900)
  assert.equal(run.world.player.tier, 3)
  assert.ok(run.world.bonds >= 5)
})
