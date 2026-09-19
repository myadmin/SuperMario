/**
 * math.ts — ported verbatim from upstream `public/js/math.js`
 * (meth-meth-method/super-mario). Matrix is the sparse tile grid, Vec2 the
 * ubiquitous 2D vector. Values and semantics are unchanged.
 */

export class Matrix<T = unknown> {
  grid: Array<Array<T>> = []

  forEach(callback: (value: T, x: number, y: number) => void) {
    this.grid.forEach((column, x) => {
      column.forEach((value, y) => {
        callback(value, x, y)
      })
    })
  }

  delete(x: number, y: number) {
    const col = this.grid[x]
    if (col) {
      delete col[y]
    }
  }

  get(x: number, y: number): T | undefined {
    const col = this.grid[x]
    if (col) {
      return col[y]
    }
    return undefined
  }

  set(x: number, y: number, value: T) {
    if (!this.grid[x]) {
      this.grid[x] = []
    }
    this.grid[x][y] = value
  }
}

export class Vec2 {
  x!: number
  y!: number

  constructor(x?: number, y?: number) {
    this.set(x as number, y as number)
  }

  copy(vec2: Vec2) {
    this.x = vec2.x
    this.y = vec2.y
  }

  equals(vec2: Vec2) {
    return this.x === vec2.x && this.y === vec2.y
  }

  distance(v: Vec2) {
    const dx = this.x - v.x,
      dy = this.y - v.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  set(x: number, y: number) {
    this.x = x
    this.y = y
  }
}

export function clamp(value: number, min: number, max: number) {
  if (value > max) {
    return max
  }
  if (value < min) {
    return min
  }
  return value
}

export const Direction = {
  UP: new Vec2(0, -1),
  DOWN: new Vec2(0, 1),
  RIGHT: new Vec2(1, 0),
  LEFT: new Vec2(-1, 0),
}

export type DirectionName = keyof typeof Direction
