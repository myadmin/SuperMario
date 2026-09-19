/**
 * game.ts — ported from upstream `public/js/main.js`.
 *
 * Flow (identical to upstream):
 *   click to start -> load entities + font -> load 1-1 -> black "Loading 1-1..."
 *   -> world splash (WORLD 1-1 / Mario x3, 4s countdown) -> level
 *   -> 'goto' triggers advance to the next level, pipe portals swap levels
 *   -> level complete / pipe complete drives SceneRunner.runNext()
 *
 * The only structural change is that the rAF Timer is gone: the Phaser host
 * scene drives `update(deltaTime)` on a fixed 1/60 step (same as upstream's
 * Timer), and the render target is a Phaser CanvasTexture instead of the
 * page's <canvas>.
 */
import { createLevelLoader, type LevelSpec } from './engine/loaders/level'
import { loadFont, type Font } from './engine/loaders/font'
import { loadEntities } from './engine/entities'
import { makePlayer, bootstrapPlayer, resetPlayer, findPlayers } from './engine/player'
import { setupKeyboard, type KeyboardListener } from './engine/input'
import { createColorLayer } from './engine/layers/color'
import { createTextLayer } from './engine/layers/text'
import { createDashboardLayer } from './engine/layers/dashboard'
import { createPlayerProgressLayer } from './engine/layers/player-progress'
import { createCollisionLayer } from './engine/layers/collision'
import SceneRunner from './engine/SceneRunner'
import Scene from './engine/Scene'
import TimedScene from './engine/TimedScene'
import Level from './engine/Level'
import Pipe, { connectEntity } from './engine/traits/Pipe'
import Damage, { EVENT_PLAYER_DIED } from './engine/traits/Damage'
import StarPower from './engine/traits/StarPower'
import { playJingle, stopJingle, stopStarTheme, jingleRemaining } from './engine/jingle'
import { setScorePopupFont } from './engine/scorePopups'
import Player from './engine/traits/Player'
import PowerState from './engine/traits/PowerState'
// 副作用导入：注册本项目新增的关卡特性（可顶问号块 / 旗杆旗子 / 城堡通关）
import './engine/features'
import type GameContext from './engine/GameContext'
import type InputRouter from './engine/InputRouter'
import type Entity from './engine/Entity'

export type GameHandle = {
  /** Advance the simulation by `deltaTime` seconds (host calls this at 1/60). */
  update(deltaTime: number): void
  /** Begin World 1-1 — upstream called `startWorld('1-1')` at the end of main(). */
  start(): void
  /** The live Mario entity (upstream exposed this as `window.mario`). */
  mario: Entity
  /** The loaded bitmap font (used for the loading screen). */
  font: Font
  /** 加载一个关卡并返回 Level（不入场景队列）——供冒烟测试做全关卡运行时加载检查。 */
  loadLevel: (name: string) => Promise<Level>
  /**
   * 场景队列（本项目新增，给调试 / 自动检查用）。
   *
   * `window.mario`（上游留下的调试句柄）只能看到马里奥自己：关卡实体、相机、计时器都
   * 在 `Level` 上，而他并不持有它。想看「当前是哪一关、现在是加载页还是关卡、场上还有
   * 什么实体」就必须能拿到 `sceneRunner`。宿主把它挂到 `window.__handle` 上
   * （与上游把 `mario` 挂到 `window` 同一性质，见 `scenes/GameScene.ts`）。
   */
  sceneRunner: SceneRunner
}

export type CreateGameOptions = {
  videoContext: CanvasRenderingContext2D
  audioContext: AudioContext
  listenToKeyboard: (listener: KeyboardListener) => void
  /**
   * 原版在 `setupLevel()` 里无条件 push 碰撞调试层（红色实体包围盒 + 蓝色瓦片候选框）。
   * 那是调试脚手架而非设计，因此交付时默认关闭；传 `true`（访问加 `?debug=1`）
   * 可还原与原版逐像素一致的输出。
   */
  collisionDebugLayer?: boolean
}

export async function createGame({
  videoContext,
  audioContext,
  listenToKeyboard,
  collisionDebugLayer = false,
}: CreateGameOptions): Promise<GameHandle> {
  const [entityFactory, font] = await Promise.all([loadEntities(audioContext), loadFont()])

  // 本项目新增：把位图字体交给加命 / 得分飘字（`traits/Player` 在加命时用它冒「1UP」）。
  setScorePopupFont(font)

  const loadLevel = await createLevelLoader(entityFactory)

  const sceneRunner = new SceneRunner()

  const mario = entityFactory.mario()
  makePlayer(mario, 'MARIO')

  const inputRouter: InputRouter = setupKeyboard(listenToKeyboard)
  inputRouter.addReceiver(mario)

  function createLoadingScreen(name: string) {
    const scene = new Scene()
    scene.comp.layers.push(createColorLayer('#000'))
    scene.comp.layers.push(createTextLayer(font, `Loading ${name}...`))
    return scene
  }

  /**
   * 本项目新增：GAME OVER 屏（黑底 + 居中文字，3 秒后回 1-1）。
   * 上游没有这一段——它没有死亡结算，所以也不需要结束画面。
   */
  function createGameOverScreen() {
    const scene = new TimedScene()
    scene.countDown = 3
    scene.comp.layers.push(createColorLayer('#000'))
    scene.comp.layers.push(createTextLayer(font, 'GAME OVER'))
    return scene
  }

  async function setupLevel(name: string): Promise<Level> {
    const loadingScreen = createLoadingScreen(name)
    sceneRunner.addScene(loadingScreen)
    sceneRunner.runNext()

    const level = await loadLevel(name)
    bootstrapPlayer(mario, level)

    // 本项目新增：每次关卡就绪都清一次受伤/死亡状态。放在 `bootstrapPlayer` 之后，
    // 所以死亡动画期间的旧状态不会带到新关卡里（注意这里**不**重置大小，
    // 正常换关应该保留蘑菇）。
    mario.getTrait(Damage).reset(mario)

    level.events.listen(Level.EVENT_TRIGGER, (spec: any, _trigger: unknown, touches: Set<Entity>) => {
      if (spec.type === 'goto') {
        for (const _ of findPlayers(touches)) {
          // 本项目新增（音频）：过关小曲是跨场景的（见 `engine/jingle.ts`），
          // 关卡推进时收尾，免得它盖到下一关的「WORLD x-x」过渡页上。
          // 城堡通关序列（features/exitSequence.ts）会等小曲放完才发 goto，
          // 所以正常走到这里时小曲已经放完，这一下只是兜底。
          stopJingle()
          stopStarTheme()
          void startWorld(spec.name)
          return
        }
      }
    })

    // 本项目新增：马里奥死亡（被怪物碰到 / 掉坑 / 时间归零）后的结算。
    // 死亡动画与事件由 `engine/traits/Damage.ts` 负责，这里负责扣命与重开。
    level.events.listen(EVENT_PLAYER_DIED, () => {
      void onPlayerDied(level)
    })

    level.events.listen(Pipe.EVENT_PIPE_COMPLETE, async (pipe: Entity) => {
      stopJingle()
      stopStarTheme()

      if (pipe.props.goesTo) {
        const nextLevel = await setupLevel(pipe.props.goesTo.name)
        sceneRunner.addScene(nextLevel)
        sceneRunner.runNext()
        if (pipe.props.backTo) {
          nextLevel.events.listen(Level.EVENT_COMPLETE, async () => {
            const backLevel = await setupLevel(name)
            const exitPipe = backLevel.entities.get(pipe.props.backTo)
            connectEntity(exitPipe!, mario)
            sceneRunner.addScene(backLevel)
            sceneRunner.runNext()
          })
        }
      } else {
        level.events.emit(Level.EVENT_COMPLETE)
      }
    })

    // Upstream: `level.comp.layers.push(createCollisionLayer(level));`
    if (collisionDebugLayer) {
      level.comp.layers.push(createCollisionLayer(level))
    }

    const dashboardLayer = createDashboardLayer(font, mario)
    level.comp.layers.push(dashboardLayer)

    return level
  }

  /**
   * 本项目新增：马里奥死亡的结算（上游完全没有这一段）。
   *
   * `Damage` 已经播完死亡动画并发出了事件，这里扣命、停音乐，然后：
   *   - 还有命：重开本关（成绩/金币保留，计时器复位）；
   *   - 命扣光了：成绩清零，先播一屏 GAME OVER，再从 1-1 重新开始。
   *
   * 本项目新增（音频）：死亡瞬间 `Damage` 已经停掉主题曲并起播死亡小曲（2.72s）。
   * 命扣光时 GAME OVER 屏大约在死亡后 1s 出现，而死亡小曲还有约 1.7s——所以 GAME OVER
   * 小曲按「死亡小曲剩余时长」排期（原版也是先听完死亡小曲，再出现 GAME OVER 画面与小曲）。
   */
  async function onPlayerDied(level: Level) {
    const player = mario.getTrait(Player)
    player.lives -= 1

    level.music.pause()
    mario.getTrait(PowerState).reset(mario)
    // 无敌星效果不跨死亡（原版一死就清）。
    mario.getTrait(StarPower).cancel()

    if (player.lives < 0) {
      player.lives = 3
      player.score = 0
      player.coins = 0
      // interrupt: false —— 别把正在放的死亡小曲掐掉：GAME OVER 小曲按它的
      // 剩余时长排期（原版是先听完死亡小曲，再出现 GAME OVER 画面与小曲）。
      playJingle('game-over', jingleRemaining(), { interrupt: false })
      void startWorld('1-1', createGameOverScreen())
      return
    }

    void startWorld(level.name)
  }

  /**
   * 加载并开始一个世界。`prefix` 是一张插在「WORLD x-x / ×N」过渡页**之前**的场景
   * （GAME OVER 用）——它同样靠 `TimedScene` 的完成事件自动推进到过渡页。
   */
  async function startWorld(name: string, prefix?: Scene) {
    const level = await setupLevel(name)
    resetPlayer(mario, name)

    const playerProgressLayer = createPlayerProgressLayer(font, level)
    const dashboardLayer = createDashboardLayer(font, mario)

    const waitScreen = new TimedScene()
    waitScreen.countDown = 4
    waitScreen.comp.layers.push(createColorLayer('#000'))
    waitScreen.comp.layers.push(dashboardLayer)
    waitScreen.comp.layers.push(playerProgressLayer)

    if (prefix) {
      sceneRunner.addScene(prefix)
    }
    sceneRunner.addScene(waitScreen)
    sceneRunner.addScene(level)
    sceneRunner.runNext()
  }

  const gameContext: GameContext = {
    audioContext,
    videoContext,
    entityFactory,
    deltaTime: 0,
    tick: 0,
  }

  // Upstream kicked off `startWorld('1-1')` here; we defer it to the caller
  // (the Phaser scene) so the very first frame already has a canvas texture.
  const game = {
    update(deltaTime: number) {
      gameContext.tick++
      gameContext.deltaTime = deltaTime
      sceneRunner.update(gameContext)
    },
    mario,
    start: () => startWorld('1-1'),
    font: font as Font,
    sceneRunner,
    loadLevel,
  }

  return game
}

export type { LevelSpec }
