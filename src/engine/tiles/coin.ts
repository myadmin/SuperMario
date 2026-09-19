/**
 * tiles/coin.ts — ported from upstream `public/js/tiles/coin.js`.
 * A coin tile is picked up by a Player and removed from the grid.
 * 本项目新增：吃瓦片金币也冒「200」飘字（原版规则；位置在马里奥身上）。
 */
import Player from '../traits/Player'
import type { TileCollisionContext } from '../TileCollider'

function handle({ entity, match, resolver }: TileCollisionContext) {
  const player = entity.traits.get(Player) as Player | undefined
  if (player) {
    player.addCoins(1)
    player.score += 200
    player.pushScorePopup(entity.bounds.getCenter().x, entity.bounds.top - 4, '200')
    const grid = resolver.matrix
    grid.delete(match.indexX, match.indexY)
  }
}

export const coin = [handle, handle]
