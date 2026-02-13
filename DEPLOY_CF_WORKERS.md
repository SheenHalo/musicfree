# Cloudflare Workers 部署文档（MusicFree）

## 1. 准备条件
- 已有 Cloudflare 账号。
- 域名 `music.usersfree.com` 已托管在 Cloudflare。
- 本地已安装 Node.js（建议 18+）。
- 已获取 TuneHub API Key。

## 2. 安装依赖
在项目根目录执行：

```bash
npm install
```

## 3. 登录 Cloudflare
```bash
npx wrangler login
```

浏览器会弹出授权页面，授权后返回终端。

## 4. 配置 Secret（最关键）
把 TuneHub Key 存到 Workers 的 Secret：

```bash
npx wrangler secret put music_parser_key
```

终端会提示你输入值，把 `.env` 里的 `music_parser_key` 粘贴进去即可。

## 5. 本地开发调试
```bash
npm run dev
```

默认会启动本地 Workers 服务，打开终端提示的地址即可。

## 6. 正式部署
```bash
npm run deploy
```

部署成功后会得到一个 `*.workers.dev` 域名。

## 7. 绑定自定义域名 `music.usersfree.com`

### 方式 A（推荐，命令行）
```bash
npx wrangler domains add music.usersfree.com
```

如果你的 wrangler 版本提示子命令不同，可先执行：

```bash
npx wrangler domains --help
```

按提示完成绑定。

### 方式 B（控制台）
1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 找到 `musicfree` 服务。
4. 在 `Domains` 中添加 `music.usersfree.com`。

## 8. 限流配置（已默认开启）
- 默认规则：同一 IP 每分钟最多 `30` 次 API 请求。
- 配置位置：`wrangler.toml` 中 `RATE_LIMIT_MAX_PER_MIN`。

如需改为每分钟 60 次：

```toml
[vars]
RATE_LIMIT_MAX_PER_MIN = "60"
```

改完后重新部署：

```bash
npm run deploy
```

## 9. 验证接口
部署后可直接访问：

- 健康检查：`/api/health`
- 搜索：`/api/search?source=netease&keyword=晴天&page=1&limit=20`
- 榜单列表：`/api/toplists?source=qq`
- 榜单歌曲：`/api/toplist?source=qq&id=26`
- 歌单详情：`/api/playlist?source=netease&id=3778678`
- 解析：`/api/parse?source=netease&id=1974443814&quality=320k`

## 10. 常见问题
- 提示 `缺少 music_parser_key`：说明 Secret 没配好，重新执行第 4 步。
- 返回 `429`：触发限流，等待下一分钟或调大限流值。
- 某些歌曲解析失败：通常是源站版权限制，不是程序错误。

