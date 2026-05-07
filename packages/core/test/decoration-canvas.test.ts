import { describe, expect, it } from "vitest";
import type { SectionDocument } from "../src/model/types";
import { LayoutEngine } from "../src/layout/layout-engine";
import { DisplayListBuilder } from "../src/renderer/display-list-builder";
import type { TextRunDrawOp } from "../src/renderer/draw-ops";

describe("canvas decoration rendering", () => {
  it("emits underline draw ops for underlined decoration blocks", () => {
    const section: SectionDocument = {
      id: "section-1",
      href: "OPS/underline.xhtml",
      title: "Underline",
      anchors: {},
      blocks: [
        {
          id: "text-1",
          kind: "text",
          inlines: [{ kind: "text", text: "Underline decoration target" }]
        }
      ]
    };

    const layout = new LayoutEngine().layout(
      {
        section,
        spineIndex: 0,
        viewportWidth: 280,
        viewportHeight: 600,
        typography: {
          fontSize: 18,
          lineHeight: 1.6,
          paragraphSpacing: 12
        },
        fontFamily: "serif"
      },
      "scroll"
    );

    const displayList = new DisplayListBuilder().buildSection({
      section,
      width: 280,
      viewportHeight: 600,
      blocks: layout.blocks,
      theme: {
        color: "#1f2328",
        background: "#fffdf7"
      },
      typography: {
        fontSize: 18,
        lineHeight: 1.6,
        paragraphSpacing: 12
      },
      underlinedBlockIds: new Set(["text-1"]),
      underlineColorsByBlock: new Map([["text-1", "#2563eb"]]),
      activeBlockId: undefined
    });

    const textOps = displayList.ops.filter(
      (op): op is TextRunDrawOp => op.kind === "text" && op.blockId === "text-1"
    );

    expect(textOps.length).toBeGreaterThan(0);
    expect(textOps.every((op) => op.underline === true)).toBe(true);
    expect(textOps.every((op) => op.underlineColor === "#2563eb")).toBe(true);
  });
});
