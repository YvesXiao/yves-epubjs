const XML_BUILTIN_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"])

const LEGACY_HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: "\u00A0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200C",
  zwj: "\u200D",
  shy: "\u00AD",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201A",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bdquo: "\u201E",
  laquo: "\u00AB",
  raquo: "\u00BB",
  lsaquo: "\u2039",
  rsaquo: "\u203A",
  middot: "\u00B7",
  bull: "\u2022",
  dagger: "\u2020",
  Dagger: "\u2021",
  permil: "\u2030",
  prime: "\u2032",
  Prime: "\u2033",
  oline: "\u203E",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  deg: "\u00B0",
  plusmn: "\u00B1",
  times: "\u00D7",
  divide: "\u00F7",
  euro: "\u20AC",
  pound: "\u00A3",
  yen: "\u00A5",
  cent: "\u00A2",
  curren: "\u00A4",
  brvbar: "\u00A6",
  sect: "\u00A7",
  para: "\u00B6",
  micro: "\u00B5",
  iexcl: "\u00A1",
  iquest: "\u00BF",
  not: "\u00AC",
  macr: "\u00AF",
  acute: "\u00B4",
  uml: "\u00A8",
  cedil: "\u00B8",
  ordf: "\u00AA",
  ordm: "\u00BA",
  sup1: "\u00B9",
  sup2: "\u00B2",
  sup3: "\u00B3",
  frac14: "\u00BC",
  frac12: "\u00BD",
  frac34: "\u00BE"
}

const ENTITY_NAME_PATTERN = Object.keys(LEGACY_HTML_ENTITY_MAP)
  .sort((left, right) => right.length - left.length)
  .join("|")

const LEGACY_HTML_ENTITY_PATTERN = new RegExp(
  `&(${ENTITY_NAME_PATTERN}|amp|lt|gt|quot|apos)(;|(?=[^0-9A-Za-z]))`,
  "g"
)

export function normalizeLegacyHtmlEntities(xml: string): string {
  return xml.replace(
    LEGACY_HTML_ENTITY_PATTERN,
    (match, entityName: string) => {
      if (XML_BUILTIN_ENTITIES.has(entityName)) {
        return match
      }

      const decoded = LEGACY_HTML_ENTITY_MAP[entityName]
      if (!decoded) {
        return match
      }

      return decoded
    }
  )
}
