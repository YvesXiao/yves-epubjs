import { XMLParser } from "fast-xml-parser"
import { normalizeResourcePath } from "../container/resource-path"

type RootfileNode = {
  "@_full-path"?: string
  "@_media-type"?: string
}

type ContainerDocument = {
  container?: {
    rootfiles?: {
      rootfile?: RootfileNode | RootfileNode[]
    }
  }
}

export type PackageDocumentRef = {
  fullPath: string
  mediaType?: string
}

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false
})

export function parseContainerXml(xml: string): PackageDocumentRef {
  const parsed = xmlParser.parse(xml) as ContainerDocument
  const rootfileNode = parsed.container?.rootfiles?.rootfile
  const firstRootfile = Array.isArray(rootfileNode)
    ? rootfileNode[0]
    : rootfileNode
  const fullPath = firstRootfile?.["@_full-path"]

  if (!fullPath) {
    throw new Error("Invalid container.xml: missing rootfile full-path.")
  }

  const result: PackageDocumentRef = {
    fullPath: normalizeResourcePath(fullPath)
  }

  if (firstRootfile?.["@_media-type"]) {
    result.mediaType = firstRootfile["@_media-type"]
  }

  return result
}
