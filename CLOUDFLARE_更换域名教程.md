# Cloudflare 中更换域名教程（MusicFree）

这份文档用于：你已经部署好了 `musicfree` Worker，现在要把旧域名换成新域名。

---

## 1. 准备条件

- 你已经能正常部署 Worker（`npm run deploy` 成功过）。
- 新域名已经接入到同一个 Cloudflare 账号。
- 你有 Cloudflare Dashboard 管理权限。

---

## 2. 推荐方式（控制台操作，最稳妥）

### 第一步：打开 Worker

1. 登录 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 找到并打开 `musicfree` 服务。

### 第二步：移除旧域名

1. 进入该 Worker 的 `Domains`（或 `Triggers` 中的自定义域名区域）。
2. 找到旧域名（例如 `old.example.com`）。
3. 点击移除（Remove / Delete）。

### 第三步：绑定新域名

1. 点击 `Add custom domain`。
2. 输入新域名（例如 `music.newdomain.com`）。
3. 确认添加。

Cloudflare 通常会自动帮你创建或调整需要的 DNS 记录。

---

## 3. DNS 与 SSL 检查

### DNS 检查

到目标站点（Zone）的 `DNS` 页面确认：

- 新域名记录存在。
- 代理状态是橙云（Proxied）。

### SSL 检查

在 `SSL/TLS` 页面建议使用：

- `Full (strict)`（推荐）

---

## 4. 验证是否切换成功

把下面地址中的域名换成你的新域名：

- 首页：`https://你的新域名/`
- 健康检查：`https://你的新域名/api/health`
- 搜索接口：`https://你的新域名/api/search?source=kuwo&keyword=晴天&page=1&limit=10`

如果能正常返回 JSON，说明切换成功。

---

## 5. 同步更新你本地配置

域名换完后，建议把这些地方一起改掉：

- `apipost_musicfree_collection.json` 中变量 `cloudflare_base_url`
- 你自己的前端配置（如果有写死域名）
- 对外分享的接口地址、文档截图

---

## 6. 常见问题

### 1）新域名打不开

- 先确认新域名是否真的在 Cloudflare 托管。
- 再确认该域名已绑定到 `musicfree` Worker。

### 2）一直显示旧内容

- 浏览器强刷：`Ctrl + F5`
- 等待 1~5 分钟再测（DNS/边缘缓存同步需要时间）

### 3）接口 404

- 常见原因是域名没绑定到 Worker，而是指向了别的服务。

---

## 7. 命令行方式（可选）

你也可以用 wrangler 做域名管理，但 wrangler 不同版本命令可能有变化，先看帮助：

```bash
npx wrangler domains --help
```

如果你更希望稳定，建议优先用控制台方式操作。

