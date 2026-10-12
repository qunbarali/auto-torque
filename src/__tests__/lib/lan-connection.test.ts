import { describe, expect, it } from 'vitest'
import { normalizeLanHostAddress } from '@/lib/lan-connection'

describe('normalizeLanHostAddress', () => {
  it('accepts common private IPv4 LAN addresses and strips a trailing slash', () => {
    expect(normalizeLanHostAddress('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000')
    expect(normalizeLanHostAddress('https://10.0.0.8')).toBe('https://10.0.0.8')
  })

  it('accepts local hostnames for trusted local networks', () => {
    expect(normalizeLanHostAddress('http://garage-pc.local:3000')).toBe('http://garage-pc.local:3000')
    expect(normalizeLanHostAddress('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('rejects public hosts and malformed or credential-bearing URLs', () => {
    expect(normalizeLanHostAddress('https://example.com')).toBeNull()
    expect(normalizeLanHostAddress('http://8.8.8.8:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://user:pass@192.168.1.20:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://192.168.1.20:3000/settings')).toBeNull()
    expect(normalizeLanHostAddress('javascript:alert(1)')).toBeNull()
    expect(normalizeLanHostAddress('')).toBeNull()
  })
})
