# Sub17 训练日志

个人使用的离线优先 5K 训练 PWA：记录训练/休息与睡眠，实时更新 VDOT、负荷与准备度，并按 26 周计划生成/调整每周课表。

- 默认数据只存在本机浏览器（IndexedDB）；可选跨端同步会写到**你自己的私有 GitHub 仓库**。
- 纯离线 PWA：安装后飞行模式可用；同步失败不影响本地使用。
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

## 记录类型：间歇 I / 重复 R / 阈值 T

- **间歇 I**：800–1200 m 一组，组间慢跑 2–3 min；练最大摄氧量。当前约 3:54–4:00/km。
- **重复 R**：200–400 m 一组，充分恢复；练速度、跑姿与神经募集，不堆疲劳。当前约 3:36–3:45/km。
- **阈值 T**：1–3 km 或 8–15 min 一组，组间 60–90 s；练乳酸阈。当前约 4:15–4:19/km。可切「连续跑」或「分组跑」，分组支持 2 组以上。

间歇和重复在录入界面共用同一个构建器，所以看起来像重合；它们的区别是**强度、单组时长和恢复**。计划里的 8×400 是重复 R，5×1000 是间歇 I。

## 跨端同步（可选，私有 GitHub 仓库）

App 仍是离线优先；云端只存一份合并后的 JSON。

1. 新建一个 **Private** 仓库 `sub17-data`，勾选 **Add a README file**（让 `main` 分支存在）。
2. 创建 **fine-grained token**：GitHub → Settings → Developer settings → Fine-grained tokens。
   - Repository access：Only select repositories → `sub17-data`
   - Permissions：Contents → **Read and write**；Metadata 自动只读
   - 复制 `github_pat_...`
3. 在手机和电脑上分别打开 App → 设置 → 云同步：
   - Owner：`Race-Hazard`
   - 数据仓库：`sub17-data`
   - 文件路径：`sub17.json`
   - 分支：`main`
   - Token：粘贴上面的 token
   - 保存并测试
4. 两端填同一仓库和 token。之后打开 App、保存记录后会自动 pull+merge+push；设置页还有「立即同步」和「从云端覆盖」。

说明：
- 公开仓库会被 App 拒绝保存，避免训练数据公开。
- token 存在本机浏览器；设备丢失时到 GitHub 立即撤销。不要用全权限 token。
- 冲突按记录合并：训练/睡眠按 UUID/日期，同一记录以 `updatedAt` 较晚的为准；删除用 tombstone 传播。
- 不是实时推送：另一端在下次打开/同步时看到变化。

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
