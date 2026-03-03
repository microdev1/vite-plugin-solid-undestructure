import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { ensureImports } from '../../modules/import-manager'
import { extractPropsInfo, replacePropsReferences } from '../../modules/transform'

/**
 * Transforms destructured props parameters into proper Solid.js reactive props access.
 * Converts:
 *   function Component({ prop1, prop2 }) { ... }
 * Into:
 *   function Component(_props) {
 *     const _merged = mergeProps(defaults, _props)
 *     const [, rest] = splitProps(_merged, ['prop1', 'prop2'])
 *     // References to prop1, prop2 become _merged.prop1, _merged.prop2
 *   }
 */
export function transformPropsDestructuring(
  path: NodePath<t.Function>,
  objectPattern: t.ObjectPattern
) {
  const propsIdentifier = path.scope.generateUidIdentifier('props')
  const info = extractPropsInfo(objectPattern)
  const { propsToSplit, defaultValues, hasRestElement, restIdentifier } = info

  // Create statements to add at the beginning of function body
  const newStatements: t.Statement[] = []

  // If only a rest element with no other props or defaults, just rename the parameter
  const restOnly =
    hasRestElement && propsToSplit.length === 0 && Object.keys(defaultValues).length === 0
  if (restOnly && restIdentifier) {
    path.node.params[0] = restIdentifier
    return
  }

  // Replace parameter with single props identifier
  path.node.params[0] = propsIdentifier

  // Add import for mergeProps and splitProps if needed
  const needsMergeProps = Object.keys(defaultValues).length > 0
  const needsSplitProps = propsToSplit.length > 0 || hasRestElement

  // Determine which identifier will hold the merged props (for accessing properties later)
  let mergedIdentifier: t.Identifier

  // Create mergeProps call if there are default values
  if (needsMergeProps) {
    const defaultsObject = t.objectExpression(
      Object.entries(defaultValues).map(([key, value]) =>
        t.objectProperty(t.identifier(key), value)
      )
    )

    mergedIdentifier = path.scope.generateUidIdentifier('merged')
    newStatements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          mergedIdentifier,
          t.callExpression(t.identifier('mergeProps'), [defaultsObject, propsIdentifier])
        )
      ])
    )

    // Create splitProps call if needed (only to extract rest)
    if (needsSplitProps && restIdentifier) {
      const splitArray = t.arrayPattern([
        null, // Skip the first element (the specific props)
        restIdentifier
      ])

      newStatements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            splitArray,
            t.callExpression(t.identifier('splitProps'), [
              mergedIdentifier,
              t.arrayExpression(propsToSplit.map((prop) => t.stringLiteral(prop)))
            ])
          )
        ])
      )
    }
  } else if (needsSplitProps) {
    // Only splitProps needed (no defaults)
    mergedIdentifier = propsIdentifier

    if (restIdentifier) {
      const splitArray = t.arrayPattern([
        null, // Skip the first element (the specific props)
        restIdentifier
      ])

      newStatements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            splitArray,
            t.callExpression(t.identifier('splitProps'), [
              propsIdentifier,
              t.arrayExpression(propsToSplit.map((prop) => t.stringLiteral(prop)))
            ])
          )
        ])
      )
    }
  } else {
    // No transformations needed
    mergedIdentifier = propsIdentifier
  }

  // Replace all references to destructured variables with property accesses
  const bodyPath = path.get('body')
  if (Array.isArray(bodyPath)) {
    return
  }

  replacePropsReferences(bodyPath, mergedIdentifier.name, info)

  // Insert statements at the beginning of function body
  if (t.isBlockStatement(path.node.body)) {
    path.node.body.body.unshift(...newStatements)
  } else if (t.isExpression(path.node.body)) {
    // Arrow function with expression body - need to convert to block statement
    const returnStatement = t.returnStatement(path.node.body)
    path.node.body = t.blockStatement([...newStatements, returnStatement])
  }

  // Ensure imports are added to the file
  const program = path.findParent((p) => p.isProgram())
  if (program) {
    ensureImports(program as NodePath<t.Program>, needsMergeProps, needsSplitProps)
  }
}
