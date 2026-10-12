import { getAppDataDir } from '@/lib/app-data-path'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { resolveInvoicePrefix, toSafeDate } from '@/lib/invoice-utils'
import { mkdir, writeFile, stat, readdir, rm } from 'fs/promises'
import { readFileSync } from 'fs'
import path from 'path'
import os from 'os'
import { BSON } from 'bson'
import JSZip from 'jszip'
import { resolveWithinDir } from '@/lib/safe-path'

export const maxDuration = 300

type LegacyDoc = Record<string, any>

function values(doc: LegacyDoc, ...keys: string[]) {
  for (const key of keys) {
    if (doc[key] !== undefined && doc[key] !== null && doc[key] !== '') return doc[key]
    const actual = Object.keys(doc).find((k) => k.toLowerCase() === key.toLowerCase())
    if (actual && doc[actual] !== undefined && doc[actual] !== null && doc[actual] !== '') return doc[actual]
  }
  return undefined
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value && '$numberDecimal' in value) return String((value as any).$numberDecimal)
  return null
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number.parseFloat(asText(value) ?? '')
  return Number.isFinite(n) ? n : fallback
}

function asInt(value: unknown, fallback = 0): number {
  return Math.round(asNumber(value, fallback))
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  const text = asText(value)?.toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes') return true
  if (text === 'false' || text === '0' || text === 'no') return false
  return fallback
}

function legacyId(doc: LegacyDoc): string | null {
  const id = values(doc, '_id', 'Id', 'ID', 'id')
  if (id === undefined || id === null) return null
  if (typeof id === 'object' && id && '$oid' in id) return String((id as any).$oid)
  return String(id)
}

function parseDecimal(value: unknown): number {
  return asNumber(value, 0)
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv', txt: 'text/plain', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return mimeMap[ext || ''] || 'application/octet-stream'
}

function extractBsonDocuments(buffer: Buffer): LegacyDoc[] {
  const docs: LegacyDoc[] = []
  const seen = new Set<string>()
  // LiteDB stores BSON documents in pages. Scanning BSON length-prefixed records
  // is intentionally tolerant because old backups can contain free-space and
  // deleted pages. De-duplication prevents the same document being imported twice.
  for (let offset = 0; offset <= buffer.length - 5; offset++) {
    const size = buffer.readInt32LE(offset)
    if (size < 5 || size > 16 * 1024 * 1024 || offset + size > buffer.length) continue
    if (buffer[offset + size - 1] !== 0) continue
    try {
      const doc = BSON.deserialize(buffer.subarray(offset, offset + size)) as LegacyDoc
      if (!doc || typeof doc !== 'object' || Object.keys(doc).length === 0) continue
      const id = legacyId(doc)
      const signature = id ? `${id}:${JSON.stringify(doc).slice(0, 500)}` : JSON.stringify(doc)
      if (seen.has(signature)) continue
      seen.add(signature)
      docs.push(doc)
    } catch {
      // Not BSON at this offset.
    }
  }
  return docs
}

function classify(doc: LegacyDoc): string {
  const keys = Object.keys(doc).map((k) => k.toLowerCase())
  const has = (...names: string[]) => names.some((n) => keys.includes(n.toLowerCase()))
  if (has('vehicleid') && (has('date', 'servicedate') || has('cost', 'totalcost')) && has('description', 'title')) return 'serviceRecord'
  if (has('vehicleid') && has('notetext', 'note', 'content')) return 'note'
  if (has('vehicleid') && has('gallons', 'litres', 'liters') && has('pricepergallon', 'priceperlitr', 'totalcost')) return 'fuelLog'
  if (has('vehicleid') && has('duedate', 'duemileage') && has('title', 'description')) return 'reminder'
  if (has('partnumber', 'sku', 'productkey') && has('quantity', 'instockquantity', 'stock')) return 'inventory'
  if (has('make', 'model') && has('year')) return 'vehicle'
  if (has('customername', 'ownername', 'firstname', 'lastname') && !has('make', 'model')) return 'customer'
  if (has('template', 'inspectiontemplate') || has('inspectionitems')) return 'inspection'
  if (has('quote', 'quotenumber')) return 'quote'
  if (has('vehicleid') && has('odometer', 'endingodometer', 'odometerreading')) return 'odometer'
  if (has('vehicleid') && has('tax', 'taxamount')) return 'tax'
  if (has('vehicleid') && has('progress', 'priority') && has('description', 'cost')) return 'plan'
  if (has('vehicleid') && has('supply', 'supplies', 'requisition')) return 'supply'
  if (has('vehicleid') && has('equipment', 'equipped')) return 'equipment'
  if (has('fieldname', 'fieldtype', 'extrafields')) return 'customField'
  return 'legacy'
}

function findVehicleId(doc: LegacyDoc): string | null {
  const value = values(doc, 'VehicleId', 'vehicleId', 'CarId', 'carId')
  return value === undefined || value === null ? null : String(value)
}

async function resolveBackupDir(inputPath: string): Promise<string> {
  // Backups from different LubeLog versions may add one or more wrapper
  // folders. Walk only directories, stay inside the extracted root, and stop
  // as soon as the expected LiteDB file is found.
  const queue = [inputPath]
  while (queue.length) {
    const current = queue.shift()!
    const directDb = path.join(current, 'data', 'cartracker.db')
    try {
      await stat(directDb)
      return current
    } catch {}

    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        queue.push(path.join(current, entry.name))
      }
    }
  }

  throw new Error('Could not find data/cartracker.db in the backup. Make sure this is a valid LubeLog/LiteDB backup zip.')
}

async function extractZip(zipBuffer: Buffer): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `auto-torque-legacy-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  const zip = await JSZip.loadAsync(zipBuffer)
  for (const [relativePath, entry] of Object.entries(zip.files)) {
    const target = resolveWithinDir(tmpDir, relativePath)
    if (!target) continue
    if (entry.dir) await mkdir(target, { recursive: true })
    else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, await entry.async('nodebuffer')) }
  }
  return tmpDir
}

export async function POST(request: NextRequest) {
  if (isDemoMode) return NextResponse.json({ error: 'Data import is disabled on the demo.' }, { status: 403 })
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let tmpDir: string | null = null
  try {
    const zipBuffer = Buffer.from(await request.arrayBuffer())
    if (zipBuffer.length < 100) return NextResponse.json({ error: 'Uploaded file is too small.' }, { status: 400 })
    tmpDir = await extractZip(zipBuffer)
    const backupDir = await resolveBackupDir(tmpDir)
    const dbBuffer = readFileSync(path.join(backupDir, 'data', 'cartracker.db'))
    const docs = extractBsonDocuments(dbBuffer)
    if (!docs.length) return NextResponse.json({ error: 'No readable BSON records were found in the legacy database.' }, { status: 400 })

    const groups = new Map<string, LegacyDoc[]>()
    for (const doc of docs) {
      const type = classify(doc)
      const list = groups.get(type) ?? []
      list.push(doc)
      groups.set(type, list)
    }

    const { organizationId, userId } = ctx
    const prefixSetting = await db.appSetting.findFirst({ where: { organizationId, key: 'workshop.invoicePrefix' } })
    const invoicePrefix = resolveInvoicePrefix(prefixSetting?.value ?? '{year}-')
    const lastRecord = await db.serviceRecord.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { invoiceNumber: true } })
    let nextInvoiceNum = 1001
    const match = lastRecord?.invoiceNumber?.match(/(\d+)$/)
    if (match) nextInvoiceNum = Number.parseInt(match[1], 10) + 1

    const vehicles = groups.get('vehicle') ?? []
    const services = groups.get('serviceRecord') ?? []
    const notes = groups.get('note') ?? []
    const fuels = groups.get('fuelLog') ?? []
    const reminders = groups.get('reminder') ?? []
    const customers = groups.get('customer') ?? []
    const inventory = groups.get('inventory') ?? []
    const odometers = groups.get('odometer') ?? []
    const plans = groups.get('plan') ?? []
    const supplies = groups.get('supply') ?? []

    const vehicleMap = new Map<string, string>()
    const customerMap = new Map<string, string>()
    const legacyIdToEntity = new Map<string, { type: string; id: string }>()
    let createdCounts = { vehicles: 0, customers: 0, serviceRecords: 0, notes: 0, fuelLogs: 0, reminders: 0, inventory: 0, odometers: 0, plans: 0, supplies: 0, preserved: 0 }

    const uploadsBase = path.join(getAppDataDir(), 'uploads', organizationId)
    async function copyLegacyFile(sourcePath: string, category: string, filename: string) {
      const normalized = String(sourcePath).replace(/^[/\\]+/, '')
      const local = resolveWithinDir(backupDir, normalized)
      if (!local) return null
      try {
        const data = readFileSync(local)
        const dir = path.join(uploadsBase, category)
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, filename), data)
        return { fileUrl: `/api/protected/files/${organizationId}/${category}/${filename}`, fileSize: data.length }
      } catch { return null }
    }

    await db.$transaction(async (tx) => {
      // Customers first. Legacy customer IDs are retained as the mapping key.
      for (const c of customers) {
        const id = legacyId(c)
        const first = asText(values(c, 'FirstName', 'firstName'))
        const last = asText(values(c, 'LastName', 'lastName'))
        const name = asText(values(c, 'Name', 'CustomerName', 'OwnerName')) || [first, last].filter(Boolean).join(' ') || `Legacy customer ${id ?? createdCounts.customers + 1}`
        const created = await tx.customer.create({ data: { name, email: asText(values(c, 'Email', 'email')), phone: asText(values(c, 'Phone', 'phone', 'Mobile')), address: asText(values(c, 'Address', 'address')), notes: asText(values(c, 'Notes', 'notes')), userId, organizationId } })
        if (id) { customerMap.set(id, created.id); legacyIdToEntity.set(id, { type: 'customer', id: created.id }) }
        createdCounts.customers++
      }

      // Some LubeLog versions store the customer only on the vehicle. Create those
      // owners first so the vehicle can be linked immediately.
      for (const v of vehicles) {
        const ownerName = asText(values(v, 'CustomerName', 'OwnerName', 'Owner'))
        if (!ownerName) continue
        const ownerKey = `name:${ownerName.toLowerCase()}`
        if (!customerMap.has(ownerKey)) {
          const existing = await tx.customer.findFirst({ where: { organizationId, name: ownerName } })
          const owner = existing ?? await tx.customer.create({ data: { name: ownerName, userId, organizationId } })
          customerMap.set(ownerKey, owner.id)
          if (!existing) createdCounts.customers++
        }
      }

      // Vehicles are created before dependent records. Owner/customer references are resolved where possible.
      for (const v of vehicles) {
        const id = legacyId(v)
        const ownerLegacy = values(v, 'CustomerId', 'customerId', 'OwnerId', 'ownerId')
        const ownerName = asText(values(v, 'CustomerName', 'OwnerName', 'Owner'))
        const customerId = ownerLegacy != null ? customerMap.get(String(ownerLegacy)) ?? null : ownerName ? customerMap.get(`name:${ownerName.toLowerCase()}`) ?? null : null
        let vehicleImageUrl: string | null = null
        const vehicleImage = asText(values(v, 'ImageLocation', 'Image', 'ImagePath', 'Picture'))
        if (vehicleImage) {
          const ext = vehicleImage.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg'
          const copied = await copyLegacyFile(vehicleImage, 'vehicles', `legacy-vehicle-${id ?? createdCounts.vehicles}.${ext}`)
          vehicleImageUrl = copied?.fileUrl ?? null
        }
        const created = await tx.vehicle.create({ data: {
          make: asText(values(v, 'Make', 'make')) || 'Unknown',
          model: asText(values(v, 'Model', 'model')) || 'Vehicle',
          year: asInt(values(v, 'Year', 'year'), new Date().getFullYear()),
          licensePlate: asText(values(v, 'LicensePlate', 'licensePlate', 'Plate')), 
          vin: asText(values(v, 'VIN', 'Vin', 'vin')),
          color: asText(values(v, 'Color', 'color')),
          mileage: asInt(values(v, 'Mileage', 'mileage'), 0),
          fuelType: asBool(values(v, 'IsElectric', 'isElectric')) ? 'electric' : asBool(values(v, 'IsDiesel', 'isDiesel')) ? 'diesel' : 'gasoline',
          transmission: asText(values(v, 'Transmission', 'transmission')),
          engineSize: asText(values(v, 'EngineSize', 'engineSize')),
          engineCode: asText(values(v, 'EngineCode', 'engineCode')),
          purchasePrice: parseDecimal(values(v, 'PurchasePrice', 'purchasePrice')) || null,
          imageUrl: vehicleImageUrl,
          customerId,
          userId,
          organizationId,
        } })
        if (id) { vehicleMap.set(id, created.id); legacyIdToEntity.set(id, { type: 'vehicle', id: created.id }) }
        createdCounts.vehicles++
      }

      for (const sr of services) {
        const legacyVehicle = findVehicleId(sr)
        const vehicleId = legacyVehicle ? vehicleMap.get(legacyVehicle) : null
        if (!vehicleId) continue
        const cost = parseDecimal(values(sr, 'Cost', 'cost', 'TotalCost', 'totalCost'))
        const date = toSafeDate(asText(values(sr, 'Date', 'ServiceDate', 'serviceDate')) ?? '') ?? new Date()
        const created = await tx.serviceRecord.create({ data: {
          organizationId, vehicleId,
          title: asText(values(sr, 'Description', 'Title', 'ServiceType')) || 'Imported service',
          description: asText(values(sr, 'Notes', 'Note', 'Description')),
          diagnosticNotes: asText(values(sr, 'DiagnosticNotes', 'Diagnostics')),
          invoiceNotes: asText(values(sr, 'InvoiceNotes', 'PublicNotes')),
          type: 'repair', status: 'completed', cost, mileage: asInt(values(sr, 'Mileage', 'mileage'), 0) || null,
          serviceDate: date, subtotal: cost, totalAmount: cost,
          invoiceNumber: `${invoicePrefix}${nextInvoiceNum++}`,
        } })
        const id = legacyId(sr)
        if (id) legacyIdToEntity.set(id, { type: 'serviceRecord', id: created.id })
        createdCounts.serviceRecords++

        const partLines = values(sr, 'Parts', 'ServiceParts', 'PartsUsed', 'LineItems')
        if (Array.isArray(partLines)) {
          for (const raw of partLines) {
            if (!raw || typeof raw !== 'object') continue
            const qty = asNumber(values(raw, 'Quantity', 'quantity'), 1)
            const unitPrice = asNumber(values(raw, 'UnitPrice', 'Price', 'price'), 0)
            const name = asText(values(raw, 'Name', 'Description', 'PartName')) || 'Imported part'
            await tx.servicePart.create({ data: { serviceRecordId: created.id, name, partNumber: asText(values(raw, 'PartNumber', 'SKU')), quantity: qty, unitPrice, total: asNumber(values(raw, 'Total', 'LineTotal'), qty * unitPrice), unitCost: asNumber(values(raw, 'Cost', 'UnitCost'), 0) } })
          }
        }
        const files = values(sr, 'Files', 'Attachments', 'Documents')
        if (Array.isArray(files)) {
          for (const raw of files) {
            if (!raw || typeof raw !== 'object') continue
            const location = asText(values(raw, 'Location', 'Path', 'FilePath', 'Url'))
            if (!location) continue
            const originalName = asText(values(raw, 'Name', 'FileName')) || path.basename(location)
            const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_')
            const copied = await copyLegacyFile(location, 'services', `legacy-${legacyId(sr) ?? created.id}-${safeName}`)
            if (!copied) continue
            await tx.serviceAttachment.create({
              data: {
                fileName: originalName,
                fileUrl: copied.fileUrl,
                fileType: getMimeType(originalName),
                fileSize: copied.fileSize,
                category: /\.(jpg|jpeg|png|webp|gif)$/i.test(originalName) ? 'image' : 'diagnostic',
                serviceRecordId: created.id,
              },
            })
          }
        }

        const laborLines = values(sr, 'Labor', 'ServiceLabor', 'LaborItems')
        if (Array.isArray(laborLines)) {
          for (const raw of laborLines) {
            if (!raw || typeof raw !== 'object') continue
            const hours = asNumber(values(raw, 'Hours', 'hours'), 0)
            const rate = asNumber(values(raw, 'Rate', 'rate'), 0)
            await tx.serviceLabor.create({ data: { serviceRecordId: created.id, description: asText(values(raw, 'Description', 'Name')) || 'Imported labor', hours, rate, total: asNumber(values(raw, 'Total', 'total'), hours * rate) } })
          }
        }
      }

      for (const n of notes) {
        const vehicleId = findVehicleId(n) ? vehicleMap.get(findVehicleId(n)!) : null
        if (!vehicleId) continue
        await tx.note.create({ data: { vehicleId, title: asText(values(n, 'Description', 'Title')) || 'Imported note', content: asText(values(n, 'NoteText', 'Note', 'Content')) || '', isPinned: asBool(values(n, 'Pinned', 'IsPinned')) } })
        createdCounts.notes++
      }

      for (const f of fuels) {
        const vehicleId = findVehicleId(f) ? vehicleMap.get(findVehicleId(f)!) : null
        if (!vehicleId) continue
        const gallons = asNumber(values(f, 'Gallons', 'gallons', 'Litres', 'Liters'), 0)
        const total = asNumber(values(f, 'TotalCost', 'totalCost', 'Cost'), 0)
        const ppg = asNumber(values(f, 'PricePerGallon', 'PricePerLitre', 'PricePerLiter'), gallons ? total / gallons : 0)
        await tx.fuelLog.create({ data: { vehicleId, date: toSafeDate(asText(values(f, 'Date', 'date')) ?? '') ?? new Date(), mileage: asInt(values(f, 'Mileage', 'mileage'), 0), gallons, pricePerGallon: ppg, totalCost: total, isFillUp: asBool(values(f, 'IsFillUp', 'isFillUp'), true), station: asText(values(f, 'Station', 'station')), notes: asText(values(f, 'Notes', 'notes')) } })
        createdCounts.fuelLogs++
      }

      for (const r of reminders) {
        const vehicleId = findVehicleId(r) ? vehicleMap.get(findVehicleId(r)!) : null
        if (!vehicleId) continue
        await tx.reminder.create({ data: { vehicleId, organizationId, title: asText(values(r, 'Title', 'Description', 'Name')) || 'Imported reminder', description: asText(values(r, 'Description', 'Notes')), dueDate: toSafeDate(asText(values(r, 'DueDate', 'Date')) ?? '') ?? null, dueMileage: asInt(values(r, 'DueMileage', 'Mileage'), 0) || null, isCompleted: asBool(values(r, 'IsCompleted', 'Completed')) } })
        createdCounts.reminders++
      }

      for (const o of odometers) {
        const vehicleId = findVehicleId(o) ? vehicleMap.get(findVehicleId(o)!) : null
        if (!vehicleId) continue
        const mileage = asInt(values(o, 'Odometer', 'EndingOdometer', 'OdometerReading', 'Mileage'), 0)
        if (mileage > 0) {
          await tx.vehicle.update({ where: { id: vehicleId }, data: { mileage: { set: mileage } } })
          createdCounts.odometers++
        }
      }

      for (const plan of plans) {
        const vehicleId = findVehicleId(plan) ? vehicleMap.get(findVehicleId(plan)!) : null
        if (!vehicleId) continue
        const progress = String(values(plan, 'Progress', 'Status') ?? '').toLowerCase()
        const completed = progress === 'done' || progress === 'completed'
        await tx.reminder.create({ data: { vehicleId, organizationId, title: asText(values(plan, 'Description', 'Title', 'Name')) || 'Imported plan', description: asText(values(plan, 'Notes', 'Description')), dueDate: toSafeDate(asText(values(plan, 'DueDate', 'Date')) ?? '') ?? null, dueMileage: asInt(values(plan, 'DueMileage', 'Mileage'), 0) || null, isCompleted: completed } })
        createdCounts.plans++
      }

      for (const part of [...inventory, ...supplies]) {
        await tx.inventoryPart.create({ data: { organizationId, userId, name: asText(values(part, 'Name', 'Description', 'PartName')) || 'Imported part', partNumber: asText(values(part, 'PartNumber', 'SKU', 'ProductKey')), barcode: asText(values(part, 'Barcode', 'UPC')), description: asText(values(part, 'Description', 'Notes')), category: asText(values(part, 'Category')), quantity: asNumber(values(part, 'Quantity', 'InStockQuantity', 'Stock')), minQuantity: asNumber(values(part, 'MinQuantity', 'ReorderPoint')), unitCost: asNumber(values(part, 'Cost', 'UnitCost')), sellPrice: asNumber(values(part, 'Price', 'SellPrice')), supplier: asText(values(part, 'Supplier', 'Vendor')), location: asText(values(part, 'Location')), isArchived: asBool(values(part, 'IsArchived', 'Archived')) } })
        createdCounts.inventory++
      }
      createdCounts.supplies = supplies.length

      // Preserve every source document, including documents that could not be mapped.
      // Batch writes keep a large restore from holding the SQLite connection on
      // thousands of individual INSERT round-trips. JSON stringify/parse
      // normalizes BSON-specific objects into plain JSON.
      const preservedRows = docs.map((doc) => ({
        source: 'lubelog',
        legacyId: legacyId(doc),
        entityType: classify(doc),
        payload: JSON.parse(JSON.stringify(doc)),
        organizationId,
        userId,
      }))
      for (let offset = 0; offset < preservedRows.length; offset += 100) {
        const batch = preservedRows.slice(offset, offset + 100)
        await tx.legacyImportRecord.createMany({ data: batch as never })
        createdCounts.preserved += batch.length
      }
    })

    return NextResponse.json({ success: true, imported: { ...createdCounts, totalLegacyRecords: docs.length, entityTypes: Object.fromEntries([...groups.entries()].map(([k, v]) => [k, v.length])) } })
  } catch (error) {
    console.error('[import-lubelog] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Legacy import failed' }, { status: 500 })
  } finally {
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
