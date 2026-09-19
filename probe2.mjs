import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(existsSync)[0]
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--mute-audio'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
await page.goto('http://localhost:4173/SuperMario/', { waitUntil: 'networkidle0' })
await page.mouse.click(550, 420)
await sleep(9000)
const names = await page.evaluate(() => {
  const m = window.mario
  return m ? [...m.traits.values()].map((t) => t.constructor.name) : 'no mario'
})
console.log('trait names:', JSON.stringify(names))
await browser.close()
