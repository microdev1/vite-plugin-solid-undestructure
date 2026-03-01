import { transformForLinting, TransformResult } from './transform'

// Store transform metadata per file for postprocess to use
const transformCache = new Map<string, TransformResult>()

export const processor = {
  meta: {
    name: 'solid-undestructure',
    version: '0.1.1'
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

  postprocess(messages: { ruleId: string | null; message: string }[][], filename: string) {
    const result = transformCache.get(filename)
    if (!result) {
      return messages[0]
    }

    transformCache.delete(filename)

    // Build a regex to replace 'props.X' references in messages with the original local name
    const { propMappings } = result
    if (propMappings.size === 0) {
      return messages[0]
    }

    // Create reverse mapping: propKey → localName
    const keyToLocal = new Map<string, string>()
    for (const [localName, propKey] of propMappings) {
      keyToLocal.set(propKey, localName)
    }

    return messages[0].map((msg) => {
      let { message } = msg
      // Replace '_props.X' with 'X' (the original destructured name) in error messages
      for (const [localName, propKey] of propMappings) {
        // Handle both '_props.X' (top-level) and '_props.a.b' (nested) patterns
        const propsAccess = `_props.${propKey}`
        message = message.replaceAll(`'${propsAccess}'`, `'${localName}'`)
      }
      return { ...msg, message }
    })
  },

  supportsAutofix: false as const
}
