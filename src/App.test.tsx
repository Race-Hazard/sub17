import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { db } from './db/schema'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Sub17 app', () => {
  it('completes onboarding, logs a run, and updates Today', async () => {
    render(<App />)

    expect(await screen.findByText('个人 5K 训练日志')).toBeInTheDocument()
    fireEvent.click(screen.getByText('开始设置'))
    expect(await screen.findByText('目标与作息')).toBeInTheDocument()
    fireEvent.click(screen.getByText('下一步'))
    expect(await screen.findByText('已导入最近一周')).toBeInTheDocument()
    fireEvent.click(screen.getByText('进入 App'))

    expect(await screen.findByText('今日课表')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('打开记录'))
    expect(await screen.findByText('记录训练')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('8.0'), { target: { value: '5' } })
    fireEvent.change(screen.getByPlaceholderText('40:00'), { target: { value: '30:00' } })
    fireEvent.click(screen.getByText('保存记录'))

    expect(await screen.findByText('今天的记录')).toBeInTheDocument()
    const kmMatches = await screen.findAllByText(/5 km/)
    expect(kmMatches.length).toBeGreaterThan(0)
  })
})
