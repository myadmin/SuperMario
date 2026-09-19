/**
 * entities/Mario.ts — ported verbatim from upstream `public/js/entities/Mario.js`.
 *
 * Mario's frame routing is a faithful copy: pipe travel -> pole climb ->
 * falling -> skid ('break') -> run -> idle. Turbo swaps the Go drag factor.
 *
 * 本项目新增：`PowerState`（吃蘑菇变大/受伤变小）、`Damage`（受伤与死亡的结算）、
 * 以及死亡帧 `die` 与无敌闪烁。原版没有道具与死亡，这三处素材（小/大马里奥全套帧、
 * `die` 帧）都一直存在但从未被使用。
 */
import Entity from '../Entity'
import Go from '../traits/Go'
import Jump from '../traits/Jump'
import Killable from '../traits/Killable'
import Physics from '../traits/Physics'
import PipeTraveller from '../traits/PipeTraveller'
import PoleTraveller from '../traits/PoleTraveller'
import Solid from '../traits/Solid'
import Stomper from '../traits/Stomper'
import PowerState, { LARGE_BOX, SMALL_BOX } from '../traits/PowerState'
import Crouch, { CROUCH_BOX } from '../traits/Crouch'
import Damage from '../traits/Damage'
import Fire from '../traits/Fire'
import StarPower from '../traits/StarPower'
import { registerExtraFx } from '../fxSounds'
import { loadAudioBoard } from '../loaders/audio'
import { loadSpriteSheet } from '../loaders/sprite'
import type SpriteSheet from '../SpriteSheet'
import type AudioBoard from '../AudioBoard'

const SLOW_DRAG = 1 / 1000
const FAST_DRAG = 1 / 5000

/**
 * 本项目新增：大马里奥（吃蘑菇后）的帧名映射。
 * 素材里只有 16x32 的站着 / 跑 / 跳 / 刹车 / 下蹲五个大帧，攀爬与游泳没有大号帧，
 * 这两种状态沿用小的（`?? frame` 兜底）。
 * `crouch` 一项给的是帧选择用的假名（`traits/Crouch` 蹲下时直接返回 'crouch-large'），
 * 列在这里是为了让火力形态的调色板替换也能覆盖它（见 `LARGE_FRAME_NAMES`）。
 */
const LARGE_FRAMES: Record<string, string> = {
  idle: 'idle-large',
  jump: 'jump-large',
  break: 'break-large',
  crouch: 'crouch-large',
  'run-1': 'run-1-large',
  'run-2': 'run-2-large',
  'run-3': 'run-3-large',
}

/** 大马里奥帧的集合：火力形态只对这几帧做调色板替换。 */
const LARGE_FRAME_NAMES = new Set(Object.values(LARGE_FRAMES))

/**
 * 本项目新增：调色板替换机制（按「调色板名 + 帧名」缓存，每帧只重画一次）。
 *
 * `mario.png` 里没有独立的火力帧（原版 SMB 也只是同一套帧换调色板），所以这里在
 * 绘制时把帧读出来重画一套颜色。颜色值直接取自 `public/img/sprites.png` 的实际像素：
 *   - `fire`（火力形态）：帽子 / 上衣 红 `#bd4131` → 白 `#ffffff`，背带褲 橄榄
 *     `#797b00` → 红 `#bd4131`——原版火力马里奥（白衣红褲）的换色规则；
 *   - `starA` / `starB`（无敌星闪烁）：原版吃星星后整套精灵调色板循环。**注意它们
 *     必须与火力色不同**——火力马里奥吃星星时若只在「常态 ↔ 火力色」间切换，等于
 *     没换（用户实测「吃完星星不会闪光」），所以星星闪烁循环是
 *     [常态 → starA → starB]（火力马里奥为 [火力 → starA → starB]）。
 */
const SWAP_PALETTES: Record<string, Record<string, [number, number, number]>> = {
  fire: {
    '189,65,49': [255, 255, 255], // #bd4131 红 → 白
    '121,123,0': [189, 65, 49], // #797b00 橄榄 → 红
  },
  starA: {
    '189,65,49': [0, 168, 0], // #bd4131 红 → NES 绿
    '121,123,0': [189, 65, 49], // #797b00 橄榄 → 红
  },
  starB: {
    '189,65,49': [0, 0, 0], // #bd4131 红 → 黑
    '121,123,0': [0, 168, 0], // #797b00 橄榄 → 绿
  },
}

const swappedFrames = new Map<string, HTMLCanvasElement>()

function toSwappedFrame(buffer: HTMLCanvasElement, palette: Record<string, [number, number, number]>) {
  const canvas = document.createElement('canvas')
  canvas.width = buffer.width
  canvas.height = buffer.height

  const context = canvas.getContext('2d')!
  context.drawImage(buffer, 0, 0)

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      continue
    }
    const swap = palette[`${data[i]},${data[i + 1]},${data[i + 2]}`]
    if (swap) {
      data[i] = swap[0]
      data[i + 1] = swap[1]
      data[i + 2] = swap[2]
    }
  }
  context.putImageData(image, 0, 0)

  return canvas
}

function getSwappedFrame(sprite: SpriteSheet, name: string, flip: boolean, paletteKey: string) {
  const key = `${paletteKey}:${name}${flip ? ':flip' : ''}`
  let frame = swappedFrames.get(key)
  if (!frame) {
    frame = toSwappedFrame(sprite.tiles.get(name)![flip ? 1 : 0], SWAP_PALETTES[paletteKey])
    swappedFrames.set(key, frame)
  }
  return frame
}

export async function loadMario(audioContext: AudioContext) {
  const [sprite, audio] = await Promise.all([
    loadSpriteSheet('mario'),
    loadAudioBoard('mario', audioContext),
  ])

  // 本项目新增：把上游 `sounds/mario.json` 没登记、但素材确实存在的音效补进音效板
  // （1-UP / 道具出现 / 吃到道具 / 火球），见 `fxSounds.ts`。
  await registerExtraFx(audio, audioContext)

  return createMarioFactory(sprite, audio)
}

function createMarioFactory(sprite: SpriteSheet, audio: AudioBoard) {
  const runAnim = sprite.animations.get('run')!
  const climbAnim = sprite.animations.get('climb')!

  function getHeading(mario: Entity) {
    const poleTraveller = mario.getTrait(PoleTraveller)
    if (poleTraveller.distance) {
      return false
    }
    return mario.getTrait(Go).heading < 0
  }

  function routeFrame(mario: Entity) {
    // 本项目新增：死亡动画用素材里现成的 `die` 帧（`mario.png` 的 [96,88,16,16]，
    // 原版因为没做死亡结算，这一帧从来没被画过）。大马里奥没有大号死亡帧，沿用小的。
    if (mario.getTrait(Damage).dying) {
      return 'die'
    }

    // 本项目新增：蹲下用素材里现成的 `crouch-large` 帧（`crouch-large` 只有大号，
    // 而 `traits/Crouch` 里 `crouching` 为真时必定是大 / 火力形态）。
    if (mario.getTrait(Crouch).crouching) {
      return 'crouch-large'
    }

    const frame = routeSmallFrame(mario)
    return mario.getTrait(PowerState)?.large ? (LARGE_FRAMES[frame] ?? frame) : frame
  }

  function routeSmallFrame(mario: Entity) {
    const pipeTraveller = mario.getTrait(PipeTraveller)
    if (pipeTraveller.movement.x != 0) {
      return runAnim(pipeTraveller.distance.x * 2)
    }
    if (pipeTraveller.movement.y != 0) {
      return 'idle'
    }

    const poleTraveller = mario.getTrait(PoleTraveller)
    if (poleTraveller.distance) {
      return climbAnim(poleTraveller.distance)
    }

    if (mario.getTrait(Jump).falling) {
      return 'jump'
    }

    const go = mario.getTrait(Go)
    if (go.distance > 0) {
      if ((mario.vel.x > 0 && go.dir < 0) || (mario.vel.x < 0 && go.dir > 0)) {
        return 'break'
      }

      return runAnim(mario.getTrait(Go).distance)
    }

    return 'idle'
  }

  function setTurboState(this: Entity, turboOn: boolean) {
    this.getTrait(Go).dragFactor = turboOn ? FAST_DRAG : SLOW_DRAG

    // 本项目新增：原版的 B 键同时是「跑」和「发射火球」，按下时登记一次发射请求
    // （真正生成火球在 `traits/Fire.update`，那里才拿得到 level）。
    if (turboOn) {
      this.getTrait(Fire).request()
    }
  }

  function drawMario(this: Entity, context: CanvasRenderingContext2D) {
    // 受伤后的无敌期闪烁：用透明度而不是「不画」，这样过渡页（player-progress）
    // 复用小马里奥图标时不会正好抽到空帧。
    const damage = this.getTrait(Damage)
    const blinking = damage.invincible && Math.floor(damage.invincibleFor * 20) % 2 === 0

    if (blinking) {
      context.save()
      context.globalAlpha = 0.35
    }

    const frame = routeFrame(this)

    // 本项目新增：`crouch-large` 是 16x32 的格子、人像画在**下半格**（前 10 行全透明），
    // 而蹲着的碰撞盒只有 16 高 —— 往上偏一个身位，脚才落在地上。
    const offsetY = this.getTrait(Crouch).crouching ? CROUCH_BOX.height - LARGE_BOX.height : 0

    // 本项目新增：绘制时用哪套调色板。无敌星期间按 ~6Hz 在三态间循环（原版就是
    // 整套调色板轮着换）：普通马里奥 [常态 → starA → starB]，火力马里奥
    // [火力 → starA → starB]（火力色本身就是他的常态，不能拿来当「闪」的另一态）。
    // 非星星时保持原行为：火力形态的大帧用火力调色板。
    const power = this.getTrait(PowerState)
    const star = this.getTrait(StarPower)
    let paletteKey: string | null = null
    if (star.active) {
      const phase = Math.floor(this.lifetime * 6) % 3
      paletteKey = power.fire ? (['fire', 'starA', 'starB'] as const)[phase] : phase === 0 ? null : (['starA', 'starB'] as const)[phase - 1]
    } else if (power.fire && LARGE_FRAME_NAMES.has(frame)) {
      paletteKey = 'fire'
    }

    if (paletteKey) {
      context.drawImage(getSwappedFrame(sprite, frame, getHeading(this), paletteKey), 0, offsetY)
    } else {
      sprite.draw(frame, context, 0, offsetY, getHeading(this))
    }

    if (blinking) {
      context.restore()
    }
  }

  return function createMario() {
    const mario = new Entity()
    mario.audio = audio
    mario.size.set(SMALL_BOX.width, SMALL_BOX.height)

    mario.addTrait(new Physics())
    mario.addTrait(new Solid())
    mario.addTrait(new Go())
    // 本项目新增：大马里奥按 ↓ 蹲下。位置有意插在 `Go` 之后、`Jump` 之前——
    // 特性按插入顺序每帧跑，它要能当帧清掉 `Go` 加出来的水平速度、
    // 并在 `Jump.update` 之前把跳跃请求取消掉（蹲着不能跳）。
    mario.addTrait(new Crouch())
    mario.addTrait(new Jump())
    mario.addTrait(new Killable())
    mario.addTrait(new Stomper())
    mario.addTrait(new PipeTraveller())
    mario.addTrait(new PoleTraveller())
    mario.addTrait(new PowerState())
    mario.addTrait(new Fire())
    // 本项目新增：无敌星状态（吃星星后 ~10.5s 无敌 + 打翻碰到的敌人 + 调色板闪烁）。
    mario.addTrait(new StarPower())
    // 必须放在最后：它的 update 每帧最后跑，才能盖掉 Go/Jump/Physics 那一帧写进去的
    // 速度与重力（死亡动画要穿过地形掉落、水平不动）。
    mario.addTrait(new Damage())

    mario.getTrait(Killable).removeAfter = Infinity
    mario.getTrait(Jump).velocity = 175

    mario.turbo = setTurboState
    mario.draw = drawMario

    mario.turbo(false)

    return mario
  }
}
