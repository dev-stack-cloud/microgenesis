import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { WorldState } from '../src/model.ts'

const snapshots: Record<string, WorldState> = JSON.parse(readFileSync(new URL('./checkpoints.json', import.meta.url), 'utf8'))
const folder = process.env.QA_PICTURES || 'qa'
const screen = (page: Page, name: string) => page.screenshot({ path: `${folder}/${name}.png`, scale: 'css', animations: 'disabled' })
const mode = (page: Page) => page.locator('#interface')
const key = 'microgenesis.v1.run'

function catchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function load(page: Page, save?: WorldState, low = false) {
  if (save || low) {
    await page.addInitScript(({ world, low }) => {
      if (world) localStorage.setItem('microgenesis.v1.run', JSON.stringify(world))
      if (low) localStorage.setItem('microgenesis.v1.settings', JSON.stringify({ quality: 'low', muted: true, volume: .62 }))
    }, { world: save ?? null, low })
  }
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready', { timeout: 20_000 })
  const size = await page.locator('#viewport canvas').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect()
    return { w: bounds.width, h: bounds.height, x: bounds.x, y: bounds.y }
  })
  expect(Math.abs(size.w - page.viewportSize()!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(size.h - page.viewportSize()!.height)).toBeLessThanOrEqual(1)
  expect(size).toMatchObject({ x: 0, y: 0 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

async function saved(page: Page) {
  return page.evaluate(storage => JSON.parse(localStorage.getItem(storage) || 'null') as WorldState, key)
}

test('desktop cultivation, keyboard and mouse, mutation, pause and persistence', async ({ page }) => {
  const errors = catchErrors(page)
  await load(page)
  await expect(page.getByRole('heading', { name: 'MICROGENESIS' })).toBeVisible()
  await page.waitForTimeout(650)
  await screen(page, '01-title')
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(mode(page)).toHaveAttribute('data-screen', 'help')
  await page.keyboard.press('Escape')
  await page.locator('#begin-culture').click()
  await expect(mode(page)).toHaveAttribute('data-screen', 'playing')
  await screen(page, '02-nursery')

  await page.mouse.move(800, 450)
  await page.mouse.down()
  await expect(page.locator('#hud-catalysts')).not.toHaveText('0', { timeout: 12_000 })
  await page.mouse.up()
  await page.keyboard.press('KeyE')
  await expect(page.locator('#evolve-button')).toHaveClass(/is-ready/)
  await page.keyboard.press('Tab')
  await expect(mode(page)).toHaveAttribute('data-screen', 'evolution')
  await expect(page.locator('button[data-mutation]:enabled')).toHaveCount(3)
  await screen(page, '03-evolution')
  await page.locator('[data-mutation="symbiote-1"]').click()
  await expect(page.locator('#hud-lineage')).toContainText('Symbiote')
  await page.mouse.move(950, 500)
  await page.mouse.wheel(0, -176)
  await page.keyboard.down('KeyD')
  await page.keyboard.press('Space')
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyD')
  await page.keyboard.press('Escape')
  await expect(mode(page)).toHaveAttribute('data-screen', 'pause')
  const state = await saved(page)
  expect(state.player.x).toBeGreaterThan(45)
  expect(state.dash).toBeGreaterThan(0)
  expect(state.ability).toBeGreaterThan(0)
  expect(state.player.nodes.some(n => n.kind === 'veil')).toBeTruthy()
  await page.locator('#pause-screen [data-action="settings"]').click()
  await page.locator('#graphics-quality').selectOption('high')
  const oldBacking = await page.locator('#viewport canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)
  await page.locator('#graphics-quality').selectOption('low')
  await expect.poll(() => page.locator('#viewport canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeLessThan(oldBacking)
  await page.locator('#audio-muted').check()
  await page.keyboard.press('Escape')
  await page.locator('#pause-screen [data-action="title"]').click()
  await page.reload()
  await expect(page.locator('#continue-culture')).toBeEnabled()
  await page.locator('#continue-culture').click()
  await expect(page.locator('#hud-lineage')).toContainText('Symbiote')
  expect(await page.locator('#graphics-quality').inputValue()).toBe('low')
  expect(await page.locator('#audio-muted').isChecked()).toBeTruthy()
  expect(errors).toEqual([])
})

test('browser combat, developed anatomy and victory through the actual discharge action', async ({ page }) => {
  const errors = catchErrors(page)
  // Replay reached this snapshot from inoculation without modifying simulation state.
  const finisher = snapshots['last-shot']
  await load(page, finisher, true)
  await page.locator('#continue-culture').click()
  await expect(page.locator('#crown-health')).toBeVisible()
  await expect(page.locator('#hud-lineage')).toContainText('Crystalline III')
  await screen(page, '04-crown-encounter')
  const start = { x: finisher.player.x, y: finisher.player.y }
  const crown = finisher.enemies.find(e => e.kind === 'crown')!
  await page.mouse.move(720 + (crown.x - start.x) * 1.36, 450 + (crown.y - start.y) * 1.36)
  await page.mouse.down()
  await expect.poll(async () => {
    await page.keyboard.press('KeyQ')
    return (await saved(page)) === null
  }, { timeout: 13_000, intervals: [120, 160, 200] }).toBeTruthy()
  await page.mouse.up()
  await expect(page.locator('#crown-health')).toBeHidden()
  await expect(page.locator('#hud-objective')).toHaveText('Crown colony dissolved')
  await screen(page, '05-crown-dissolution')
  await expect(page.locator('#result-title')).toHaveText('Crown dissolved', { timeout: 15_000 })
  await screen(page, '06-victory')
  expect(await saved(page)).toBeNull()
  await page.locator('#result-screen [data-action="title"]').click()
  await expect(page.locator('#title-wins')).toContainText('1 successful culture')
  expect(errors).toEqual([])
})

test('lethal acid, defeat screen and restart', async ({ page }) => {
  const errors = catchErrors(page)
  // Isolate defeat in a reachable late-game state with one lethal pool.
  const world = structuredClone(snapshots.encounter)
  world.player.hp = 1
  world.drain = 0
  world.player.shield = 0
  world.hazards.push({ kind: 'acid', x: world.player.x, y: world.player.y, radius: 84, age: 2, life: 10 })
  await load(page, world, true)
  await page.locator('#continue-culture').click()
  await expect(page.locator('#result-title')).toHaveText('Specimen lost')
  await expect(mode(page)).toHaveAttribute('data-screen', 'result')
  await screen(page, '07-defeat')
  await page.getByRole('button', { name: 'Begin new culture' }).click()
  await expect(mode(page)).toHaveAttribute('data-screen', 'playing')
  await expect(page.locator('#hud-lineage')).toHaveText('Progenitor')
  expect(errors).toEqual([])
})

test.describe('mobile viewport and emulated touch events', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  test('touch grow, move, fire and open responsive instruments', async ({ page, context }) => {
    const errors = catchErrors(page)
    await load(page)
    await screen(page, '08-mobile-title')
    await page.locator('#begin-culture').tap()
    await expect(page.locator('#touch-controls')).toBeVisible()
    const cdp = await context.newCDPSession(page)
    const absorb = (await page.locator('[data-touch="absorb"]').boundingBox())!
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: absorb.x + absorb.width / 2, y: absorb.y + absorb.height / 2 }] })
    await expect(page.locator('#hud-catalysts')).not.toHaveText('0', { timeout: 12_000 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.locator('[data-touch="bond"]').tap()
    await expect(page.locator('#evolve-button')).toHaveClass(/is-ready/)
    await screen(page, '09-mobile-gameplay')
    await page.locator('#evolve-button').tap()
    await expect(mode(page)).toHaveAttribute('data-screen', 'evolution')
    await screen(page, '10-mobile-evolution')
    await page.locator('[data-mutation="predator-1"]').tap()
    await expect(page.locator('#hud-lineage')).toContainText('Predator')
    const stick = (await page.locator('#joystick').boundingBox())!
    const x = stick.x + stick.width / 2
    const y = stick.y + stick.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 51, y }] })
    await page.waitForTimeout(650)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.locator('[data-touch="dash"]').tap()
    await page.locator('[data-touch="ability"]').tap()
    await page.getByRole('button', { name: 'Pause game' }).tap()
    await expect(mode(page)).toHaveAttribute('data-screen', 'pause')
    const state = await saved(page)
    expect(state.player.x).toBeGreaterThan(15)
    expect(state.dash).toBeGreaterThan(0)
    expect(state.ability).toBeGreaterThan(0)
    const box = (await page.locator('#pause-screen').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await page.setViewportSize({ width: 320, height: 568 })
    await expect.poll(() => page.locator('#viewport canvas').evaluate(canvas => Math.round(canvas.getBoundingClientRect().width))).toBe(320)
    const compact = (await page.locator('#pause-screen').boundingBox())!
    expect(compact.x).toBeGreaterThanOrEqual(0)
    expect(compact.x + compact.width).toBeLessThanOrEqual(320)
    expect(errors).toEqual([])
  })
})
