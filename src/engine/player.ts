/**
 * player.ts — ported verbatim from upstream `public/js/player.js`.
 *
 * 本项目新增：`bootstrapPlayer` 里清理**跨关卡残留的实体状态**。实体（马里奥）和它的
 * trait 跨关卡存活，本项目新增的几个 trait 会往实体上写「上一关的行走意图」——
 * 最典型是通关收尾自动走位（`features/exitSequence.ts` 的 EndWalk）把 `Go.dir` 钉在 1：
 * 不清掉的话，马里奥会在下一关的出生点自己向右走（上游没有这类状态所以不用清）。
 */
import Player from './traits/Player'
import LevelTimer from './traits/LevelTimer'
import Go from './traits/Go'
import Crouch from './traits/Crouch'
import type Entity from './Entity'
import type Level from './Level'

export function makePlayer(entity: Entity, _name: string) {
  const player = new Player()
  player.name = 'MARIO'
  entity.addTrait(player)

  const timer = new LevelTimer()
  entity.addTrait(timer)
}

export function resetPlayer(entity: Entity, worldName: string) {
  entity.getTrait(LevelTimer).reset()
  entity.getTrait(Player).world = worldName
}

export function bootstrapPlayer(entity: Entity, level: Level) {
  entity.getTrait(LevelTimer).hurryEmitted = null

  // 本项目新增：上一关残留的行走 / 蹲下输入状态清零（trait 跨关卡存活，见文件头）。
  const go = entity.traits.get(Go) as Go | undefined
  if (go) {
    go.dir = 0
  }
  const crouch = entity.traits.get(Crouch) as Crouch | undefined
  if (crouch) {
    crouch.down = false
    crouch.crouching = false
  }

  entity.pos.copy(level.checkpoints[0])
  level.entities.add(entity)
}

export function* findPlayers(entities: Iterable<Entity>): Generator<Entity> {
  for (const entity of entities) {
    if (entity.traits.has(Player)) {
      yield entity
    }
  }
}
