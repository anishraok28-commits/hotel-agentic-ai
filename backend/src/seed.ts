/**
 * Seed script for initial hotel setup.
 *
 * Creates default staff users for a new hotel deployment.
 * All seed users are created with must_change_password = true.
 * Run once during initial setup: npx tsx src/seed.ts
 */

import 'dotenv/config'
import { closeDatabase } from './db/database.js'
import { createStaffUser, getStaffByIdentifier } from './staff/staffRoleStore.js'

const DEFAULT_STAFF = [
  { id: 'staff-001', name: 'Front Desk Staff', identifier: 'frontdesk', role: 'FRONT_DESK' as const, password: 'hotel123' },
  { id: 'staff-002', name: 'Kitchen Staff', identifier: 'kitchen', role: 'KITCHEN' as const, password: 'hotel123' },
  { id: 'staff-003', name: 'Hotel Manager', identifier: 'manager', role: 'MANAGER' as const, password: 'hotel123' },
  { id: 'staff-004', name: 'Hotel Owner', identifier: 'owner', role: 'OWNER' as const, password: 'hotel123' },
]

try {
  console.log('Seeding default staff users...')

  for (const staff of DEFAULT_STAFF) {
    const existing = getStaffByIdentifier(staff.identifier)
    if (existing) {
      console.log(`  [skip] ${staff.identifier} already exists`)
      continue
    }

    createStaffUser(staff.id, staff.name, staff.identifier, staff.role, staff.password, true)
    console.log(`  [created] ${staff.identifier} (${staff.role}) - MUST CHANGE PASSWORD`)
  }

  console.log('\nSeed complete!')
  console.log('\nDefault login credentials (MUST be changed on first login):')
  console.log('  Front Desk: frontdesk / hotel123')
  console.log('  Kitchen:    kitchen / hotel123')
  console.log('  Manager:    manager / hotel123')
  console.log('  Owner:      owner / hotel123')
  console.log('\nAll users must change their password on first login!')
} catch (err) {
  console.error('Seed failed:', err)
  process.exit(1)
} finally {
  closeDatabase()
}
