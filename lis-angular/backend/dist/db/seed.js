"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seed script: creates default admin user if no users exist.
 * Run with: npm run seed
 */
const connection_1 = require("./connection");
const User_1 = require("../models/User");
async function seed() {
    console.log('[seed] Initializing database...');
    (0, connection_1.initializeDb)();
    const userCount = User_1.UserModel.count();
    console.log(`[seed] Found ${userCount} existing users`);
    if (userCount === 0) {
        console.log('[seed] Creating default admin user...');
        const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD ||
            Math.random().toString(36).slice(-10) + Math.random().toString(36).toUpperCase().slice(-4) + '!';
        const admin = await User_1.UserModel.create({
            name: 'Admin User',
            email: 'admin@lab.com',
            password: defaultPassword,
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
        if (process.env.DEFAULT_ADMIN_PASSWORD) {
            console.log('[seed] Password configured from DEFAULT_ADMIN_PASSWORD environment variable.');
        }
        else {
            console.log(`[seed] Generated one-time admin password: ${defaultPassword}`);
            console.log('[seed] ⚠️  Save this password now — it will not be displayed again.');
        }
    }
    else {
        console.log('[seed] Users already exist, skipping seed.');
    }
    (0, connection_1.closeDb)();
    console.log('[seed] Done.');
}
seed().catch(err => {
    console.error('[seed] Error:', err);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map