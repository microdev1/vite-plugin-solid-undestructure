import { NodePath, Visitor } from '@babel/traverse'
import * as t from '@babel/types'

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
