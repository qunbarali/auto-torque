'use server'

import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'

export async function getRecentCustomers() {
  return withAuth(
    async ({ organizationId }) => {
      const customers = await db.customer.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      })
      return customers
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    }
  )
}

export async function globalSearch(query: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (!query || query.trim().length < 2) {
        return {
          vehicles: [],
          customers: [],
          services: [],
          parts: [],
          quotes: [],
          reminders: [],
          inspections: [],
          tireSets: [],
        }
      }

      const q = query.trim()
      const words = q.split(/\s+/).filter(Boolean)
      // Digits-only version for phone matching (strips +, spaces, dashes, parens)
      const digitsOnly = q.replace(/[\s\-\+\(\)]/g, '')
      const isPhoneLike = /^\d{3,}$/.test(digitsOnly)

      // For multi-word queries, each word must match at least one field (AND logic).
      // For single-word queries, behavior is the same as before.

      const vehicleWhere: Prisma.VehicleWhereInput = {
        organizationId,
        AND: words.map((word) => {
          const or: Prisma.VehicleWhereInput[] = [
            { make: { contains: word } },
            { model: { contains: word } },
            { licensePlate: { contains: word } },
            { vin: { contains: word } },
            { customer: { name: { contains: word } } },
          ]
          if (!isNaN(Number(word))) {
            or.push({ year: Number(word) })
          }
          return { OR: or }
        }),
      }

      // Tire sets are looked up at the desk by plate, customer or shelf code —
      // "where are the Hansen tires" is the question, and the answer is a shelf.
      // Only searched when the module is on, so a shop without it pays nothing.
      const tireHotelOn = await isTireHotelEnabled(organizationId)

      const [vehicles, customers, services, parts, quotes, reminders, inspections, tireSets] =
        await Promise.all([
          db.vehicle.findMany({
            where: vehicleWhere,
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
            take: 10,
          }),
          (async () => {
            // For phone-like queries, use raw SQL to strip formatting before matching
            if (isPhoneLike) {
              // Normalize formatted phone values in application code because SQLite
              // intentionally keeps phone numbers as ordinary text so
              // matching works with spaces, + signs, brackets, dashes, etc.
              const phoneCustomers = (await db.customer.findMany({
                where: { organizationId, phone: { not: null } },
                select: { id: true, name: true, email: true, phone: true, company: true },
              }))
                .filter((customer) => (customer.phone ?? '').replace(/\D/g, '').includes(digitsOnly))
                .slice(0, 10)
              // Fetch vehicles for matched customers
              const customerIds = phoneCustomers.map((c) => c.id)
              const customerVehicles =
                customerIds.length > 0
                  ? await db.vehicle.findMany({
                      where: { customerId: { in: customerIds }, isArchived: false },
                      select: {
                        id: true,
                        make: true,
                        model: true,
                        year: true,
                        licensePlate: true,
                        customerId: true,
                      },
                      take: 25,
                      orderBy: { updatedAt: 'desc' },
                    })
                  : []
              return phoneCustomers.map((c) => ({
                ...c,
                vehicles: customerVehicles
                  .filter((v) => v.customerId === c.id)
                  .slice(0, 5)
                  .map(({ customerId: _, ...v }) => v),
              }))
            }
            // Standard text search
            return db.customer.findMany({
              where: {
                organizationId,
                AND: words.map((word) => ({
                  OR: [
                    { name: { contains: word } },
                    { email: { contains: word } },
                    { phone: { contains: word } },
                    { company: { contains: word } },
                  ],
                })),
              },
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                company: true,
                vehicles: {
                  where: { isArchived: false },
                  select: {
                    id: true,
                    make: true,
                    model: true,
                    year: true,
                    licensePlate: true,
                  },
                  take: 5,
                  orderBy: { updatedAt: 'desc' },
                },
              },
              take: 10,
            })
          })(),
          db.serviceRecord.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { title: { contains: word } },
                  { invoiceNumber: { contains: word } },
                  { techName: { contains: word } },
                ],
              })),
            },
            select: {
              id: true,
              title: true,
              invoiceNumber: true,
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
            take: 10,
          }),
          db.inventoryPart.findMany({
            where: {
              organizationId,
              isArchived: false,
              AND: words.map((word) => ({
                OR: [
                  { name: { contains: word } },
                  { partNumber: { contains: word } },
                  { supplier: { contains: word } },
                ],
              })),
            },
            select: {
              id: true,
              name: true,
              partNumber: true,
              quantity: true,
              unit: true,
            },
            take: 10,
          }),
          db.quote.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { title: { contains: word } },
                  { quoteNumber: { contains: word } },
                  { customer: { name: { contains: word } } },
                ],
              })),
            },
            select: {
              id: true,
              title: true,
              quoteNumber: true,
              status: true,
            },
            take: 10,
          }),
          db.reminder.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { title: { contains: word } },
                  { description: { contains: word } },
                  { vehicle: { make: { contains: word } } },
                  { vehicle: { model: { contains: word } } },
                  { vehicle: { licensePlate: { contains: word } } },
                  { customer: { name: { contains: word } } },
                ],
              })),
            },
            select: {
              id: true,
              title: true,
              dueDate: true,
              isCompleted: true,
              customer: { select: { id: true, name: true } },
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
            take: 10,
          }),
          db.inspection.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { template: { name: { contains: word } } },
                  { notes: { contains: word } },
                  { vehicle: { make: { contains: word } } },
                  { vehicle: { model: { contains: word } } },
                  { vehicle: { licensePlate: { contains: word } } },
                ],
              })),
            },
            select: {
              id: true,
              status: true,
              createdAt: true,
              template: { select: { name: true } },
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
            take: 10,
          }),
          tireHotelOn
            ? db.tireSet.findMany({
                where: {
                  organizationId,
                  AND: words.map((word) => ({
                    OR: [
                      { reference: { contains: word } },
                      { brand: { contains: word } },
                      { size: { contains: word } },
                      { location: { code: { contains: word } } },
                      { customer: { name: { contains: word } } },
                      { vehicle: { make: { contains: word } } },
                      { vehicle: { model: { contains: word } } },
                      { vehicle: { licensePlate: { contains: word } } },
                    ],
                  })),
                },
                select: {
                  id: true,
                  reference: true,
                  season: true,
                  size: true,
                  quantity: true,
                  status: true,
                  location: { select: { code: true } },
                  customer: { select: { id: true, name: true } },
                  vehicle: {
                    select: {
                      id: true,
                      make: true,
                      model: true,
                      year: true,
                      licensePlate: true,
                    },
                  },
                },
                // Stored sets first: a released set is history, and the desk is
                // almost always asking about something still on a shelf.
                orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
                take: 10,
              })
            : Promise.resolve([]),
        ])

      return { vehicles, customers, services, parts, quotes, reminders, inspections, tireSets }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    }
  )
}
