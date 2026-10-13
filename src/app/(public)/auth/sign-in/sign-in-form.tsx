'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signIn, authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Fingerprint, Loader2, PlayCircle, XCircle } from 'lucide-react'
import { AuthLogo } from '@/components/auth-logo'
import { normalizeLanHostAddress } from '@/lib/lan-connection'
import { Wifi, ImageUp } from 'lucide-react'

const DEMO_EMAIL = 'demo@torqvoice.com'
const DEMO_PASSWORD = 'demo'

function SignInFormInner({
  registrationDisabled,
  demoMode = false,
}: {
  registrationDisabled: boolean
  demoMode?: boolean
}) {
  const t = useTranslations('auth.signIn')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [secondaryMode, setSecondaryMode] = useState(false)
  const [secondaryCode, setSecondaryCode] = useState('')
  const [secondaryError, setSecondaryError] = useState('')
  const [secondaryBusy, setSecondaryBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        if (result.error.status === 429) {
          setError(t('errors.tooManyAttempts'))
        } else {
          setError(result.error.message || t('errors.invalidCredentials'))
        }
        // Clear password and refocus so the retry is one keystroke away
        setPassword('')
        passwordRef.current?.focus()
      } else {
        const redirect = searchParams.get('redirect') || '/'
        router.push(redirect)
        router.refresh()
      }
    } catch {
      setError(tc('errors.unexpected'))
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSignIn = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await signIn.email({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      if (result.error) {
        setError(result.error.message || tc('errors.unexpected'))
        setLoading(false)
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError(tc('errors.unexpected'))
      setLoading(false)
    }
  }

  // Auto-sign-in when arriving with ?demo=1 (deep-link from marketing site)
  const autoTriggered = useRef(false)
  useEffect(() => {
    if (!demoMode || autoTriggered.current) return
    if (searchParams.get('demo') !== '1') return
    autoTriggered.current = true
    void handleDemoSignIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, searchParams])

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        // User dismissed the passkey prompt — not an error state
        if ('code' in result.error && result.error.code === 'AUTH_CANCELLED') return
        const msg = typeof result.error.message === 'string' ? result.error.message : ''
        setError(msg || t('errors.passkeyFailed'))
      } else {
        const redirect = searchParams.get('redirect') || '/'
        router.push(redirect)
        router.refresh()
      }
    } catch {
      setError(t('errors.passkeyFailed'))
    } finally {
      setPasskeyLoading(false)
    }
  }

  const connectSecondary = (rawValue: string) => {
    const address = normalizeLanHostAddress(rawValue)
    if (!address) {
      setSecondaryError('Enter a valid private LAN address, for example http://192.168.1.20:3000.')
      return
    }
    setSecondaryError('')
    // Redirect to the main device itself. Authentication and all data operations
    // then happen on the host; this browser does not create a local data store.
    window.location.assign(`${address}/auth/sign-in?secondary=1`)
  }

  const importSecondaryQr = async (file?: File) => {
    if (!file) return
    setSecondaryBusy(true)
    setSecondaryError('')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const reader = new Html5Qrcode('secondary-qr-reader')
      const decoded = await reader.scanFile(file, false)
      await reader.clear()
      setSecondaryCode(decoded)
      connectSecondary(decoded)
    } catch {
      setSecondaryError('Could not read that QR image. Import the saved Auto Torque LAN QR code or enter the connection code manually.')
    } finally {
      setSecondaryBusy(false)
    }
  }

  return (
    <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2">
          <AuthLogo alt={tc('brandName')} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            <p className="mt-1 text-xs">
              {t('forgotPassword')}{' '}
              <Link href="/auth/forgot-password" className="font-medium underline">
                {t('resetPasswordCta')}
              </Link>
            </p>
          </div>
        </div>
      )}

      {demoMode && (
        <div className="mb-6">
          <Button
            type="button"
            className="h-11 w-full"
            disabled={loading}
            onClick={handleDemoSignIn}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Try the demo
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Or sign in manually with <code className="rounded bg-muted px-1">{DEMO_EMAIL}</code> /{' '}
            <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>
          </p>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{tc('form.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={tc('form.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username webauthn"
            className="h-11 bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{tc('form.password')}</Label>
          <Input
            ref={passwordRef}
            id="password"
            type="password"
            placeholder={t('passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 bg-background/50"
          />
          <div className="flex justify-end">
            <Link
              href="/auth/forgot-password"
              className="text-xs text-muted-foreground hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {tc('buttons.signIn')}
        </Button>
      </form>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background/50 px-2 text-muted-foreground">{t('or')}</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={passkeyLoading}
        onClick={handlePasskeySignIn}
      >
        {passkeyLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        {t('passkey')}
      </Button>

      <div className="mt-4">
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full"
          onClick={() => {
            setSecondaryMode((value) => !value)
            setSecondaryError('')
          }}
        >
          <Wifi className="mr-2 h-4 w-4" />
          Login as secondary device
        </Button>
        {secondaryMode && (
          <div className="mt-3 space-y-3 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Connect to the main device on the same private Wi-Fi. The main device stores the data; this device opens its sign-in page.
            </p>
            <div className="space-y-2">
              <Label htmlFor="secondary-connection-code">Connection code / main device address</Label>
              <Input
                id="secondary-connection-code"
                value={secondaryCode}
                onChange={(event) => setSecondaryCode(event.target.value)}
                placeholder="http://192.168.1.20:3000"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <Button type="button" className="w-full" onClick={() => connectSecondary(secondaryCode)}>
                Connect to main device
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary-qr-image">Or import saved QR image</Label>
              <Input
                id="secondary-qr-image"
                type="file"
                accept="image/*"
                disabled={secondaryBusy}
                onChange={(event) => {
                  void importSecondaryQr(event.target.files?.[0])
                  event.currentTarget.value = ''
                }}
              />
              <div id="secondary-qr-reader" className="hidden" />
              {secondaryBusy && <p className="text-xs text-muted-foreground">Reading QR image…</p>}
            </div>
            {secondaryError && <p role="alert" className="text-sm text-destructive">{secondaryError}</p>}
            <p className="text-xs text-muted-foreground">
              The QR code is a connection address, not a password or login token. You must still sign in on the main device. Use only a trusted private Wi-Fi network.
            </p>
          </div>
        )}
      </div>

      {!registrationDisabled && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link
            href={`/auth/sign-up${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : ''}`}
            className="font-medium text-primary hover:underline"
          >
            {t('createOne')}
          </Link>
        </p>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t('termsAgreement')}{' '}
        <Link href="/terms" target="_blank" className="text-primary hover:underline">
          {tc('terms.termsOfService')}
        </Link>
      </p>
    </div>
  )
}

export function SignInForm({
  registrationDisabled,
  demoMode = false,
}: {
  registrationDisabled: boolean
  demoMode?: boolean
}) {
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <Suspense>
        <SignInFormInner registrationDisabled={registrationDisabled} demoMode={demoMode} />
      </Suspense>
    </div>
  )
}
