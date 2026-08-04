export type CanvasBacklogFreezeSignal =
  | {
      kind: "tag"
      name: string
      renderer: "dom"
      rationale: string
    }
  | {
      kind: "style"
      name: string
      renderer: "dom"
      rationale: string
    }

export const CANVAS_BACKLOG_FREEZE_SIGNALS = [
  {
    kind: "tag",
    name: "table",
    renderer: "dom",
    rationale: "Table layout fidelity should stay on the browser layout path."
  },
  {
    kind: "tag",
    name: "svg",
    renderer: "dom",
    rationale:
      "SVG rendering and interaction should not be expanded on the canvas fallback path."
  },
  {
    kind: "tag",
    name: "math",
    renderer: "dom",
    rationale:
      "Math content depends on browser-native fidelity and should remain DOM-owned."
  },
  {
    kind: "tag",
    name: "iframe",
    renderer: "dom",
    rationale:
      "Embedded browsing contexts are outside the canvas renderer responsibility."
  },
  {
    kind: "style",
    name: "float",
    renderer: "dom",
    rationale: "Float-based layout is frozen out of the canvas backlog."
  },
  {
    kind: "style",
    name: "text-indent",
    renderer: "dom",
    rationale:
      "Publisher typography with first-line indentation should use browser layout."
  },
  {
    kind: "style",
    name: "position",
    renderer: "dom",
    rationale: "Positioned layout is explicitly kept on the DOM route."
  },
  {
    kind: "style",
    name: "flex",
    renderer: "dom",
    rationale: "Flex layout is frozen out of the canvas backlog."
  },
  {
    kind: "style",
    name: "grid",
    renderer: "dom",
    rationale: "Grid layout is frozen out of the canvas backlog."
  }
] as const satisfies readonly CanvasBacklogFreezeSignal[]

export const HIGH_RISK_DOM_TAGS = CANVAS_BACKLOG_FREEZE_SIGNALS.filter(
  (signal) => signal.kind === "tag"
).map((signal) => signal.name) as readonly string[]

export const COMPLEX_DOM_STYLE_PROPERTIES =
  CANVAS_BACKLOG_FREEZE_SIGNALS.filter((signal) => signal.kind === "style").map(
    (signal) => signal.name
  ) as readonly string[]
