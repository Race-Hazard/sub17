# Sub17 — 项目上下文（新会话请先读）

关键词：**sub17** / **破17** / **继续sub17** / **Sub17 训练 App**

> 新会话只要输入上述任一关键词，先读本文件、`README.md` 和 `git log --oneline -5`，再按「待办 / 用户侧」继续。

## 这是什么

个人使用的 5K 训练离线 PWA：
- 记录训练/休息/睡眠，400 m 圈计时，GPX 导入
- 按 VDOT 更新 5 km 等价、五档配速、ACWR、准备度
- 26 周自适应课表（**目标优先版**：68–72 km/周；周日休息、周一轻松、周二/周四质量课、周三中长跑、周五轻松+加速、周六长距离；下肢力量 A 周二课后，核心 B 周四课后，核心可选 2–3 次/周）
- 临时测试日：可在本周或未来任意一周指定某天做 3/5/10 km 计时赛，当天课表替换，前后 2 天质量课、3 天内长距离自动降级；自动重排不会改掉测试日
- 计划日详情：点计划页任意一天，查看计划内容、当天实际训练（含分段）和质量课评估
- 可选跨端同步：私有 GitHub 仓库 `sub17-data/sub17.json`
- 中文 UI；手机 Android PWA；默认离线优先

用户当前水平（2026-10）：2 km 7:28、400 m 58 s；目标 5 km sub-17。App 如实显示：
当前 VDOT ≈ 49–50、5 km 等价 ≈ 20:05；6 个月更可能 17:50–18:20，sub-17 是 stretch（约 15–25%）。
2026-10-19 起改为**目标优先计划**：峰值 68–72 km/周，检查点 W4 19:15、W8 18:45、W12 3k 10:50、W16 17:55、W20 17:30、W26 sub-17；概率约 25–35%，但不是保证。

## 位置与部署

- 代码：`/home/hazard/sub17`
- 代码仓库（公开）：`https://github.com/Race-Hazard/sub17`
- Pages：`https://Race-Hazard.github.io/sub17/`
- 数据仓库（私有）：`https://github.com/Race-Hazard/sub17-data`
  - 文件：`sub17.json`，分支 `main`
  - App 设置页：Owner `Race-Hazard`、repo `sub17-data`、path `sub17.json`、branch `main`
  - 使用只授权该仓库的 fine-grained token（Contents: Read and write）；token 只在 App 本机 localStorage，**不要写入仓库或聊天**
- Git remote 已改为 SSH：`git@github.com:Race-Hazard/sub17.git`
- `git push` 后 GitHub Actions 自动测试、构建、部署 Pages；不需要手动上传 dist
- 最新提交：`de48b7f`（身体数据/午睡 + 质量评估卡片 UI；之前：目标优先计划、实际训练重排、PWA 更新提示、质量评估、自动写入下次计划）
- 最新部署：`de48b7f` GitHub Actions **success**（Pages 已更新）
- 之前：`ba0fef7`（阈值分组 + 按时间模式）、`30a7ac0`（私有 GitHub 同步）

## 常用命令

```bash
cd /home/hazard/sub17
npm run dev        # http://localhost:5173/
npm test           # Vitest，当前 84 个测试
npm run build      # 产出 dist/（base=/sub17/）
npm run preview    # http://localhost:4173/sub17/
node scripts/screenshot.mjs   # 需 npx playwright install chromium
git add . && git commit -m "..." && git push
```

修改代码后至少跑 `npm test` + `npm run build`；部署靠 push。

## 结构

```
src/domain/     纯函数：VDOT(vdot.ts)、计划(plan.ts)、测试日(testDay.ts)、负荷(load.ts)、
                睡眠(sleep.ts)、准备度(readiness.ts)、教练规则(coach.ts)、
                状态(status.ts)、圈计时(lapTimer.ts)、GPX(gpx.ts)、.ics(notify.ts)
src/db/         Dexie schema/repo/seed/backup（schema v4，含 tombstones + body + testDays）
src/sync/       GitHub Contents API、merge、自动同步引擎
src/pages/      Onboarding/Today/Log/Plan/Status/Sleep/Body/Settings
src/components/ UI、LapTimer、ReadinessBadge、BottomNav、QualityCard、DayDetail、UpdatePrompt
vite.config.ts  base=/sub17/；vite-plugin-pwa；Vitest 配置
.github/workflows/deploy.yml  GitHub Pages Actions
```

## 当前功能与状态

- 记录：轻松/长距离/间歇 I/阈值 T/重复 R/计时赛/力量/休息；编辑、删除、GPX
- 间歇/重复/阈值分组共用构建器：按距离 / 按时间；阈值可选连续/分组（默认 3×2 km）
- 按时间模式：距离留空用当前 I/R/T 中间配速估算，也可填实际距离
- 400 m 圈计时：暂停不计时、完成自动补最后一段、刷新恢复、Wake Lock
- 睡眠：上床/起床或总时长、**午睡分钟**、7 天图、睡眠债（夜间+午睡）、规律性
- 身体：身高/体重/体脂/腰围、7 天均重、4 周变化、30 天趋势；建议体重 2–3 次/周、身高一次、体脂/腰围 2–4 周一次
- 计划：26 周、检查点 W4/8/12/16/20/26、按完成度/准备度/ACWR/睡眠/检查点调整
- 状态：VDOT/5 km 等价/配速/ACWR/里程碑/周报
- 同步：打开+保存后自动 pull+merge+push；按记录合并；tombstone 传播删除；设置页可手动同步/从云端覆盖
- 实际训练重排：`src/domain/replan.ts`；App 在保存/删除后自动重排本周未来几天（48h 规则、重复质量/长距离降级、跑量补偿），不改已完成记录和周日休息
- 质量课评估：`src/domain/quality.ts`；每次间歇/阈值/重复/计时赛后自动评价（优秀/达标/前快后慢/快于目标/慢于目标/过载/未完成），状态页、今日页、计划页显示评价和下次同类课建议；建议以 repsDelta/continuousMinDelta 自动写入下一次同类计划（sourceSessionId 防重复叠加）；VDOT 仍只由计时赛更新
- 临时测试日：`src/domain/testDay.ts` + 计划页「测试日 · 计时赛」卡片；`testDays` 表（schema v4）记录日期/距离/目标成绩，计划中的测试课带 `locked: true`；前后 48h 质量课、72h 长距离降为轻松跑，自动重排跳过 locked；可移除并重建受影响周
- 计划日详情：`src/components/DayDetail.tsx`；计划页点任意一天，显示计划详情、实际训练（距离/用时/配速/RPE/备注/分组）和该次质量课评估，可直接补记/记录
- 更新提示：`src/components/UpdatePrompt.tsx`；新 SW waiting 时显示「重启更新」，点击 SKIP_WAITING + reload，数据不丢
- 提醒：App 内 20:30/07:30 + `.ics` 日历；没有后台推送
- 未做：OCR、FIT、Strava/Garmin、后台 Web Push

## 修改规则（给后续 agent）

1. 先读本文件 + `README.md`，再读要改的 `src/` 文件。
2. 保持中文 UI、深色运动风、PaceRange 的 `fastSecKm/slowSecKm` 约定。
3. 训练逻辑改动必须加/改 `src/domain/*.test.ts`；数据层改动跑 `src/db/*.test.ts`。
4. 改 Dexie schema 必须新增版本号并测试迁移；不要清空用户数据。
5. 同步相关改动不要打印或提交 token；不要把私钥/数据仓库内容写进公开仓库。
6. 改完：`npm test` → `npm run build` → `git add . && git commit` → `git push`。
7. 用户会手动改文件；编辑前重读目标文件，避免覆盖手动修改。
8. 目标相关建议要诚实：sub-17 是 stretch，不要伪造进度。

## 待办 / 用户侧

- **手机**：Android 无 Chrome，用 Edge 安装 PWA；若已安装，先手动更新到 `de48b7f`（旧 Service Worker 缓存），之后走「重启更新」提示条。
- **云同步**：若尚未配置，创建私有 `sub17-data` + fine-grained token（Contents: Read and write），在设置页填 `Race-Hazard / sub17-data / sub17.json / main / token`；不要索要或粘贴 token。
- **验收**：身体页记身高/体重 → 睡眠页填午睡 → 记一次质量课看今日页评估卡 → 计划页看「已写入计划」的组数/时长 → 两端「立即同步」互查。
- **可选下一步**：Garmin 570 数据导入（FIT/TCX/CSV；单条导出或 USB 拷贝，官方无个人 API）；今日/状态页加身体摘要；质量评估历史筛选；OCR；后台通知。
- 当前代码工作区干净，`main` 与 `origin/main` 同步；84 个测试通过。
