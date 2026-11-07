# 分享与上传 GitHub · 操作清单

> 目标：把项目放到 GitHub，并分享给别人（在线试玩 / 压缩包 / 插件）。
> 仓库已经在本地建好（`main` 分支），只差远程。

---

## 0. 先决定两件事

| 决定 | 选项 | 建议 |
| --- | --- | --- |
| 仓库可见性 | Private（只备份）/ Public（分享） | 想分享就 **Public** |
| 动画素材怎么办 | 一起上传（带署名）/ 不上传，让使用者自己从 dsh-pet 复制 | **一起上传**（README/CREDITS 已署名；注意非商用） |

> 素材来自 dsh-pet，许可证是「非商用 + 署名」。公开仓库带上它们并保留 `CREDITS.md` 是允许的；
> 但不能用于付费产品或付费分发。

---

## 1. 在 GitHub 建仓库

网页：<https://github.com/new> → 名字建议 `DSH-cozy-room` → **不要**勾 “Add a README”（本地已有）。

## 2. 推送

```powershell
cd <项目根目录>

git remote add origin https://github.com/Frey-Good/DSH-cozy-room.git
git branch -M main
git push -u origin main
```

- 第一次会弹出浏览器登录（Git Credential Manager），或使用 Personal Access Token
- 首次推送约 70 MB，慢一点属正常
- 最大的单文件约 10 MB，远低于 GitHub 100 MB 上限，**不需要 LFS**

## 3. 换成你的提交身份（可选）

```powershell
git config user.name  "<你的名字>"
git config user.email "<你的邮箱>"
git commit --amend --reset-author --no-edit
git push --force-with-lease origin main
```

> 只有你自己在推这个仓库时才需要；**不要**对别人的仓库强推。

## 4. 开启在线试玩（GitHub Pages）

仓库根部有 `index.html`，会自动跳到 `anime-room/`。

1. 仓库 **Settings → Pages**
2. Source 选 **Deploy from a branch**，Branch 选 `main`，目录 `/ (root)`
3. 等 1–2 分钟，访问 `https://Frey-Good.github.io/DSH-cozy-room/`

## 5. 分享给别人（三种方式）

| 方式 | 怎么做 | 适合谁 |
| --- | --- | --- |
| **在线试玩** | 上面 Pages 的链接 | 只想看看的人 |
| **下载压缩包** | 见下面命令 | 想本地玩 / 离线 |
| **装 DSH 插件** | 见 `dsh-cozy-room/PUBLISH.md` | DSH 用户 |

压缩包（只含房间，约 75 MB）：

```powershell
cd <项目根目录>
New-Item -ItemType Directory -Force .\dist | Out-Null
Compress-Archive -Path .\anime-room -DestinationPath .\dist\cozy-room-standalone.zip -Force
```

整个仓库的压缩包：

```powershell
git archive --format=zip --output=.\dist\cozy-room-repo.zip HEAD
```

## 6. 从源码跑插件（重要）

`dsh-cozy-room/room/` 是构建产物，**不入库**。别人 clone 后要先同步一次：

```powershell
cd dsh-cozy-room
npm run sync-room
```

然后再在 DSH 里安装 / 刷新，否则宿主找不到 `room/index.html` 会静默退出。

## 7. 上架 DSH 插件市场（可选）

见 `dsh-cozy-room/PUBLISH.md`：替换仓库地址 → `npm publish` → 提交 Awesome DSH Plugin。
这是另一条线，和 GitHub 分享互不阻塞。

## 8. 推完之后的检查

- [ ] 仓库首页 README 图片能正常显示
- [ ] `LICENSE`、`NOTICE`、`CREDITS.md` 都在
- [ ] Settings → 填 Description 与 Topics：`threejs`, `isometric`, `cozy`, `dsh-plugin`, `desktop-pet`
- [ ] Pages 链接能打开、能看到房间
- [ ] 自己先用无痕窗口 / 手机开一次

## 9. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| push 很慢 / 卡住 | 首次推送体积大，属正常；网络受限时先确认能访问 github.com |
| Pages 打开是 404 | Pages 生效需要 1–2 分钟；确认 Branch=`main`、目录=`/` |
| 房间在 Pages 上没角色 | 确认 `anime-room/assets/webm/` 已推上去 |
| clone 后插件没反应 | 先跑 `npm run sync-room`（见 §6） |
| 想删仓库重来 | Settings → Danger Zone → Delete；本地 `git remote remove origin` |
