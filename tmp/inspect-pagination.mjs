import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const APP_URL = 'http://127.0.0.1:4174/'
const books = [
  '/Users/xyf/Downloads/books/国家为什么会破产_大周期_--_瑞·达利欧_--_2025_--_中信出版集团股份有限公司_--_isbn13_9787521776829_--_63c6372a130fe8ba9f482f25f5da58ec_--_Anna’s_Archive.epub',
  '/Users/xyf/Downloads/books/剑指Offer_名企面试官精讲典型编程题_--_何海涛_--_2011_--_电子工业出版社_--_214aa1542d6778be54e208760805863d_--_Anna’s_Archive.epub',
  '/Users/xyf/Downloads/books/精通Rust(第2版)_--_[印]拉胡尔•沙玛(Rahul_Sharma)_[芬]韦萨•凯拉维塔(Vesa_Kaihlavirta)_--_2021_--_人民邮电出版社_--_9ffed7de87a634f81fedb829c07c77ab_--_Anna’s_Archive.epub'
]
const outDir = '/Users/xyf/xyfProject/yves-epub/tmp/pagination-inspect-2026-04-19'
await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const bookPath of books) {
    const slug = path.basename(bookPath, '.epub').slice(0, 48).replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '')
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.goto(APP_URL)
    await page.locator('input[type="file"]').setInputFiles(bookPath)
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.reading-fact-chip')).some((n) => /page\s+\d+\s+of\s+\d+/i.test(n.textContent ?? '')), undefined, { timeout: 30000 })
    await page.waitForTimeout(1200)

    await page.getByRole('button', { name: 'Tune' }).click()
    const field = page.locator('.field-shell').filter({ hasText: 'Mode' })
    await field.locator('.custom-select-trigger').click()
    await field.locator('.custom-select-option', { hasText: 'Paginated' }).click()
    await page.waitForFunction(() => document.querySelector('.reading-fact-chip')?.textContent?.trim() === 'paginated', undefined, { timeout: 10000 })
    await page.waitForTimeout(1000)
    const scrim = page.locator('.reading-drawer-scrim')
    if (await scrim.count()) {
      await scrim.click({ force: true })
      await page.waitForTimeout(300)
    }

    const bookResult = { bookPath, pages: [] }
    for (let i = 0; i < 3; i += 1) {
      const snapshot = await page.evaluate(() => {
        const root = document.querySelector('.reader-root')
        const rootRect = root instanceof HTMLElement ? root.getBoundingClientRect() : null
        const selectors = [
          '.epub-text-run',
          '.reader-root p',
          '.reader-root li',
          '.reader-root td',
          '.reader-root th',
          '.reader-root h1',
          '.reader-root h2',
          '.reader-root h3',
          '.reader-root h4',
          '.reader-root h5',
          '.reader-root h6',
          '.reader-root blockquote',
          '.reader-root span'
        ]
        const visible = Array.from(document.querySelectorAll(selectors.join(',')))
          .filter((node) => node instanceof HTMLElement)
          .map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left
            }
          })
          .filter((entry) => entry.text.length > 0 && rootRect && entry.bottom > rootRect.top + 16 && entry.top < rootRect.bottom - 16)
          .sort((a, b) => a.top - b.top || a.left - b.left)

        const chips = Array.from(document.querySelectorAll('.reading-fact-chip')).map((n) => n.textContent?.trim() ?? '')
        const pageChip = chips.find((text) => /page\s+\d+\s+of\s+\d+/i.test(text)) ?? ''
        return {
          mode: chips[0] ?? '',
          pageChip,
          renderBackend: pageChip.split('/')[0]?.trim() ?? '',
          root: root instanceof HTMLElement ? {
            clientHeight: root.clientHeight,
            clientWidth: root.clientWidth,
            paddingTop: Number.parseFloat(getComputedStyle(root).paddingTop) || 0,
            paddingBottom: Number.parseFloat(getComputedStyle(root).paddingBottom) || 0
          } : null,
          firstTexts: visible.slice(0, 6),
          lastTexts: visible.slice(-6),
          minTop: visible[0]?.top ?? null,
          maxBottom: visible.at(-1)?.bottom ?? null,
          visibleCount: visible.length
        }
      })
      const screenshotPath = path.join(outDir, `${slug}-page-${i + 1}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      bookResult.pages.push({ ...snapshot, screenshotPath })

      if (i < 2) {
        await page.getByRole('button', { name: 'Next' }).click()
        await page.waitForTimeout(1000)
      }
    }
    results.push(bookResult)
    await page.close()
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify(results, null, 2))
