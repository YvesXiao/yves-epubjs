import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { delimiter, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const workspaceRoot = resolve(import.meta.dirname, "..")
const coreRoot = resolve(workspaceRoot, "packages/core")
const temporaryRoot = await mkdtemp(resolve(coreRoot, ".artifact-smoke-"))

try {
  verifyDeclaredExports()
  const packResult = run(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryRoot],
    coreRoot
  )
  const packMetadata = JSON.parse(packResult.stdout)[0]
  verifyPackedFiles(packMetadata.files.map(({ path }) => path))

  const tarballPath = resolve(temporaryRoot, packMetadata.filename)
  const installedPackageRoot = resolve(
    temporaryRoot,
    "node_modules/@yves-epub/core"
  )
  await mkdir(installedPackageRoot, { recursive: true })
  run(
    "tar",
    ["-xzf", tarballPath, "--strip-components=1", "-C", installedPackageRoot],
    workspaceRoot
  )
  await writeFile(
    resolve(temporaryRoot, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2)
  )
  await writeFile(
    resolve(temporaryRoot, "esm-consumer.mjs"),
    'import { EpubReader } from "@yves-epub/core"\nif (typeof EpubReader !== "function") process.exit(1)\n'
  )
  await writeFile(
    resolve(temporaryRoot, "cjs-consumer.cjs"),
    'const { EpubReader } = require("@yves-epub/core")\nif (typeof EpubReader !== "function") process.exit(1)\n'
  )
  await writeFile(
    resolve(temporaryRoot, "type-consumer.ts"),
    'import { EpubReader, type ReaderOptions } from "@yves-epub/core"\nconst options: ReaderOptions = {}\nconst reader = new EpubReader(options)\nvoid reader\n'
  )
  await writeFile(
    resolve(temporaryRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2022"
        },
        files: ["type-consumer.ts"]
      },
      null,
      2
    )
  )

  run("node", [resolve(temporaryRoot, "esm-consumer.mjs")], temporaryRoot)
  run("node", [resolve(temporaryRoot, "cjs-consumer.cjs")], temporaryRoot)
  run(
    "tsc",
    ["--project", resolve(temporaryRoot, "tsconfig.json")],
    temporaryRoot,
    {
      PATH: `${resolve(workspaceRoot, "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`
    }
  )
  console.log(
    `PASS package artifact: ${packMetadata.filename}, ${packMetadata.files.length} files, ESM/CJS/types verified`
  )
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}

function verifyDeclaredExports() {
  for (const path of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts"]) {
    if (!existsSync(resolve(coreRoot, path))) {
      throw new Error(`Missing declared export: ${path}`)
    }
  }
}

function verifyPackedFiles(files) {
  const unexpected = files.filter(
    (path) =>
      path !== "package.json" &&
      !/^README(?:\..+)?$/i.test(path) &&
      !/^LICENSE(?:\..+)?$/i.test(path) &&
      !path.startsWith("dist/")
  )
  if (unexpected.length > 0) {
    throw new Error(`Unexpected packed files: ${unexpected.join(", ")}`)
  }
  for (const required of [
    "package.json",
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts"
  ]) {
    if (!files.includes(required)) {
      throw new Error(`Missing packed file: ${required}`)
    }
  }
}

function run(command, args, cwd, extraEnvironment = {}) {
  const executable =
    process.platform === "win32" && ["npm", "pnpm", "tsc"].includes(command)
      ? `${command}.cmd`
      : command
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnvironment },
    shell: process.platform === "win32"
  })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`
    )
  }
  return result
}
