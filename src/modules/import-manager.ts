import type { NodePath } from '@babel/traverse'
import traverseImport from '@babel/traverse'
import * as t from '@babel/types'

const traverse =
  (traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport

/** Internal alias used for plugin-generated mergeProps calls */
export const MERGE_PROPS_ALIAS = '_$mergeProps'
/** Internal alias used for plugin-generated splitProps calls */
export const SPLIT_PROPS_ALIAS = '_$splitProps'

/**
 * Ensures the required Solid.js imports (mergeProps, splitProps) are present in the program.
 *
 * - Adds `import { mergeProps as _$mergeProps } from "solid-js"` (and/or splitProps)
 *   as separate declarations so namespace imports (`import * as X from 'solid-js'`) are
 *   never modified.
 * - If the user already imports `mergeProps` or `splitProps` from `solid-js`, those
 *   specifiers are removed (cleaning up the declaration if it becomes empty) and every
 *   reference in the program is renamed to the `_$` prefixed alias.
 */
export function ensureImports(
  programPath: NodePath<t.Program>,
  needsMergeProps: boolean,
  needsSplitProps: boolean
) {
  const namesOfInterest = new Map<string, string>() // 'mergeProps' -> alias, etc.
  if (needsMergeProps) namesOfInterest.set('mergeProps', MERGE_PROPS_ALIAS)
  if (needsSplitProps) namesOfInterest.set('splitProps', SPLIT_PROPS_ALIAS)

  if (namesOfInterest.size === 0) return

  // Track which names the user already imports so we can rename their references
  const userImportedNames = new Set<string>()

  // Collect namespace identifiers for solid-js (e.g. `import * as Solid from 'solid-js'`)
  const namespaceIds = new Set<string>()

  // 1. Remove mergeProps / splitProps specifiers from any existing `solid-js` import
  const body = programPath.node.body
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i]
    if (!t.isImportDeclaration(stmt) || stmt.source.value !== 'solid-js') continue

    // Collect namespace import identifiers
    for (const spec of stmt.specifiers) {
      if (t.isImportNamespaceSpecifier(spec) && t.isIdentifier(spec.local)) {
        namespaceIds.add(spec.local.name)
      }
    }

    stmt.specifiers = stmt.specifiers.filter((spec) => {
      if (
        t.isImportSpecifier(spec) &&
        t.isIdentifier(spec.imported) &&
        namesOfInterest.has(spec.imported.name)
      ) {
        userImportedNames.add(spec.imported.name)
        return false // remove this specifier
      }
      return true
    })

    // If the import declaration is now empty, remove it entirely
    if (stmt.specifiers.length === 0) {
      body.splice(i, 1)
    }
  }

  // 2. Rename every user reference of the removed imports → _$alias
  if (userImportedNames.size > 0) {
    const astNode = programPath.node as unknown as t.Node
    traverse(astNode, {
      Identifier(idPath: NodePath<t.Identifier>) {
        const name = idPath.node.name
        if (!userImportedNames.has(name)) return

        const alias = namesOfInterest.get(name)
        if (!alias) return

        // Skip binding positions (we already removed the import specifier)
        if ((idPath.isBindingIdentifier as () => boolean)()) return

        // Skip property keys
        const parent = idPath.parent
        if (
          (t.isMemberExpression(parent) && parent.property === idPath.node && !parent.computed) ||
          (t.isObjectProperty(parent) && parent.key === idPath.node && !parent.computed)
        ) {
          return
        }

        idPath.node.name = alias
      },
      noScope: true
    })
  }

  // 3. Replace namespace member accesses: e.g. Solid.mergeProps(...) → _$mergeProps(...)
  if (namespaceIds.size > 0) {
    const astNode = programPath.node as unknown as t.Node
    traverse(astNode, {
      MemberExpression(mePath: NodePath<t.MemberExpression>) {
        const node = mePath.node
        if (
          !node.computed &&
          t.isIdentifier(node.object) &&
          namespaceIds.has(node.object.name) &&
          t.isIdentifier(node.property) &&
          namesOfInterest.has(node.property.name)
        ) {
          const alias = namesOfInterest.get(node.property.name)
          if (alias) mePath.replaceWith(t.identifier(alias))
        }
      },
      noScope: true
    })
  }

  // 3. Add new import declarations from solid-js
  //    Find the last import declaration to insert after it (keeps imports grouped).
  let lastImportIndex = -1
  for (let i = 0; i < body.length; i++) {
    if (t.isImportDeclaration(body[i])) lastImportIndex = i
  }

  // Collect aliases already imported from solid-js so we don't duplicate
  const existingAliases = new Set<string>()
  for (const stmt of body) {
    if (t.isImportDeclaration(stmt) && stmt.source.value === 'solid-js') {
      for (const spec of stmt.specifiers) {
        if (t.isImportSpecifier(spec) && t.isIdentifier(spec.local)) {
          existingAliases.add(spec.local.name)
        }
      }
    }
  }

  const newImports: t.ImportDeclaration[] = []
  for (const [name, alias] of namesOfInterest) {
    if (existingAliases.has(alias)) continue
    newImports.push(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(alias), t.identifier(name))],
        t.stringLiteral('solid-js')
      )
    )
  }

  if (lastImportIndex >= 0) {
    body.splice(lastImportIndex + 1, 0, ...newImports)
  } else {
    body.unshift(...newImports)
  }
}
