# 上线插件市场 · 操作清单

目标：把 `dsh-cozy-room` 发布到 [Awesome DSH Plugin](https://awesome-dsh-plugin.com)（索引在 `dsh-plugin-catalog`）。

## 0. 发布前必须改的地方

| 位置 | 现在 | 改成 |
| --- | --- | --- |
| `package.json` 的 `homepage` / `repository` / `bugs` | `Frey-Good` | 你的 GitHub 用户名/仓库 |
| `README.md` 里的三张图片 | `Frey-Good` | 同上 |

```bash
# 确认包能打包、内容正确
cd dsh-cozy-room
npm pack --dry-run
```

预期：tarball 里包含 `lib/`、`room/`（约 65 MB）、`cordis.patch.yml`、`README.md`、`LICENSE`、`CREDITS.md`。

## 1. 发到 npm

```bash
cd dsh-cozy-room
npm login
npm publish --access public
```

- 包名 `dsh-cozy-room`，如果被占用就改成 `dsh-cozy-room-<后缀>`（同时改 `package.json` 的 `name`，插件 id 不用改）
- 发布后验证：`npm view dsh-cozy-room version`

## 2. 提交到插件市场

市场索引由 **GitHub 仓库** 驱动（条目字段：`name`、`title`（`owner/repo`）、`description`、`homepage`、`repository`、`category`、`labels`）。

1. 把仓库推到 GitHub（公开）
   - 仓库里要有：`package.json`、`lib/`、`room/`、`cordis.patch.yml`、`README.md`、`LICENSE`、`CREDITS.md`、`screenshots/`
2. 到 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 按站点说明提交（通常是提 PR / 填表），填：
   - **npm 包名**：`dsh-cozy-room@1.1.0`
   - **标题**：`<你的GitHub名>/dsh-cozy-room`
   - **简介**（英文，≤ 2 句）：
     > A cozy anime isometric room behind the DSH window. Decorate it, and a little maid lives there: she thinks, types and cheers along with your work, and can be recalled onto your desktop.
   - **分类**：`ui`（或 `theme`，以市场分类为准）
   - **标签**：`background`, `room`, `desktop-pet`, `cozy`
3. 等索引同步，然后在 DSH 里用插件市场搜索安装验证

## 3. 安装后自检

- 打开 DSH Web UI → 右下角出现 ⚙️ / 🐾 / 🏠
- `http://127.0.0.1:8140/health.json` 返回 `{"app":"dsh-cozy-room",...}`
- 如果 8140 被占用，服务端会自动 +1，客户端通过 `/health.json` 扫描 8139–8159 自动找到
- 点 🐾 能把她召到桌面，点 🏠 能进房间拖家具

## 4. 许可证提醒（重要）

- **代码** MIT
- **角色动画**来自 dsh-pet：**禁止商用**、公开渠道须署名
- 所以：插件必须**免费**发布，README 里保留 dsh-pet 的链接和作者名
- 如果市场要求商用授权，需要先把动画素材换掉（可以换成自己画的 / 授权素材）

## 5. 版本节奏

- 首发 `1.1.0`
- 之后按 `1.1.x` 修 bug，`1.2.0` 加功能；每次发版记得 `npm publish` 后等市场索引更新
