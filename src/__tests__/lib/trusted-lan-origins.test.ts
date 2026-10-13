import { describe, expect, it } from 'vitest'
import { parseTrustedLanOrigins } from '@/lib/trusted-lan-origins'

describe('parseTrustedLanOrigins', () => {
  it('accepts exact HTTP and HTTPS origins and removes duplicates', () => {
    expect(
      parseTrustedLanOrigins(
        'http://192.168.1.20:3000, https://garage.example.test, http://192.168.1.20:3000/'
      )
    ).toEqual(['http://192.168.1.20:3000', 'https://garage.example.test'])
  })

  it('rejects paths, credentials, wildcards, queries, fragments and malformed values', () => {
    expect(
      parseTrustedLanOrigins(
        'http://192.168.1.20:3000/app, http://user:pass@192.168.1.20:3000, http://*.local:3000, http://192.168.1.20:3000/?x=1, http://192.168.1.20:3000/#frag, nope'
      )
    ).toEqual([])
  })

  it('returns an empty list for missing configuration', () => {
    expect(parseTrustedLanOrigins(undefined)).toEqual([])
    expect(parseTrustedLanOrigins('  ')).toEqual([])
  })
})
