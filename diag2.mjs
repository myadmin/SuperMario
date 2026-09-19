import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PORT = 5211
const BASE_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function resolveChrome() {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].filter(Boolean)
  for (const p of c) if (existsSync(p)) return p
  throw new Error('no chrome')
}
const vite = spawn(process.execPath, [new URL('./node_modules/vite/bin/vite.js', import.meta.url).pathname, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
process.on('exit', () => vite.kill())
const deadline = Date.now() + 30000
while (Date.now() < deadline) { try { if ((await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) })).ok) break } catch {} await sleep(300) }

const browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: 'new', args: ['--no-sandbox', '--mute-audio'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 4).join('\n')))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text()) })
await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
await page.mouse.click(200, 200)
await page.waitForFunction(() => {
  const h = window.__handle
  const cur = h && h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
  return cur && cur.name === '1-1'
}, { timeout: 30000 })
// 清怪（保证确定性）
await page.evaluate(() => {
  const cur = window.__handle.sceneRunner.scenes[window.__handle.sceneRunner.sceneIndex]
  for (const e of [...cur.entities]) {
    for (const t of e.traits.values()) if (t.constructor.name === 'Behavior') { cur.entities.delete(e); break }
  }
  for (const e of cur.entities) for (const t of e.traits.values()) if (t.constructor.name === 'Spawner') t.entities.length = 0
})
// 抓杆（不做奖励室旅行，排除干扰）
await page.evaluate(() => { window.mario.pos.set(3168, 104); window.mario.vel.set(0, 0) })
let last = ''
for (let i = 0; i < 40; i++) {
  await sleep(400)
  const s = await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    const m = window.mario
    const tr = {}
    if (m) for (const t of m.traits.values()) tr[t.constructor.name] = t
    return {
      scene: cur ? (cur.name ?? cur.constructor.name) : 'none',
      score: tr.Player?.score, time: Math.round(tr.LevelTimer?.currentTime ?? -1),
      frozen: tr.LevelTimer?.frozen, endSeq: tr.Damage?.endSequence, dying: tr.Damage?.dying,
      pos: m ? `${Math.round(m.pos.x)},${Math.round(m.pos.y)}` : null,
      vel: m ? `${Math.round(m.vel.x)},${Math.round(m.vel.y)}` : null,
    }
  })
  const line = JSON.stringify(s)
  if (line !== last) { console.log(i, line); last = line }
  if (s.scene === '1-2') { console.log('REACHED 1-2'); break }
}
console.log('ERRORS:', errors.length ? errors.join('\n---\n') : '(none)')
await browser.close()
