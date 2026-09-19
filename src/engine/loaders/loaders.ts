/**
 * loaders.ts — ported verbatim from upstream `public/js/loaders.js`.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => {
      resolve(image)
    })
    image.src = url
  })
}

export function loadJSON<T = any>(url: string): Promise<T> {
  return fetch(url).then((r) => r.json())
}
