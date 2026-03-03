import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { traverseComponentProps } from '../../modules/babel'
import { extractPropsInfo, replacePropsReferences } from '../../modules/transform'

export type TransformResult = {
  code: string
  /** Maps original local name → prop key (e.g. "localName" → "propKey") */
  propMappings: Map<string, string>
  /** Maps original local name → full transformed access (e.g. "size" → "_props.size") */
  propAccess: Map<string, string>
  /** Maps generated rest identifier name → original rest name (e.g. "_props" → "props") */
  restMapping: { generated: string; original: string } | null
}

/**
 * Renames rest parameter references to the generated props identifier.
 * When there's a rest element (e.g. `...props`), the full transform
 * produces `const [, props] = splitProps(...)` keeping `props` defined.
 * For linting we skip splitProps, so rename rest references to the
 * generated identifier so that e.g. `props.class` → `_props.class`.
 * Only renames actual references to the rest parameter, not shadowed variables.
 */
function renameRestReferences(
  bodyPath: NodePath,
  restIdentifier: t.Identifier,
  propsIdName: string,
  parentPath: NodePath<t.Function>
): void {
  const restName = restIdentifier.name
  const restBinding = parentPath.scope.getBinding(restName)
  const restVisitor = {
    Identifier(identPath: NodePath<t.Identifier>) {
      const node = identPath.node
      const parent = identPath.parent
      if (node.name !== restName) return

      // Only rename if this identifier references the same binding as the rest parameter
      const currentBinding = identPath.scope.getBinding(restName)
      if (currentBinding !== restBinding) return

      if (identPath.isBindingIdentifier()) return
      if (t.isMemberExpression(parent) && parent.property === node && !parent.computed) {
        return
      }
      if (t.isObjectProperty(parent) && parent.key === node && !parent.computed) {
        return
      }
      node.name = propsIdName
    }
  }
  bodyPath.traverse(restVisitor)
}

/**
 * Transforms destructured component props into `_props.X` member expressions
 * for linting purposes. This is a minimal transformation — no mergeProps/splitProps/imports
 * are added, only the patterns the eslint-plugin-solid reactivity rule needs to see.
 */
export function transformForLinting(code: string): TransformResult | null {
  const result: TransformResult = {
    code: '',
    propMappings: new Map(),
    propAccess: new Map(),
    restMapping: null
  }

  try {
    const output = traverseComponentProps(code, (path, firstParam) => {
      // Extract info using shared utility
      const info = extractPropsInfo(firstParam)

      // If only a rest element with no other props, just rename the parameter
      const restOnly =
        info.hasRestElement && info.propsToSplit.length === 0 && info.localNames.length === 0
      if (restOnly && info.restIdentifier) {
        if (firstParam.typeAnnotation) {
          info.restIdentifier.typeAnnotation = firstParam.typeAnnotation
        }
        path.node.params[0] = info.restIdentifier
        return
      }

      // Generate a unique identifier to avoid conflicts with user-defined _props
      const propsIdentifier = path.scope.generateUidIdentifier('props')
      const propsIdName = propsIdentifier.name

      // Build propMappings and propAccess from extracted info
      for (const [localName, key] of info.localToKey) {
        result.propMappings.set(localName, key)
        result.propAccess.set(localName, `${propsIdName}.${key}`)
      }
      for (const [localName, propPath] of info.nestedPropPaths) {
        result.propMappings.set(localName, propPath.join('.'))
        result.propAccess.set(localName, `${propsIdName}.${propPath.join('.')}`)
      }

      // Preserve TypeAnnotation from the destructured param
      if (firstParam.typeAnnotation) {
        propsIdentifier.typeAnnotation = firstParam.typeAnnotation
      }
      path.node.params[0] = propsIdentifier

      // Replace references using shared utility
      const bodyPath = path.get('body')
      if (!Array.isArray(bodyPath)) {
        replacePropsReferences(bodyPath, propsIdName, info)

        if (info.restIdentifier) {
          result.restMapping = { generated: propsIdName, original: info.restIdentifier.name }
          renameRestReferences(bodyPath, info.restIdentifier, propsIdName, path)
        }
      }
    })

    if (!output) {
      return null
    }

    return { ...result, code: output.code }
  } catch (error) {
    console.warn('Failed to transform:', error)
    return null
  }
}
