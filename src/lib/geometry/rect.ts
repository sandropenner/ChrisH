import type { RectNorm } from '../../types/models'

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number, width: number, height: number): RectNorm {
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  const maxX = Math.max(x1, x2)
  const maxY = Math.max(y1, y2)

  return {
    x: clamp01(minX / width),
    y: clamp01(minY / height),
    width: clamp01((maxX - minX) / width),
    height: clamp01((maxY - minY) / height),
  }
}

export function denormalizeRect(rect: RectNorm, width: number, height: number): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.width * width,
    height: rect.height * height,
  }
}
