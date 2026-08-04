module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  ignorePatterns: ["dist", "coverage"],
  overrides: [
    {
      files: ["**/*.{ts,tsx,js,mjs,cjs}"],
      parserOptions: {
        project: false
      }
    }
  ]
}
