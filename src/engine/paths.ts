/**
 * paths.ts —— 本项目新增：运行时资源 URL 的统一解析。
 *
 * 上游的关卡 / 精灵 / 音效 JSON 里写的是**根绝对路径**（`/img/tiles.png` 等，
 * 这些文件逐字节冻结，不能改成相对路径），本项目代码里也沿用了一批根绝对路径。
 * 本地（`vite dev` / `vite preview`）从站点根服务没问题；但部署到 GitHub Pages 时
 * 站点挂在 `/SuperMario/` 子路径下，根绝对路径会全部 404。
 *
 * 解法：所有 URL 消费点过一遍 `assetUrl()`——以 `/` 开头的路径前面拼上部署前缀
 * （`import.meta.env.BASE_URL`，由 vite 的 `base` 决定：本地是 `/`，Pages 构建时
 * 由 DEPLOY_BASE 环境变量注入 `/SuperMario/`，见 `vite.config.ts`）；相对路径
 * 原样返回。
 */
const BASE: string = (import.meta.env?.BASE_URL as string | undefined) ?? '/'

export function assetUrl(url: string): string {
  if (!url || !url.startsWith('/')) {
    return url
  }
  return BASE.replace(/\/+$/, '') + url
}
