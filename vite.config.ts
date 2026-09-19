import { defineConfig } from 'vite'

/**
 * `base: '/'` is required: the upstream level / sprite / music / sound specs
 * reference root-absolute asset URLs (e.g. `/img/sprites.png`,
 * `/levels/1-1.json`, `/audio/fx/jump.ogg`). Those specs are kept verbatim, so
 * the app must be served from the site root — `npm run dev` / `npm run preview`.
 */
// base 默认 '/'（本地 dev / preview 从站点根服务）；部署到 GitHub Pages 时
// 由 CI 注入 DEPLOY_BASE=/SuperMario/，运行时资源路径经 src/engine/paths.ts 的
// assetUrl() 统一拼前缀。
export default defineConfig({
  base: process.env.DEPLOY_BASE || '/',
  build: {
    // 保留类名：tools/smoke.mjs 的探针靠 trait 的 constructor.name 识别实体状态，
    // 默认压缩会把类名混淆、冒烟在构建产物上全盲。
    minify: 'terser',
    terserOptions: { keep_classnames: true },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
})
