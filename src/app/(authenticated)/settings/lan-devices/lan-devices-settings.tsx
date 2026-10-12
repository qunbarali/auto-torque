'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Download, Info, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeLanHostAddress } from '@/lib/lan-connection'

export function LanDevicesSettings() {
  const [hostAddress, setHostAddress] = useState('')
  const [savedAddress, setSavedAddress] = useState('')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setHostAddress(window.location.origin)
  }, [])

  const normalized = normalizeLanHostAddress(hostAddress)
  const qrValue = normalized ? normalized : ''

  const saveQr = () => {
    const svg = document.querySelector('#auto-torque-lan-qr svg') as SVGSVGElement | null
    if (!svg || !qrValue) return
    const copy = svg.cloneNode(true) as SVGSVGElement
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'auto-torque-secondary-device.svg'
    link.click()
    URL.revokeObjectURL(url)
    toast.success('LAN connection QR code saved')
  }

  const copyAddress = async () => {
    if (!qrValue) return
    try {
      await navigator.clipboard.writeText(qrValue)
      toast.success('LAN address copied')
    } catch {
      toast.error('Could not copy the address. Select and copy it manually.')
    }
  }

  const applyAddress = () => {
    if (!normalized) {
      setInvalid(true)
      return
    }
    setHostAddress(normalized)
    setSavedAddress(normalized)
    setInvalid(false)
    toast.success('LAN connection address is ready')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Wifi className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Secondary devices on Wi-Fi</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Share this host address with another device so it opens the same Auto Torque server and database.
        </p>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lan-host-address">Main device LAN address</Label>
          <Input
            id="lan-host-address"
            value={hostAddress}
            onChange={(event) => {
              setHostAddress(event.target.value)
              setInvalid(false)
              setSavedAddress('')
            }}
            placeholder="http://192.168.1.20:3000"
            autoCapitalize="none"
            autoCorrect="off"
          />
          {invalid && (
            <p className="text-sm text-destructive">
              Enter a private LAN URL such as http://192.168.1.20:3000 or a .local hostname. Public internet hosts are not accepted.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Use the host computer's Wi-Fi IPv4 address, not localhost, when connecting a different device. LAN hosting must already be enabled on the main computer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={applyAddress}>Prepare QR code</Button>
            <Button type="button" variant="outline" onClick={copyAddress} disabled={!qrValue}>
              <Copy className="mr-2 h-4 w-4" /> Copy connection code
            </Button>
          </div>
        </div>

        {qrValue && (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-5 text-center text-slate-900">
            <div id="auto-torque-lan-qr">
              <QRCodeSVG value={qrValue} size={224} level="Q" includeMargin />
            </div>
            <p className="break-all text-sm font-medium">{qrValue}</p>
            <Button type="button" variant="outline" onClick={saveQr}>
              <Download className="mr-2 h-4 w-4" /> Save QR code
            </Button>
          </div>
        )}
        {savedAddress && (
          <p className="text-sm text-muted-foreground">QR code prepared for {savedAddress}.</p>
        )}
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-2 text-sm">
            <p className="font-medium">Important: this QR code connects; it does not grant account access.</p>
            <p>
              On the second device, import the saved QR image on the sign-in screen or enter the connection code. The device opens the main device's sign-in page, where the user must authenticate normally. No data is copied into the second device's browser database.
            </p>
            <p>
              Keep the main device running and use a trusted private Wi-Fi network. HTTP LAN traffic is not encrypted; do not use this over public Wi-Fi or expose port 3000 to the internet.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
