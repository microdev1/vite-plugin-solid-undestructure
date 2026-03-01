import { checkIfComponent } from '@/modules/component-detector'
import generateImport from '@babel/generator'
import { parse } from '@babel/parser'
import traverseImport, { NodePath, Visitor } from '@babel/traverse'
import * as t from '@babel/types'

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
 * Transforms destructured component props into `props.X` member expressions
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

        transformDestructuredProps(path, firstParam, propMappings)
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

function transformDestructuredProps(
  path: NodePath<t.Function>,
  objectPattern: t.ObjectPattern,
  propMappings: Map<string, string>
) {
  const propsIdentifier = t.identifier('props')

  // Preserve TypeAnnotation from the destructured param
  if (objectPattern.typeAnnotation) {
    propsIdentifier.typeAnnotation = objectPattern.typeAnnotation
  }

  // Extract prop names and build mappings
  const localNames: string[] = []
  const localToKey = new Map<string, string>()
  const nestedPropPaths = new Map<string, string[]>()

  function processObjectPattern(pattern: t.ObjectPattern, parentPath: string[] = []) {
    for (const prop of pattern.properties) {
      if (t.isRestElement(prop)) {
        // Rest elements are not reactive — leave as-is
        continue
      }

      if (!t.isObjectProperty(prop)) continue

      let key: string | null = null
      if (t.isIdentifier(prop.key)) {
        key = prop.key.name
      } else if (t.isStringLiteral(prop.key)) {
        key = prop.key.value
      }
      if (!key) continue

      const currentPath = [...parentPath, key]

      // Handle nested object patterns
      if (t.isObjectPattern(prop.value)) {
        processObjectPattern(prop.value, currentPath)
        continue
      }

      // Extract local name
      let localName: string | null = null
      if (t.isIdentifier(prop.value)) {
        localName = prop.value.name
      } else if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)) {
        localName = prop.value.left.name
      }

      if (!localName) continue

      if (parentPath.length === 0) {
        localNames.push(localName)
        localToKey.set(localName, key)
        propMappings.set(localName, key)
      } else {
        nestedPropPaths.set(localName, currentPath)
        propMappings.set(localName, currentPath.join('.'))
      }
    }
  }

  processObjectPattern(objectPattern)

  // Replace parameter with `props` identifier
  path.node.params[0] = propsIdentifier

  // Replace all references to destructured prop names with props.X
  const bodyPath = path.get('body')
  if (Array.isArray(bodyPath)) return

  const visitor: Visitor = {
    Identifier(identPath) {
      const parent = identPath.parent
      // Skip property keys and computed member expression properties
      if (
        (t.isMemberExpression(parent) && parent.property === identPath.node && !parent.computed) ||
        (t.isObjectProperty(parent) && parent.key === identPath.node && !parent.computed)
      ) {
        return
      }

      // Skip binding positions (declarations)
      if (identPath.isBindingIdentifier()) return

      const idPath = identPath as NodePath<t.Identifier>
      const name = idPath.node.name

      // Handle nested property paths
      const propPath = nestedPropPaths.get(name)
      if (propPath) {
        let memberExpr: t.MemberExpression = t.memberExpression(
          t.identifier('props'),
          t.identifier(propPath[0])
        )
        for (let i = 1; i < propPath.length; i++) {
          memberExpr = t.memberExpression(memberExpr, t.identifier(propPath[i]))
        }
        idPath.replaceWith(memberExpr)
      } else if (localNames.includes(name)) {
        const propKey = localToKey.get(name) ?? name
        idPath.replaceWith(t.memberExpression(t.identifier('props'), t.identifier(propKey)))
      }
    }
  }
  bodyPath.traverse(visitor)
}
