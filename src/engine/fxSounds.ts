/**
 * fxSounds.ts —— 本项目新增：补登记「素材里有、但上游的 `sounds/*.json` 没写」的音效。
 *
 * 上游只登记了 5 个音效（`mario.json` 的 coin / jump / stomp，加上 `brick-shrapnel.json`
 * 的 break、`pipe-portal.json` 的 pipe、`cannon.json` 的 shoot、`flag-pole.json` 的
 * ride），而 `public/audio/fx/` 下有 20 多个真实素材。本项目的约定是 `public/` 一字不改，
 * 所以这些音效只能在代码里按 URL 解码后补进音效板。
 *
 * 两种用法：
 *   1. **马里奥自己的音效板**：`entities/Mario.ts` 在装载时调 `registerExtraFx(audio, ctx)`，
 *      把这些音效全部解码进马里奥的音效板。播放方都拿的是**马里奥自己的**音效板
 *      （`entity.sounds.add(name)` 走 `Entity.playSounds`），因此马里奥之外的实体
 *      （蘑菇、火花、火球）自己不发音，而是由持有者把名字加进马里奥的集合里——
 *      与上游 `Player.addCoins` 播硬币音效的写法一致。
 *   2. **别的实体的音效板**：上游有几个实体自己没挂音效板（注入的旗杆、乌龟），
 *      它们 `sounds.add()` 的声音原本是**静默**的（空 `AudioBoard` 里没有缓冲）。
 *      用 `extraFxBoard([...])` 现造一块带指定音效的板子挂上去即可。缓冲在启动时
 *      就已由第 1 种用法的 `registerExtraFx()` 解码好，所以这里是**同步**的。
 */
import AudioBoard from './AudioBoard'
import { assetUrl } from './paths'
import { createAudioLoader } from './loaders/audio'

/** 加命音效（`public/audio/fx/1up.ogg`）：吃 1-UP 蘑菇、攒满 100 枚金币。 */
export const ONE_UP_SOUND = '1up'

/** 道具从方块里钻出来时的音效。 */
export const POWER_UP_APPEARS_SOUND = 'power-up-appears'

/** 吃到道具（变大蘑菇 / 火花）时的音效。 */
export const POWER_UP_CONSUME_SOUND = 'power-up-consume'

/** 发射火球。 */
export const FIREBALL_SOUND = 'fireball'

/**
 * 大马里奥的跳跃音效（`jump-large.ogg`）。原版大小马里奥的跳跃声不同，
 * 上游只登记了小马里奥的 `jump`，所以这一份一直没被用过。
 */
export const JUMP_LARGE_SOUND = 'jump-large'

/**
 * 抓旗杆的音效（`flagpole.ogg`）。上游在 `sounds/flag-pole.json` 里把 `ride` 指向它，
 * 但 `flag-pole` 工厂只在关卡 JSON 写了 `flag-pole` 实体时才用得上——1-1 的 JSON 里
 * 没有，旗杆是 `features/flag.ts` 自己注入的，而那个实体是空音效板，所以抓杆一直是静默的。
 */
export const FLAGPOLE_SOUND = 'ride'

/** 踩乌龟壳把它踢出去（以及横着踩死壳）的音效（`kick.ogg`）。 */
export const KICK_SOUND = 'kick'

/** 小马里奥顶普通砖的「咚」声（`brick-bump.ogg`）。原版有这段，上游没登记。 */
export const BRICK_BUMP_SOUND = 'brick-bump'

/** 补充音效的名字 → 素材地址。 */
const EXTRA_FX: Record<string, string> = {
  [ONE_UP_SOUND]: '/audio/fx/1up.ogg',
  [POWER_UP_APPEARS_SOUND]: '/audio/fx/power-up-appears.ogg',
  [POWER_UP_CONSUME_SOUND]: '/audio/fx/power-up-consume.ogg',
  [FIREBALL_SOUND]: '/audio/fx/fireball.ogg',
  [JUMP_LARGE_SOUND]: '/audio/fx/jump-large.ogg',
  [FLAGPOLE_SOUND]: '/audio/fx/flagpole.ogg',
  [KICK_SOUND]: '/audio/fx/kick.ogg',
  [BRICK_BUMP_SOUND]: '/audio/fx/brick-bump.ogg',
}

/** 已解码的音效缓冲，按名字缓存（同一个 AudioContext 下可跨音效板复用）。 */
const buffers = new Map<string, AudioBuffer>()

/** 正在解码中的请求，避免同一份素材被 fetch 两次。 */
const loading = new Map<string, Promise<AudioBuffer>>()

function decode(name: string, audioContext: AudioContext): Promise<AudioBuffer> {
  const cached = buffers.get(name)
  if (cached) {
    return Promise.resolve(cached)
  }

  let request = loading.get(name)
  if (!request) {
    request = createAudioLoader(audioContext)(assetUrl(EXTRA_FX[name])).then(
      (buffer) => {
        buffers.set(name, buffer)
        loading.delete(name)
        return buffer
      },
      (error) => {
        // 失败也要把「加载中」的占位清掉：否则这份 rejected promise 会永远留在
        // 缓存里，之后连重试的机会都没有。
        loading.delete(name)
        throw error
      },
    )
    loading.set(name, request)
  }

  return request
}

/**
 * 把这些音效解码后加进 `audio`（马里奥的音效板）。每个只加载一次。
 * 返回的 Promise 在全部登记完成后 resolve——装载马里奥时会 await 它。
 *
 * 单个音效解码失败**不再中断启动**（原实现会让 `registerExtraFx` 整体 reject、
 * 连锁导致 `loadMario` → `createGame` 失败）：缺哪个音效就静默缺着，与上游
 * 「板子里没有这个音效就播静音」的行为一致。
 *
 * 顺带把缓冲缓存下来，供 `extraFxBoard()` 同步取用。
 */
export function registerExtraFx(audio: AudioBoard, audioContext: AudioContext): Promise<void> {
  return Promise.all(
    Object.keys(EXTRA_FX).map((name) =>
      decode(name, audioContext)
        .then((buffer) => {
          audio.addAudio(name, buffer)
        })
        .catch(() => undefined),
    ),
  ).then(() => undefined)
}

/**
 * 造一块**只带指定音效**的音效板（同步）。
 *
 * 给上游那些自己没挂音效板的实体用：注入的旗杆（抓杆的 `ride`）与乌龟（踢壳的 `kick`）。
 * 缓冲来自 `registerExtraFx()` 启动时的解码缓存——`game.ts` 会先 await `loadEntities()`
 * 再加载关卡，所以到这里一定已经有值；万一没有（极端时序）就退回空板，表现为静默，
 * 与改动前完全一致，不会抛错（`AudioBoard.playAudio` 对空缓冲是播静音）。
 */
export function extraFxBoard(names: string[]): AudioBoard {
  const board = new AudioBoard()
  for (const name of names) {
    const buffer = buffers.get(name)
    if (buffer) {
      board.addAudio(name, buffer)
    }
  }
  return board
}
