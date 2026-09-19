import { defineConfig } from 'vite'

/**
 * `base: '/'` is required: the upstream level / sprite / music / sound specs
 * reference root-absolute asset URLs (e.g. `/img/sprites.png`,
 * `/levels/1-1.json`, `/audio/fx/jump.ogg`). Those specs are kept verbatim, so
 * the app must be served from the site root — `npm run dev` / `npm run preview`.
 */
export default defineConfig({
  base: '/',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
