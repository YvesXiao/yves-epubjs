import { gzipSync } from "node:zlib"
import { readdir, readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"

const workspaceRoot = resolve(import.meta.dirname, "..")
const limits = {
  coreEsm: readLimit("CORE_ESM_MAX_BYTES", 705_000),
  demoEntryRaw: readLimit("DEMO_ENTRY_MAX_BYTES", 980_000),
  demoEntryGzip: readLimit("DEMO_ENTRY_GZIP_MAX_BYTES", 284_000)
}

const coreEsmPath = resolve(workspaceRoot, "packages/core/dist/index.js")
const demoAssetsPath = resolve(workspaceRoot, "packages/demo/dist/assets")
const demoEntryPath = await findDemoEntry(demoAssetsPath)
const demoEntry = await readFile(demoEntryPath)
const measurements = [
  {
    name: "core ESM raw",
    actual: (await stat(coreEsmPath)).size,
    limit: limits.coreEsm
  },
  {
    name: "demo entry raw",
    actual: demoEntry.byteLength,
    limit: limits.demoEntryRaw
  },
  {
    name: "demo entry gzip",
    actual: gzipSync(demoEntry).byteLength,
    limit: limits.demoEntryGzip
  }
]

let failed = false
for (const measurement of measurements) {
  const delta = measurement.actual - measurement.limit
  const status = delta <= 0 ? "PASS" : "FAIL"
  failed ||= delta > 0
  console.log(
    `${status} ${measurement.name}: actual=${measurement.actual} limit=${measurement.limit} delta=${formatDelta(delta)}`
  )
}

if (failed) {
  process.exitCode = 1
}

function readLimit(name, fallback) {
  const value = process.env[name]
  if (value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

async function findDemoEntry(assetsPath) {
  const entries = (await readdir(assetsPath))
    .filter((name) => /^index-.*\.js$/.test(name))
    .sort()
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one demo entry in ${assetsPath}, found ${entries.length}`
    )
  }
  return resolve(assetsPath, entries[0])
}

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta)
}
