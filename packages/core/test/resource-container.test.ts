// @vitest-environment node

import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  InMemoryResourceContainer,
  ZipResourceContainer
} from "../src/container/resource-container";

const encoder = new TextEncoder();

describe("resource containers", () => {
  it("reads text and binary data from an in-memory resource container", async () => {
    const container = new InMemoryResourceContainer({
      "OPS/chapter.xhtml": encoder.encode("<p>Hello EPUB</p>")
    });

    await expect(container.readText("OPS/chapter.xhtml")).resolves.toContain(
      "Hello EPUB"
    );
    await expect(container.readBinary("OPS/chapter.xhtml")).resolves.toEqual(
      encoder.encode("<p>Hello EPUB</p>")
    );
    expect(container.exists("OPS/chapter.xhtml")).toBe(true);
  });

  it("resolves and lists normalized resource paths", () => {
    const container = new InMemoryResourceContainer({
      "./OPS/text/chapter.xhtml": encoder.encode("chapter"),
      "OPS/../OPS/nav.xhtml": encoder.encode("nav")
    });

    expect(container.resolvePath("OPS/text/chapter.xhtml", "../images/a.png")).toBe(
      "OPS/images/a.png"
    );
    expect(container.listPaths()).toEqual(["OPS/../OPS/nav.xhtml", "OPS/text/chapter.xhtml"]);
  });

  it("unzips a ZIP archive and builds a resource index", async () => {
    const zipBytes = zipSync({
      mimetype: Buffer.from("application/epub+zip"),
      "META-INF/container.xml": Buffer.from(
        `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/content.opf" /></rootfiles></container>`
      ),
      "OPS/content.opf": Buffer.from("<package></package>")
    });

    const container = await ZipResourceContainer.fromZip(zipBytes);

    await expect(container.readText("META-INF/container.xml")).resolves.toContain(
      "OPS/content.opf"
    );
    await expect(container.readText("OPS/content.opf")).resolves.toBe(
      "<package></package>"
    );
    expect(container.listPaths()).toEqual(
      expect.arrayContaining(["META-INF/container.xml", "OPS/content.opf"])
    );
  });

  it("rejects ZIP archives that exceed configured resource limits", async () => {
    const zipBytes = zipSync({
      "OPS/a.txt": Buffer.from("aaa"),
      "OPS/b.txt": Buffer.from("bbb")
    });

    await expect(
      ZipResourceContainer.fromZip(zipBytes, {
        maxCompressedBytes: 1
      })
    ).rejects.toThrowError("compressed size exceeds limit");
    await expect(
      ZipResourceContainer.fromZip(zipBytes, {
        maxEntryCount: 1
      })
    ).rejects.toThrowError("entry count exceeds limit");
    await expect(
      ZipResourceContainer.fromZip(zipBytes, {
        maxEntryBytes: 2
      })
    ).rejects.toThrowError("entry exceeds uncompressed size limit");
    await expect(
      ZipResourceContainer.fromZip(zipBytes, {
        maxTotalUncompressedBytes: 5
      })
    ).rejects.toThrowError("total uncompressed size exceeds limit");
  });

  it("throws a clear error for invalid ZIP data", async () => {
    await expect(
      ZipResourceContainer.fromZip(new Uint8Array([1, 2, 3, 4]))
    ).rejects.toThrowError("Failed to unzip EPUB container");
  });
});
