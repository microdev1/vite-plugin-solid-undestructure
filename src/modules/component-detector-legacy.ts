import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

export function checkIfComponentLegacy(path: NodePath<t.Function>): boolean {
  let hasJSX = false

  path.traverse({
    JSXElement() {
      hasJSX = true
    },
    JSXFragment() {
      hasJSX = true
    }
  })

  return hasJSX
}
