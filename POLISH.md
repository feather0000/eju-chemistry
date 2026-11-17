# MWG 修复 + 视觉美化（mwg-polish）

正文、公式、例题、练习题及答案都没有改；`assets/chem.js`、`demos_src/` 与 `demos.js` 的模型和读数也没动（`build.py` 重新生成的 `assets/demos.js` 与改前逐字节相同）。`demos.js?v=2` 保持不变。

## 一、Modern Web Guidance legacy-scan 修复

| finding | 修复 |
|---|---|
| secure-external-subresources | 专题页模板里的 KaTeX 0.16.11 `katex.min.css`、`katex.min.js`、`contrib/auto-render.min.js`（另有 `contrib/mhchem.min.js`） 都加了 `integrity="sha384-…" crossorigin="anonymous" referrerpolicy="no-referrer"`。本地的 lazy-katex.js、demos.js、nav.js 不加。 |
| dark-mode-toggle | `<head>` 紧跟 viewport 之后加 `<meta name="color-scheme" content="light dark">` 和头脚本 `HEADJS`：在首次绘制前读 `localStorage['eju-theme']`，没有存值时用 `prefers-color-scheme`，然后设置 `data-theme`，并把 meta 改为 `light` 或 `dark`。主题切换 `TOGGLEJS` 一起更新 `data-theme`、meta、按钮文字与 aria-label、localStorage，还会响应其它标签页的 `storage` 事件；没有存值时也跟着系统变化。 |
| CSS | `:root` 不再写死 `color-scheme: light`。现在是 `:root { color-scheme: light dark }`，加上 `[data-theme="light"] { color-scheme: light }` 和 `[data-theme="dark"] { color-scheme: dark }`；JS 没运行时用 `@media (prefers-color-scheme: dark)` 跟随系统。 |

首页模板和专题页模板都改了（`build.py` 中的 `HEADJS` / `TOGGLEJS` 常量，与另外三站相同）。首页原有的内联样式（青绿 `--acc:#1e6b6b`，与专题页的色板不一致）已删除，改为链接 `assets/site.css`（`<body class="home">`）。

## 二、视觉

`assets/site.css` 末尾的「EJU 讲义站共用设计层」块与另外两科逐字节相同，与数学站的 `assets/eju-ds.css` 也相同：

- 色板：中性色取 Radix slate 12 级，强调色取 indigo，浅色和深色各一套 token：bg / surface / surface-2 / surface-3 / line / line-strong / ink / ink-2 / ink-3 / accent / accent-solid / accent-soft / accent-line / on-accent / warn / good / hero-*。正文、链接、提示文字在两种主题下对比度都 ≥ 5:1。所有 token 都是 6 位 hex，因为 canvas demo 会用 `getComputedStyle` 读取并解析。原来的米黄底色已去掉。
- 专题页抬头：原来写死深蓝 `#1d2c4d`，后面还有一行遗留规则覆盖成青绿 `#1f3a3a`。现在改用 `--hero-bg`（浅色时是淡灰带，深色时是 surface），跟随主题，不用渐变。
- 字体：保留原有系统 / CJK 字体栈，没有新增字体 CDN。h1/h2 用衬线，h3 改用无衬线，并微调了字号层级和段落间距。
- 组件：chip、demo 分段按钮、「解答」按钮（`details > summary`）、卡片、表格、提示框统一了圆角、边框、hover / active 状态。去掉了答案区左侧的彩色竖条，改成虚线分隔。`:focus-visible` 统一为 2px 强调色描边。触控设备上热区约 44px；移动端输入框 ≥ 16px。
- 动效：只过渡 color / background-color / border-color（0.15s），没有 `transition: all`；`prefers-reduced-motion: reduce` 时关掉过渡、动画和平滑滚动。
- 首页：小 eyebrow「EJU 理科 · 化学」，主题开关与专题页相同（同一个 `eju-theme`），专题卡片网格和排行表都用同一组 token。
- 打印：强制用浅色 token。

## 验证

```
python3 build.py && python3 verify.py      # 184 problems … 0 failures；115 个方程式配平检查 0 unbalanced；5 个 demo
npx -y modern-web-guidance@latest legacy-scan .   # 0 findings（改前 3：dark-mode-toggle 2、secure-external-subresources 1）
```


## 三、第二轮指定美化（8 点）

这一轮在第一轮之上改动，SRI、meta color-scheme、头脚本、主题切换都保留。第一轮「不新增字体 CDN」和「四站同一个 indigo 主色」两条说明，按这轮要求作废，其余照旧。正文、题目、答案和 demo 计算逻辑都没有改，demo 读取的颜色 token 仍是 6 位 hex。

`build.py` 新增 `SITE` / `SITE_NAME` / `SITE_URL` / `SITE_DESC` 和 `headmeta()`。专题页和首页的 `<html>` 加上 `data-site`，`<title>` 后加 description、favicon、OG / Twitter 标签；专题页 head 加 `<script defer src="../../assets/eju-ux.js">`；术语表的日文列加 `lang="ja"`；构建时同时写出 `404.html`。`demos.js?v=2` 保持不变。

1. **排版**：中文正文用 Noto Sans SC；日语区域（`:lang(ja)`、`.jp-sub`、`.kana`、术语卡）用 Noto Sans JP。字体在 CSS 里用 `@font-face` 加载，来源是 jsDelivr 上版本锁定的 fontsource woff2（`noto-sans-sc@5.2.5` 的 `chinese-simplified` 与 `latin` 子集、`noto-sans-jp@5.2.5` 的 `japanese` 与 `latin` 子集）。只取 400 和 700，带 `unicode-range`，全部 `font-display: swap`。没有用 Google Fonts 的 `<link>`。标题改为无衬线 700。表格、读数、题号、目录序号都用 `tabular-nums`。正文栏 `--measure: 46rem`，行高 1.7。h2 → 正文约 24px，h3 上 40、下 16，段落间距 12。
2. **间距**：新增 `--s-1 … --s-16` 变量（4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px），设计层的 margin / padding / gap 都改用它们。
3. **配色**：本站主色是绿（Radix green），用 `<html data-site="chemistry">` 覆盖 `--accent` / `--accent-solid` / `--accent-soft` / `--accent-line` / `--on-accent`。浅色下 accent `#1d7349`、solid `#2b9a66`；深色下 accent `#3dd68c`、solid `#33b074`。深色背景从 `#111113` 改为 `#0f1115`。主色文字在两套主题下对比度都 ≥ 5.1:1。`::selection` 和 `::-moz-selection` 用 `--accent-line` 底配 `--ink` 字。
4. **卡片**：公式卡（`.box`、抬头公式 `.hero-formula`、表格 `.tw`）和例题卡（`.q`，含练习题）统一为墨色 10% 的 1px 边框（`color-mix`，旧浏览器退回 `--line`）、18px 圆角、轻阴影。深色模式下只留 1px 的暗阴影。
5. **微交互**：链接、按钮、chip、目录项、首页卡片都用 150ms 过渡，只过渡 color / background-color / border-color / box-shadow / transform，没有 `transition: all`。按钮和 chip 按下时下沉 1px；滑块按下时变暗。`prefers-reduced-motion: reduce` 下关掉过渡、动画、位移和平滑滚动。
6. **阅读体验**：新增共用脚本 `assets/eju-ux.js`（四站同一份）。① 顶部 3px 主色阅读进度条，按 `<main>` 的滚动进度计算，`pointer-events: none`，只在有目录的专题页出现。② 移动端横向目录在当前小节变化时，自动把高亮项滚入视野。目录本身改为半透明加模糊背景，当前项有底色。③ 点击公式会从 KaTeX 的 `<annotation encoding="application/x-tex">` 取源码并复制，然后弹出「已复制 LaTeX」。正在选取文字、或公式在链接/按钮/summary/demo 里时不复制；复制失败时提示改为手动选取，不会抛未捕获错误。公式的 DOM 和 MathML 都不改。
7. **细节**：`assets/favicon.svg`、`favicon-32.png`、`apple-touch-icon.png` 用本站主色；所有页面 head 都链接了它们。OG 图 `assets/og.png` 是 1200×630 的 PNG，`og:image` 为 `https://feather0000.github.io/eju-chemistry/assets/og.png`，另有 og:title / og:description / og:url 和 `twitter:card=summary_large_image`。根目录新增 `404.html`，带头脚本、主题开关和回首页链接，资源用 `/eju-chemistry/…` 绝对路径。
8. **性能**：字体全部 `font-display: swap`。仓库里没有 `<img>`，也没有为了转 WebP 去动 canvas。OG 图为兼容各平台保留 PNG，canvas 也不做懒加载。

favicon 和 OG 图由 `/workspace/eju-polish-work/scripts/make_brand.py`（Pillow）生成，四站用同一套版式。设计层和 `eju-ux.js` 的母版在 `/workspace/eju-polish-work/`，用 `scripts/sync_ds.py` 同步到四站。
