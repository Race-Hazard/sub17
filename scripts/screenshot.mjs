import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const outDir = new URL('../screenshots/', import.meta.url)
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})
const page = await context.newPage()
await page.clock.install({ time: new Date('2026-10-27T08:00:00+08:00') })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

await page.getByText('个人 5K 训练日志').waitFor()
await page.screenshot({ path: new URL('01-onboarding.png', outDir).pathname, fullPage: true })

await page.getByText('开始设置').click()
await page.getByText('目标与作息').waitFor()
await page.screenshot({ path: new URL('02-profile.png', outDir).pathname, fullPage: true })

await page.getByText('下一步').click()
await page.getByText('已导入最近一周').waitFor()
await page.screenshot({ path: new URL('03-seed.png', outDir).pathname, fullPage: true })

await page.getByText('进入 App').click()
await page.getByText('今日课表').waitFor()
await page.getByText(/4 × 600 m/).first().waitFor({ timeout: 15000 })
await page.getByText('目标 36 km').waitFor({ timeout: 15000 })
await page.waitForTimeout(600)
await page.screenshot({ path: new URL('04-today.png', outDir).pathname, fullPage: true })

await page.getByText('400 m 计时').click()
await page.getByText('400 m 圈计时').waitFor()
await page.screenshot({ path: new URL('04b-lap-timer.png', outDir).pathname, fullPage: true })
await page.getByText('开始', { exact: true }).click()
await page.clock.runFor(90_000)
await page.getByText('计圈', { exact: true }).click()
await page.waitForTimeout(200)
await page.screenshot({ path: new URL('04c-lap-running.png', outDir).pathname, fullPage: true })

await page.getByText('计划', { exact: true }).click()
await page.getByText('本周课表').waitFor()
await page.screenshot({ path: new URL('05-plan.png', outDir).pathname, fullPage: true })

await page.getByText('状态', { exact: true }).click()
await page.getByText('当前状态').waitFor()
await page.screenshot({ path: new URL('06-status.png', outDir).pathname, fullPage: true })

await page.getByText('记录', { exact: true }).click()
await page.getByText('记录训练').waitFor()
await page.screenshot({ path: new URL('07-log.png', outDir).pathname, fullPage: true })

await page.getByText('睡眠', { exact: true }).click()
await page.getByRole('heading', { name: '记录睡眠' }).waitFor()
await page.screenshot({ path: new URL('08-sleep.png', outDir).pathname, fullPage: true })

await page.getByLabel('设置').click()
await page.getByText('目标与作息', { exact: true }).waitFor()
await page.screenshot({ path: new URL('09-settings.png', outDir).pathname, fullPage: true })

await browser.close()
console.log('screenshots written to', outDir.pathname)
