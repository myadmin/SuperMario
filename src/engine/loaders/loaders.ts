/**
 * loaders.ts — ported verbatim from upstream `public/js/loaders.js`.
 */
import { assetUrl } from '../paths'

/**
 * 本项目改动：URL 过 `assetUrl()` 解析——上游 JSON / 本项目代码里的资源路径是
 * 根绝对路径（`/img/...`），部署到 GitHub Pages 子路径时由这里统一拼部署前缀
 * （见 `engine/paths.ts`）。
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => {
      resolve(image)
    })
    image.src = assetUrl(url)
  })
}

export function loadJSON<T = any>(url: string): Promise<T> {
  return fetch(assetUrl(url)).then((r) => r.json())
}
