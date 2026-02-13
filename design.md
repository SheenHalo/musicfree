# MUSIC FREE 设计文档

## 1. 项目目标
- 提供一个网页，用户可按歌曲名搜索。
- 搜索结果支持试听与下载。
- 后端调用 TuneHub API（支持网易/腾讯/酷我）。
- 控制成本，优先考虑免费可用方案。

## 2. 已知约束
- 前端技术：`Vue3`
- 后端技术：`Node.js` 或 `Cloudflare Workers`
- 部署候选：`Vercel` / `Cloudflare`
- 域名：`music.usersfree.com`
- API Key：从环境变量 `music_parser_key` 读取

## 3. 功能拆分（统一，不依赖部署平台）
- `GET /api/search?keyword=xxx&source=netease|qq|kuwo`
  - 调用 TuneHub 搜索接口，返回歌曲列表（含歌曲 id）。
- `GET /api/parse?id=xxx&source=netease|qq|kuwo`
  - 调用 TuneHub 解析接口，返回试听/下载地址。
- 前端仅调用本项目后端接口，不直接暴露第三方 API Key。

## 4. 方案对比：Vercel vs Cloudflare Workers

| 对比项 | Vercel 方案 | Cloudflare Workers 方案 |
| --- | --- | --- |
| 架构形式 | `Vercel + Vercel Functions` | `Cloudflare Pages + Workers` |
| 上手难度 | 低，Node.js 后端写法直观 | 中等，需要适应 Workers 运行时 |
| 与 Node 生态兼容 | 高，常见 Node 包基本直接可用 | 中等，部分 Node 包不可用或需兼容层 |
| 免费可持续性（白嫖） | 可用，但函数时长/带宽更容易触顶 | 更适合高并发轻逻辑代理，免费层更稳 |
| 全球访问延迟 | 较好 | 更偏边缘节点，通常更低 |
| 前后端一体部署体验 | 好 | 好（Pages + Workers 绑定） |
| 环境变量管理 | 项目面板配置，简单 | Secrets 管理，简单 |
| 日志排查 | 控制台友好 | 需要适应 `wrangler` 与控制台 |
| 适合本项目程度 | 适合快速开发 | 适合长期免费运行 |

## 5. 两套落地方案

### 方案 A：Vercel（开发最快）
- 前端：Vue3 构建后部署到 Vercel。
- 后端：Vercel Functions 提供 `/api/search`、`/api/parse`。
- 环境变量：在 Vercel 配置 `music_parser_key`。
- 优点：开发体验简单，Node.js 资料多，适合快速上线。
- 风险：免费额度在流量增长后可能先到瓶颈。

### 方案 B：Cloudflare Workers（白嫖优先）
- 前端：Cloudflare Pages 部署 Vue3 静态站点。
- 后端：Cloudflare Workers 提供 `/api/search`、`/api/parse`。
- 环境变量：使用 Workers Secrets 存储 `music_parser_key`。
- 优点：边缘网络和免费层对“API 转发类项目”更友好。
- 风险：如果引入重 Node 依赖，兼容成本会提高。

## 6. 结论与推荐
- **推荐主方案：Cloudflare Workers（方案 B）**。
- 原因：本项目后端逻辑很轻（主要是转发 TuneHub 接口），Workers 性能和免费策略更契合“长期白嫖”目标。
- **推荐备选：Vercel（方案 A）**，当你更看重开发速度、暂时不追求长期免费上限时可优先使用。

## 7. 实施建议（简单版本）
- 第一步：先实现统一后端接口 `/api/search`、`/api/parse`。
- 第二步：前端页面只对接这两个接口。
- 第三步：先部署到 Cloudflare，验证搜索、试听、下载全链路。
- 第四步：保留一份 Vercel 部署配置作为备用。

