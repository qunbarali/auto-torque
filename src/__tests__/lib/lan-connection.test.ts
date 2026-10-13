import { describe, expect, it } from 'vitest'
import { normalizeLanHostAddress } from '@/lib/lan-connection'

describe('normalizeLanHostAddress', () => {
  it('accepts common private IPv4 LAN addresses and strips a trailing slash', () => {
    expect(normalizeLanHostAddress('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000')
    expect(normalizeLanHostAddress('https://10.0.0.8')).toBe('https://10.0.0.8')
    expect(normalizeLanHostAddress('http://172.20.0.4:3000')).toBe('http://172.20.0.4:3000')
    expect(normalizeLanHostAddress('http://169.254.1.8:3000')).toBe('http://169.254.1.8:3000')
  })

  it('accepts .local hostnames and private IPv6 addresses', () => {
    expect(normalizeLanHostAddress('http://garage-pc.local:3000')).toBe('http://garage-pc.local:3000')
    expect(normalizeLanHostAddress('http://[fd12:3456::20]:3000')).toBe('http://[fd12:3456::20]:3000')
    expect(normalizeLanHostAddress('http://[fe80::20]:3000')).toBe('http://[fe80::20]:3000')
  })

  it('rejects loopback and public hosts for a different device', () => {
    expect(normalizeLanHostAddress('http://localhost:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://127.0.0.1:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://127.20.30.40:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://[::1]:3000')).toBeNull()
    expect(normalizeLanHostAddress('https://example.com')).toBeNull()
    expect(normalizeLanHostAddress('http://8.8.8.8:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://[2001:4860:4860::8888]:3000')).toBeNull()
  })

  it('rejects malformed or credential-bearing URLs', () => {
    expect(normalizeLanHostAddress('http://user:pass@192.168.1.20:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://@192.168.1.20:3000')).toBeNull()
    expect(normalizeLanHostAddress('http://192.168.1.20:3000/settings')).toBeNull()
    expect(normalizeLanHostAddress('http://192.168.1.20:3000/?next=/')).toBeNull()
    expect(normalizeLanHostAddress('javascript:alert(1)')).toBeNull()
    expect(normalizeLanHostAddress('')).toBeNull()
  })
})
