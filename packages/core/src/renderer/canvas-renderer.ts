import type { Point, Rect } from "../model/types";
import { approximateTextWidth } from "../utils/text-wrap";
import type {
  DrawOp,
  ImageDrawOp,
  InteractionRegion,
  LineDrawOp,
  RectDrawOp,
  SectionDisplayList,
  TextRunDrawOp
} from "./draw-ops";

type RenderCanvasSection = {
  sectionId: string;
  height: number;
  canvas: HTMLCanvasElement;
  interactions: InteractionRegion[];
};

type ScrollRenderWindow = {
  top: number;
  height: number;
};

type SlicedDisplayList = {
  displayList: SectionDisplayList;
  sourceOps: DrawOp[];
  sourceInteractions: InteractionRegion[];
};

export type CanvasRenderResult = {
  sections: RenderCanvasSection[];
  bounds: Rect[];
  drawOpCount: number;
  totalCanvasHeight: number;
};

type CanvasTextMetrics = {
  fontSize: number;
  actualAscent: number;
  fontBoxAscent: number;
  topInset: number;
  selectionBoxHeight: number;
};

type CanvasTextMeasureContext = {
  font: string;
  measureText(text: string): TextMetrics;
  save(): void;
  restore(): void;
};

export class CanvasRenderer {
  private readonly imageCache = new Map<string, HTMLImageElement>();
  private paintVersion = 0;

  renderPaginated(
    container: HTMLElement,
    displayList: SectionDisplayList,
    height: number,
    externalCanvas?: HTMLCanvasElement
  ): CanvasRenderResult {
    container.innerHTML = "";
    const wrapper = document.createElement("article");
    wrapper.className = "epub-section epub-section-paginated-canvas";
    wrapper.dataset.sectionId = displayList.sectionId;
    wrapper.dataset.href = displayList.sectionHref;
    wrapper.style.position = "relative";
    const canvas = externalCanvas ?? document.createElement("canvas");
    canvas.className = "epub-canvas epub-canvas-paginated";
    canvas.dataset.sectionId = displayList.sectionId;
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    this.prepareCanvas(
      canvas,
      displayList.width,
      Math.max(height, displayList.height)
    );
    const renderToken = this.assignRenderToken(canvas);
    wrapper.appendChild(canvas);
    const textLayer = createCanvasTextLayer(displayList, {
      className: "epub-text-layer epub-text-layer-paginated"
    });
    if (textLayer) {
      wrapper.appendChild(textLayer);
    }
    container.appendChild(wrapper);
    this.paint(canvas, displayList, renderToken);

    return {
      sections: [
        {
          sectionId: displayList.sectionId,
          height: Math.max(height, displayList.height),
          canvas,
          interactions: displayList.interactions
        }
      ],
      bounds: displayList.ops.map((op) => op.rect),
      drawOpCount: displayList.ops.length,
      totalCanvasHeight: Math.max(height, displayList.height)
    };
  }

  renderScrollable(
    container: HTMLElement,
    sectionsToRender: Array<{
      sectionId: string;
      sectionHref: string;
      height: number;
      displayList?: SectionDisplayList;
      renderWindows?: ScrollRenderWindow[];
      domHtml?: string;
    }>,
    externalCanvas?: HTMLCanvasElement
  ): CanvasRenderResult {
    Array.from(container.children).forEach((child) => {
      if (
        child instanceof HTMLElement &&
        !child.matches("article[data-section-id]")
      ) {
        container.removeChild(child);
      }
    });

    const existingWrappers = new Map<string, HTMLElement>();
    container
      .querySelectorAll<HTMLElement>("article[data-section-id]")
      .forEach((wrapper) => {
        const sectionId = wrapper.dataset.sectionId;
        if (sectionId) {
          existingWrappers.set(sectionId, wrapper);
        }
      });
    let totalCanvasHeight = 0;
    let drawOpCount = 0;
    const sections: RenderCanvasSection[] = [];
    const bounds: Rect[] = [];

    for (const sectionEntry of sectionsToRender) {
      const wrapper =
        existingWrappers.get(sectionEntry.sectionId) ??
        document.createElement("article");
      existingWrappers.delete(sectionEntry.sectionId);

      if (sectionEntry.domHtml) {
        wrapper.className = "epub-section epub-section-dom";
        wrapper.dataset.sectionId = sectionEntry.sectionId;
        wrapper.dataset.href = sectionEntry.sectionHref;
        wrapper.style.removeProperty("position");
        wrapper.style.removeProperty("height");
        wrapper.innerHTML = sectionEntry.domHtml;
        container.appendChild(wrapper);
        totalCanvasHeight += wrapper.offsetHeight || sectionEntry.height;
        continue;
      }

      if (!sectionEntry.displayList) {
        wrapper.className = "epub-section epub-section-virtual";
        wrapper.dataset.sectionId = sectionEntry.sectionId;
        wrapper.dataset.href = sectionEntry.sectionHref;
        wrapper.style.height = `${sectionEntry.height}px`;
        wrapper.style.removeProperty("position");
        wrapper.replaceChildren();
        container.appendChild(wrapper);
        continue;
      }

      const displayList = sectionEntry.displayList;
      const wasCanvasWrapper = wrapper.classList.contains(
        "epub-section-canvas"
      );
      wrapper.className = "epub-section epub-section-canvas";
      wrapper.dataset.sectionId = displayList.sectionId;
      wrapper.dataset.href = displayList.sectionHref;
      wrapper.style.height = `${displayList.height}px`;
      wrapper.style.position = "relative";
      if (!wasCanvasWrapper) {
        wrapper.replaceChildren();
      }
      const renderWindows = (
        sectionEntry.renderWindows?.length
          ? sectionEntry.renderWindows
          : [{ top: 0, height: displayList.height }]
      )
        .map((window) => normalizeRenderWindow(window, displayList.height))
        .filter((window) => window.height > 0);
      if (renderWindows.length === 0) {
        wrapper.replaceChildren();
        container.appendChild(wrapper);
        continue;
      }

      const existingCanvases = new Map<string, HTMLCanvasElement>();
      const existingTextLayers = new Map<string, HTMLDivElement>();
      wrapper
        .querySelectorAll<HTMLCanvasElement>("canvas.epub-canvas-section")
        .forEach((canvas) => {
          const sliceIndex = canvas.dataset.sliceIndex;
          if (sliceIndex) {
            existingCanvases.set(sliceIndex, canvas);
          }
        });
      wrapper
        .querySelectorAll<HTMLDivElement>(".epub-text-layer-section")
        .forEach((layer) => {
          const sliceIndex = layer.dataset.sliceIndex;
          if (sliceIndex) {
            existingTextLayers.set(sliceIndex, layer);
          }
        });
      const sectionInteractions: InteractionRegion[] = [];
      let primaryCanvas: HTMLCanvasElement | null = null;
      for (const [windowIndex, renderWindow] of renderWindows.entries()) {
        const sliced = sliceDisplayList(displayList, renderWindow);
        const slicedDisplayList = sliced.displayList;
        const sliceIndex = `${windowIndex}`;
        const canvas =
          externalCanvas &&
          sectionsToRender.length === 1 &&
          renderWindows.length === 1
            ? externalCanvas
            : (existingCanvases.get(sliceIndex) ??
              document.createElement("canvas"));
        existingCanvases.delete(sliceIndex);
        canvas.className = "epub-canvas epub-canvas-section";
        canvas.dataset.sliceIndex = sliceIndex;
        canvas.style.display = "block";
        canvas.style.position = "absolute";
        canvas.style.top = `${renderWindow.top}px`;
        canvas.style.left = "50%";
        canvas.style.transform = "translateX(-50%)";
        this.prepareCanvas(
          canvas,
          slicedDisplayList.width,
          slicedDisplayList.height
        );
        const renderToken = this.assignRenderToken(canvas);
        this.paint(canvas, slicedDisplayList, renderToken);
        if (!primaryCanvas) {
          primaryCanvas = canvas;
        }
        if (
          !externalCanvas ||
          sectionsToRender.length > 1 ||
          renderWindows.length > 1
        ) {
          wrapper.appendChild(canvas);
        }
        const textLayer = createCanvasTextLayer(slicedDisplayList, {
          className: "epub-text-layer epub-text-layer-section",
          sliceIndex,
          top: renderWindow.top
        });
        const existingTextLayer = existingTextLayers.get(sliceIndex) ?? null;
        existingTextLayers.delete(sliceIndex);
        if (textLayer) {
          if (existingTextLayer) {
            existingTextLayer.replaceWith(textLayer);
          } else {
            wrapper.appendChild(textLayer);
          }
        } else if (existingTextLayer?.parentElement === wrapper) {
          wrapper.removeChild(existingTextLayer);
        }
        sectionInteractions.push(...sliced.sourceInteractions);
        totalCanvasHeight += slicedDisplayList.height;
        drawOpCount += slicedDisplayList.ops.length;
        bounds.push(...sliced.sourceOps.map((op) => op.rect));
      }

      for (const staleCanvas of existingCanvases.values()) {
        if (staleCanvas.parentElement === wrapper) {
          wrapper.removeChild(staleCanvas);
        }
      }
      for (const staleTextLayer of existingTextLayers.values()) {
        if (staleTextLayer.parentElement === wrapper) {
          wrapper.removeChild(staleTextLayer);
        }
      }
      container.appendChild(wrapper);
      sections.push({
        sectionId: displayList.sectionId,
        height: displayList.height,
        canvas: primaryCanvas ?? document.createElement("canvas"),
        interactions: sectionInteractions
      });
    }

    for (const staleWrapper of existingWrappers.values()) {
      if (staleWrapper.parentElement === container) {
        container.removeChild(staleWrapper);
      }
    }

    return {
      sections,
      bounds,
      drawOpCount,
      totalCanvasHeight
    };
  }

  hitTest(
    rendered: CanvasRenderResult,
    point: Point,
    scrollTop = 0
  ): InteractionRegion | null {
    let accumulatedTop = 0;
    const absoluteY = point.y + scrollTop;

    for (const section of rendered.sections) {
      const localY = absoluteY - accumulatedTop;
      if (localY >= 0 && localY <= section.height) {
        const hit =
          [...section.interactions]
            .reverse()
            .find((interaction) =>
              containsPoint(interaction.rect, point.x, localY)
            ) ?? null;
        if (hit) {
          return {
            ...hit,
            rect: {
              ...hit.rect,
              y: hit.rect.y + accumulatedTop
            }
          };
        }
      }
      accumulatedTop += section.height;
    }

    return null;
  }

  private prepareCanvas(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    const ratio =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${Math.max(1, width)}px`;
    canvas.style.height = `${Math.max(1, height)}px`;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private paint(
    canvas: HTMLCanvasElement,
    displayList: SectionDisplayList,
    renderToken: string
  ): void {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, displayList.width, displayList.height);
    for (const op of displayList.ops) {
      switch (op.kind) {
        case "rect":
          this.paintRect(context, op);
          break;
        case "line":
          this.paintLine(context, op);
          break;
        case "image":
          this.paintImage(context, op, canvas, displayList, renderToken);
          break;
        case "text":
          this.paintText(context, op);
          break;
        default:
          break;
      }
    }
  }

  private paintRect(context: CanvasRenderingContext2D, op: RectDrawOp): void {
    context.save();
    context.fillStyle = op.color;
    if (op.radius && op.radius > 0) {
      roundRect(
        context,
        op.rect.x,
        op.rect.y,
        op.rect.width,
        op.rect.height,
        op.radius
      );
      context.fill();
    } else {
      context.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
    }
    if (op.strokeColor && op.strokeWidth) {
      context.strokeStyle = op.strokeColor;
      context.lineWidth = op.strokeWidth;
      context.strokeRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
    }
    context.restore();
  }

  private paintLine(
    context: CanvasRenderingContext2D,
    op: DrawOp & { kind: "line" }
  ): void {
    context.save();
    context.strokeStyle = op.color;
    context.lineWidth = op.lineWidth;
    context.beginPath();
    context.moveTo(op.x1, op.y1);
    context.lineTo(op.x2, op.y2);
    context.stroke();
    context.restore();
  }

  private paintText(
    context: CanvasRenderingContext2D,
    op: TextRunDrawOp
  ): void {
    context.save();
    if (op.backgroundColor) {
      context.fillStyle = op.backgroundColor;
      context.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
    }
    if (op.highlightSegments?.length) {
      for (const segment of op.highlightSegments) {
        const segmentText = sliceByCharacterRange(
          op.text,
          segment.start,
          segment.end
        );
        if (!segmentText) {
          continue;
        }
        const prefixText = sliceByCharacterRange(op.text, 0, segment.start);
        const segmentX = op.rect.x + approximateTextWidth(prefixText, op.font);
        const segmentWidth = approximateTextWidth(segmentText, op.font);
        context.fillStyle = segment.color;
        context.fillRect(
          segmentX,
          op.rect.y,
          Math.max(1, segmentWidth),
          op.rect.height
        );
      }
    }
    if (op.highlightColor) {
      context.fillStyle = op.highlightColor;
      context.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
    }
    context.font = op.font;
    const metrics = resolveCanvasTextMetrics(
      op.font,
      op.text,
      op.rect.height,
      context
    );
    const fontSize = metrics.fontSize;
    const baselineY = op.y + metrics.topInset + metrics.actualAscent;
    context.textBaseline = "alphabetic";
    context.fillStyle = op.color;
    context.fillText(op.text, op.x, baselineY);
    if (op.underline) {
      const underlineY = Math.min(
        op.y + op.rect.height - 3,
        baselineY + Math.max(fontSize * 0.08, 1)
      );
      context.strokeStyle = op.underlineColor ?? op.color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(op.x, underlineY);
      context.lineTo(op.x + op.width, underlineY);
      context.stroke();
    }
    context.restore();
  }

  private paintImage(
    context: CanvasRenderingContext2D,
    op: ImageDrawOp,
    canvas: HTMLCanvasElement,
    displayList: SectionDisplayList,
    renderToken: string
  ): void {
    context.save();
    if (op.background && op.background !== "transparent") {
      context.fillStyle = op.background;
      roundRect(
        context,
        op.rect.x,
        op.rect.y,
        op.rect.width,
        op.rect.height,
        14
      );
      context.fill();
    }
    const image = this.loadImage(op.src, () => {
      if (canvas.dataset.renderToken !== renderToken) {
        return;
      }
      this.paint(canvas, displayList, renderToken);
    });
    if (
      image &&
      image.complete &&
      image.naturalWidth > 0 &&
      image.naturalHeight > 0
    ) {
      const fittedRect = fitRectContain(
        {
          width: image.naturalWidth,
          height: image.naturalHeight
        },
        op.rect
      );
      context.drawImage(
        image,
        fittedRect.x,
        fittedRect.y,
        fittedRect.width,
        fittedRect.height
      );
    } else {
      context.fillStyle = "rgba(71, 85, 105, 0.72)";
      context.font = '600 14px "Iowan Old Style", "Palatino Linotype", serif';
      context.textBaseline = "middle";
      context.fillText(
        "Image",
        op.rect.x + 16,
        op.rect.y + op.rect.height * 0.5
      );
    }
    context.restore();
  }

  private loadImage(src: string, onLoad?: () => void): HTMLImageElement | null {
    if (typeof Image === "undefined") {
      return null;
    }
    const cached = this.imageCache.get(src);
    if (cached) {
      if (onLoad && (!cached.complete || cached.naturalWidth <= 0)) {
        cached.addEventListener("load", onLoad, { once: true });
      }
      return cached;
    }
    const image = new Image();
    if (onLoad) {
      image.addEventListener("load", onLoad, { once: true });
    }
    image.src = src;
    this.imageCache.set(src, image);
    return image;
  }

  private assignRenderToken(canvas: HTMLCanvasElement): string {
    const token = `${++this.paintVersion}`;
    canvas.dataset.renderToken = token;
    return token;
  }
}

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const boundedRadius = Math.min(radius, width * 0.5, height * 0.5);
  context.beginPath();
  context.moveTo(x + boundedRadius, y);
  context.arcTo(x + width, y, x + width, y + height, boundedRadius);
  context.arcTo(x + width, y + height, x, y + height, boundedRadius);
  context.arcTo(x, y + height, x, y, boundedRadius);
  context.arcTo(x, y, x + width, y, boundedRadius);
  context.closePath();
}

function fitRectContain(
  source: {
    width: number;
    height: number;
  },
  target: Rect
): Rect {
  if (source.width <= 0 || source.height <= 0) {
    return target;
  }

  const scale = Math.min(
    target.width / source.width,
    target.height / source.height
  );
  const width = Math.max(1, source.width * scale);
  const height = Math.max(1, source.height * scale);

  return {
    x: target.x + (target.width - width) * 0.5,
    y: target.y + (target.height - height) * 0.5,
    width,
    height
  };
}

function normalizeRenderWindow(
  renderWindow: ScrollRenderWindow,
  maxHeight: number
): ScrollRenderWindow {
  const top = Math.max(0, Math.min(renderWindow.top, maxHeight));
  const bottom = Math.max(
    top,
    Math.min(renderWindow.top + renderWindow.height, maxHeight)
  );
  return {
    top,
    height: Math.max(0, bottom - top)
  };
}

function sliceDisplayList(
  displayList: SectionDisplayList,
  renderWindow: ScrollRenderWindow
): SlicedDisplayList {
  const sourceOps = displayList.ops.filter((op) =>
    rectIntersectsWindow(op.rect, renderWindow)
  );
  const sourceInteractions = displayList.interactions.filter((interaction) =>
    rectIntersectsWindow(interaction.rect, renderWindow)
  );

  return {
    displayList: {
      ...displayList,
      height: renderWindow.height,
      ops: sourceOps.map((op) => offsetDrawOp(op, -renderWindow.top)),
      interactions: sourceInteractions.map((interaction) =>
        offsetInteractionRegion(interaction, -renderWindow.top)
      )
    },
    sourceOps,
    sourceInteractions
  };
}

function rectIntersectsWindow(
  rect: Rect,
  renderWindow: ScrollRenderWindow
): boolean {
  const windowBottom = renderWindow.top + renderWindow.height;
  const rectBottom = rect.y + rect.height;
  return rectBottom > renderWindow.top && rect.y < windowBottom;
}

function offsetDrawOp(op: DrawOp, deltaY: number): DrawOp {
  const rect = {
    ...op.rect,
    y: op.rect.y + deltaY
  };

  if (op.kind === "line") {
    return {
      ...op,
      rect,
      y1: op.y1 + deltaY,
      y2: op.y2 + deltaY
    } satisfies LineDrawOp;
  }

  if (op.kind === "text") {
    return {
      ...op,
      rect,
      y: op.y + deltaY
    } satisfies TextRunDrawOp;
  }

  if (op.kind === "image") {
    return {
      ...op,
      rect
    } satisfies ImageDrawOp;
  }

  return {
    ...op,
    rect
  } satisfies RectDrawOp;
}

function offsetInteractionRegion<TInteraction extends InteractionRegion>(
  interaction: TInteraction,
  deltaY: number
): TInteraction {
  return {
    ...interaction,
    rect: {
      ...interaction.rect,
      y: interaction.rect.y + deltaY
    }
  };
}

function extractFontSize(font: string): number {
  const match = font.match(/(\d+(?:\.\d+)?)px/);
  return match ? Number.parseFloat(match[1]!) : 16;
}

function createCanvasTextLayer(
  displayList: SectionDisplayList,
  options: {
    className: string;
    sliceIndex?: string;
    top?: number;
  }
): HTMLDivElement | null {
  const textOps = displayList.ops.filter(
    (op): op is TextRunDrawOp => op.kind === "text" && Boolean(op.text)
  );
  if (textOps.length === 0) {
    return null;
  }

  const layer = document.createElement("div");
  layer.className = options.className;
  if (options.sliceIndex) {
    layer.dataset.sliceIndex = options.sliceIndex;
  }
  layer.style.position = "absolute";
  layer.style.left = "50%";
  layer.style.top = `${options.top ?? 0}px`;
  layer.style.transform = "translateX(-50%)";
  layer.style.width = `${Math.max(1, displayList.width)}px`;
  layer.style.height = `${Math.max(1, displayList.height)}px`;
  layer.style.zIndex = "1";
  layer.style.userSelect = "text";
  layer.style.webkitUserSelect = "text";
  layer.style.pointerEvents = "auto";
  layer.style.overflow = "hidden";
  layer.style.color = "transparent";
  layer.style.webkitTextFillColor = "transparent";
  layer.style.caretColor = "transparent";

  const measureContext = createTextMeasureContext();
  const fragment = document.createDocumentFragment();
  for (const op of textOps) {
    const span = document.createElement("span");
    const metrics = resolveCanvasTextMetrics(
      op.font,
      op.text,
      op.rect.height,
      measureContext ?? undefined
    );
    span.className = "epub-text-run";
    span.dataset.readerSectionId = op.sectionId;
    span.dataset.readerBlockId = op.blockId;
    span.dataset.readerInlineStart = `${op.textStart ?? 0}`;
    span.dataset.readerInlineEnd = `${op.textEnd ?? Array.from(op.text).length}`;
    span.textContent = op.text;
    span.style.position = "absolute";
    span.style.left = `${op.x}px`;
    span.style.top = `${op.y + metrics.topInset - (metrics.fontBoxAscent - metrics.actualAscent)}px`;
    span.style.width = `${Math.max(1, op.width)}px`;
    span.style.height = `${Math.max(1, metrics.selectionBoxHeight)}px`;
    span.style.font = op.font;
    span.style.lineHeight = `${Math.max(1, metrics.selectionBoxHeight)}px`;
    span.style.whiteSpace = "pre";
    span.style.color = "transparent";
    span.style.webkitTextFillColor = "transparent";
    span.style.userSelect = "text";
    span.style.webkitUserSelect = "text";
    if (op.underline) {
      span.style.textDecoration = "underline";
      span.style.textDecorationColor = "transparent";
    }
    fragment.appendChild(span);
  }
  layer.appendChild(fragment);
  return layer;
}

const canvasTextMetricsCache = new Map<string, CanvasTextMetrics>();

function resolveCanvasTextMetrics(
  font: string,
  text: string,
  rectHeight: number,
  context?: CanvasTextMeasureContext
): CanvasTextMetrics {
  const cacheKey = context ? null : `${font}\u0000${text}\u0000${rectHeight}`;
  if (cacheKey) {
    const cached = canvasTextMetricsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const fontSize = extractFontSize(font);
  let actualAscent = fontSize * 0.82;
  let fontBoxAscent = actualAscent;
  let selectionBoxHeight = fontSize;
  const measureContext = context ?? createTextMeasureContext();
  if (measureContext && typeof measureContext.measureText === "function") {
    measureContext.save();
    measureContext.font = font;
    const measured = measureContext.measureText(text);
    measureContext.restore();
    if (
      Number.isFinite(measured.actualBoundingBoxAscent) &&
      measured.actualBoundingBoxAscent > 0
    ) {
      actualAscent = measured.actualBoundingBoxAscent;
    }
    if (
      Number.isFinite(measured.fontBoundingBoxAscent) &&
      measured.fontBoundingBoxAscent > 0
    ) {
      fontBoxAscent = measured.fontBoundingBoxAscent;
    }
    const fontBoxHeight = sumFiniteMetrics(
      measured.fontBoundingBoxAscent,
      measured.fontBoundingBoxDescent
    );
    const actualBoxHeight = sumFiniteMetrics(
      measured.actualBoundingBoxAscent,
      measured.actualBoundingBoxDescent
    );
    selectionBoxHeight =
      fontBoxHeight > 0
        ? fontBoxHeight
        : actualBoxHeight > 0
          ? actualBoxHeight
          : fontSize;
  }

  const topInset = Math.min(
    Math.max(fontSize * 0.08, 1),
    Math.max(rectHeight - actualAscent, 0)
  );
  const result = {
    fontSize,
    actualAscent,
    fontBoxAscent,
    topInset,
    selectionBoxHeight
  } satisfies CanvasTextMetrics;
  if (cacheKey) {
    canvasTextMetricsCache.set(cacheKey, result);
  }
  return result;
}

function createTextMeasureContext(): CanvasTextMeasureContext | null {
  if (typeof document !== "undefined") {
    return document.createElement("canvas").getContext("2d");
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(1, 1).getContext("2d");
  }
  return null;
}

function sumFiniteMetrics(first?: number, second?: number): number {
  const safeFirst =
    typeof first === "number" && Number.isFinite(first) ? first : 0;
  const safeSecond =
    typeof second === "number" && Number.isFinite(second) ? second : 0;
  return safeFirst + safeSecond;
}

function sliceByCharacterRange(
  text: string,
  start: number,
  end: number
): string {
  return Array.from(text).slice(Math.max(0, start), Math.max(0, end)).join("");
}
