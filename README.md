# Glass Monitor

一个面向 [Monitor](https://github.com/monitor-probe/monitor) 的单一固定风格主题。目标是让首页、节点卡片、详情页及地球动画尽量保持 [Komari Glassmorphism](https://github.com/3560912451zz-stack/komari-theme-Glassmorphism) 的外观；数据接口仍由 Monitor 提供。本仓库不会修改 Komari 原主题或其后台配置。

## 主要功能

- 六张概览卡：内存、硬盘、剩余价值、累计流量、实时上行和实时下行。
- 写实地球：按节点的国家级坐标显示当前节点国家；同一国家只显示一面旗帜，并标出该国家的节点数量。
- 桌面端按 `Tab` 进入地球沉浸模式，再按 `Tab` 或 `Esc` 返回；卡片、工具栏和地球使用连续过渡动画。手机端不启用该快捷键。
- 节点卡片与列表两种视图、搜索、收藏和后台顺序；离线节点自动置底。
- 详情页沿用 Komari 版的节点标题、4×2 统计卡与硬件／系统／存储／网络四区布局，数据来自 Monitor；下方显示资源历史和 Ping。
- 费用面板包含固定账单、剩余价值和月度支出预估：只计算目标月份实际到期且仍计划续费的节点；一次性购买不会被当作月度续费；“不再续费”从本次到期起停止预测支出。
- WebSocket 实时更新；连接失败时自动回退为 5 秒轮询。
- 默认亮色；亮暗模式、收藏、视图模式和“不再续费”计划只保存在当前浏览器，不写入 Monitor 后台。

## 设计边界

这是一个不带服务器端主题设置的单一风格主题。外观、地球样式、卡片布局和动画均使用内置默认值，不提供后台几十项主题开关。

地球只使用 Monitor 提供的国家代码和国家级位置，不做城市级定位或城市翻译，也不会保存历史节点位置。节点被删除或不再出现在 `/api/nodes` 后，页面不会继续显示它。

Monitor 公开节点接口没有 Komari 主题所用的分组和自定义标签，因此首页不伪造分组按钮，详情页也不伪造标签。Monitor 当前只给主题国家代码，不会显示原版的城市级地理位置。CPU 信息区用 Monitor 的当前 CPU 使用率，不把它冒充为原版的 CPU Mark 估算排名。

本主题不实现 ASN/BGP 拓扑、GPU、审计、节点对比和快照等高级功能；这些功能仍由 Monitor 后台或其他工具负责。

## 安装

Monitor 主题首次安装需要主题压缩包，而不是直接填写 GitHub 仓库地址：

1. 在本仓库的 Releases 下载 `theme.tar.gz`。
2. 打开 Monitor 后台的主题页面。
3. 将压缩包拖入上传区域并启用 `Glass Monitor`。

上传给 Monitor 的 `theme.tar.gz` 必须把主题文件直接放在压缩包根目录（不要再套一层 `glassmorphism/`）：

```text
theme.json
preview.png
dist/
└── index.html
```

如果手动放入 Hub 的 themes 目录，应先创建与 `theme.json.short` 相同的目录（本主题为 `glassmorphism`），再把上面的三个项目放进去：`themes/glassmorphism/theme.json`、`themes/glassmorphism/preview.png` 和 `themes/glassmorphism/dist/`。`theme.json.url` 只用于 Releases 自动更新；它不是首次安装的导入链接。

## 开发与本地预览

需要 Node.js 20.19+（或 Node.js 22.12+）。

```bash
npm ci
npm run dev
```

连接真实 Monitor Hub 时，Vite 会将同源 `/api` 和 WebSocket 请求交给 Hub。没有 Hub 时可使用内置模拟数据：

```bash
npm run mock
npm run dev -- --host 127.0.0.1
```

模拟数据入口位于 `scripts/mock-monitor.mjs`，只用于本地开发，不会打包进主题运行时。

提交前运行完整检查：

```bash
npm run build
npm run lint
npm test
```

构建结果在 `dist/`。发布包应包含 `theme.json`、`preview.png` 和 `dist/`，不要把 `node_modules/`、源码和开发脚本放入 `theme.tar.gz`。

## Monitor 接口

主题只依赖同源公开接口：

| 接口 | 用途 |
| --- | --- |
| `GET /api/me` | 站点名、登录状态和公开页状态 |
| `GET /api/nodes` | 节点列表、实时指标和累计流量 |
| `GET /api/nodes/{id}/metrics` | 历史指标和 Ping 记录 |
| `GET /api/ws` | 实时节点快照 |

详情页使用 `/node/{id}`，由主题的客户端路由处理。若 Hub 前有按路径限制的反向代理或 WAF，请放行 `/node/` 前缀，以便直接刷新详情页。

## 项目来源与许可

本项目基于 Monitor 官方默认主题的接口契约和 React/Vite 工程结构进行重做，保留 MIT 许可。视觉样式参照 Komari Glassmorphism；背景、操作系统图标、地球纹理和国旗素材随主题一起打包，仅用于主题展示。发布或再分发时请同时遵守原主题与各素材来源的许可。

作者：3560912451zz-stack

源码：[github.com/3560912451zz-stack/monitor-theme-Glassmorphism](https://github.com/3560912451zz-stack/monitor-theme-Glassmorphism)
