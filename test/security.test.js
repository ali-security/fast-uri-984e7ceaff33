'use strict'

const test = require('tape')
const fastURI = require('..')

test('parse marks malformed authority and port inputs as errors', (t) => {
  const malformedCases = [
    {
      input: 'http://[::1]foo',
      expectedError: 'URI path must start with "/" when authority is present.'
    },
    {
      input: 'http://[::1]:80abc/path',
      expectedError: 'URI path must start with "/" when authority is present.'
    },
    {
      input: 'http://example.com:80abc/path',
      expectedError: 'URI path must start with "/" when authority is present.'
    },
    {
      input: 'http://[::1]:65536',
      expectedError: 'URI port is malformed.'
    }
  ]

  t.plan(malformedCases.length)

  malformedCases.forEach(({ input, expectedError }) => {
    t.equal(fastURI.parse(input).error, expectedError, input)
  })
})

test('normalize does not canonicalize malformed URLs into different valid URLs', (t) => {
  const malformedCases = [
    'http://[::1]foo',
    'http://[::1]:80abc/path',
    'http://example.com:80abc/path',
    'http://[::1]:65536'
  ]

  t.plan(malformedCases.length)

  malformedCases.forEach((input) => {
    t.equal(fastURI.normalize(input), input, input)
  })
})

test('equal returns false when either side is malformed', (t) => {
  const malformedPairs = [
    ['http://[::1]foo', 'http://[::1]/foo'],
    ['http://[::1]:80abc/path', 'http://[::1]/abc/path'],
    ['http://example.com:80abc/path', 'http://example.com/abc/path'],
    ['http://[::1]:65536', 'http://[::1]:65536/']
  ]

  t.plan(malformedPairs.length)

  malformedPairs.forEach(([left, right]) => {
    t.equal(fastURI.equal(left, right), false, `${left} != ${right}`)
  })
})

test('normalize preserves encoded authority delimiters in host', (t) => {
  const cases = [
    ['http://trusted.com%40evil.com/', 'http://trusted.com%40evil.com/'],
    ['http://example.com%3A8080/', 'http://example.com%3A8080/'],
    ['http://example.com%2Fevil.com/path', 'http://example.com%2Fevil.com/path'],
    ['http://example.com%23fragment/path', 'http://example.com%23fragment/path'],
    ['http://example.com%3Fq=evil/path', 'http://example.com%3Fq=evil/path'],
    ['http://user%3Apass%40evil.com/', 'http://user%3Apass%40evil.com/'],
    ['http://user@trusted.com%40evil.com/', 'http://user@trusted.com%40evil.com/'],
    ['https://trusted.com%40evil.com/', 'https://trusted.com%40evil.com/'],
    ['ws://trusted.com%40evil.com/chat', 'ws://trusted.com%40evil.com/chat'],
    ['wss://trusted.com%40evil.com/chat', 'wss://trusted.com%40evil.com/chat']
  ]

  t.plan(cases.length)

  cases.forEach(([input, expected]) => {
    t.equal(fastURI.normalize(input), expected, input)
  })
})

test('parse preserves encoded authority delimiters in host', (t) => {
  const cases = [
    ['http://trusted.com%40evil.com/', 'trusted.com%40evil.com'],
    ['http://example.com%3A8080/', 'example.com%3A8080'],
    ['http://user%3Apass%40evil.com/', 'user%3Apass%40evil.com']
  ]

  t.plan(cases.length)

  cases.forEach(([input, expectedHost]) => {
    t.equal(fastURI.parse(input).host, expectedHost, input)
  })
})

test('equal returns false when encoded delimiters differ from live delimiters', (t) => {
  const pairs = [
    ['http://trusted.com%40evil.com/', 'http://trusted.com@evil.com/'],
    ['http://example.com%3A8080/', 'http://example.com:8080/']
  ]

  t.plan(pairs.length)

  pairs.forEach(([left, right]) => {
    t.equal(fastURI.equal(left, right, {}), false, `${left} != ${right}`)
  })
})

test('resolve preserves encoded authority delimiters', (t) => {
  const result = fastURI.resolve('http://base.com/', '//trusted.com%40evil.com/path')
  const parsed = fastURI.parse(result)

  t.plan(1)
  t.notEqual(parsed.host, 'evil.com', '//trusted.com%40evil.com/path')
})

test('resolve keeps encoded authority delimiters when resolving a relative path', (t) => {
  const result = fastURI.resolve('http://trusted.com%40evil.com/a/b', '../c')

  t.plan(2)
  t.equal(result, 'http://trusted.com%40evil.com/c', 'resolved reference')
  t.equal(fastURI.parse(result).host, 'trusted.com%40evil.com', 'host is not promoted to evil.com')
})

test('normalize is stable when applied twice to an encoded authority', (t) => {
  const once = fastURI.normalize('http://trusted.com%40evil.com/')

  t.plan(2)
  t.equal(once, 'http://trusted.com%40evil.com/', 'first pass')
  t.equal(fastURI.normalize(once), once, 'second pass')
})

test('serialize escapes authority delimiters in host field', (t) => {
  const result = fastURI.serialize({ scheme: 'http', host: 'trusted.com@evil.com', path: '/' })
  const parsed = fastURI.parse(result)

  t.plan(1)
  t.notEqual(parsed.host, 'evil.com', 'host: trusted.com@evil.com')
})

test('normalize does not double-decode %2540 into a live @', (t) => {
  const result = fastURI.normalize('http://trusted.com%2540evil.com/')
  const parsed = fastURI.parse(result)

  t.plan(1)
  t.notEqual(parsed.host, 'trusted.com@evil.com', 'http://trusted.com%2540evil.com/')
})

test('equal keeps the remaining encoded gen-delims distinct from live ones', (t) => {
  const pairs = [
    ['http://example.com%2Fevil.com/path', 'http://example.com/evil.com/path'],
    ['http://example.com%3Fevil/path', 'http://example.com/path?evil'],
    ['http://example.com%23evil/path', 'http://example.com/path#evil']
  ]

  t.plan(pairs.length)

  pairs.forEach(([left, right]) => {
    t.equal(fastURI.equal(left, right, {}), false, `${left} != ${right}`)
  })
})

test('parse keeps every encoded gen-delim escaped in the host', (t) => {
  const cases = [
    ['http://example.com%2Fevil.com/path', 'example.com%2Fevil.com'],
    ['http://example.com%3Fevil/path', 'example.com%3Fevil'],
    ['http://example.com%23evil/path', 'example.com%23evil']
  ]

  t.plan(cases.length)

  cases.forEach(([input, expectedHost]) => {
    t.equal(fastURI.parse(input).host, expectedHost, input)
  })
})

test('parse canonicalises IDN / Unicode hosts to their ASCII form', (t) => {
  const cases = [
    {
      input: 'http://127。0。0。1/',
      expectedHost: '127.0.0.1',
      description: 'full-width ideographic stops as octet separators'
    },
    {
      input: 'http://ｅxample.com/',
      expectedHost: 'example.com',
      description: 'fullwidth e as first letter'
    },
    {
      input: 'http://納豆.example.org/',
      expectedHost: 'xn--99zt52a.example.org',
      description: 'CJK label requiring punycode'
    }
  ]

  t.plan(cases.length * 2)

  cases.forEach(({ input, expectedHost, description }) => {
    const parsed = fastURI.parse(input)
    t.notOk(parsed.error, `parse should not set error: ${description}`)
    t.equal(parsed.host, expectedHost, `host canonicalised to ASCII: ${description}`)
  })
})

test('resolve canonicalises IDN / Unicode hosts to their ASCII form', (t) => {
  const resolved = fastURI.resolve('http://127。0。0。1/a/b', '../c', { domainHost: true })

  t.plan(2)
  t.equal(resolved.indexOf('。'), -1, 'resolved reference keeps no Unicode host')
  t.equal(fastURI.parse(resolved).host, '127.0.0.1', 'host canonicalised to ASCII through resolve')
})

test('parse keeps percent-encoded authority delimiters out of the canonicalised host', (t) => {
  const cases = [
    'http://trusted.com%40evil.com/',
    'http://example.com%3A8080/',
    'http://trusted.com%2540evil.com/'
  ]

  t.plan(cases.length * 2)

  cases.forEach((input) => {
    const parsed = fastURI.parse(input)
    t.notEqual(parsed.host, 'evil.com', input)
    t.equal(parsed.host.indexOf('@'), -1, `no live @ in host: ${input}`)
  })
})
