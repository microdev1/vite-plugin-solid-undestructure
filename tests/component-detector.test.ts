import { describe, test } from 'bun:test'
import { expectContains, transformOrThrow } from './helpers'

describe('component definition styles', () => {
  test('default export function declaration', () => {
    const code = `
export default function Button({ label }) {
  return <button>{label}</button>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.label')
  })

  test('default export arrow function', () => {
    const code = `
const Component = ({ title }) => {
  return <h1>{title}</h1>
}
export default Component
`
    const out = transformOrThrow(code)
    expectContains(out, '.title')
  })

  test('inline default export arrow function', () => {
    const code = `export default ({ message }) => <div>{message}</div>`
    const out = transformOrThrow(code)
    expectContains(out, '.message')
  })

  test('named export function declaration', () => {
    const code = `
export function Header({ title, subtitle }) {
  return <header><h1>{title}</h1><h2>{subtitle}</h2></header>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.title')
    expectContains(out, '.subtitle')
  })

  test('function expression assigned to const', () => {
    const code = `
const Card = function({ title }) {
  return <div>{title}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.title')
  })

  test('function expression assigned to let', () => {
    const code = `
let Widget = function({ value }) {
  return <span>{value}</span>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.value')
  })

  test('function expression assigned to var', () => {
    const code = `
var Panel = function({ content }) {
  return <div>{content}</div>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.content')
  })

  test('component with generic type parameter', () => {
    const code = `
function List<T>({ items }: { items: T[] }) {
  return <ul>{items.map(i => <li>{i}</li>)}</ul>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.items')
  })

  test('arrow function with generic type parameter', () => {
    const code = `
const Select = <T,>({ options, value }: { options: T[]; value: T }) => {
  return <select value={value}>{options}</select>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.options')
    expectContains(out, '.value')
  })

  test('mixed default and named exports', () => {
    const code = `
export function Header({ title }) {
  return <h1>{title}</h1>
}

export function Footer({ copyright }) {
  return <footer>{copyright}</footer>
}

export default function Main({ content }) {
  return <main>{content}</main>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.title')
    expectContains(out, '.copyright')
    expectContains(out, '.content')
  })

  test('immediately exported function declaration', () => {
    const code = `
export { Link }

function Link({ href, children }) {
  return <a href={href}>{children}</a>
}
`
    const out = transformOrThrow(code)
    expectContains(out, '.href')
    expectContains(out, '.children')
  })

  test('re-exported component', () => {
    const code = `
const Button = ({ label }) => <button>{label}</button>
export { Button }
`
    const out = transformOrThrow(code)
    expectContains(out, '.label')
  })
})
