import { Linter } from 'eslint'
import { transformForLinting, TransformResult } from './transform'

// Store transform metadata per file for postprocess to use
const transformCache = new Map<string, TransformResult>()

export const processor: Linter.Processor = {
  meta: {
    name: 'solid-undestructure'
  },

  preprocess(text: string, filename: string) {
    // Only process files that could contain JSX components
    if (!/\.(tsx?|jsx?)$/.test(filename)) {
      return [text]
    }

    const result = transformForLinting(text)
    if (!result) {
      transformCache.delete(filename)
      return [text]
    }

    transformCache.set(filename, result)
    return [result.code]
  },

  postprocess(messages: Linter.LintMessage[][], filename: string) {
    const result = transformCache.get(filename)
    if (!result) {
      return messages[0]
    }

    transformCache.delete(filename)

    const { propAccess, restMapping } = result
    if (propAccess.size === 0 && !restMapping) {
      return messages[0]
    }

    // Track cumulative column shift per line from prior expansions
    const lineShifts = new Map<number, number>()

    return messages[0].map((msg) => {
      let { message } = msg
      let lengthDelta = 0

      for (const [localName, access] of propAccess) {
        if (message.includes(`'${access}'`)) {
          message = message.replaceAll(`'${access}'`, `'${localName}'`)
          // Track length difference for endColumn adjustment (best-effort)
          lengthDelta = access.length - localName.length
        }
      }

      // Replace generated rest identifier with original (e.g., _props → props)
      if (restMapping) {
        const restPattern = new RegExp(`'${restMapping.generated}(?:\\.|')`)
        if (restPattern.test(message)) {
          message = message.replaceAll(restMapping.generated, restMapping.original)
          lengthDelta = restMapping.generated.length - restMapping.original.length
        }
      }

      const adjusted = { ...msg, message } as typeof msg & { endColumn?: number }

      if (lengthDelta > 0 && typeof msg.column === 'number') {
        const priorShift = lineShifts.get(msg.line) ?? 0

        // Shift column back by cumulative prior expansions on this line
        if (priorShift > 0) {
          adjusted.column = msg.column - priorShift
        }

        // Shrink the squiggly underline to match the original variable length
        if (typeof msg.endColumn === 'number') {
          adjusted.endColumn = msg.endColumn - priorShift - lengthDelta
        }

        // Accumulate shift for subsequent messages on this line
        lineShifts.set(msg.line, priorShift + lengthDelta)
      }

      return adjusted
    })
  },

  supportsAutofix: false as const
}
