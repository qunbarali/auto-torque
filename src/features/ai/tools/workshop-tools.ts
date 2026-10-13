import 'server-only'
import { db } from '@/lib/db'
import type OpenAI from 'openai'
import { Prisma } from '@/generated/prisma/client'

const MAX_ROWS = 100

/**
 * Single tool: AI generates a SQL query, we validate and execute it.
 */
export const workshopTools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'run_sql_query',
      description:
        'Execute a read-only SQLite SELECT query against the workshop database. The query MUST be a SELECT statement. You do NOT need to filter by organization — that is enforced automatically. Always use the actual table names (snake_case with @@map names). Limit results to 100 rows max.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A SQLite SELECT query. Must start with SELECT.',
          },
        },
        required: ['sql'],
      },
    },
  },
]

// ─── Blocked keywords (mutation / DDL / admin) ─────────────────────────────

const BLOCKED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'UPSERT',
  'MERGE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'CALL',
  'VACUUM',
  'REINDEX',
  'COMMENT',
  'LOCK',
  'PREPARE',
  'DEALLOCATE',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'INTO',
  'SET',
  'RESET',
  'DISCARD',
  'LOAD',
  'SECURITY',
] as const

// Tables the AI is allowed to query (whitelist approach — everything else is blocked)
const ALLOWED_TABLES = [
  'vehicles',
  'service_records',
  'service_parts',
  'service_labor',
  'service_attachments',
  'payments',
  'customers',
  'reminders',
  'quotes',
  'quote_parts',
  'quote_labor',
  'quote_attachments',
  'inventory_parts',
  'notes',
  'fuel_logs',
  'technicians',
  'inspections',
  'inspection_items',
  'recurring_invoices',
  'recurring_parts',
  'recurring_labor',
  'notifications',
  'sms_messages',
  'inspection_quote_requests',
] as const

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateSql(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim()

  // Must start with SELECT (case-insensitive)
  if (!/^SELECT\b/i.test(trimmed)) {
    return { valid: false, error: 'Only SELECT queries are allowed.' }
  }

  // Must not contain semicolons (prevent multi-statement injection)
  if (trimmed.includes(';')) {
    return { valid: false, error: 'Multiple statements are not allowed.' }
  }

  // Block SQL comments
  if (/--/.test(trimmed)) {
    return { valid: false, error: 'SQL comments are not allowed.' }
  }
  if (/\/\*/.test(trimmed)) {
    return { valid: false, error: 'SQL block comments are not allowed.' }
  }

  // SQLite has no schemas that the AI tool needs. Reject schema-qualified
  // references and direct access to SQLite's internal catalog.
  if (/(?:^|[\s,(])(?:main|temp|sqlite_master|sqlite_schema)\s*\./i.test(trimmed)) {
    return { valid: false, error: 'Qualified or system table names are not allowed.' }
  }
  if (/\b(?:sqlite_master|sqlite_schema|sqlite_temp_master|sqlite_temp_schema)\b/i.test(trimmed)) {
    return { valid: false, error: 'SQLite system catalog access is not allowed.' }
  }

  // SQLite file-access/extension functions must never be available to the AI.
  if (/\b(?:readfile|writefile|load_extension|eval|fts3_tokenizer)\s*\(/i.test(trimmed)) {
    return { valid: false, error: 'Unsafe SQLite function call is not allowed.' }
  }

  // Normalize for keyword checking: collapse whitespace, uppercase
  const normalized = trimmed.replace(/\s+/g, ' ').toUpperCase()

  // Check for blocked mutation/DDL keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`)
    if (regex.test(normalized)) {
      return { valid: false, error: `Forbidden keyword: ${keyword}` }
    }
  }

  // Whitelist: extract all table-like identifiers from FROM / JOIN clauses
  // and verify they're in the allowed list
  const tableRefPattern = /\b(?:FROM|JOIN)\s+"?([a-z_][a-z0-9_]*)"?/gi
  let match
  while ((match = tableRefPattern.exec(trimmed)) !== null) {
    const tableName = match[1].toLowerCase()
    if (!ALLOWED_TABLES.includes(tableName as (typeof ALLOWED_TABLES)[number])) {
      return { valid: false, error: `Access to table "${tableName}" is not allowed.` }
    }
  }

  return { valid: true }
}

// ─── Org-scoped execution ───────────────────────────────────────────────────

/**
 * Executes the AI query inside a transaction with temporary views
 * that enforce organization isolation at the database level.
 *
 * Security layers:
 * 1. The transaction creates temporary views that shadow every allowed table
 *    name, pre-filtered by organization ID.
 * 2. Child tables (service_records, payments, etc.) are scoped via JOIN to their
 *    org-scoped parent — no direct organizationId needed.
 * 3. The organization ID is validated before it is embedded in the view SQL.
 * 4. SQLite TEMP objects take precedence over main-schema objects for unqualified
 *    table names, so the AI query sees only the scoped views.
 * 5. The SQL validator permits SELECT only and blocks DML, DDL, and system access.
 */
async function executeOrgScopedQuery(sql: string, orgId: string): Promise<unknown[]> {
  // Validate orgId is a safe CUID (alphanumeric plus the separators used by CUIDs).
  // It is embedded only into a generated TEMP VIEW definition; no user SQL is
  // interpolated here, and the value is restricted to a safe identifier alphabet.
  if (!/^[a-zA-Z0-9_-]+$/.test(orgId)) {
    throw new Error('Invalid organization ID')
  }

  return db.$transaction(async (tx) => {
    // SQLite has no search_path or SET TRANSACTION READ ONLY. TEMP objects are
    // resolved before main-schema objects, so these views shadow the real tables
    // for the duration of this transaction. The SQL validator independently
    // permits SELECT only and blocks DDL/DML/system access.
    const orgDirectTables = [
      'vehicles',
      'customers',
      'quotes',
      'inventory_parts',
      'notifications',
      'sms_messages',
      'technicians',
      'inspections',
      'inspection_quote_requests',
      'service_records',
    ]

    for (const table of orgDirectTables) {
      await tx.$executeRaw`${Prisma.raw(
        `CREATE TEMP VIEW "${table}" AS SELECT * FROM main."${table}" WHERE "organizationId" = '${orgId}'`
      )}`
    }

    const vehicleChildren = ['notes', 'fuel_logs', 'reminders', 'recurring_invoices']
    for (const table of vehicleChildren) {
      await tx.$executeRaw`${Prisma.raw(
        `CREATE TEMP VIEW "${table}" AS SELECT t.* FROM main."${table}" t INNER JOIN "vehicles" v ON t."vehicleId" = v.id`
      )}`
    }

    const serviceChildren = ['service_parts', 'service_labor', 'service_attachments', 'payments']
    for (const table of serviceChildren) {
      await tx.$executeRaw`${Prisma.raw(
        `CREATE TEMP VIEW "${table}" AS SELECT t.* FROM main."${table}" t INNER JOIN "service_records" sr ON t."serviceRecordId" = sr.id`
      )}`
    }

    const quoteChildren = ['quote_parts', 'quote_labor', 'quote_attachments']
    for (const table of quoteChildren) {
      await tx.$executeRaw`${Prisma.raw(
        `CREATE TEMP VIEW "${table}" AS SELECT t.* FROM main."${table}" t INNER JOIN "quotes" q ON t."quoteId" = q.id`
      )}`
    }

    const recurringChildren = ['recurring_parts', 'recurring_labor']
    for (const table of recurringChildren) {
      await tx.$executeRaw`${Prisma.raw(
        `CREATE TEMP VIEW "${table}" AS SELECT t.* FROM main."${table}" t INNER JOIN "recurring_invoices" ri ON t."recurringInvoiceId" = ri.id`
      )}`
    }

    await tx.$executeRaw`${Prisma.raw(
      `CREATE TEMP VIEW "inspection_items" AS SELECT t.* FROM main."inspection_items" t INNER JOIN "inspections" i ON t."inspectionId" = i.id`
    )}`

    const rows = await tx.$queryRawUnsafe(sql)
    return Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : []
  })
}

// ─── Tool execution ─────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  organizationId: string
): Promise<string> {
  if (name !== 'run_sql_query') {
    return JSON.stringify({ error: `Unknown tool: ${name}` })
  }

  const sql = (args.sql as string) || ''

  // Validate
  const validation = validateSql(sql)
  if (!validation.valid) {
    return JSON.stringify({ error: validation.error })
  }

  try {
    // Add LIMIT if missing
    const hasLimit = /\bLIMIT\b/i.test(sql)
    const limitedSql = hasLimit ? sql : `${sql} LIMIT ${MAX_ROWS}`

    const rows = await executeOrgScopedQuery(limitedSql, organizationId)

    return JSON.stringify(rows, (_key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    )
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Query execution failed',
    })
  }
}

// ─── Schema description for the AI system prompt ────────────────────────────

export const DB_SCHEMA = `
SQLite database schema (use these exact table/column names in queries):

vehicles (id, make, model, year, vin, "licensePlate", color, mileage, "fuelType", transmission, "engineSize", "purchaseDate", "purchasePrice", "isArchived", "createdAt", "updatedAt", "customerId")

service_records (id, title, description, type, status, cost, mileage, "serviceDate", "startDateTime", "endDateTime", "shopName", "techName", parts, "laborHours", "diagnosticNotes", "invoiceNotes", subtotal, "taxRate", "taxAmount", "totalAmount", "invoiceNumber", "discountType", "discountValue", "discountAmount", "manuallyPaid", "createdAt", "updatedAt", "vehicleId", "customerId", "technicianId", "sortOrder") -- "vehicleId" is NULL for parts-only counter sales; those link "customerId" directly

service_parts (id, "partNumber", name, quantity, unit, "unitPrice", total, "serviceRecordId")

service_labor (id, description, hours, rate, total, "serviceRecordId")

payments (id, amount, date, method, note, provider, "externalId", "createdAt", "updatedAt", "serviceRecordId")

customers (id, name, email, phone, address, company, notes, "createdAt", "updatedAt")

reminders (id, title, description, "dueDate", "dueMileage", "isCompleted", "createdAt", "updatedAt", "vehicleId")

quotes (id, "quoteNumber", title, description, status, "validUntil", subtotal, "taxRate", "taxAmount", "discountType", "discountValue", "discountAmount", "totalAmount", notes, "customerMessage", "convertedToId", "createdAt", "updatedAt", "customerId", "vehicleId", "inspectionId")

quote_parts (id, "partNumber", name, quantity, unit, "unitPrice", total, excluded, "quoteId")

quote_labor (id, description, hours, rate, total, excluded, "quoteId")

inventory_parts (id, "partNumber", name, description, category, quantity, "minQuantity", unit, "unitCost", "sellPrice", supplier, "supplierPhone", "supplierEmail", "supplierUrl", location, "isArchived", "createdAt", "updatedAt")

notes (id, title, content, "isPinned", "createdAt", "updatedAt", "vehicleId")

fuel_logs (id, date, mileage, gallons, "pricePerGallon", "totalCost", "isFillUp", station, notes, "createdAt", "updatedAt", "vehicleId")

technicians (id, name, color, "isActive", "sortOrder", "dailyCapacity", "createdAt", "updatedAt")

inspections (id, status, mileage, notes, "startDateTime", "endDateTime", "completedAt", "createdAt", "updatedAt", "vehicleId", "templateId", "technicianId", "sortOrder")

inspection_items (id, name, section, "sortOrder", condition, notes, "imageUrls", "inspectionId")

recurring_invoices (id, title, description, frequency, "nextRunDate", "endDate", "isActive", "lastRunAt", "runCount", type, cost, "taxRate", "invoiceNotes", "vehicleId", "createdAt", "updatedAt")

notifications (id, type, title, message, "entityType", "entityId", read, "createdAt")

sms_messages (id, direction, "fromNumber", "toNumber", body, status, "createdAt", "updatedAt", "customerId")

service_attachments (id, "fileName", "fileUrl", "fileType", "fileSize", category, description, "includeInInvoice", "createdAt", "serviceRecordId")

Key relationships:
- vehicles."customerId" → customers.id
- service_records."vehicleId" → vehicles.id (NULL for counter sales)
- service_records."customerId" → customers.id (set only for counter sales)
- service_parts."serviceRecordId" → service_records.id
- service_labor."serviceRecordId" → service_records.id
- payments."serviceRecordId" → service_records.id
- reminders."vehicleId" → vehicles.id
- quotes."customerId" → customers.id
- quotes."vehicleId" → vehicles.id
- quote_parts."quoteId" → quotes.id
- quote_labor."quoteId" → quotes.id
- inspections."vehicleId" → vehicles.id
- inspections."technicianId" → technicians.id

IMPORTANT business rules:
- A service record is considered PAID if "manuallyPaid" = true OR the sum of payments.amount for that service >= the effective total (use "totalAmount" if > 0, otherwise use cost).
- To find UNPAID invoices, use this pattern:
  SELECT sr.*, COALESCE(p.paid, 0) AS paid_amount
  FROM service_records sr
  LEFT JOIN (SELECT "serviceRecordId", SUM(amount) AS paid FROM payments GROUP BY "serviceRecordId") p ON p."serviceRecordId" = sr.id
  WHERE sr."manuallyPaid" = false
    AND (CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END) > 0
    AND COALESCE(p.paid, 0) < (CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END)
- Quote statuses: draft, sent, accepted, rejected, expired, converted
- Service record statuses: pending, in_progress, waiting_parts, completed
- Service record types: maintenance, repair, upgrade, inspection

Note: camelCase columns MUST be double-quoted in SQL (e.g. "licensePlate", "totalAmount").
Organization filtering is applied automatically — do NOT add WHERE "organizationId" = ... yourself.

IMPORTANT: Linking to pages
Always include id columns in your queries — for the primary entity AND any related entities (vehicle, customer, etc.). When displaying results, add markdown links for ALL entities present in the row. Use these URL patterns:
- Vehicle: [vehicle name](/vehicles/{vehicle.id})
- Service record: [title](/vehicles/{vehicle.id}/service/{service_record.id})
- Customer: [name](/customers/{customer.id})
- Quote: [title](/quotes/{quote.id})
- Inventory part: [name](/inventory)
- Reminder: [title](/reminders)
- Inspection: [template name](/inspections/{inspection.id})

When a query involves JOINs, make every related entity clickable. For example, when showing invoices with vehicle and customer info:
| [Oil Change](/vehicles/abc123/service/def456) | [Toyota Corolla](/vehicles/abc123) | [John Smith](/customers/cust789) | $150 |
Always JOIN to vehicles and customers when relevant so you can include their ids and link to them.
`.trim()
