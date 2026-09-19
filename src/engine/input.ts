/**
 * input.ts — ported verbatim from upstream `public/js/input.js`.
 *
 * KEYMAP is upstream's exactly:
 *   W/S/A/D  -> up/down/left/right (down+left/right also drive PipeTraveller)
 *   P        -> A button (jump)
 *   O        -> B button (turbo / run)
 *
 * `listenTo` is injected so the same KeyboardState can be fed either from
 * `window` (upstream behaviour) or from Phaser's keyboard plugin.
 *
 * 本项目新增：↓ 除了写 `PipeTraveller.direction`（上游行为），还把按键状态转交给
 * `traits/Crouch`——原版大马里奥按住 ↓ 会蹲下，上游漏了这条规则。
 */
import Keyboard from './KeyboardState'
import InputRouter from './InputRouter'
import Jump from './traits/Jump'
import PipeTraveller from './traits/PipeTraveller'
import Go from './traits/Go'
import Crouch from './traits/Crouch'
import type Entity from './Entity'

const KEYMAP = {
  UP: 'KeyW',
  DOWN: 'KeyS',
  LEFT: 'KeyA',
  RIGHT: 'KeyD',
  A: 'KeyP',
  B: 'KeyO',
}

export type KeyboardListener = (event: KeyboardEvent) => void

export function setupKeyboard(listenTo: (listener: KeyboardListener) => void) {
  const input = new Keyboard()
  const router = new InputRouter()

  input.listenTo(listenTo)

  input.addMapping(KEYMAP.A, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.getTrait(Jump).start())
    } else {
      router.route((entity) => entity.getTrait(Jump).cancel())
    }
  })

  input.addMapping(KEYMAP.B, (keyState) => {
    router.route((entity: Entity) => entity.turbo!(!!keyState))
  })

  input.addMapping(KEYMAP.UP, (keyState) => {
    router.route((entity) => {
      entity.getTrait(PipeTraveller).direction.y += keyState ? -1 : 1
    })
  })

  input.addMapping(KEYMAP.DOWN, (keyState) => {
    router.route((entity) => {
      entity.getTrait(PipeTraveller).direction.y += keyState ? 1 : -1

      // 本项目新增：原版大马里奥按住 ↓ 蹲下（上游没有蹲这条规则）。这里只转交按键状态，
      // 「能不能蹲」由 `traits/Crouch` 自己判断（形态 / 是否落地 / 头顶站不站得下）。
      if (entity.traits.has(Crouch)) {
        entity.getTrait(Crouch).down = !!keyState
      }
    })
  })

  input.addMapping(KEYMAP.RIGHT, (keyState) => {
    router.route((entity) => {
      entity.getTrait(Go).dir += keyState ? 1 : -1
      entity.getTrait(PipeTraveller).direction.x += keyState ? 1 : -1
    })
  })

  input.addMapping(KEYMAP.LEFT, (keyState) => {
    router.route((entity) => {
      entity.getTrait(Go).dir += keyState ? -1 : 1
      entity.getTrait(PipeTraveller).direction.x += keyState ? -1 : 1
    })
  })

  return router
}
