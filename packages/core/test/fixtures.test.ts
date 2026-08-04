import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "../../..")

describe("test fixtures", () => {
  it("reads the minimal book fixture metadata", () => {
    const fixturePath = resolve(
      ROOT,
      "test-fixtures/books/minimal-book/fixture-info.json"
    )
    const raw = readFileSync(fixturePath, "utf8")
    const fixture = JSON.parse(raw) as {
      id: string
      title: string
      status: string
    }

    expect(fixture.id).toBe("minimal-book")
    expect(fixture.title).toBe("Playwright Smoke Book")
    expect(fixture.status).toBe("active")
  })

  it("reads the reflowable compatibility fixture metadata", () => {
    const fixturePath = resolve(
      ROOT,
      "test-fixtures/books/reflowable-compat/fixture-info.json"
    )
    const raw = readFileSync(fixturePath, "utf8")
    const fixture = JSON.parse(raw) as {
      id: string
      title: string
      status: string
      samples: Array<{ id: string }>
    }

    expect(fixture.id).toBe("reflowable-compat")
    expect(fixture.title).toBe("Reflowable Compatibility Fixture Set")
    expect(fixture.status).toBe("active")
    expect(fixture.samples).toHaveLength(6)
  })

  it("keeps the snapshot directory documented and available", () => {
    const snapshotReadmePath = resolve(
      ROOT,
      "test-fixtures/snapshots/README.md"
    )
    const readme = readFileSync(snapshotReadmePath, "utf8")

    expect(readme).toContain("解析快照")
    expect(readme).toContain("布局快照")
  })
})
