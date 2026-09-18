"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
function rowToUser(row) {
    return {
        ...row,
        permissions: JSON.parse(row.permissions || '{}'),
    };
}
exports.UserModel = {
    findAll() {
        const db = (0, connection_1.getDb)();
        const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
        return rows.map(rowToUser);
    },
    findById(id) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        return row ? rowToUser(row) : null;
    },
    findByEmail(email) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
        return row ? rowToUser(row) : null;
    },
    async create(data) {
        const db = (0, connection_1.getDb)();
        const id = (0, uuid_1.v4)();
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 12);
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO users (id, name, email, password, role, status, license_number, permissions, created_at)
      VALUES (?, ?, ?, ?, ?, 'Active', ?, ?, ?)
    `).run(id, data.name, data.email, hashedPassword, data.role || 'Encoder', data.license_number || null, JSON.stringify(data.permissions || {}), now);
        return this.findById(id);
    },
    update(id, data) {
        const db = (0, connection_1.getDb)();
        const existing = this.findById(id);
        if (!existing)
            return null;
        const fields = [];
        const values = [];
        if (data.name !== undefined) {
            fields.push('name = ?');
            values.push(data.name);
        }
        if (data.email !== undefined) {
            fields.push('email = ?');
            values.push(data.email);
        }
        if (data.password !== undefined) {
            fields.push('password = ?');
            values.push(data.password);
        }
        if (data.role !== undefined) {
            fields.push('role = ?');
            values.push(data.role);
        }
        if (data.status !== undefined) {
            fields.push('status = ?');
            values.push(data.status);
        }
        if (data.license_number !== undefined) {
            fields.push('license_number = ?');
            values.push(data.license_number);
        }
        if (data.signature !== undefined) {
            fields.push('signature = ?');
            values.push(data.signature);
        }
        if (data.auto_signature_enabled !== undefined) {
            fields.push('auto_signature_enabled = ?');
            values.push(data.auto_signature_enabled);
        }
        if (data.auto_signature_until !== undefined) {
            fields.push('auto_signature_until = ?');
            values.push(data.auto_signature_until);
        }
        if (data.permissions !== undefined) {
            fields.push('permissions = ?');
            values.push(JSON.stringify(data.permissions));
        }
        if (data.last_login !== undefined) {
            fields.push('last_login = ?');
            values.push(data.last_login);
        }
        if (fields.length === 0)
            return existing;
        values.push(id);
        db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },
    delete(id) {
        const db = (0, connection_1.getDb)();
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
        return result.changes > 0;
    },
    count() {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
        return row.count;
    },
    async verifyPassword(plainPassword, hashedPassword) {
        return bcryptjs_1.default.compare(plainPassword, hashedPassword);
    }
};
//# sourceMappingURL=User.js.map