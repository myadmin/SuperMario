import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(existsSync)[0]
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--mute-audio'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('response', (r) => {
  if (r.status() >= 400) {
    errors.push(`http ${r.status()}: ${r.url()}`)
  }
})
await page.goto('http://localhost:4173/SuperMario/', { waitUntil: 'networkidle0' })
const boot = await page.evaluate(() => ({
  progress: document.getElementById('boot-progress')?.textContent,
  bootOpacity: getComputedStyle(document.getElementById('boot')).opacity,
  canvasCount: document.querySelectorAll('canvas').length,
}))
console.log('boot:', JSON.stringify(boot))
await page.mouse.click(550, 420)
await sleep(3000)
const st = await page.evaluate(() => ({
  handle: !!window.__handle,
  mario: !!window.mario,
  phaserBooted: !!window.Phaser,
  scene: window.__handle ? (() => { const c = window.__handle.sceneRunner.scenes[window.__handle.sceneRunner.sceneIndex]; return c ? (c.name ?? c.constructor.name) : 'none' })() : 'n/a',
}))
console.log('after click:', JSON.stringify(st))
const probe2 = await page.evaluate(async () => {
  const r = await fetch('/SuperMario/assets/index-B1V8z_Uj.js', { cache: 'no-store' })
  const txt = await r.text()
  return { status: r.status, url: r.url, head: txt.slice(0, 120) }
})
console.log('in-page fetch:', JSON.stringify(probe2))
console.log('page.url now:', page.url())
console.log('errors:', errors.length ? errors.join('\n') : '(none)')
await browser.close()
