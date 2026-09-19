#!/usr/bin/env node
/**
 * smoke.mjs —— 无头浏览器冒烟测试（`npm run smoke`）。
 *
 * 对「游戏真的能玩」做回归保护：启动 dev server，用系统 Chrome 无头加载页面，
 * 通过 window.__handle / window.mario 探针驱动并断言关键链路：
 *
 *   A. 启动 → 加载 1-1、无 console 错误
 *   B0. 顶块弹飞上面的敌人（killEnemiesAbove）
 *   B1/B2. 顶金币块出金币 +200；顶道具块出蘑菇（不计分）——都变已使用块
 *   C1/D1. 小马里奥顶砖只弹不碎；大马里奥顶砖会碎
 *   E1/E2. 星砖出无敌星（大马里奥顶不碎）→ 吃到激活 StarPower +1000
 *   G1~G4. 抓杆冻结计时 + 高度计分 → 通关序列（自动走位 → 进门消失 →
 *          时间结算 → 等小曲）→ 推进到 1-2
 *
 * Chrome 路径：环境变量 CHROME_PATH 优先，否则探测常见安装路径（macOS / Linux）。
 * CI（GitHub Actions ubuntu-latest 自带 Chrome）直接可用。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

// 默认自己起 dev server（base '/'）；设置 SMOKE_BASE_URL 时改为对既有站点实测
// （CI 的部署流程用它对「按 Pages 子路径构建出来的产物」做回归，如
// http://localhost:4173/SuperMario/）。
const PORT = 5199
const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${PORT}/`

function resolveChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    '找不到 Chrome/Chromium。请用环境变量 CHROME_PATH 指定可执行文件路径。\n' +
      candidates.join('\n'),
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await sleep(300)
  }
  throw new Error(`dev server 在 ${timeoutMs}ms 内没有就绪: ${url}`)
}

// ---------------------------------------------------------------- 启动 dev server（外部 URL 时跳过）
let vite = null
if (!process.env.SMOKE_BASE_URL) {
  vite = spawn(
    process.execPath,
    [new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname, '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore' },
  )
  process.on('exit', () => vite.kill())
}

try {
  await waitForServer(BASE_URL)

  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    // 网络类错误（"Failed to load resource: ..."）不带 URL，由下面的 response
    // 处理器按 URL 判定（favicon 已豁免），这里不重复计错。
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      errors.push('console.error: ' + m.text())
    }
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`http ${r.status()}: ${r.url()}`)
  })

  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok })
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
  }

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 })

  // ---- A. 启动：点击画布开始，等 1-1 就绪
  await page.mouse.click(200, 200)
  await page.waitForFunction(
    () => {
      const h = window.__handle
      if (!h) return false
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      return cur && cur.name === '1-1'
    },
    { timeout: 30000 },
  )
  check('A1. 游戏启动并加载 1-1', true)

  // ---- B0. 顶块弹飞上面的敌人（先于清场，从刷怪队列取第一只板栗仔放到 (20,9) 砖顶）
  const goombaFlipped = await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    let goomba = null
    for (const e of cur.entities) {
      for (const t of e.traits.values()) {
        if (t.constructor.name.replace(/^_/, '') === 'Behavior') { goomba = e; break }
      }
      if (goomba) break
    }
    if (!goomba) {
      for (const e of cur.entities) {
        for (const t of e.traits.values()) {
          if (t.constructor.name.replace(/^_/, '') === 'Spawner' && t.entities.length > 0) {
            goomba = t.entities.shift()
            break
          }
        }
        if (goomba) break
      }
    }
    if (!goomba) return { found: false }
    cur.entities.add(goomba)
    goomba.pos.set(20 * 16 + 1, 128)
    goomba.vel.set(0, 0)
    const m = window.mario
    m.pos.set(20 * 16 + 1, 163)
    m.vel.set(0, -250)
    return { found: true }
  })
  await sleep(500)
  const flipState = await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    for (const e of cur.entities) {
      const names = [...e.traits.values()].map((t) => t.constructor.name.replace(/^_/, ''))
      if (names.includes('Flipped')) {
        const k = [...e.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'Killable')
        return { flipped: true, killed: k ? k.killed : null }
      }
    }
    return { flipped: false }
  })
  check('B0. 顶块弹飞上面的敌人（打翻 + 砖保留）',
    goombaFlipped.found && flipState.flipped === true && flipState.killed === true,
    JSON.stringify({ ...goombaFlipped, ...flipState }))

  // ---- 清场：删除剩余敌人 + 清空刷怪队列（保证后续瞬移测试的确定性）
  await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    for (const e of [...cur.entities]) {
      for (const t of e.traits.values()) {
        if (t.constructor.name.replace(/^_/, '') === 'Behavior') { cur.entities.delete(e); break }
      }
    }
    for (const e of cur.entities) {
      for (const t of e.traits.values()) {
        if (t.constructor.name.replace(/^_/, '') === 'Spawner') t.entities.length = 0
      }
    }
  })

  const state = () =>
    page.evaluate(() => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      const m = window.mario
      const level = cur && cur.name ? cur : null
      // 反向扫描：层 0 是整格覆盖的天空层，层 1 才是砖块层
      const tileAt = (x, y) => {
        if (!level) return null
        const rs = level.tileCollider.resolvers
        for (let i = rs.length - 1; i >= 0; i--) {
          const t = rs[i].matrix.get(x, y)
          if (t) return { style: t.style, behavior: t.behavior ?? null, hidden: !!t.hidden }
        }
        return null
      }
      const findTrait = (name) => {
        if (!m) return null
        for (const t of m.traits.values()) if (t.constructor.name.replace(/^_/, '') === name) return t
        return null
      }
      const countTrait = (name) => {
        if (!level) return 0
        let n = 0
        for (const e of level.entities) {
          for (const t of e.traits.values()) if (t.constructor.name.replace(/^_/, '') === name) n++
        }
        return n
      }
      const player = findTrait('Player')
      const timer = findTrait('LevelTimer')
      const star = findTrait('StarPower')
      return {
        levelName: level ? level.name : null,
        score: player ? player.score : null,
        coins: player ? player.coins : null,
        lives: player ? player.lives : null,
        timerFrozen: timer ? timer.frozen : null,
        timerTime: timer ? Math.round(timer.currentTime) : null,
        starActive: star ? star.active : null,
        marioPos: m ? { x: Math.round(m.pos.x), y: Math.round(m.pos.y) } : null,
        marioSize: m ? { w: m.size.x, h: m.size.y } : null,
        marioInLevel: level && m ? level.entities.has(m) : null,
        brick106: tileAt(106, 9),
        brick20: tileAt(20, 9),
        brick22: tileAt(22, 9),
        brick101: tileAt(101, 9),
        chance16: tileAt(16, 9),
        starmen: countTrait('StarPickup'),
        mushrooms: countTrait('MushroomPickup'),
        fireworks: countTrait('Firework'),
      }
    })

  const bump = (x, y) =>
    page.evaluate(
      (x, y) => {
        const m = window.mario
        m.pos.set(x, y)
        m.vel.set(0, -250)
      },
      x,
      y,
    )

  let s = await state()
  check('A2. 初始状态（小马里奥、分数 0、砖块层在位、隐藏块白名单生效）',
    s.score === 0 && s.marioSize.h === 16 && s.brick20.behavior === 'brick' && s.chance16.behavior === 'chance',
    JSON.stringify({ score: s.score, size: s.marioSize }))
  const hidden64 = await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    const rs = cur.tileCollider.resolvers
    for (let i = rs.length - 1; i >= 0; i--) {
      const t = rs[i].matrix.get(64, 8)
      if (t) return { style: t.style, hidden: !!t.hidden }
    }
    return null
  })
  check('A3. 1-1 第 64 列隐藏 1-UP 块仍隐藏（白名单）',
    hidden64 !== null && hidden64.hidden === true && hidden64.style === 'metal',
    JSON.stringify(hidden64))

  // ---- B1. 顶金币问号块（col 106；col 16/78 是道具块）
  await bump(106 * 16 + 1, 163)
  await sleep(400)
  s = await state()
  check('B1. 顶金币块：+1 金币 +200 分 + 变已使用块',
    s.coins === 1 && s.score === 200 && s.brick106.behavior === 'ground' && s.brick106.style === 'metal',
    JSON.stringify({ coins: s.coins, score: s.score, tile: s.brick106 }))

  // ---- B2. 顶道具块（col 16）→ 出蘑菇（不计分）
  await bump(16 * 16 + 1, 163)
  await sleep(400)
  s = await state()
  check('B2. 顶道具块出蘑菇（小马里奥 → 蘑菇实体，块变已使用，不计分）',
    s.mushrooms === 1 && s.chance16.behavior === 'ground' && s.score === 200 && s.coins === 1,
    JSON.stringify({ mushrooms: s.mushrooms, tile: s.chance16, score: s.score }))

  // ---- C1. 小马里奥顶普通砖（col 20）—— 砖保留
  await bump(20 * 16 + 1, 163)
  await sleep(400)
  s = await state()
  check('C1. 小马里奥顶砖只弹不碎（砖保留、不加分）',
    s.brick20 && s.brick20.behavior === 'brick' && s.score === 200,
    JSON.stringify({ tile: s.brick20, score: s.score }))

  // ---- D1. 变大马里奥，顶砖（col 22）—— 碎。起跳点要在块底（y=160）之下
  await page.evaluate(() => {
    const m = window.mario
    for (const t of m.traits.values()) {
      if (t.constructor.name.replace(/^_/, '') === 'PowerState') {
        t.level = 'super'
        t.resize(m, 32)
      }
    }
  })
  await bump(22 * 16 + 1, 162)
  await sleep(400)
  s = await state()
  check('D1. 大马里奥顶砖会碎（砖块层该格已空）',
    s.brick22 !== null && s.brick22.behavior === null && s.marioSize.h === 32,
    JSON.stringify({ brick22: s.brick22, size: s.marioSize }))

  // ---- E1. 星砖（col 101）：大马里奥顶内容砖不碎、出星星
  await bump(101 * 16 + 1, 162)
  await sleep(400)
  s = await state()
  check('E1. 星砖被顶出无敌星（大马里奥顶也不碎）',
    s.starmen === 1 && s.brick101.behavior === 'ground' && s.brick101.style === 'metal',
    JSON.stringify({ starmen: s.starmen, tile: s.brick101 }))

  // ---- E2. 吃星星（星星在弹跳移动，反复贴上去直到吃到——最多 3 秒）
  const scoreBeforeStar = (await state()).score
  const tEat = Date.now()
  let s2 = await state()
  while (Date.now() - tEat < 3000 && !s2.starActive) {
    await page.evaluate(() => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      const m = window.mario
      for (const e of cur.entities) {
        let isStar = false
        for (const t of e.traits.values()) if (t.constructor.name.replace(/^_/, '') === 'StarPickup') isStar = true
        if (isStar) {
          m.pos.set(e.pos.x, e.pos.y - 8)
          m.vel.set(0, 0)
          return
        }
      }
    })
    await sleep(250)
    s2 = await state()
  }
  s = s2
  check('E2. 吃到无敌星（StarPower 激活、+1000 分）',
    s.starActive === true && s.score === scoreBeforeStar + 1000,
    JSON.stringify({ active: s.starActive, score: s.score, before: scoreBeforeStar }))

  // ---- H. 隐藏金币奖励室（1-1 ↔ coin-room-1）
  // H1: 两个门户已注入（入口 DOWN 带 goesTo+backTo，出口 UP 带 id）
  const portals = await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    const found = []
    for (const e of cur.entities) {
      if (e.props && e.props.dir !== undefined) {
        found.push({ dir: e.props.dir, id: e.id ?? null, goesTo: e.props.goesTo?.name ?? null, backTo: e.props.backTo ?? null, x: e.pos.x, y: e.pos.y })
      }
    }
    return found
  })
  const entry = portals.find((p) => p.dir === 'DOWN' && p.goesTo === 'coin-room-1')
  const exit = portals.find((p) => p.dir === 'UP' && p.id === 'bonus-exit-1-1')
  check('H1. 奖励室门户已注入（入口 DOWN→coin-room-1 + backTo，出口 UP 带 id）',
    !!entry && entry.backTo === 'bonus-exit-1-1' && !!exit,
    JSON.stringify(portals))

  // H2: 全程 E2E——站上 57 列管口按 ↓（直接置 PipeTraveller.direction）进奖励室，
  // 再走进奖励室的返程横管，从 163 列管口钻出回到 1-1。
  await page.evaluate(() => {
    const m = window.mario
    // 大马里奥站在管口上：脚底 y=144 → pos.y=112；x 落在门户 [912,944] 内
    m.pos.set(920, 112)
    m.vel.set(0, 0)
    const pt = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PipeTraveller')
    pt.direction.y = 1
  })
  await page.waitForFunction(
    () => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      return cur && cur.name === 'coin-room-1' && window.mario && cur.entities.has(window.mario)
    },
    { timeout: 15000 },
  )
  check('H2a. 钻进 57 列水管 → 进入 coin-room-1', true)

  await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    const m = window.mario
    // 奖励室返程门户在 x [206,230]：马里奥横向整个落在门户内，纵向站在地面 y 208
    m.pos.set(208, 176)
    m.vel.set(0, 0)
    const pt = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PipeTraveller')
    pt.direction.set(0, 0)
    pt.direction.x = 1
  })
  await page.waitForFunction(
    () => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      return cur && cur.name === '1-1' && window.mario && cur.entities.has(window.mario)
    },
    { timeout: 15000 },
  )
  // 等钻管动画结束（connectEntity 向上插值 1s），马里奥应站在 163 列管口顶（y≈144，大马里奥）
  await sleep(2000)
  s = await state()
  await page.evaluate(() => {
    const m = window.mario
    const pt = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PipeTraveller')
    pt.direction.set(0, 0)
  })
  check('H2b. 走进返程横管 → 从 163 列管口钻出回 1-1',
    s.levelName === '1-1' && s.marioPos && Math.abs(s.marioPos.x - 2617) < 24 && Math.abs(s.marioPos.y - 144) < 8,
    JSON.stringify({ level: s.levelName, pos: s.marioPos }))

  // ---- G1. 抓旗杆（旗杆实体 x≈3168-3180）；没抓上就再贴一次（最多 3 次）
  let g1 = null
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      const m = window.mario
      m.pos.set(3168, 104)
      m.vel.set(0, 0)
    })
    await sleep(500)
    g1 = await state()
    if (g1.timerFrozen === true) break
  }
  s = g1
  check('G1. 抓杆：计时冻结 + 高度计分',
    s.timerFrozen === true && s.score > 1200,
    JSON.stringify({ frozen: s.timerFrozen, score: s.score, time: s.timerTime }))
  // 冻结之后再钉 TIME=361（个位 1 → 1 发烟花）：冻结后不再倒走，而烟花发数是
  // 滑杆到底（序列启动）那一刻取样的——此刻设置正好被采样。
  await page.evaluate(() => {
    const m = window.mario
    const timer = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'LevelTimer')
    timer.currentTime = 361
  })

  // ---- G2~G4. 通关序列走完并推进到 1-2（滑杆+走位+结算+小曲 ≈ 12s）
  const trace = []
  let sawHidden = false
  let sawBonus = false
  let sawFireworks = false
  let sawFireworksMax = 0
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    s = await state()
    trace.push(`${s.levelName}|score=${s.score}|time=${s.timerTime}|in=${s.marioInLevel}|fw=${s.fireworks}`)
    if (s.levelName === '1-1' && s.marioInLevel === false && s.timerFrozen) sawHidden = true
    if (s.levelName === '1-1' && s.timerTime === 0 && s.timerFrozen) sawBonus = true
    if (s.fireworks >= 1) sawFireworks = true
    if (s.fireworks > sawFireworksMax) sawFireworksMax = s.fireworks
    if (s.levelName === '1-2') break
  }
  check('G2. 通关序列：马里奥进门消失 + 时间结算归零', sawHidden && sawBonus, trace.slice(-4).join('  '))
  check('G2b. TIME 个位为 1 → 放 1 发烟花', sawFireworks && sawFireworksMax === 1, `max fireworks seen = ${sawFireworksMax}`)
  check('G3. 小曲放完后推进到 1-2', s.levelName === '1-2', s.levelName)

  await page.waitForFunction(
    () => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      return cur && cur.name === '1-2' && window.mario && cur.entities.has(window.mario)
    },
    { timeout: 20000 },
  )
  check('G4. 进入 1-2（马里奥在关卡中）', true)

  // ---- G5. 1-2 瓦片修正验证：砖块 behavior=brick、天花板 metal 可见、chance 已转换
  const t12 = await page.evaluate(() => {
    const h = window.__handle
    const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
    const rs = cur.tileCollider.resolvers
    const read = (x, y) => {
      for (let i = rs.length - 1; i >= 0; i--) {
        const t = rs[i].matrix.get(x, y)
        if (t) return { style: t.style, behavior: t.behavior ?? null, hidden: !!t.hidden }
      }
      return null
    }
    return { ceilingBrick: read(10, 2), structureBrick: read(39, 7), ceilingMetal: read(89, 2), chance: read(10, 9), hidden29: read(29, 8), hidden46: read(46, 7) }
  })
  check('G5. 1-2 瓦片：砖可顶(behavior=brick)、天花板 metal 可见、chance 已转换',
    t12.ceilingBrick.behavior === 'brick' && t12.structureBrick.behavior === 'brick' &&
      t12.ceilingMetal.hidden === false && t12.ceilingMetal.style === 'metal' &&
      t12.chance.behavior === 'chance',
    JSON.stringify(t12))
  check('G5b. 1-2 悬浮隐藏块已入白名单（不可见、可顶）',
    t12.hidden29.hidden === true && t12.hidden29.style === 'metal' && t12.hidden46.hidden === true,
    JSON.stringify({ hidden29: t12.hidden29, hidden46: t12.hidden46 }))

  // ---- H3. 1-2 的奖励室管道对（col 109 中间最高管进 → coin-room-2 → col 115 右管出）
  await page.evaluate(() => {
    const m = window.mario
    const power = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PowerState')
    const mouthTop = 144                                   // 4 格高管口顶 y
    m.pos.set(109 * 16 + 2, power.large ? mouthTop - 32 : mouthTop - 16)
    m.vel.set(0, 0)
    const pt = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PipeTraveller')
    pt.direction.set(0, 0)
    pt.direction.y = 1
  })
  await page.waitForFunction(
    () => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      return cur && cur.name === 'coin-room-2' && window.mario && cur.entities.has(window.mario)
    },
    { timeout: 15000 },
  )
  check('H3a. 站上 109 列（中间最高）管口按 ↓ → 进入 coin-room-2', true)

  await page.evaluate(() => {
    const m = window.mario
    const power = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PowerState')
    m.pos.set(202, power.large ? 176 : 192)                // 返程管口（x 200~224）前的地面
    m.vel.set(0, 0)
    const pt = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PipeTraveller')
    pt.direction.set(0, 0)
    pt.direction.x = 1
  })
  await page.waitForFunction(
    () => {
      const h = window.__handle
      const cur = h.sceneRunner.scenes[h.sceneRunner.sceneIndex]
      return cur && cur.name === '1-2' && window.mario && cur.entities.has(window.mario)
    },
    { timeout: 15000 },
  )
  await sleep(1800)                                        // 等钻管动画结束
  const h3b = await page.evaluate(() => {
    const m = window.mario
    const power = [...m.traits.values()].find((t) => t.constructor.name.replace(/^_/, '') === 'PowerState')
    const expectY = power.large ? 144 : 160                // 2 格管口顶 y=176，站上去脚底对齐
    return { pos: { x: Math.round(m.pos.x), y: Math.round(m.pos.y) }, expectY }
  })
  check('H3b. 走进返程横管 → 从 115 列 2 格管钻出回 1-2',
    h3b.pos.x > 1820 && Math.abs(h3b.pos.y - h3b.expectY) < 8,
    JSON.stringify(h3b))

  console.log('\n---- console/page/http errors ----')
  console.log(errors.length ? errors.join('\n') : '(none)')

  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length || errors.length ? 1 : 0)
} finally {
  vite?.kill()
}
