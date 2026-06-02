import { expect, test } from "@playwright/test"

const BOOK_PATH = process.env.BOOK_PATH
const SEARCH_QUERY = process.env.SEARCH_QUERY ?? "戒烟"
const SEARCH_RESULT_INDEX = Number(process.env.SEARCH_RESULT_INDEX ?? "80")
const MIN_SCROLL_TOP = Number(process.env.EXPECT_MIN_SCROLL_TOP ?? "5000")
const EXPECT_BACKEND = process.env.EXPECT_BACKEND ?? "dom"

test.skip(!BOOK_PATH, "BOOK_PATH is required for external EPUB search validation")

test("external epub search result jump keeps the hit near the visible viewport", async ({
  page
}) => {
  await page.goto("/")
  await page.locator('input[type="file"]').setInputFiles(BOOK_PATH)

  await expect(page.locator(".reader-root article").first()).toBeVisible()

  await openDrawer(page, "Find")
  await page.getByRole("searchbox").fill(SEARCH_QUERY)
  await page.getByRole("button", { name: "Search" }).click()

  const searchResults = page.locator(".search-card")
  await expect(searchResults.nth(SEARCH_RESULT_INDEX)).toBeVisible()

  const selectedExcerpt = (await searchResults
    .nth(SEARCH_RESULT_INDEX)
    .locator("span")
    .nth(1)
    .textContent())?.trim() ?? ""
  const excerptSnippet = extractSearchSnippet(selectedExcerpt, SEARCH_QUERY)

  await searchResults.nth(SEARCH_RESULT_INDEX).click()

  const factsText = (await page.locator(".reading-topbar-facts").textContent()) ?? ""
  const actualBackend = extractBackend(factsText)

  if (EXPECT_BACKEND) {
    await expect(page.locator(".reading-topbar-facts")).toContainText(
      `${EXPECT_BACKEND} /`
    )
  }

  await expect
    .poll(
      async () =>
        page.locator(".reader-root").evaluate((node) => {
          const element = node
          return element instanceof HTMLElement ? element.scrollTop : 0
        }),
      { timeout: 10000 }
    )
    .toBeGreaterThan(MIN_SCROLL_TOP)

  if (actualBackend === "dom") {
    await expect
      .poll(
        async () =>
          page.locator(".reader-root").evaluate((node) => {
            if (!(node instanceof HTMLElement)) {
              return ""
            }

            const containerRect = node.getBoundingClientRect()
            const visibleTexts = Array.from(
              node.querySelectorAll("p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote")
            )
              .filter((element) => {
                const rect = element.getBoundingClientRect()
                return rect.bottom > containerRect.top && rect.top < containerRect.bottom
              })
              .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
              .filter(Boolean)

            return visibleTexts.join(" ")
          }),
        { timeout: 10000 }
      )
      .toContain(excerptSnippet)
  }
})

async function openDrawer(page, name) {
  await page.getByRole("button", { name }).click()
  await expect(page.locator(".reading-drawer")).toBeVisible()
}

function extractSearchSnippet(excerpt, fallbackQuery) {
  const normalizedExcerpt = excerpt.replace(/^\.{3}/, "").replace(/\.{3}$/, "").trim()
  if (!normalizedExcerpt) {
    return fallbackQuery
  }

  const queryIndex = normalizedExcerpt.indexOf(fallbackQuery)
  if (queryIndex >= 0) {
    return normalizedExcerpt.slice(queryIndex, queryIndex + fallbackQuery.length)
  }

  return normalizedExcerpt.slice(0, Math.min(12, normalizedExcerpt.length))
}

function extractBackend(metaText) {
  const match = metaText.match(/\b(canvas|dom)\s*\//)
  return match ? match[1] : ""
}
