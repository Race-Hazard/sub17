# Sub17 训练日志

个人使用的离线优先 5K 训练 PWA：记录训练/休息与睡眠，实时更新 VDOT、负荷与准备度，并按 26 周计划生成/调整每周课表。

- 数据只存在手机浏览器（IndexedDB），无后端、无云同步。
- 纯离线 PWA：安装后飞行模式可用。
- 400 m 圈计时器、手动记录、GPX 导入、睡眠与每日签到。
- 提醒以 `.ics` 日历为主（App 内 20:30/07:30 横幅兜底）。
- 目标 5 km sub-17，但 App 会如实显示当前能力与目标差距。

## 开发

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest：领域层 + Dexie + App 集成
npm run build      # 产出 dist/（base=/sub17/）
npm run preview    # http://localhost:4173/sub17/
node scripts/screenshot.mjs   # 需先 npx playwright install chromium
```

项目默认部署在 GitHub Pages 的项目路径 `/sub17/`。如果仓库名不是 `sub17`，修改：

- `vite.config.ts` 的 `REPO_BASE`
- `package.json` 的 `preview` 脚本
- `dist/index.html` 由构建自动生成，无需手改

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库 `sub17`（public 即可；训练数据不在仓库里）。
2. 本地：

```bash
git init
git add .
git commit -m "feat: Sub17 training PWA"
git branch -M main
git remote add origin https://github.com/<你的用户名>/sub17.git
git push -u origin main
```

3. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
4. 推送到 `main` 后，Actions 会跑测试、构建并发布；地址为：

```
https://<你的用户名>.github.io/sub17/
```

## Android 安装

1. 用 Chrome 打开上面的 HTTPS 地址，等页面完全加载。
2. 菜单 →「安装应用」或「添加到主屏幕」。
3. 联网启动一次，再开飞行模式重开，确认离线可用。
4. 设置页 →「导出 .ics 日历」→ 用日历 App 导入；每天 20:30 训练提醒、07:30 睡眠提醒。
5. 更新：完全关闭 PWA 后重新打开，新的 Service Worker 会接管；若仍是旧版，清一次站点缓存或重装。

> 纯离线 PWA 无法保证 App 关闭时的定时通知；日历是唯一可靠的 App 外提醒。日历不知道你今天是否已记录，已记录时忽略即可。

## 数据备份

- 设置页「导出备份」生成 JSON；「导入备份」全量替换。
- 建议每次计时赛后导出一次，并存到网盘/电脑。
- 换域名/仓库会改变浏览器 origin，旧数据不会自动出现；用备份 JSON 迁移。

## 结构

```
src/domain/     纯函数：VDOT、配速、负荷、睡眠、准备度、计划生成、圈计时
src/db/         Dexie schema、repo、种子数据、备份
src/pages/      今日、记录、计划、状态、睡眠、设置、Onboarding
src/components/ UI、圈计时器、准备度徽章、底部导航
src/domain/*.test.ts / src/db/*.test.ts / src/App.test.tsx
```

## 边界

- 不做 Strava/Garmin 直连（纯静态 PWA 无后端）。
- 截图 OCR、FIT 导入为 v1.1 可选。
- 训练建议不是医疗建议；胸痛、晕厥、热射病表现、血尿、疑似应力性骨折请立即停训就医。
