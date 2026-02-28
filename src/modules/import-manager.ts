import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

/**
 * Ensures the required Solid.js imports (mergeProps, splitProps) are present in the program.
 *
 * For each needed import, checks if a named import from 'solid-js' already exists.
 * If it does, nothing happens. If it doesn't, adds:
 *   import { mergeProps } from 'solid-js'
 *   import { splitProps } from 'solid-js'
 */
export function ensureImports(
  programPath: NodePath<t.Program>,
  needsMergeProps: boolean,
  needsSplitProps: boolean
) {
  const needed: string[] = []
  if (needsMergeProps) needed.push('mergeProps')
  if (needsSplitProps) needed.push('splitProps')

  if (needed.length === 0) return

  const body = programPath.node.body

  // Collect all named imports already present from 'solid-js'
  const existingImports = new Set<string>()
  for (const stmt of body) {
    if (!t.isImportDeclaration(stmt) || stmt.source.value !== 'solid-js') continue
    for (const spec of stmt.specifiers) {
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        existingImports.add(spec.imported.name)
      }
    }
  }

  // Determine which imports are missing
  const missing = needed.filter((name) => !existingImports.has(name))
  if (missing.length === 0) return

  // Find the last import declaration to insert after it
  let lastImportIndex = -1
  for (let i = 0; i < body.length; i++) {
    if (t.isImportDeclaration(body[i])) lastImportIndex = i
  }

  // Create new import declarations for each missing import
  const newImports = missing.map((name) =>
    t.importDeclaration(
      [t.importSpecifier(t.identifier(name), t.identifier(name))],
      t.stringLiteral('solid-js')
    )
  )

  if (lastImportIndex >= 0) {
    body.splice(lastImportIndex + 1, 0, ...newImports)
  } else {
    body.unshift(...newImports)
  }
}
