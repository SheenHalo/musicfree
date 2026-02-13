# MusicFree

一个基于 Cloudflare Workers 的在线音乐工具：

- 按关键词搜索歌曲
- 试听歌曲
- 下载链接解析
- 查看热门榜单
- 查看歌单详情

> 提醒：QQ、网易搜索有时会受上游限制而不稳定，页面已提供“按音乐 ID 解析下载”入口。

## 在线使用

- 访问地址：`https://music.usersfree.com`

## 鸣谢

- 感谢 `TuneHub` 提供音乐解析能力与 API 文档支持：`https://tunehub.sayqz.com/docs`

---

## 1. 功能概览

- 歌曲搜索：`网易 / QQ / 酷我`
- 歌曲解析：根据 `source + id` 解析播放/下载链接
- 榜单功能：榜单列表、榜单歌曲
- 歌单功能：通过歌单 ID 查看歌曲列表
- UI：浅色/深色模式、移动端适配
- 安全：第三方 API Key 保存在 Worker Secret，不暴露到浏览器
- 限流：默认同一 IP 每分钟 30 次 API 请求

---

## 2. 项目结构

```text
musicfree/
├─ public/                     # 前端静态页面
│  ├─ index.html
│  ├─ app.js
│  ├─ style.css
│  └─ favicon.svg
├─ src/
│  └─ worker.js                # Cloudflare Worker 后端
├─ wrangler.toml               # Worker 配置
├─ package.json
├─ DEPLOY_CF_WORKERS.md        # 部署文档
├─ CLOUDFLARE_更换域名教程.md   # 域名更换文档
└─ apipost_musicfree_collection.json
```

---

## 3. 环境要求

- Node.js 18+
- npm
- Cloudflare 账号

---

## 4. 本地开发

### 4.1 安装依赖

```bash
npm install
```

### 4.2 配置本地变量（可选但推荐）

新建 `.dev.vars`：

```env
music_parser_key=你的TuneHubKey
RATE_LIMIT_MAX_PER_MIN=30
```

### 4.3 启动本地服务

```bash
npm run dev
```

启动后访问终端显示的地址，例如：`http://127.0.0.1:8787`

---

## 5. 线上部署（Cloudflare）

### 5.1 登录 Cloudflare

```bash
npx wrangler login
```

### 5.2 设置 Secret

```bash
npx wrangler secret put music_parser_key
```

### 5.3 部署

```bash
npm run deploy
```

部署后会得到 `*.workers.dev` 地址。

详细部署步骤见：`DEPLOY_CF_WORKERS.md`

---

## 6. 更换自定义域名

如果你要把域名从 A 换到 B，请看：

- `CLOUDFLARE_更换域名教程.md`

---

## 7. 配置项说明

### 7.1 Worker Secret

- `music_parser_key`：TuneHub 的 API Key（必填）

### 7.2 Worker Vars（`wrangler.toml`）

- `RATE_LIMIT_MAX_PER_MIN`：每分钟每 IP 限流次数，默认 `30`

---

## 8. 接口文档（本项目后端）

基础地址：`https://你的域名`

### 8.1 健康检查

- `GET /api/health`

### 8.2 搜索歌曲

- `GET /api/search?source=kuwo&keyword=晴天&page=1&limit=10`

参数：

- `source`：`netease | qq | kuwo`
- `keyword`：关键词
- `page`：页码（可选）
- `limit`：每页数量（可选，默认 10）

### 8.3 榜单列表

- `GET /api/toplists?source=kuwo`

### 8.4 榜单歌曲

- `GET /api/toplist?source=kuwo&id=16`

### 8.5 歌单详情

- `GET /api/playlist?source=netease&id=3778678`

### 8.6 解析歌曲

- `GET /api/parse?source=kuwo&id=228908&quality=320k`
- `POST /api/parse`

POST Body 示例：

```json
{
  "source": "kuwo",
  "ids": "228908",
  "quality": "320k"
}
```

### 8.7 方法接口（调试用）

- `GET /api/methods`
- `GET /api/methods/:source`
- `GET /api/methods/:source/:function`

---

## 9. APIPost / Postman 测试

仓库已提供集合文件：

- `apipost_musicfree_collection.json`

导入后记得设置变量：

- `cloudflare_base_url`
- `tunehub_api_key`

---

## 10. 常见问题

### 10.1 搜索结果为空

- 常见原因是上游平台风控，尤其 QQ/网易。
- 建议优先使用“按音乐 ID 解析下载”。

### 10.2 返回 `缺少 music_parser_key`

- 说明 Secret 没配置成功。
- 重新执行：`npx wrangler secret put music_parser_key`

### 10.3 返回 `429`

- 触发了限流。
- 可以等待下一分钟，或调高 `RATE_LIMIT_MAX_PER_MIN` 后重新部署。

---

## 11. 开发命令

```bash
npm run dev      # 本地调试
npm run deploy   # 部署到 Cloudflare
```
