import { NodePath, Visitor } from '@babel/traverse'
import * as t from '@babel/types'
import { ensureImports, MERGE_PROPS_ALIAS, SPLIT_PROPS_ALIAS } from './import-manager'

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

  // Extract properties from destructuring
  const properties = objectPattern.properties
  const propsToSplit: string[] = []
  const propNames: string[] = [] // Keep track of all prop names for renaming
  const localToKey = new Map<string, string>() // Map local name → original prop key
  const nestedPropPaths = new Map<string, string[]>() // Map nested local names to their paths
  const defaultValues: Record<string, t.Expression> = {}
  let hasRestElement = false
  let restIdentifier: t.Identifier | null = null

  // Helper function to process nested patterns
  function processObjectPattern(pattern: t.ObjectPattern, parentPath: string[] = []): void {
    pattern.properties.forEach((prop) => {
      if (t.isObjectProperty(prop)) {
        let key: string | null = null

        if (t.isIdentifier(prop.key)) {
          key = prop.key.name
        } else if (t.isStringLiteral(prop.key)) {
          key = prop.key.value
        }
        if (!key) return

        const currentPath = [...parentPath, key]

        // Handle nested object patterns
        if (t.isObjectPattern(prop.value)) {
          // For nested patterns, we still need to include the parent key in propsToSplit
          if (parentPath.length === 0) {
            propsToSplit.push(key)
          }
          processObjectPattern(prop.value, currentPath)
        } else {
          // Handle normal properties and assignment patterns
          let localName: string | null = null

          if (t.isIdentifier(prop.value)) {
            localName = prop.value.name
          } else if (t.isAssignmentPattern(prop.value)) {
            if (t.isIdentifier(prop.value.left)) {
              localName = prop.value.left.name
              // Check for default values
              if (t.isExpression(prop.value.right)) {
                // For nested properties, we can't use default values directly in mergeProps
                // They would need special handling
                if (parentPath.length === 0) {
                  defaultValues[key] = prop.value.right
                }
              }
            }
          }

          if (parentPath.length === 0) {
            // Top-level property
            propsToSplit.push(key)
            if (localName) {
              propNames.push(localName)
              localToKey.set(localName, key)
            } else {
              propNames.push(key)
              localToKey.set(key, key)
            }
          } else {
            // Nested property
            if (localName) {
              nestedPropPaths.set(localName, currentPath)
            } else {
              nestedPropPaths.set(key, currentPath)
            }
          }
        }
      }
    })
  }

  for (const prop of properties) {
    if (t.isRestElement(prop)) {
      hasRestElement = true
      if (t.isIdentifier(prop.argument)) {
        restIdentifier = prop.argument
      }
    } else if (t.isObjectProperty(prop)) {
      let key: string | null = null
      let localName: string | null = null

      if (t.isIdentifier(prop.key)) {
        key = prop.key.name
      } else if (t.isStringLiteral(prop.key)) {
        key = prop.key.value
      }
      if (!key) continue

      // Handle nested object patterns
      if (t.isObjectPattern(prop.value)) {
        propsToSplit.push(key)
        processObjectPattern(prop.value, [key])
        continue
      }

      // Handle renamed props (e.g., { propName: localName })
      if (t.isIdentifier(prop.value)) {
        localName = prop.value.name
      } else if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)) {
        localName = prop.value.left.name
      }

      propsToSplit.push(key)
      if (localName) {
        propNames.push(localName)
        localToKey.set(localName, key)
      } else {
        propNames.push(key)
        localToKey.set(key, key)
      }

      // Check for default values
      if (t.isAssignmentPattern(prop.value) && t.isExpression(prop.value.right)) {
        defaultValues[key] = prop.value.right
      }
    }
  }

  // Replace parameter with single props identifier
  path.node.params[0] = propsIdentifier

  // Create statements to add at the beginning of function body
  const newStatements: t.Statement[] = []

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

    if (needsSplitProps) {
      mergedIdentifier = path.scope.generateUidIdentifier('merged')
      newStatements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            mergedIdentifier,
            t.callExpression(t.identifier(MERGE_PROPS_ALIAS), [defaultsObject, propsIdentifier])
          )
        ])
      )
    } else {
      mergedIdentifier = path.scope.generateUidIdentifier('merged')
      newStatements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            mergedIdentifier,
            t.callExpression(t.identifier(MERGE_PROPS_ALIAS), [defaultsObject, propsIdentifier])
          )
        ])
      )
    }

    // Create splitProps call if needed (only to extract rest)
    if (needsSplitProps && restIdentifier) {
      // Don't destructure the props, just extract rest
      const splitArray = t.arrayPattern([
        null, // Skip the first element (the specific props)
        restIdentifier
      ])

      newStatements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            splitArray,
            t.callExpression(t.identifier(SPLIT_PROPS_ALIAS), [
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
      // Don't destructure the props, just extract rest
      const splitArray = t.arrayPattern([
        null, // Skip the first element (the specific props)
        restIdentifier
      ])

      newStatements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            splitArray,
            t.callExpression(t.identifier(SPLIT_PROPS_ALIAS), [
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
  // on the merged identifier
  const bodyPath = path.get('body')
  if (Array.isArray(bodyPath)) {
    return
  }

  const visitor: Visitor = {
    Identifier(identPath) {
      // Skip if this is a property key or if it's in a declaration position
      const parent = identPath.parent
      if (
        (t.isMemberExpression(parent) && parent.property === identPath.node && !parent.computed) ||
        (t.isObjectProperty(parent) && parent.key === identPath.node && !parent.computed)
      ) {
        return
      }

      // Save reference before type guard narrows identPath to never
      const idPath: NodePath<t.Identifier> = identPath
      const name = idPath.node.name

      // Skip if it's in a binding context (declaration)
      if (identPath.isBindingIdentifier()) {
        return
      }

      // Check if this is a nested property
      const propPath = nestedPropPaths.get(name)
      if (propPath) {
        // Build nested member expression: merged.nested.a
        let memberExpr: t.MemberExpression = t.memberExpression(
          t.identifier(mergedIdentifier.name),
          t.identifier(propPath[0])
        )
        for (let i = 1; i < propPath.length; i++) {
          memberExpr = t.memberExpression(memberExpr, t.identifier(propPath[i]))
        }
        idPath.replaceWith(memberExpr)
      } else if (propNames.includes(name)) {
        // Replace with member expression: merged.propKey
        const propKey = localToKey.get(name) ?? name
        idPath.replaceWith(
          t.memberExpression(t.identifier(mergedIdentifier.name), t.identifier(propKey))
        )
      }
    }
  }
  bodyPath.traverse(visitor)

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
