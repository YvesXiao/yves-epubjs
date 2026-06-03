import { expect, test } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SMOKE_BOOK_PATH = path.resolve(
  __dirname,
  "../../../test-fixtures/books/minimal-book/book.epub"
)
const FXL_SPREAD_BOOK_PATH = path.resolve(
  __dirname,
  "../../../test-fixtures/books/fxl-spread-smoke/book.epub"
)

test("demo shell renders", async ({ page }) => {
  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Open a local EPUB" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Select EPUB Choose File" })).toBeVisible()
  await expect(page.locator(".reading-topbar-facts")).toContainText("No bookmark saved")
  await expect(page.locator(".reading-action-rail")).toContainText("TOC")

  await openDrawer(page, "Debug")

  const diagnostics = page.locator(".reader-diagnostics")
  await expect(diagnostics.getByText("Debug Panel")).toBeVisible()
  await expect(diagnostics.getByText("Backend")).toBeVisible()
  await expect(diagnostics).toContainText("Mode")
  await expect(diagnostics).toContainText("Score")
  await expect(diagnostics).toContainText("No visible sections")
})

test("opens an epub and navigates with toc and search", async ({ page }) => {
  await page.goto("/")
  await openSmokeBook(page)

  await expect(page.locator(".reader-root")).toContainText("Chapter One")
  await openDrawer(page, "TOC")
  await expect(page.locator(".sidebar-panel")).toContainText("Chapter One")
  await expect(page.locator(".sidebar-panel")).toContainText("Chapter Two")

  await page.getByRole("button", { name: "Chapter Two" }).click()
  await expect(page.locator(".reader-root")).toContainText("Chapter Two")

  await openDrawer(page, "Find")
  await page.getByRole("searchbox").fill("beta-keyword")
  await page.getByRole("button", { name: "Search" }).click()

  const searchResults = page.locator(".search-card")
  await expect(searchResults.first()).toContainText("chapter-2.xhtml")
  await openDrawer(page, "TOC")
  await page.getByRole("button", { name: "Chapter One" }).click()
  await expect(page.locator(".reader-root")).toContainText("Chapter One")
  await openDrawer(page, "Find")
  await searchResults.first().click()
  await expect(page.locator(".reader-root")).toContainText("Chapter Two")
})

test("search results panel fills the drawer body", async ({ page }) => {
  await page.goto("/")
  await openSmokeBook(page)

  await openDrawer(page, "Find")
  await page.getByRole("searchbox").fill("beta-keyword")
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.locator(".search-card").first()).toBeVisible()

  const layout = await page.evaluate(() => {
    const drawerBody = document.querySelector(".reading-drawer-body")
    const panel = document.querySelector(".hero-search-results")
    const resultsBody = document.querySelector(".hero-search-results-body")

    if (!(drawerBody instanceof HTMLElement)) {
      throw new Error("Missing drawer body")
    }
    if (!(panel instanceof HTMLElement)) {
      throw new Error("Missing search results panel")
    }
    if (!(resultsBody instanceof HTMLElement)) {
      throw new Error("Missing search results body")
    }

    const drawerBodyRect = drawerBody.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const resultsBodyRect = resultsBody.getBoundingClientRect()
    const drawerBodyStyle = window.getComputedStyle(drawerBody)
    const paddingBottom = Number.parseFloat(drawerBodyStyle.paddingBottom)

    return {
      expectedPanelBottom: drawerBodyRect.bottom - paddingBottom,
      panelBottom: panelRect.bottom,
      panelHeight: panelRect.height,
      resultsBodyHeight: resultsBodyRect.height
    }
  })

  expect(Math.abs(layout.panelBottom - layout.expectedPanelBottom)).toBeLessThanOrEqual(2)
  expect(layout.panelHeight).toBeGreaterThan(320)
  expect(layout.resultsBodyHeight).toBeGreaterThan(260)
})

test("supports paginated next and previous navigation", async ({ page }) => {
  await page.goto("/")
  await openSmokeBook(page)

  await page.getByRole("button", { name: "Paginated" }).click()
  await expect(page.locator(".reader-root")).toHaveAttribute("data-mode", "paginated")

  await expect(page.locator(".page-input")).toHaveValue("1")
  await expect.poll(async () => await readTotalPages(page)).toBeGreaterThan(1)

  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.locator(".page-input")).toHaveValue("2")

  await page.getByRole("button", { name: "Previous" }).click()
  await expect(page.locator(".page-input")).toHaveValue("1")
})

test("shows locator and restore diagnostics after bookmark restoration", async ({ page }) => {
  await page.goto("/")
  await openSmokeBook(page)

  await openDrawer(page, "Debug")
  const diagnostics = page.locator(".reader-diagnostics")
  await expect(diagnostics).toContainText("Locator")
  await expect(diagnostics).toContainText("s1 / progress:0.000")

  await closeDrawer(page)
  await page.getByRole("button", { name: "Save" }).click()
  await openDrawer(page, "TOC")
  await page.getByRole("button", { name: "Chapter Two" }).click()
  await expect(page.locator(".reader-root")).toContainText("Chapter Two")

  await page.getByRole("button", { name: "Restore" }).click()

  await expect(page.locator(".reading-topbar-facts")).toContainText("Bookmark restored")
  await expect(page.locator(".reader-root")).toContainText("Chapter One")
  await openDrawer(page, "Debug")
  await expect(diagnostics).toContainText("Locator")
  await expect(diagnostics).toContainText("s1 / progress:")
  await expect(diagnostics).toContainText("restored /")
  await expect(diagnostics).toContainText("fallback:no")
})

test("renders search overlay and saves highlight inside a synthetic spread", async ({ page }) => {
  await page.goto("/")
  await openBook(page, FXL_SPREAD_BOOK_PATH, "FXL Spread Smoke")
  await page.getByRole("button", { name: "Paginated" }).click()
  await expect(page.locator(".reader-root")).toHaveAttribute("data-mode", "paginated")

  await expect(page.locator(".reader-root")).toHaveAttribute("data-synthetic-spread", "enabled")
  await openDrawer(page, "Debug")
  await expect(page.locator(".reader-diagnostics")).toContainText("auto / synthetic-on")

  await openDrawer(page, "Find")
  await page.getByRole("searchbox").fill("Spread overlay target signal")
  await page.getByRole("button", { name: "Search" }).click()

  const searchResults = page.locator(".search-card")
  await expect(searchResults).toHaveCount(1)
  await expect(searchResults.first()).toContainText("page-3.xhtml")

  await searchResults.first().click()

  await expect(page.locator(".page-input")).toHaveValue("2")
  await expect(await readTotalPages(page)).toBe(2)
  await expect(page.locator(".reader-root")).toContainText("Right Match")
  await expect(page.locator(".reader-viewport-overlay-rect.is-search-hit")).toHaveCount(1)

  await closeDrawer(page)
  await page.locator(".reader-toolbar").getByRole("button", { name: "Highlight" }).click()

  await expect(page.locator(".reading-topbar-facts")).toContainText("Highlight saved")
  await expect(page.locator(".reader-viewport-overlay-rect.is-search-hit")).toHaveCount(1)

  const searchBox = await page.locator(".reader-viewport-overlay-rect.is-search-hit").boundingBox()

  expect(searchBox).not.toBeNull()
  expect(searchBox.width).toBeGreaterThan(0)
  expect(searchBox.height).toBeGreaterThan(0)
})

async function openSmokeBook(page) {
  await openBook(page, SMOKE_BOOK_PATH, "Chapter One")
}

async function openBook(page, bookPath, expectedText) {
  await page.locator('input[type="file"]').setInputFiles(bookPath)

  await expect(page.locator(".reader-root")).toContainText(expectedText)
}

async function openDrawer(page, name) {
  await closeDrawer(page)
  await page.getByRole("button", { name }).click()
  await expect(page.locator(".reading-drawer")).toBeVisible()
  await expect(page.locator(".reading-drawer")).toHaveAttribute(
    "data-panel",
    resolveDrawerPanel(name)
  )
}

async function closeDrawer(page) {
  if (await page.locator(".reading-drawer").isVisible()) {
    await page.locator(".drawer-close").click()
    await expect(page.locator(".reading-drawer")).toBeHidden()
  }
}

async function readTotalPages(page) {
  const text = await page.locator(".page-total").textContent()
  const match = text?.match(/\/\s*(\d+)/)
  return match ? Number(match[1]) : 0
}

function resolveDrawerPanel(name) {
  switch (name) {
    case "TOC":
      return "contents"
    case "Find":
      return "search"
    case "Debug":
      return "diagnostics"
    default:
      throw new Error(`Unknown drawer: ${name}`)
  }
}
