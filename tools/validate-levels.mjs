#!/usr/bin/env node
/**
 * validate-levels.mjs — 关卡与素材引用完整性校验
 *
 * 上游的关卡 JSON 是「数据驱动」的：一个 level 会引用 spriteSheet / musicSheet /
 * patternSheet，pattern 又会嵌套引用 sprite sheet 里的 tile 名，entity 名则必须能在
 * 实体工厂里找到。任何一处写错都只在**运行时**炸（例如 pattern 展开时抛
 * `TypeError: b is not iterable`），静态检查能把这类问题提前拦住。
 *
 * 上游自身在 debug 关卡里带有若干数据缺陷。这些记在 KNOWN_UPSTREAM_ISSUES 里，
 * 只作为「已知上游问题」提示、不导致失败——这样既保留 1:1 复刻的素材原貌，
 * 又能让**新引入的**回归被 CI 拦住。
 *
 * 用法：node tools/validate-levels.mjs
 * 退出码 0 = 无新增问题；1 = 存在非上游固有的错误。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')

/** 实体工厂注册表 —— 必须与 src/engine/entities.ts 的 addAs(...) 保持一致 */
const ENTITY_NAMES = new Set([
  'mario',
  'piranha-plant',
  'goomba-brown',
  'goomba-blue',
  'koopa-green',
  'koopa-blue',
  'cheep-slow',
  'cheep-fast',
  'cheep-slow-wavy',
  'cheep-fast-wavy',
  'bullet',
  'cannon',
  'pipe-portal',
  'flag-pole',
  'brickShrapnel',
])

/**
 * 上游 data 里既有的缺陷（本项目原样保留，不修改 public/）。
 * 每条用「匹配子串」判定；命中则降级为提示。
 */
const KNOWN_UPSTREAM_ISSUES = [
  {
    match: 'music/silent.json: 空 url',
    note: '「静音」音乐表：故意留空 url，仅供 debug-coin / debug-progression 使用',
  },
  {
    match: 'levels/debug-pipe.json: pipe-portal backTo "outlet1"',
    note: 'debug 关卡数据缺陷：backTo 指向 coin-room-1 中不存在的实体 id；正常流程不可达',
  },
  {
    match: 'levels/debug-pipe.json: 没有 checkpoints',
    note: 'debug 关卡：出生点退化为 (0,0)，与原版一致',
  },
  {
    match: 'levels/debug-flag.json: tile 既没有 style 也没有 pattern',
    note: 'debug 关卡数据用的是旧 schema（name/type 而非 style/behavior）：渲染不出瓦片、无碰撞，加载即抛错；正常流程不可达',
  },
]

const errors = []
const known = []
let checks = 0

const err = (msg) => {
  const hit = KNOWN_UPSTREAM_ISSUES.find((k) => msg.includes(k.match))
  if (hit) known.push({ msg, note: hit.note })
  else errors.push(msg)
}

const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))
const exists = (p) => existsSync(p)
const urlToDisk = (url) => join(PUB, url.replace(/^\//, ''))

// ---------------------------------------------------------------- 素材文件
console.log('▶ 校验精灵规格 / 音乐 / 音效的文件引用…')
const spriteSheetNames = readdirSync(join(PUB, 'sprites'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))

for (const name of spriteSheetNames) {
  const spec = readJSON(join(PUB, 'sprites', `${name}.json`))
  checks++
  if (!spec.imageURL) err(`sprites/${name}.json: 缺少 imageURL`)
  else if (!exists(urlToDisk(spec.imageURL)))
    err(`sprites/${name}.json: imageURL 指向的文件不存在 -> ${spec.imageURL}`)

  // 动画引用的帧必须在本表里已定义，否则运行时会抛
  // TypeError: Cannot read properties of undefined (reading '0')
  const defined = new Set([
    ...(spec.tiles ?? []).map((t) => t.name),
    ...(spec.frames ?? []).map((f) => f.name),
  ])
  for (const anim of spec.animations ?? []) {
    checks++
    if (!Array.isArray(anim.frames) || anim.frames.length === 0) {
      err(`sprites/${name}.json: 动画 "${anim.name}" 没有 frames`)
      continue
    }
    for (const f of anim.frames) {
      checks++
      if (!defined.has(f)) {
        err(`sprites/${name}.json: 动画 "${anim.name}" 引用了未定义的帧 "${f}"`)
      }
    }
  }
}

const patternSheetNames = readdirSync(join(PUB, 'sprites', 'patterns'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))

for (const dir of ['music', 'sounds']) {
  for (const file of readdirSync(join(PUB, dir))) {
    const spec = readJSON(join(PUB, dir, file))
    const urls =
      dir === 'music'
        ? Object.values(spec).map((t) => t.url)
        : Object.values(spec.fx ?? {}).map((t) => t.url)
    for (const u of urls) {
      checks++
      if (u === '') err(`${dir}/${file}: 空 url`)
      else if (!u) err(`${dir}/${file}: 缺少 url`)
      else if (!exists(urlToDisk(u))) err(`${dir}/${file}: url 指向的文件不存在 -> ${u}`)
    }
  }
}

// ---------------------------------------------------------------- 关卡
console.log('▶ 校验关卡引用…')
const levelNames = readdirSync(join(PUB, 'levels'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
const levelSet = new Set(levelNames)

/** 展开 pattern 得到最终 style 列表 */
function resolveStyles(tiles, patterns, sheetName, levelName, depth = 0) {
  const out = []
  if (depth > 8) {
    err(`levels/${levelName}.json: pattern 嵌套过深（疑似循环引用）`)
    return out
  }
  for (const t of tiles) {
    if (t.pattern) {
      if (!(t.pattern in patterns)) {
        err(`levels/${levelName}.json: pattern "${t.pattern}" 在 ${sheetName} 里不存在`)
        continue
      }
      out.push(
        ...resolveStyles(patterns[t.pattern].tiles ?? [], patterns, sheetName, levelName, depth + 1),
      )
    } else if (t.style) {
      out.push(t.style)
    } else {
      const legacy = t.name ? `（旧 schema：name="${t.name}"${t.type ? `, type="${t.type}"` : ''}）` : ''
      err(`levels/${levelName}.json: tile 既没有 style 也没有 pattern ${legacy}`)
    }
    if (!Array.isArray(t.ranges) || t.ranges.length === 0) {
      err(`levels/${levelName}.json: 有 tile 缺少 ranges（${t.style ?? t.pattern}）`)
    }
  }
  return out
}

for (const name of levelNames) {
  const spec = readJSON(join(PUB, 'levels', `${name}.json`))

  for (const key of ['spriteSheet', 'musicSheet', 'patternSheet']) {
    checks++
    if (!spec[key]) {
      err(`levels/${name}.json: 缺少 ${key}`)
      continue
    }
    const ok =
      key === 'spriteSheet'
        ? spriteSheetNames.includes(spec[key])
        : key === 'musicSheet'
          ? exists(join(PUB, 'music', `${spec[key]}.json`))
          : patternSheetNames.includes(spec[key])
    if (!ok) err(`levels/${name}.json: ${key} "${spec[key]}" 不存在`)
  }

  if (!Array.isArray(spec.layers) || spec.layers.length === 0) {
    err(`levels/${name}.json: 没有 layers`)
    continue
  }

  if (!spriteSheetNames.includes(spec.spriteSheet)) continue
  const sheet = readJSON(join(PUB, 'sprites', `${spec.spriteSheet}.json`))
  const available = new Set([
    ...(sheet.tiles ?? []).map((t) => t.name),
    ...(sheet.animations ?? []).map((a) => a.name),
  ])

  let patterns = {}
  const patternPath = join(PUB, 'sprites', 'patterns', `${spec.patternSheet}.json`)
  if (exists(patternPath)) patterns = readJSON(patternPath)

  for (const [i, layer] of spec.layers.entries()) {
    for (const style of resolveStyles(layer.tiles ?? [], patterns, spec.patternSheet, name)) {
      checks++
      if (!available.has(style)) {
        err(
          `levels/${name}.json: 图层 ${i} 引用了 ${spec.spriteSheet} 里没有的 tile/animation "${style}"`,
        )
      }
    }
  }

  for (const e of spec.entities ?? []) {
    checks++
    if (!ENTITY_NAMES.has(e.name)) err(`levels/${name}.json: 未知实体 "${e.name}"（实体工厂里没有）`)
    if (!Array.isArray(e.pos) || e.pos.length !== 2) err(`levels/${name}.json: 实体 ${e.name} 的 pos 非法`)
  }

  for (const t of spec.triggers ?? []) {
    checks++
    if (t.type === 'goto' && !levelSet.has(t.name))
      err(`levels/${name}.json: trigger goto 指向不存在的关卡 "${t.name}"`)
  }

  if (!spec.checkpoints?.length) err(`levels/${name}.json: 没有 checkpoints`)
}

// pipe 的 goesTo / backTo 交叉引用
console.log('▶ 校验管道传送的目标…')
for (const name of levelNames) {
  const spec = readJSON(join(PUB, 'levels', `${name}.json`))
  for (const e of spec.entities ?? []) {
    if (e.name !== 'pipe-portal' || !e.props?.goesTo) continue
    checks++
    if (!levelSet.has(e.props.goesTo.name)) {
      err(`levels/${name}.json: pipe-portal goesTo 指向不存在的关卡 "${e.props.goesTo.name}"`)
      continue
    }
    if (e.props.backTo) {
      checks++
      const target = readJSON(join(PUB, 'levels', `${e.props.goesTo.name}.json`))
      const ids = new Set((target.entities ?? []).filter((x) => x.id).map((x) => x.id))
      if (!ids.has(e.props.backTo)) {
        err(
          `levels/${name}.json: pipe-portal backTo "${e.props.backTo}" 在 ${e.props.goesTo.name} 里找不到对应 id`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------- 结果
console.log('')
if (known.length) {
  console.log(`ℹ ${known.length} 条已知上游问题（本项目原样保留，未修改 public/）：`)
  known.forEach((k) => console.log(`  - ${k.msg}\n      ↳ ${k.note}`))
  console.log('')
}
if (errors.length) {
  console.log(`✗ ${errors.length} 条错误（共 ${checks} 项检查）：`)
  errors.forEach((e) => console.log('  - ' + e))
  process.exit(1)
}
console.log(
  `✓ 通过：${checks} 项检查 | ${levelNames.length} 关卡 | ${spriteSheetNames.length} 精灵规格 | ${patternSheetNames.length} 图案表`,
)
