import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'node:fs'

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const base = process.env.GAME_URL || 'http://127.0.0.1:5174/'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
  args: ['--enable-gpu', '--enable-unsafe-swiftshader'],
})
const { encounter } = JSON.parse(readFileSync(new URL('../tests/checkpoints.json', import.meta.url), 'utf8'))
try {
  await profile('nursery desktop High', { width: 1440, height: 900 }, false, 'high')
  await profile('Crown desktop High', { width: 1440, height: 900 }, false, 'high', encounter)
  await profile('Crown mobile Adaptive', { width: 390, height: 844 }, true, 'auto', encounter)
} finally { await browser.close() }

async function profile(name, viewport, mobile, quality, savedState) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', err => errors.push(err.message))
    await page.addInitScript(({ quality, state }) => {
      localStorage.setItem('microgenesis.v1.settings', JSON.stringify({ quality, muted: true, volume: .62 }))
      if (state) localStorage.setItem('microgenesis.v1.run', JSON.stringify(state))
    }, { quality, state: savedState ?? null })
    await page.goto(base)
    await page.locator('html[data-engine=ready]').waitFor({ timeout: 25_000 })
    const adapter = await page.evaluate(() => {
      const gl = document.querySelector('#viewport canvas').getContext('webgl2')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable'
    })
    await page.locator(savedState ? '#continue-culture' : '#begin-culture').click()
    await page.waitForTimeout(250)
    const timing = await page.evaluate(async () => {
      const series = []
      let last = 0
      await new Promise(resolve => {
        const count = time => {
          if (last > 0) series.push(time - last)
          last = time
          if (series.length === 120) resolve()
          else requestAnimationFrame(count)
        }
        requestAnimationFrame(count)
      })
      series.sort((a, b) => a - b)
      const canvas = document.querySelector('#viewport canvas')
      return { p50: series[60], p95: series[113], max: series[119], backing: [canvas.width, canvas.height] }
    })
    console.log(JSON.stringify({ name, adapter, ...timing, errors }))
  } finally { await context.close() }
}
