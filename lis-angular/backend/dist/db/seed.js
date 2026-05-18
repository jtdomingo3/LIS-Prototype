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
        const admin = await User_1.UserModel.create({
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