import type { Locator, Rect } from "../model/types";

export type DrawOpBase = {
  kind: string;
  sectionId: string;
  sectionHref: string;
  blockId: string;
  locator: Locator | undefined;
  rect: Rect;
};

export type TextHighlightSegment = {
  start: number;
  end: number;
  color: string;
};

export type TextRunDrawOp = DrawOpBase & {
  kind: "text";
  text: string;
  textStart?: number;
  textEnd?: number;
  x: number;
  y: number;
  width: number;
  font: string;
  color: string;
  backgroundColor: string | undefined;
  highlightColor: string | undefined;
  highlightSegments?: TextHighlightSegment[];
  underline: boolean | undefined;
  underlineColor?: string;
  href: string | undefined;
};

export type RectDrawOp = DrawOpBase & {
  kind: "rect";
  color: string;
  radius?: number;
  strokeColor?: string;
  strokeWidth?: number;
};

export type LineDrawOp = DrawOpBase & {
  kind: "line";
  color: string;
  lineWidth: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type ImageDrawOp = DrawOpBase & {
  kind: "image";
  src: string;
  alt: string | undefined;
  loaded: boolean;
  background: string;
};

export type DrawOp = TextRunDrawOp | RectDrawOp | LineDrawOp | ImageDrawOp;

export type InteractionRegion =
  | {
      kind: "link";
      rect: Rect;
      sectionId: string;
      blockId: string;
      href: string;
      locator: Locator | undefined;
      text: string | undefined;
    }
  | {
      kind: "image";
      rect: Rect;
      sectionId: string;
      blockId: string;
      src: string;
      alt: string | undefined;
      locator: Locator | undefined;
    }
  | {
      kind: "block";
      rect: Rect;
      sectionId: string;
      blockId: string;
      locator: Locator | undefined;
      text: string | undefined;
    };

export type SectionDisplayList = {
  sectionId: string;
  sectionHref: string;
  width: number;
  height: number;
  ops: DrawOp[];
  interactions: InteractionRegion[];
};
