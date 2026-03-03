import { NodePath, Visitor } from '@babel/traverse'
import * as t from '@babel/types'
import { ensureImports } from './import-manager'

// ─── Shared types ────────────────────────────────────────────────────────────

export type PropsInfo = {
  /** All top-level local variable names from the destructuring */
  localNames: string[]
  /** Map local name → original prop key */
  localToKey: Map<string, string>
  /** Map nested local names → their access paths */
  nestedPropPaths: Map<string, string[]>
  /** All top-level prop keys (for splitProps) */
  propsToSplit: string[]
  /** Prop key → default value expression */
  defaultValues: Record<string, t.Expression>
  /** Whether a rest element (...rest) was found */
  hasRestElement: boolean
  /** The rest element identifier, if any */
  restIdentifier: t.Identifier | null
}

// ─── Shared extraction ──────────────────────────────────────────────────────

/**
 * Walks an ObjectPattern and extracts all prop metadata:
 * local names, key mappings, nested paths, defaults, and rest info.
 */
export function extractPropsInfo(objectPattern: t.ObjectPattern): PropsInfo {
  const localNames: string[] = []
  const localToKey = new Map<string, string>()
  const nestedPropPaths = new Map<string, string[]>()
  const propsToSplit: string[] = []
  const defaultValues: Record<string, t.Expression> = {}
  let hasRestElement = false
  let restIdentifier: t.Identifier | null = null

  function processNested(pattern: t.ObjectPattern, parentPath: string[]): void {
    for (const prop of pattern.properties) {
      if (t.isRestElement(prop) || !t.isObjectProperty(prop)) continue

      let key: string | null = null
      if (t.isIdentifier(prop.key)) key = prop.key.name
      else if (t.isStringLiteral(prop.key)) key = prop.key.value
      if (!key) continue

      const currentPath = [...parentPath, key]

      if (t.isObjectPattern(prop.value)) {
        processNested(prop.value, currentPath)
        continue
      }

      let localName: string | null = null
      if (t.isIdentifier(prop.value)) localName = prop.value.name
      else if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)) {
        localName = prop.value.left.name
      }
      if (!localName) continue

      nestedPropPaths.set(localName, currentPath)
    }
  }

  for (const prop of objectPattern.properties) {
    if (t.isRestElement(prop)) {
      hasRestElement = true
      if (t.isIdentifier(prop.argument)) restIdentifier = prop.argument
      continue
    }

    if (!t.isObjectProperty(prop)) continue

    let key: string | null = null
    if (t.isIdentifier(prop.key)) key = prop.key.name
    else if (t.isStringLiteral(prop.key)) key = prop.key.value
    if (!key) continue

    if (t.isObjectPattern(prop.value)) {
      propsToSplit.push(key)
      processNested(prop.value, [key])
      continue
    }

    let localName: string | null = null
    if (t.isIdentifier(prop.value)) localName = prop.value.name
    else if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)) {
      localName = prop.value.left.name
    }

    propsToSplit.push(key)
    if (localName) {
      localNames.push(localName)
      localToKey.set(localName, key)
    } else {
      localNames.push(key)
      localToKey.set(key, key)
    }

    if (t.isAssignmentPattern(prop.value) && t.isExpression(prop.value.right)) {
      defaultValues[key] = prop.value.right
    }
  }

  return {
    localNames,
    localToKey,
    nestedPropPaths,
    propsToSplit,
    defaultValues,
    hasRestElement,
    restIdentifier
  }
}

// ─── Shared reference replacement ───────────────────────────────────────────

/**
 * Traverses the function body and replaces identifier references to destructured
 * props with member expressions (e.g., `name` → `_props.name`).
 */
export function replacePropsReferences(
  bodyPath: NodePath,
  accessIdentifierName: string,
  info: PropsInfo
): void {
  const { localNames, localToKey, nestedPropPaths } = info

  const visitor: Visitor = {
    Identifier(identPath) {
      const parent = identPath.parent
      if (
        (t.isMemberExpression(parent) && parent.property === identPath.node && !parent.computed) ||
        (t.isObjectProperty(parent) && parent.key === identPath.node && !parent.computed)
      ) {
        return
      }

      if (identPath.isBindingIdentifier()) return

      const idPath = identPath as NodePath<t.Identifier>
      const name = idPath.node.name

      const propPath = nestedPropPaths.get(name)
      if (propPath) {
        let memberExpr: t.MemberExpression = t.memberExpression(
          t.identifier(accessIdentifierName),
          t.identifier(propPath[0])
        )
        for (let i = 1; i < propPath.length; i++) {
          memberExpr = t.memberExpression(memberExpr, t.identifier(propPath[i]))
        }
        idPath.replaceWith(memberExpr)
      } else if (localNames.includes(name)) {
        const propKey = localToKey.get(name) ?? name
        idPath.replaceWith(
          t.memberExpression(t.identifier(accessIdentifierName), t.identifier(propKey))
        )
      }
    }
  }
  bodyPath.traverse(visitor)
}

// ─── Full transform (Vite plugin) ───────────────────────────────────────────

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
  const restOnly = hasRestElement && propsToSplit.length === 0 && Object.keys(defaultValues).length === 0
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
