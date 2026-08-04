import type {
  ReadingMode,
  RenderFlowModel,
  RenderGeometrySource,
  RenderInteractionModel,
  RenderLayoutAuthority
} from "../model/types"

export type RenderBackendCapabilities = {
  layoutAuthority: RenderLayoutAuthority
  geometrySource: RenderGeometrySource
  interactionModel: RenderInteractionModel
  flowModel: RenderFlowModel
}

export function resolveRenderBackendCapabilities(input: {
  backend: "canvas" | "dom"
  mode: ReadingMode
}): RenderBackendCapabilities {
  if (input.backend === "canvas") {
    return {
      layoutAuthority: "project-layout",
      geometrySource: "interaction-map",
      interactionModel: "canvas-hit-test",
      flowModel:
        input.mode === "paginated" ? "paginated-pages" : "scroll-slices"
    }
  }

  return {
    layoutAuthority: "browser-layout",
    geometrySource: "dom-geometry",
    interactionModel: "dom-events",
    flowModel: input.mode === "paginated" ? "paginated-pages" : "dom-flow"
  }
}
