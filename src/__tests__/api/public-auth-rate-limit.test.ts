import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authPostMock, rateLimitMock, dbMock, logAuditMock } = vi.hoisted(() => ({
  authPostMock: vi.fn(),
  rateLimitMock: vi.fn(),
  dbMock: {
    user: { findFirst: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
  },
  logAuditMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: {} }))
vi.mock('@/lib/demo', () => ({ isDemoMode: false }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }))
vi.mock('@/lib/db', () => ({ db: dbMock }))
vi.mock('@/lib/audit', () => ({ logAudit: logAuditMock }))
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ POST: authPostMock, GET: vi.fn() }),
}))

import { POST } from '@/app/api/public/auth/[...all]/route'

function request(path = '/api/public/auth/sign-in/email') {
  return new Request(`https://shop.example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.test', password: 'not-a-real-password' }),
  })
}

describe('public authentication rate limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitMock.mockReturnValue(null)
    authPostMock.mockResolvedValue(new Response('ok', { status: 200 }))
  })

  it('uses network identity rather than a caller-supplied bearer token', async () => {
    const req = request()
    await POST(req)

    expect(rateLimitMock).toHaveBeenCalledWith(req, {
      limit: 10,
      windowMs: 60_000,
      anonymous: true,
    })
    expect(authPostMock).toHaveBeenCalledOnce()
  })

  it('does not call the authentication handler after the limit is reached', async () => {
    rateLimitMock.mockReturnValue(new Response('limited', { status: 429 }))
    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(authPostMock).not.toHaveBeenCalled()
  })
})
