import type { Point } from './model.ts'

export class SpatialGrid<T extends Point> {
  private readonly cells: T[][] = Array.from({ length: 42 * 42 }, () => [])
  private readonly touched: T[][] = []
  private readonly size: number
  constructor(size: number) { this.size = size }

  private cell(n: number) {
    return Math.max(0, Math.min(41, Math.floor(n / this.size) + 21))
  }

  clear() {
    for (const cell of this.touched) cell.length = 0
    this.touched.length = 0
  }

  insert(item: T) {
    const cell = this.cells[this.cell(item.x) + this.cell(item.y) * 42]
    if (!cell.length) this.touched.push(cell)
    cell.push(item)
  }

  query(x: number, y: number, radius: number, found: T[]) {
    found.length = 0
    const x1 = this.cell(x + radius)
    const y1 = this.cell(y + radius)
    for (let j = this.cell(y - radius); j <= y1; j++) {
      for (let i = this.cell(x - radius); i <= x1; i++) {
        for (const item of this.cells[i + j * 42]) found.push(item)
      }
    }
    return found
  }
}

