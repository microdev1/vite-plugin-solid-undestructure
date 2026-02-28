import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

/**
 * Determines if a function is likely a Solid component by checking if it returns JSX.
 * Handles various JSX return patterns including conditional expressions, logical operators,
 * and arrow functions with expression bodies.
 */
export function checkIfComponent(path: NodePath<t.Function>): boolean {
  // Check if arrow function has JSX expression body
  if (t.isArrowFunctionExpression(path.node) && !t.isBlockStatement(path.node.body)) {
    return t.isJSXElement(path.node.body) || t.isJSXFragment(path.node.body)
  }

  // For functions with block statements, check if any return statement returns JSX
  let returnsJSX = false

  path.traverse({
    ReturnStatement(returnPath) {
      // Don't look into nested functions
      if (returnPath.getFunctionParent()?.node !== path.node) {
        return
      }

      const argument = returnPath.node.argument
      if (!argument) return

      // Check if the return value is JSX
      if (t.isJSXElement(argument) || t.isJSXFragment(argument)) {
        returnsJSX = true
        returnPath.stop()
      }

      // Check if it's a conditional or logical expression that returns JSX
      if (t.isConditionalExpression(argument)) {
        if (
          t.isJSXElement(argument.consequent) ||
          t.isJSXFragment(argument.consequent) ||
          t.isJSXElement(argument.alternate) ||
          t.isJSXFragment(argument.alternate)
        ) {
          returnsJSX = true
          returnPath.stop()
        }
      }

      // Check for logical expressions (e.g., condition && <Component />)
      if (t.isLogicalExpression(argument)) {
        if (
          t.isJSXElement(argument.left) ||
          t.isJSXFragment(argument.left) ||
          t.isJSXElement(argument.right) ||
          t.isJSXFragment(argument.right)
        ) {
          returnsJSX = true
          returnPath.stop()
        }
      }

      // Check for parenthesized JSX
      if (t.isParenthesizedExpression(argument)) {
        const inner = argument.expression
        if (t.isJSXElement(inner) || t.isJSXFragment(inner)) {
          returnsJSX = true
          returnPath.stop()
        }
      }
    }
  })

  return returnsJSX
}
