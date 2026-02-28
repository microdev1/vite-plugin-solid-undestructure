import { expect } from 'bun:test'
import { Plugin } from 'vite'
import solidPropsTransform from '../src'

/** Run the plugin's transform and return the output code (or null) */
export function transform(code: string, id = 'Component.tsx'): string | null {
  const plugin = solidPropsTransform() as Plugin & {
    transform(code: string, id: string): { code: string } | null
  }
  const result = plugin.transform(code, id)
  return result?.code ?? null
}

/** Calls transform and asserts the result is non-null */
export function transformOrThrow(code: string, id = 'Component.tsx'): string {
  const out = transform(code, id)
  if (out == null) throw new Error('Expected transform to produce output')
  return out
}

/** Wraps expect().toContain() with actual output logged on failure */
export function expectContains(actual: string, substring: string): void {
  try {
    expect(actual).toContain(substring)
  } catch (e) {
    console.error(`\n--- ACTUAL OUTPUT ---\n${actual}\n--- END ---\n`)
    throw e
  }
}

/** Wraps expect().not.toContain() with actual output logged on failure */
export function expectNotContains(actual: string, substring: string): void {
  try {
    expect(actual).not.toContain(substring)
  } catch (e) {
    console.error(`\n--- ACTUAL OUTPUT ---\n${actual}\n--- END ---\n`)
    throw e
  }
}

/** Wraps expect().toMatch() with actual output logged on failure */
export function expectMatches(actual: string, pattern: RegExp): void {
  try {
    expect(actual).toMatch(pattern)
  } catch (e) {
    console.error(`\n--- ACTUAL OUTPUT ---\n${actual}\n--- END ---\n`)
    throw e
  }
}

/** Wraps expect().not.toMatch() with actual output logged on failure */
export function expectNotMatches(actual: string, pattern: RegExp): void {
  try {
    expect(actual).not.toMatch(pattern)
  } catch (e) {
    console.error(`\n--- ACTUAL OUTPUT ---\n${actual}\n--- END ---\n`)
    throw e
  }
}
