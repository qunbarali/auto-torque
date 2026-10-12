'use client'

import Image from 'next/image'
import { useHasCustomLogo } from './auth-logo-provider'

export function AuthLogo({ alt }: { alt: string }) {
  const hasCustomLogo = useHasCustomLogo()

  if (hasCustomLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/api/public/logo" alt={alt} className="h-11 w-auto" />
    )
  }

  return (
    <Image
      src="/auto_torque_app_logo.png"
      alt={alt}
      width={220}
      height={98}
      className="h-14 w-auto"
      priority
    />
  )
}
