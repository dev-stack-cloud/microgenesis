import { writeFileSync } from 'node:fs'
import type { WorldState } from '../src/model.ts'
import { completeRun } from './autopilot.ts'

const states: Record<string, WorldState> = {}
const run = completeRun((name, world) => {
  if (name === 'encounter' || name === 'last-shot') states[name] = world
})
if (run.world.outcome !== 'won' || !states.encounter || !states['last-shot']) {
  throw new Error('The recorded pilot did not reach the encounter and win')
}
writeFileSync(new URL('./checkpoints.json', import.meta.url), JSON.stringify(states))
console.log(`Recorded encounter and final shot from a culture won in ${run.world.time.toFixed(2)} s.`)
