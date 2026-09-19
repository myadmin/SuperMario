/**
 * Compositor.ts — ported verbatim from upstream `public/js/Compositor.js`.
 */
import type Camera from './Camera'

export type Layer = (context: CanvasRenderingContext2D, camera?: Camera) => void

export default class Compositor {
  layers: Layer[] = []

  draw(context: CanvasRenderingContext2D, camera?: Camera) {
    this.layers.forEach((layer) => {
      layer(context, camera)
    })
  }
}
