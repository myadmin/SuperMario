/**
 * features/fireworks.ts —— 本项目新增：城堡通关收尾的烟花。
 *
 * 原版 SMB 规则：马里奥进城堡那一刻，TIME 的**个位数**若是 1 / 3 / 6，就放
 * 1 / 3 / 6 发烟花，放完才切下一关（1 / 3 / 6 是原版硬编码的三个幸运数字，其它
 * 个位数不放）。个数判定在 `exitSequence.startExitSequence` 里做，而且**必须在
 * 序列启动那一刻取样**：计时一进序列就冻结（`LevelTimer.frozen`），bonus 阶段还会
 * 把 `currentTime` 滚到 0——拖到 settle 阶段再读，读到的永远是 0，一场烟花都放不出。
 *
 * 每发烟花是一个临时实体（与 `entities/BrickShrapnel.ts` 同款做法）：
 *   - 引信烧完前不可见，第 k 发的引信是 k * FIREWORK_INTERVAL 秒——每发自带延迟即可，
 *     不需要驱动器逐帧驱动（实现上更简单也更可靠）；
 *   - 起爆后用 Canvas2D 现画扩散爆炸环（半径随存活时长从 0 长到 ~20px 的圆环 +
 *     8-12 个亮点粒子），NES 调色板：白 #fcfcfc / 红 #d82800 / 黄 #fcbc3c；
 *   - 存活 FIREWORK_LIFETIME 秒后由 `traits/LifeLimit` 移除。
 *
 * 实体画进 `layers/sprites.ts` 的 64x64 离屏 buffer 再 blit，所以烟花实体本体只有
 * 48x48：环最大半径 20px，加上描边与粒子的 1-2px 出头，居中画绰绰有余，不会越界。
 *
 * 音效 `fireworks.ogg` 是**音效不是 BGM**（与 kick / 1up 同类），不接音乐开关：
 * 第一发起爆时用一次性 HTMLAudio 播一遍（`jingle.ts` 同款写法，play 的 Promise
 * 被拒时照旧忽略）。
 */
import Entity from '../Entity'
import Trait from '../Trait'
import LifeLimit from '../traits/LifeLimit'
import type GameContext from '../GameContext'
import type Level from '../Level'

/** 相邻两发烟花的间隔（秒）：第 k 发在第 k * 间隔 秒起爆。 */
export const FIREWORK_INTERVAL = 0.9

/** 单发爆炸的存活时长（秒），存活期满由 LifeLimit 移除。 */
export const FIREWORK_LIFETIME = 0.8

/** 最后一发放完后再留的静默拍（秒），之后 settle 的烟花条件才算满足。 */
const FIREWORK_TRAIL_PAUSE = 0.5

/** 烟花实体 48x48：爆炸环最大半径 20px 居中画，留足余量（离屏 buffer 是 64x64）。 */
const FIREWORK_SIZE = 48
const CENTER = FIREWORK_SIZE / 2

/** 爆炸环最大半径（px）。 */
const MAX_RADIUS = 20

/** 扩散到这一比例后开始整体淡出（画到 LifeLimit 移除那一刻正好淡完）。 */
const FADE_FROM = 0.6

/** NES 调色板：白 / 红 / 黄。 */
const COLORS = ['#fcfcfc', '#d82800', '#fcbc3c']

/** 烟花音效（纯音效，不接音乐开关）。 */
const FIREWORKS_SFX = '/audio/fireworks.ogg'

/** 起爆音：一次性 HTMLAudio 播一遍（第一发起爆时由引信回调触发）。 */
function playFireworksSound() {
  const audio = new Audio(FIREWORKS_SFX)
  audio.loop = false
  void audio.play().catch(() => undefined)
}

/** 单发烟花：引信倒数 → 起爆（可见、开始扩散）→ LifeLimit 移除。 */
class Firework extends Trait {
  boomed = false

  /** 起爆后经过的时长（秒），驱动扩散与淡出。 */
  private boomAge = 0

  /** 粒子的方向角与颜色：创建时定死，起爆后只按时间扩散，不逐帧闪变。 */
  private particles: { angle: number; color: string }[]

  constructor(
    private fuse: number,
    private color: string,
    private onIgnite?: () => void,
  ) {
    super()

    const count = 8 + Math.floor(Math.random() * 5)
    this.particles = Array.from({ length: count }, (_, i) => ({
      // 均匀铺一圈再抖一点，看起来是散开的烟花而不是钟表盘。
      angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))
  }

  update(_entity: Entity, { deltaTime }: GameContext, _level: Level) {
    if (!this.boomed) {
      this.fuse -= deltaTime
      if (this.fuse <= 0) {
        this.boomed = true
        this.onIgnite?.()
      }
      return
    }

    this.boomAge += deltaTime
  }

  /** 起爆后的视觉：扩散圆环 + 钉在环上的亮点粒子，尾段淡出（画在 buffer 正中）。 */
  draw(context: CanvasRenderingContext2D) {
    if (!this.boomed) {
      return
    }

    const t = Math.min(1, this.boomAge / FIREWORK_LIFETIME)
    // 扩散先快后慢（easeOut）：起爆瞬间冲得最远，之后缓缓摊开。
    const radius = (1 - (1 - t) * (1 - t)) * MAX_RADIUS

    context.save()
    context.globalAlpha = t < FADE_FROM ? 1 : (1 - t) / (1 - FADE_FROM)

    context.lineWidth = 2
    context.strokeStyle = this.color
    context.beginPath()
    context.arc(CENTER, CENTER, radius, 0, Math.PI * 2)
    context.stroke()

    for (const particle of this.particles) {
      context.fillStyle = particle.color
      context.fillRect(
        Math.round(CENTER + Math.cos(particle.angle) * radius) - 1,
        Math.round(CENTER + Math.sin(particle.angle) * radius) - 1,
        2,
        2,
      )
    }

    context.restore()
  }
}

/** 造一发烟花：`(x, y)` 是**爆炸中心**的天空落点，`delaySeconds` 是引信时长。 */
function createFirework(x: number, y: number, delaySeconds: number, onIgnite?: () => void) {
  const entity = new Entity()
  entity.size.set(FIREWORK_SIZE, FIREWORK_SIZE)
  // pos 是左上角，往左上挪半格让爆炸中心落在 (x, y)。
  entity.pos.set(x - FIREWORK_SIZE / 2, y - FIREWORK_SIZE / 2)

  const firework = new Firework(
    delaySeconds,
    COLORS[Math.floor(Math.random() * COLORS.length)],
    onIgnite,
  )
  entity.addTrait(firework)

  // 引信烧完再活 LIFETIME 秒就删。entity.lifetime 从入场起累计、与引信同步倒数，
  // 所以上限 = 引信 + 存活时长。
  const lifeLimit = new LifeLimit()
  lifeLimit.time = delaySeconds + FIREWORK_LIFETIME
  entity.addTrait(lifeLimit)

  entity.draw = (context) => firework.draw(context)
  return entity
}

/**
 * 排一场烟花：在城堡门上方天空放 `count` 发临时烟花实体（x = baseX ± 40、
 * y = 48~120 随机散开），第 k 发在第 k * FIREWORK_INTERVAL 秒起爆，第一发起爆时
 * 播一次 fireworks.ogg。`count` 为 0 时不放也不响。
 *
 * 返回 settle 阶段要为烟花保留的时长（秒）：最后一发放完（起爆 + 存活）再留一拍
 * 静默；`count` 为 0 返回 0，settle 的烟花条件立刻满足、行为与没有烟花时完全一致
 * （`exitSequence` 的 settle 结束条件取小曲与烟花两者的更晚者）。
 */
export function scheduleFireworks(level: Level, count: number, baseX: number): number {
  for (let k = 1; k <= count; k++) {
    const x = baseX + Math.random() * 80 - 40
    const y = 48 + Math.random() * (120 - 48)
    const onIgnite = k === 1 ? playFireworksSound : undefined
    level.entities.add(createFirework(x, y, k * FIREWORK_INTERVAL, onIgnite))
  }

  return count <= 0 ? 0 : count * FIREWORK_INTERVAL + FIREWORK_LIFETIME + FIREWORK_TRAIL_PAUSE
}
