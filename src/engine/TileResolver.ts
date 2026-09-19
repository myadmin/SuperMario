/**
 * TileResolver.ts — ported verbatim from upstream `public/js/TileResolver.js`.
 * Maps world pixel ranges to tile indices and yields collision matches.
 */
import type { Matrix } from './math'

export type Tile = {
  style: string
  behavior?: string
  /**
   * 本项目新增：隐藏块（见 `features/chanceBlock.ts`）在被顶开之前不绘制。
   * 关卡数据里的 `metal` 瓦片会被特性模块标上它——原版 SMB 的隐藏块就是
   * 「看不见但实心，从下方顶开才现身」。
   */
  hidden?: boolean
  [key: string]: unknown
}

export type Match = {
  tile: Tile
  indexX: number
  indexY: number
  x1: number
  x2: number
  y1: number
  y2: number
}

export default class TileResolver {
  matrix: Matrix<Tile>
  tileSize: number

  constructor(matrix: Matrix<Tile>, tileSize = 16) {
    this.matrix = matrix
    this.tileSize = tileSize
  }

  toIndex(pos: number) {
    return Math.floor(pos / this.tileSize)
  }

  toIndexRange(pos1: number, pos2: number) {
    const pMax = Math.ceil(pos2 / this.tileSize) * this.tileSize
    const range: number[] = []
    let pos = pos1
    do {
      range.push(this.toIndex(pos))
      pos += this.tileSize
    } while (pos < pMax)
    return range
  }

  getByIndex(indexX: number, indexY: number): Match | undefined {
    const tile = this.matrix.get(indexX, indexY)
    if (tile) {
      const x1 = indexX * this.tileSize
      const x2 = x1 + this.tileSize
      const y1 = indexY * this.tileSize
      const y2 = y1 + this.tileSize
      return { tile, indexX, indexY, x1, x2, y1, y2 }
    }
    return undefined
  }

  searchByPosition(posX: number, posY: number) {
    return this.getByIndex(this.toIndex(posX), this.toIndex(posY))
  }

  searchByRange(x1: number, x2: number, y1: number, y2: number) {
    const matches: Match[] = []
    this.toIndexRange(x1, x2).forEach((indexX) => {
      this.toIndexRange(y1, y2).forEach((indexY) => {
        const match = this.getByIndex(indexX, indexY)
        if (match) {
          matches.push(match)
        }
      })
    })
    return matches
  }
}
