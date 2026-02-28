import generateImport from '@babel/generator'
import { parse } from '@babel/parser'
import traverseImport, { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { Plugin } from 'vite'
import { checkIfComponent } from './modules/component-detector'
import { transformPropsDestructuring } from './modules/props-transformer'

// Handle ESM/CJS interop
const traverse =
  (traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport
const generate =
  (generateImport as unknown as { default?: typeof generateImport }).default ?? generateImport

/**
 * Vite plugin that transforms Solid.js component prop destructuring into reactive prop access.
 * This ensures that props remain reactive by using mergeProps and splitProps instead of
 * direct destructuring, which would break Solid's reactivity system.
 */
export default (): Plugin => {
  return {
    name: 'solid-destructure',
    enforce: 'pre',
    transform(code: string, id: string) {
      // Only process TypeScript/JavaScript files in components
      if (!/\.(tsx?|jsx?)$/.test(id)) {
        return null
      }

      // Skip node_modules
      if (id.includes('node_modules')) {
        return null
      }

      // Check if the file contains props destructuring
      if (!/\(\s*\{/.test(code)) {
        return null
      }

      try {
        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx']
        })

        const astNode = ast as unknown as t.Node
        traverse(astNode, {
          // Handle function declarations and arrow functions
          Function(path: NodePath<t.Function>) {
            const params = path.node.params
            if (params.length !== 1) return

            const firstParam = params[0]

            // Check if first param is an object pattern (destructuring)
            if (!t.isObjectPattern(firstParam)) return

            // Check if this is likely a component (returns JSX or has JSX in body)
            const isComponent = checkIfComponent(path)
            if (!isComponent) return

            transformPropsDestructuring(path, firstParam)
          }
        })

        const output = generate(astNode, {
          retainLines: true,
          compact: false
        })

        return {
          code: output.code,
          map: output.map
        }
      } catch (error) {
        // If parsing fails, return original code
        console.warn(`Failed to transform ${id}:`, error)
        return null
      }
    }
  }
}
