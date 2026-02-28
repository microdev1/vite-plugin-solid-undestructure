import { describe, test } from 'bun:test'
import { expectContains, expectMatches, transformOrThrow } from './helpers'

describe('import-manager: mergeProps import', () => {
  test('adds mergeProps import when no solid-js import exists', () => {
    const code = `
function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectMatches(out, /import\s*\{\s*mergeProps\s*\}\s*from\s*["']solid-js["']/)
  })

  test('does not duplicate mergeProps import when already imported from solid-js', () => {
    const code = `
import { mergeProps } from 'solid-js'

function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'mergeProps')
  })

  test('does not duplicate mergeProps when imported alongside other specifiers', () => {
    const code = `
import { createSignal, mergeProps } from 'solid-js'

function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'createSignal')
    expectContains(out, 'mergeProps')
  })
})

describe('import-manager: splitProps import', () => {
  test('adds splitProps import when no solid-js import exists', () => {
    const code = `
function Card({ title, ...props }) {
  return <div {...props}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expectMatches(out, /import\s*\{\s*splitProps\s*\}\s*from\s*["']solid-js["']/)
  })

  test('does not duplicate splitProps import when already imported from solid-js', () => {
    const code = `
import { splitProps } from 'solid-js'

function Card({ title, ...props }) {
  return <div {...props}><h2>{title}</h2></div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'splitProps')
  })
})

describe('import-manager: both mergeProps and splitProps', () => {
  test('adds both imports when neither exists', () => {
    const code = `
function Widget({ label = 'hi', ...props }) {
  return <div {...props}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expectMatches(out, /import\s*\{\s*mergeProps\s*\}\s*from\s*["']solid-js["']/)
    expectMatches(out, /import\s*\{\s*splitProps\s*\}\s*from\s*["']solid-js["']/)
  })

  test('adds only missing import when one already exists', () => {
    const code = `
import { mergeProps } from 'solid-js'

function Widget({ label = 'hi', ...props }) {
  return <div {...props}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'mergeProps')
    expectMatches(out, /import\s*\{\s*splitProps\s*\}\s*from\s*["']solid-js["']/)
  })

  test('adds neither import when both already exist', () => {
    const code = `
import { mergeProps, splitProps } from 'solid-js'

function Widget({ label = 'hi', ...props }) {
  return <div {...props}>{label}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'mergeProps')
    expectContains(out, 'splitProps')
  })
})

describe('import-manager: placement', () => {
  test('new import is placed after existing imports', () => {
    const code = `
import { createSignal } from 'solid-js'

function Button({ label = 'Click me' }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, 'createSignal')
    expectMatches(out, /import\s*\{\s*mergeProps\s*\}\s*from\s*["']solid-js["']/)
  })
})
