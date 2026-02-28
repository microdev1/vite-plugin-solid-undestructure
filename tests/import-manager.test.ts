import { describe, test } from 'bun:test'
import { expectContains, expectMatches, expectNotMatches, transformOrThrow } from './helpers'

// ─── Namespace / Star Imports ────────────────────────────────────────────────

describe('namespace and star imports', () => {
  test('namespace import is left unchanged, mergeProps added from solid-js', () => {
    const code = `
import * as Solid from 'solid-js'

function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    // Namespace import must remain untouched
    expectContains(out, 'import * as Solid from')
    // mergeProps should come from solid-js with _$ prefix
    expectContains(out, '_$mergeProps')
    expectContains(out, 'from "solid-js"')
    // Should NOT produce an invalid combined import
    expectNotMatches(out, /import \* as Solid,/)
  })

  test('namespace import is left unchanged, splitProps added from solid-js', () => {
    const code = `
import * as Solid from 'solid-js'

function Card({ title, ...rest }) {
  return <div {...rest}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'import * as Solid from')
    expectContains(out, '_$splitProps')
    expectContains(out, 'from "solid-js"')
    expectNotMatches(out, /import \* as Solid,/)
  })

  test('namespace import with both mergeProps and splitProps needed', () => {
    const code = `
import * as Solid from 'solid-js'

function Widget({ label = 'hi', ...rest }) {
  return <div {...rest}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'import * as Solid from')
    expectContains(out, '_$mergeProps')
    expectContains(out, '_$splitProps')
    expectContains(out, 'from "solid-js"')
    expectNotMatches(out, /import \* as Solid,/)
  })
})

// ─── Existing mergeProps/splitProps imports ───────────────────────────────────

describe('existing mergeProps/splitProps imports', () => {
  test('removes existing mergeProps import from solid-js and uses _$ prefix', () => {
    const code = `
import { mergeProps } from 'solid-js'

function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    // Should use _$mergeProps in generated code
    expectContains(out, '_$mergeProps')
    expectContains(out, 'from "solid-js"')
    // The old bare import of mergeProps from solid-js should be gone
    expectNotMatches(out, /import\s*\{\s*mergeProps\s*\}\s*from\s*["']solid-js["']/)
  })

  test('removes existing splitProps import from solid-js and uses _$ prefix', () => {
    const code = `
import { splitProps } from 'solid-js'

function Card({ title, ...rest }) {
  return <div {...rest}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '_$splitProps')
    expectContains(out, 'from "solid-js"')
    expectNotMatches(out, /import\s*\{\s*splitProps\s*\}\s*from\s*["']solid-js["']/)
  })

  test('keeps other specifiers when removing mergeProps from solid-js import', () => {
    const code = `
import { createSignal, mergeProps } from 'solid-js'

function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    // createSignal should still be imported from solid-js
    expectContains(out, 'createSignal')
    expectMatches(out, /import\s*\{[^}]*createSignal[^}]*\}\s*from\s*["']solid-js["']/)
    // mergeProps should be removed from solid-js import
    expectNotMatches(out, /import\s*\{[^}]*\bmergeProps\b[^}]*\}\s*from\s*["']solid-js["']/)
    // _$mergeProps should come from solid-js
    expectContains(out, '_$mergeProps')
    expectContains(out, 'from "solid-js"')
  })

  test('renames user references of mergeProps to _$mergeProps', () => {
    const code = `
import { createSignal, mergeProps } from 'solid-js'

function Button({ label = 'Click me' }) {
  const merged = mergeProps({ x: 1 }, { y: 2 })
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    // User's explicit mergeProps call should be renamed to _$mergeProps
    expectMatches(out, /_\$mergeProps\(\{\s*x:\s*1/)
  })

  test('renames user references of splitProps to _$splitProps', () => {
    const code = `
import { splitProps } from 'solid-js'

function Card({ title, ...rest }) {
  const [local, others] = splitProps(rest, ['extra'])
  return <div {...others}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    // User's explicit splitProps call should be renamed to _$splitProps
    expectMatches(out, /_\$splitProps\(rest/)
  })

  test('no existing import creates new imports from solid-js', () => {
    const code = `
function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '_$mergeProps')
    expectContains(out, 'from "solid-js"')
  })

  test('imports from solid-js use aliased names', () => {
    const code = `
function Widget({ label = 'hi', ...rest }) {
  return <div {...rest}>{label}</div>
}
`
    const out = transformOrThrow(code)
    // Both imports should be from solid-js
    expectMatches(
      out,
      /import\s*\{\s*mergeProps as _\$mergeProps\s*\}\s*from\s*["']solid-js\/web["']/
    )
    expectMatches(
      out,
      /import\s*\{\s*splitProps as _\$splitProps\s*\}\s*from\s*["']solid-js\/web["']/
    )
  })
})

// ─── Namespace member access (Solid.mergeProps / Solid.splitProps) ────────────

describe('namespace member access replacement', () => {
  test('replaces Solid.mergeProps with _$mergeProps in user code', () => {
    const code = `
import * as Solid from 'solid-js'

function Button({ label = 'Click me' }) {
  const merged = Solid.mergeProps({ x: 1 }, { y: 2 })
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    // Solid.mergeProps should become _$mergeProps
    expectMatches(out, /_\$mergeProps\(\{\s*x:\s*1/)
    // Namespace import should remain
    expectContains(out, 'import * as Solid from')
  })

  test('replaces Solid.splitProps with _$splitProps in user code', () => {
    const code = `
import * as Solid from 'solid-js'

function Card({ title, ...rest }) {
  const [local, others] = Solid.splitProps(rest, ['extra'])
  return <div {...others}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    // Solid.splitProps should become _$splitProps
    expectMatches(out, /_\$splitProps\(rest/)
    expectContains(out, 'import * as Solid from')
  })

  test('replaces both Solid.mergeProps and Solid.splitProps', () => {
    const code = `
import * as Solid from 'solid-js'

function Widget({ label = 'hi', ...rest }) {
  const m = Solid.mergeProps({ a: 1 }, { b: 2 })
  const [l, o] = Solid.splitProps(rest, ['extra'])
  return <div {...o}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expectMatches(out, /_\$mergeProps\(\{\s*a:\s*1/)
    expectMatches(out, /_\$splitProps\(rest/)
    expectContains(out, 'import * as Solid from')
  })

  test('does not replace other Solid.* member accesses', () => {
    const code = `
import * as Solid from 'solid-js'

function Counter({ count = 0 }) {
  const [val, setVal] = Solid.createSignal(count)
  return <span>{val()}</span>
}
`
    const out = transformOrThrow(code)
    // createSignal should NOT be replaced
    expectContains(out, 'Solid.createSignal')
  })

  test('handles arbitrary namespace name (not just "Solid")', () => {
    const code = `
import * as S from 'solid-js'

function Button({ label = 'Click me' }) {
  const merged = S.mergeProps({ x: 1 }, { y: 2 })
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectMatches(out, /_\$mergeProps\(\{\s*x:\s*1/)
    expectContains(out, 'import * as S from')
  })
})
