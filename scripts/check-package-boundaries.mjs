import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const repoRoot = process.cwd()
const rootsToCheck = [
  path.join(repoRoot, "packages/demo/src"),
  path.join(repoRoot, "packages/demo/e2e")
]

const importPattern =
  /(?:import\s+(?:type\s+)?(?:[\s\S]*?)from\s*|export\s+(?:[\s\S]*?)from\s*|import\s*\()\s*["']([^"']+)["']/g

const violations = []

for (const root of rootsToCheck) {
  for await (const filePath of walk(root)) {
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(filePath)) {
      continue
    }

    const source = await readFile(filePath, "utf8")
    let match
    while ((match = importPattern.exec(source))) {
      const specifier = match[1]
      if (specifier && specifier.includes("/core/src/")) {
        violations.push({
          filePath,
          specifier
        })
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    "Package boundary check failed. Demo must not import from core source paths.\n"
  )
  for (const violation of violations) {
    console.error(
      `- ${path.relative(repoRoot, violation.filePath)} -> ${violation.specifier}`
    )
  }
  process.exitCode = 1
} else {
  console.log("Package boundary check passed.")
}

async function* walk(directory) {
  let entries
  try {
    entries = await readdir(directory, {
      withFileTypes: true
    })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      yield* walk(fullPath)
      continue
    }

    if (entry.isFile()) {
      yield fullPath
    }
  }
}
