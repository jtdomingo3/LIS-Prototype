/**
 * Seed script: creates default admin user if no users exist.
 * Run with: npm run seed
 */
import { initializeDb, getDb, closeDb } from './connection';
import { UserModel } from '../models/User';

async function seed() {
  console.log('[seed] Initializing database...');
  initializeDb();

  const userCount = UserModel.count();
  console.log(`[seed] Found ${userCount} existing users`);

  if (userCount === 0) {
    console.log('[seed] Creating default admin user...');
    const admin = await UserModel.create({
      name: 'Admin User',
      email: 'admin@lab.com',
      password: 'password123',
      role: 'Admin',
      permissions: {
        dashboard: true,
        patients: true,
        reception: true,
        tests: true,
        reports: true,
        worksheet: true,
        templates: true,
        users: true,
        delete: true,
      },
    });
    console.log(`[seed] Admin user created: ${admin.email}`);
  } else {
    console.log('[seed] Users already exist, skipping seed.');
  }

  closeDb();
  console.log('[seed] Done.');
}

seed().catch(err => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
