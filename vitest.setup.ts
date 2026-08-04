function estimateTextWidth(text: string, font: string): number {
  const fontSizeMatch = font.match(/(\d+(?:\.\d+)?)px/)
  const fontSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[1]) : 16
  let width = 0

  for (const char of Array.from(text)) {
    if (char === " ") {
      width += fontSize * 0.32
      continue
    }

    if (/[\u2e80-\u9fff\uf900-\ufaff]/u.test(char)) {
      width += fontSize
      continue
    }

    width += fontSize * 0.56
  }

  return width
}

if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value(contextId: string) {
      if (contextId !== "2d") {
        return null
      }

      return {
        font: "16px serif",
        fillStyle: "#000",
        strokeStyle: "#000",
        lineWidth: 1,
        textBaseline: "alphabetic",
        setTransform() {
          return undefined
        },
        clearRect() {
          return undefined
        },
        fillRect() {
          return undefined
        },
        strokeRect() {
          return undefined
        },
        fillText() {
          return undefined
        },
        drawImage() {
          return undefined
        },
        save() {
          return undefined
        },
        restore() {
          return undefined
        },
        beginPath() {
          return undefined
        },
        moveTo() {
          return undefined
        },
        lineTo() {
          return undefined
        },
        stroke() {
          return undefined
        },
        fill() {
          return undefined
        },
        closePath() {
          return undefined
        },
        arcTo() {
          return undefined
        },
        measureText(text: string) {
          return {
            width: estimateTextWidth(text, this.font)
          }
        }
      }
    }
  })
}

if (typeof document !== "undefined" && !("fonts" in document)) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: Promise.resolve()
    }
  })
}
