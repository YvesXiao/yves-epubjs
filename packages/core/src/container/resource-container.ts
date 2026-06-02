import { unzipSync, type UnzipFileInfo } from "fflate";
import {
  normalizeResourcePath,
  resolveResourcePath
} from "./resource-path";

export interface ResourceContainer {
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  resolvePath(base: string, relative: string): string;
  exists(path: string): boolean;
}

export type ZipResourceContainerLimits = {
  maxCompressedBytes?: number;
  maxEntryCount?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
};

const DEFAULT_ZIP_RESOURCE_CONTAINER_LIMITS: Required<ZipResourceContainerLimits> = {
  maxCompressedBytes: 512 * 1024 * 1024,
  maxEntryCount: 20_000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 1024 * 1024 * 1024
};

class ZipResourceLimitError extends Error {}

export class InMemoryResourceContainer implements ResourceContainer {
  protected readonly files = new Map<string, Uint8Array>();

  constructor(initialFiles: Record<string, Uint8Array> = {}) {
    for (const [path, value] of Object.entries(initialFiles)) {
      this.files.set(normalizeResourcePath(path), value);
    }
  }

  async readText(path: string): Promise<string> {
    const binary = await this.readBinary(path);
    return new TextDecoder().decode(binary);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const file = this.files.get(normalizeResourcePath(path));
    if (!file) {
      throw new Error(`Resource not found: ${path}`);
    }

    return file;
  }

  resolvePath(base: string, relative: string): string {
    return resolveResourcePath(base, relative);
  }

  exists(path: string): boolean {
    return this.files.has(normalizeResourcePath(path));
  }

  listPaths(): string[] {
    return [...this.files.keys()].sort();
  }
}

export class ZipResourceContainer extends InMemoryResourceContainer {
  constructor(initialFiles: Record<string, Uint8Array> = {}) {
    super();

    for (const path of Object.keys(initialFiles)) {
      const value = initialFiles[path];

      if (!value) {
        continue;
      }

      this.files.set(normalizeResourcePath(path), value);
    }
  }

  static async fromZip(
    input: Uint8Array,
    limits: ZipResourceContainerLimits = {}
  ): Promise<ZipResourceContainer> {
    const resolvedLimits = resolveZipResourceContainerLimits(limits);
    if (input.byteLength > resolvedLimits.maxCompressedBytes) {
      throw new ZipResourceLimitError(
        `EPUB ZIP compressed size exceeds limit: ${input.byteLength} > ${resolvedLimits.maxCompressedBytes}`
      );
    }

    let archiveEntries: Record<string, Uint8Array>;

    try {
      archiveEntries = unzipSync(input, {
        filter: createZipResourceFilter(resolvedLimits)
      });
    } catch (error) {
      if (error instanceof ZipResourceLimitError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "Unknown ZIP parse error";
      throw new Error(`Failed to unzip EPUB container: ${message}`);
    }

    validateUnzippedEntries(archiveEntries, resolvedLimits);

    return new ZipResourceContainer(archiveEntries);
  }
}

function resolveZipResourceContainerLimits(
  limits: ZipResourceContainerLimits
): Required<ZipResourceContainerLimits> {
  return {
    maxCompressedBytes:
      limits.maxCompressedBytes ??
      DEFAULT_ZIP_RESOURCE_CONTAINER_LIMITS.maxCompressedBytes,
    maxEntryCount:
      limits.maxEntryCount ??
      DEFAULT_ZIP_RESOURCE_CONTAINER_LIMITS.maxEntryCount,
    maxEntryBytes:
      limits.maxEntryBytes ??
      DEFAULT_ZIP_RESOURCE_CONTAINER_LIMITS.maxEntryBytes,
    maxTotalUncompressedBytes:
      limits.maxTotalUncompressedBytes ??
      DEFAULT_ZIP_RESOURCE_CONTAINER_LIMITS.maxTotalUncompressedBytes
  };
}

function createZipResourceFilter(
  limits: Required<ZipResourceContainerLimits>
): (file: UnzipFileInfo) => boolean {
  let entryCount = 0;
  let totalUncompressedBytes = 0;

  return (file) => {
    entryCount += 1;
    if (entryCount > limits.maxEntryCount) {
      throw new ZipResourceLimitError(
        `EPUB ZIP entry count exceeds limit: ${entryCount} > ${limits.maxEntryCount}`
      );
    }

    if (file.originalSize > limits.maxEntryBytes) {
      throw new ZipResourceLimitError(
        `EPUB ZIP entry exceeds uncompressed size limit: ${file.name} ${file.originalSize} > ${limits.maxEntryBytes}`
      );
    }

    totalUncompressedBytes += file.originalSize;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new ZipResourceLimitError(
        `EPUB ZIP total uncompressed size exceeds limit: ${totalUncompressedBytes} > ${limits.maxTotalUncompressedBytes}`
      );
    }

    return true;
  };
}

function validateUnzippedEntries(
  archiveEntries: Record<string, Uint8Array>,
  limits: Required<ZipResourceContainerLimits>
): void {
  const entries = Object.entries(archiveEntries);
  if (entries.length > limits.maxEntryCount) {
    throw new ZipResourceLimitError(
      `EPUB ZIP entry count exceeds limit: ${entries.length} > ${limits.maxEntryCount}`
    );
  }

  let totalUncompressedBytes = 0;
  for (const [path, value] of entries) {
    if (value.byteLength > limits.maxEntryBytes) {
      throw new ZipResourceLimitError(
        `EPUB ZIP entry exceeds uncompressed size limit: ${path} ${value.byteLength} > ${limits.maxEntryBytes}`
      );
    }

    totalUncompressedBytes += value.byteLength;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new ZipResourceLimitError(
        `EPUB ZIP total uncompressed size exceeds limit: ${totalUncompressedBytes} > ${limits.maxTotalUncompressedBytes}`
      );
    }
  }
}
