import generateImport from '@babel/generator'
import { parse } from '@babel/parser'
import traverseImport, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { checkIfComponent } from '../../modules/component-detector'
import { extractPropsInfo, replacePropsReferences } from '../../modules/props-transformer'

// Handle ESM/CJS interop
const traverse =
  (traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport
const generate =
  (generateImport as unknown as { default?: typeof generateImport }).default ?? generateImport

export type TransformResult = {
  code: string
  /** Maps original local name → prop key (e.g. "localName" → "propKey") */
  propMappings: Map<string, string>
}

/**
 * Transforms destructured component props into `_props.X` member expressions
 * for linting purposes. This is a minimal transformation — no mergeProps/splitProps/imports
 * are added, only the patterns the eslint-plugin-solid reactivity rule needs to see.
 */
export function transformForLinting(code: string): TransformResult | null {
  // Quick check for destructuring pattern
  if (!/\(\s*\{/.test(code)) {
    return null
  }

  const propMappings = new Map<string, string>()

  let transformed = false

  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx']
    })

    const astNode = ast as unknown as t.Node
    traverse(astNode, {
      Function(path: NodePath<t.Function>) {
        const params = path.node.params
        if (params.length !== 1) return

        const firstParam = params[0]
        if (!t.isObjectPattern(firstParam)) return

        if (!checkIfComponent(path)) return

        // Extract info using shared utility
        const info = extractPropsInfo(firstParam)

        // Build propMappings from extracted info
        for (const [localName, key] of info.localToKey) {
          propMappings.set(localName, key)
        }
        for (const [localName, propPath] of info.nestedPropPaths) {
          propMappings.set(localName, propPath.join('.'))
        }

        // Replace parameter with _props identifier
        const propsIdentifier = t.identifier('_props')
        if (firstParam.typeAnnotation) {
          propsIdentifier.typeAnnotation = firstParam.typeAnnotation
        }
        path.node.params[0] = propsIdentifier

        // Replace references using shared utility
        const bodyPath = path.get('body')
        if (!Array.isArray(bodyPath)) {
          replacePropsReferences(bodyPath, '_props', info)
        }

        transformed = true
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!transformed) {
      return null
    }

    const output = generate(astNode, {
      retainLines: true,
      compact: false
    })

    return { code: output.code, propMappings }
  } catch (error) {
    console.warn('Failed to transform:', error)
    return null
  }
}
