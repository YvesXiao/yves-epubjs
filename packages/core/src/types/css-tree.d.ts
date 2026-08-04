declare module "css-tree" {
  export function parse(
    source: string,
    options?: Record<string, unknown>
  ): unknown

  export function generate(node: unknown): string
}
