import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const headers = { 'X-Auto-Torque-Service': 'auto-torque' }

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' }, { headers })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503, headers })
  }
}
