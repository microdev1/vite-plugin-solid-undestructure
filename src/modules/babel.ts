import generateImport from '@babel/generator'
import { parse } from '@babel/parser'
import traverseImport, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { checkIfComponent } from './component-detector'

// Handle ESM/CJS interop
const traverse =
  (traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport
const generate =
  (generateImport as unknown as { default?: typeof generateImport }).default ?? generateImport

export { generate, traverse }

export type ComponentCallback = (path: NodePath<t.Function>, objectPattern: t.ObjectPattern) => void

/**
 * Parses code, finds components with destructured props, calls the callback
 * for each one, then generates output. Returns `{ code, map }` or `null` if
 * no components were transformed.
 */
export function traverseComponentProps(
  code: string,
  onComponent: ComponentCallback
): {
  code: string
  map: ReturnType<typeof generate> extends { map: infer M } ? M : unknown
} | null {
  // Quick check for destructuring pattern
  if (!/\(\s*\{/.test(code)) {
    return null
  }

  let transformed = false

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

      onComponent(path, firstParam)
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

  return { code: output.code, map: output.map }
}
