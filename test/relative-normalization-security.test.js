'use strict'

const test = require('tape')
const fastURI = require('..')

const ABSOLUTE_BASES = [
  'http://h/p/q/r',
  'http://h/',
  'foo://h/a/b/',
  'http://h/p/q/'
]

const RELATIVE_BASES = ['', 'base', 'relative/base']

test('normalize keeps the meaning of relative-path references', (t) => {
  const cases = [
    ['a/../b', 'b'],
    ['x/..', './'],
    ['../x', '../x'],
    ['./../x', '../x'],
    ['a/b/../../..', '..'],
    ['a/./b', 'a/b'],
    ['a/b/..', 'a/'],
    ['.', './'],
    ['..', '..'],
    ['../', '../'],
    ['../../a/./b/../c', '../../a/c'],
    ['a//..', 'a/'],
    ['a/../b?q#f', 'b?q#f']
  ]
  for (const [input, expected] of cases) {
    t.equal(fastURI.normalize(input), expected, `${input} -> ${expected}`)
  }
  t.end()
})

test('normalize never turns a relative-path reference into a root or network path', (t) => {
  t.equal(fastURI.normalize('.//x'), './/x', 'leading empty segment is kept behind "."')
  t.equal(fastURI.normalize('a/..//x'), './/x', 'collapsed prefix does not expose "//"')
  t.equal(fastURI.parse(fastURI.normalize('a/..//x')).host, undefined, 'no authority is introduced')
  t.equal(fastURI.normalize('./a:b'), 'a%3Ab', 'exposed colon is still escaped')
  t.equal(fastURI.parse(fastURI.normalize('./a:b')).scheme, undefined, 'no scheme is introduced')
  t.end()
})

test('normalize keeps the existing behavior for root-relative and absolute paths', (t) => {
  t.equal(fastURI.normalize('/a/../b'), '/b')
  t.equal(fastURI.normalize('/../x'), '/x')
  t.equal(fastURI.normalize('http://h/a/../../b'), 'http://h/b')
  t.end()
})

test('equal does not alias relative references with different targets', (t) => {
  t.equal(fastURI.equal('../x', 'x'), false)
  t.equal(fastURI.equal('a/../b', '/b'), false)
  t.equal(fastURI.equal('x/..', '/'), false)
  t.equal(fastURI.equal('a/../b', 'b'), true)
  t.end()
})

test('resolving a normalized relative reference matches resolving the original', (t) => {
  for (const base of [...ABSOLUTE_BASES, ...RELATIVE_BASES]) {
    for (const ref of ['a/../b', 'x/..', '../x', './../x', 'a/b/../../..', '.', '..', './/x']) {
      t.equal(
        fastURI.resolve(base, fastURI.normalize(ref)),
        fastURI.resolve(base, ref),
        `${base} + ${ref}`
      )
    }
  }
  t.equal(fastURI.resolve('http://h/p/q/r', fastURI.normalize('a/../b')), 'http://h/p/q/b')
  t.equal(fastURI.resolve('http://h/p/q/r', fastURI.normalize('../x')), 'http://h/p/x')
  t.end()
})

test('resolving against a relative base keeps unresolvable ".." segments', (t) => {
  t.equal(fastURI.resolve('', '../x'), '../x')
  t.equal(fastURI.resolve('base', '../x'), '../x')
  t.equal(fastURI.resolve('relative/base', '../../x'), '../x')
  t.equal(fastURI.resolve('', 'x/..'), './')
  t.equal(fastURI.resolve('relative/base', 'a/../b'), 'relative/b')
  t.equal(fastURI.resolve('/root/base', '../../x'), '/x', 'root-relative base still clamps at the root')
  t.end()
})

test('property: normalization of relative references is resolution-preserving and idempotent', (t) => {
  const segments = ['a', 'b', '.', '..', '']
  // Deterministic linear congruential generator so failures are reproducible.
  let seed = 0x5ec02
  const next = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return Math.floor((seed / 2147483648) * n)
  }

  let failures = 0
  let checked = 0
  for (let i = 0; i < 4000; i++) {
    const length = 1 + next(6)
    const parts = []
    for (let j = 0; j < length; j++) parts.push(segments[next(segments.length)])
    const ref = parts.join('/')
    // Only relative-path references: empty refs and refs starting with "/"
    // are not affected by this change ("//" would also introduce an authority).
    if (ref === '' || ref[0] === '/') continue

    checked++
    const normalized = fastURI.normalize(ref)
    if (fastURI.normalize(normalized) !== normalized) {
      failures++
      t.fail(`not idempotent: ${ref} -> ${normalized} -> ${fastURI.normalize(normalized)}`)
    }
    // 3.x's removeDotSegments (used by resolve) collapses a trailing "//" to
    // "/" (fixed in v4 by #185), so resolve() itself is inconsistent for
    // these paths regardless of normalization.
    if (normalized.endsWith('//')) continue
    for (const base of ABSOLUTE_BASES) {
      const expected = fastURI.resolve(base, ref)
      const actual = fastURI.resolve(base, normalized)
      if (actual !== expected) {
        failures++
        t.fail(`${base} + ${ref}: normalized ${normalized} resolves to ${actual}, expected ${expected}`)
      }
    }
  }

  t.ok(checked > 1000, `checked ${checked} relative references`)
  t.equal(failures, 0, 'no relative reference changed meaning')
  t.end()
})

test('suffix serialization preserves relative path meaning', (t) => {
  // 3.0.x parses a suffix reference as authority + path, so an authority-less
  // suffix reference reaches serialize() as components. The scheme is not
  // emitted for a suffix reference, so the path is a relative reference.
  const options = { reference: 'suffix' }
  for (const [input, expected] of [
    ['a/../b', 'b'],
    ['x/..', './'],
    ['../x', '../x'],
    ['a/../a:b', './a:b']
  ]) {
    t.equal(fastURI.serialize({ scheme: 'x', path: input }, options), expected, `${input} -> ${expected}`)
  }
  t.end()
})

test('serialize keeps relative-path meaning when no scheme or authority is emitted', (t) => {
  t.equal(fastURI.serialize({ path: '../x' }), '../x')
  t.equal(fastURI.serialize({ path: 'x/..' }), './')
  t.equal(fastURI.serialize({ scheme: '', path: '../x' }), '../x', 'an empty scheme is not emitted')
  t.equal(fastURI.serialize({ scheme: 'x', path: '../x' }), 'x:x', 'a scheme-bearing path is still resolved per RFC 3986')
  t.end()
})

test('normalize does not promote a colon-first relative reference to a scheme (skipEscape)', (t) => {
  // RFC 3986 section 4.2: a first path segment containing ":" must stay
  // protected by a leading "./", or it is mistaken for a scheme. Collapsing
  // the dot segments in front of it must not expose the colon.
  const options = { skipEscape: true }
  for (const ref of ['./a:b', 'a/../a:b']) {
    const normalized = fastURI.normalize(ref, options)
    t.equal(fastURI.parse(normalized).scheme, undefined, `${ref} -> ${normalized} has no scheme`)
    for (const base of ABSOLUTE_BASES) {
      t.equal(
        fastURI.resolve(base, normalized, options),
        fastURI.resolve(base, ref, options),
        `${base} + ${ref}`
      )
    }
  }
  t.end()
})

const SCHEME_PAYLOADS = ['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox(1)']

test('suffix serialization percent-encodes a first-segment colon (GHSA-333x-w4r6-6crp)', (t) => {
  // A suffix reference never emits its scheme, so an authority-less path is a
  // path-noscheme: a raw ":" in its first segment would reparse as a scheme.
  for (const options of [{ reference: 'suffix' }, { reference: 'suffix', absolutePath: true }]) {
    for (const path of SCHEME_PAYLOADS) {
      const serialized = fastURI.serialize({ scheme: 'x', path }, options)
      t.equal(fastURI.parse(serialized).scheme, undefined, `${JSON.stringify(options)}: ${path} -> ${serialized} has no scheme`)
    }
  }
  t.equal(fastURI.serialize({ scheme: 'x', path: 'javascript:alert(1)' }, { reference: 'suffix' }), 'javascript%3Aalert%281%29')
  t.equal(fastURI.serialize({ scheme: 'x', path: 'javascript:alert(1)' }, { reference: 'suffix', absolutePath: true }), 'javascript%3Aalert%281%29')
  t.equal(fastURI.serialize({ scheme: 'x', path: 'a%3Ab' }, { reference: 'suffix' }), 'a%3Ab', 'an encoded colon is not decoded into the first segment')
  t.equal(fastURI.serialize({ scheme: 'x', path: 'a/b:c' }, { reference: 'suffix' }), 'a/b:c', 'a colon after the first segment is kept')
  t.equal(fastURI.serialize({ scheme: 'x', path: 'a:b' }), 'x:a:b', 'an emitted scheme keeps the colon')
  t.equal(fastURI.serialize({ scheme: 'x', host: 'h', path: '/a:b' }, { reference: 'suffix' }), 'h/a:b', 'an emitted authority keeps the colon')
  t.end()
})

test('serialize encodes a first-segment colon whenever no scheme or authority is emitted', (t) => {
  // skipEscape (used by resolve()) and absolutePath leave the path raw and
  // skip dot-segment removal, so the "./" guard never runs for them.
  for (const path of SCHEME_PAYLOADS) {
    for (const cmpts of [{ path }, { scheme: 'x', path }]) {
      const serialized = fastURI.serialize(cmpts, { reference: cmpts.scheme ? 'suffix' : undefined, skipEscape: true, absolutePath: true })
      t.equal(fastURI.parse(serialized).scheme, undefined, `skipEscape: ${path} -> ${serialized} has no scheme`)
    }
  }
  t.equal(fastURI.serialize({ path: 'javascript:alert(1)' }, { skipEscape: true, absolutePath: true }), 'javascript%3Aalert(1)')
  t.equal(fastURI.serialize({ scheme: 'x', path: 'javascript:alert(1)' }, { reference: 'suffix', skipEscape: true, absolutePath: true }), 'javascript%3Aalert(1)')

  // An empty or null scheme is not emitted either.
  t.equal(fastURI.serialize({ scheme: '', path: 'javascript:alert(1)' }, { absolutePath: true }), 'javascript%3Aalert%281%29')
  t.equal(fastURI.serialize({ scheme: null, path: 'javascript:alert(1)' }, { absolutePath: true }), 'javascript%3Aalert%281%29')

  // A scheme handler that writes its own path (urn sets skipEscape).
  const urn = { scheme: 'urn', nid: 'javascript', nss: 'alert(1)' }
  t.equal(fastURI.serialize(urn, { reference: 'suffix', absolutePath: true }), 'javascript%3Aalert(1)')
  t.equal(fastURI.parse(fastURI.serialize(urn, { reference: 'suffix' })).scheme, undefined)
  t.end()
})

test('normalize and equal do not promote an unemitted-scheme path to a scheme', (t) => {
  const options = { absolutePath: true }
  const components = { scheme: '', path: 'javascript:alert(1)' }
  t.equal(fastURI.normalize(components, options).scheme, undefined, 'normalize keeps a relative reference')
  t.equal(fastURI.equal('javascript:alert(1)', components, options), false, 'equal does not alias it with a javascript: URI')
  t.equal(
    fastURI.normalize({ scheme: 'x', path: 'javascript:alert(1)' }, { reference: 'suffix', absolutePath: true }).scheme,
    undefined,
    'normalize keeps a suffix reference scheme-less'
  )
  t.end()
})

test('resolve keeps a colon-first relative result from reparsing as a scheme', (t) => {
  for (const options of [undefined, { absolutePath: true }]) {
    for (const base of RELATIVE_BASES) {
      for (const path of SCHEME_PAYLOADS) {
        const resolved = fastURI.resolve(base, './' + path, options)
        t.equal(fastURI.parse(resolved).scheme, undefined, `${base} + ./${path} -> ${resolved} has no scheme`)
      }
    }
  }
  t.end()
})
