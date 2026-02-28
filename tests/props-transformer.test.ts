import { describe, expect, test } from 'bun:test'
import {
  expectContains,
  expectMatches,
  expectNotContains,
  expectNotMatches,
  transform,
  transformOrThrow
} from './helpers'

// ─── Basic Destructuring ─────────────────────────────────────────────────────

describe('basic destructuring', () => {
  test('replaces destructured props with member expressions', () => {
    const code = `
function Greeting({ name, age }) {
  return <div>Hello {name}, age {age}</div>
}
`
    const out = transformOrThrow(code)
    // Should reference _props.name and _props.age (the generated identifier)
    expectContains(out, '.name')
    expectContains(out, '.age')
    // The destructuring pattern should be gone
    expectNotMatches(out, /function Greeting\(\s*\{/)
  })

  test('works with arrow function components', () => {
    const code = `const Greeting = ({ name }) => <div>{name}</div>`
    const out = transformOrThrow(code)
    expectContains(out, '.name')
  })

  test('works with exported arrow function', () => {
    const code = `export const Greeting = ({ name }) => { return <div>{name}</div> }`
    const out = transformOrThrow(code)
    expectContains(out, '.name')
  })
})

// ─── Default Values ──────────────────────────────────────────────────────────

describe('default values', () => {
  test('wraps defaults in _$mergeProps', () => {
    const code = `
function Button({ label = 'Click me', disabled = false }) {
  return <button disabled={disabled}>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '_$mergeProps')
    expectContains(out, "'Click me'")
    expectContains(out, 'false')
  })

  test('adds _$mergeProps import from solid-js', () => {
    const code = `
function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'from "solid-js"')
    expectContains(out, '_$mergeProps')
  })

  test('does not modify existing solid-js import', () => {
    const code = `
import { createSignal } from 'solid-js'

function Counter({ count = 0 }) {
  return <span>{count}</span>
}
`
    const out = transformOrThrow(code)
    // createSignal stays in its own import from solid-js
    expectContains(out, 'createSignal')
    expectMatches(out, /import\s*\{[^}]*createSignal[^}]*\}\s*from\s*["']solid-js["']/)
    // _$mergeProps comes from solid-js separately
    expectContains(out, '_$mergeProps')
    expectContains(out, 'from "solid-js"')
  })
})

// ─── Rest Properties ─────────────────────────────────────────────────────────

describe('rest properties', () => {
  test('uses _$splitProps for rest spread', () => {
    const code = `
function Card({ title, ...rest }) {
  return <div {...rest}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '_$splitProps')
    expectContains(out, '"title"')
    expectContains(out, 'rest')
  })

  test('adds _$splitProps import from solid-js', () => {
    const code = `
function Card({ title, ...rest }) {
  return <div {...rest}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '_$splitProps')
    expectContains(out, 'from "solid-js"')
  })
})

// ─── Nested Destructuring ────────────────────────────────────────────────────

describe('nested destructuring', () => {
  test('converts nested patterns to member expressions', () => {
    const code = `
function Info({ nested: { a, b } }) {
  return <div>{a} - {b}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.nested.a')
    expectContains(out, '.nested.b')
  })
})

// ─── Combined Features ──────────────────────────────────────────────────────

describe('combined features', () => {
  test('defaults + rest produces _$mergeProps AND _$splitProps', () => {
    const code = `
function Widget({ label = 'hi', ...rest }) {
  return <div {...rest}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '_$mergeProps')
    expectContains(out, '_$splitProps')
  })

  test('TestComponent: defaults + nested + rest', () => {
    const code = `
import { For } from 'solid-js'

function TestComponent({
  name = 'World',
  count = 0,
  avatar = '/default.png',
  items,
  nested: { a, b },
  ...rest
}: {
  name?: string
  count?: number
  avatar?: string
  items: string[]
  nested: { a: number; b: number }
  class?: string
  onClick?: () => void
}) {
  return (
    <div {...rest}>
      <p>{rest.class}</p>
      <pre>{a}</pre>
      <pre>{b}</pre>
      <img src={avatar} alt={name} />
      <h1>Hello {name}!</h1>
      <p>Count: {count}</p>
      <ul>
        <For each={items}>{(item) => <li>{item}</li>}</For>
      </ul>
    </div>
  )
}

export default TestComponent
`
    const out = transformOrThrow(code)

    // _$mergeProps for defaults
    expectContains(out, '_$mergeProps')
    expectContains(out, "'World'")
    expectContains(out, "'/default.png'")

    // _$splitProps for rest
    expectContains(out, '_$splitProps')
    expectContains(out, '"name"')
    expectContains(out, '"count"')
    expectContains(out, '"avatar"')
    expectContains(out, '"items"')
    expectContains(out, '"nested"')

    // Nested member expressions
    expectContains(out, '.nested.a')
    expectContains(out, '.nested.b')

    // rest should still be used directly
    expectContains(out, '{...rest}')
    expectContains(out, 'rest.class')

    // For stays in solid-js import, _$mergeProps/_$splitProps come from solid-js
    expectContains(out, 'For')
    expectContains(out, '_$mergeProps')
    expectContains(out, '_$splitProps')
    expectContains(out, 'from "solid-js"')

    // No leftover destructuring in function signature
    expectNotMatches(out, /function TestComponent\(\s*\{/)
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('renamed props are replaced correctly', () => {
    const code = `
function Tag({ label: text }) {
  return <span>{text}</span>
}
`
    const out = transformOrThrow(code)
    // 'text' should be replaced with a member expression accessing 'label' (the original prop key)
    expectContains(out, '.label')
    expectNotContains(out, '.text')
  })

  test('multiple components in one file are all transformed', () => {
    const code = `
function A({ x }) { return <div>{x}</div> }
function B({ y }) { return <span>{y}</span> }
`
    const out = transformOrThrow(code)
    expectContains(out, '.x')
    expectContains(out, '.y')
  })

  test('multiple components do not duplicate solid-js imports', () => {
    const code = `
function A({ x, ...rest }) { return <div {...rest}>{x}</div> }
function B({ y, ...rest }) { return <span {...rest}>{y}</span> }
`
    const out = transformOrThrow(code)
    const splitImports = out.match(
      /import\s*\{\s*splitProps as _\$splitProps\s*\}\s*from\s*["']solid-js\/web["']/g
    )
    expect(splitImports).toHaveLength(1)
  })

  test('preserves non-component functions unchanged', () => {
    const code = `
function helper({ a, b }) { return a + b }
function Comp({ name }) { return <div>{name}</div> }
`
    const out = transformOrThrow(code)
    // Comp should be transformed
    expectContains(out, '.name')
    // helper keeps destructuring (not a component)
    expectContains(out, 'function helper({')
  })

  test('handles .jsx extension', () => {
    const code = `function Foo({ a }) { return <div>{a}</div> }`
    const out = transformOrThrow(code, 'Foo.jsx')
    expectContains(out, '.a')
  })

  test('handles .ts extension with JSX pragma', () => {
    // .ts files are processed too — the regex matches tsx? and jsx?
    const code = `function Foo({ a }) { return <div>{a}</div> }`
    const out = transform(code, 'Foo.ts')
    // Plugin tries to parse but .ts with JSX may fail gracefully
    // Either transformed or null is acceptable
    expect(out === null || out.includes('.a')).toBe(true)
  })
})
