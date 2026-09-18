import { getDb } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export interface UserPermissions {
  dashboard?: boolean;
  patients?: boolean;
  reception?: boolean;
  tests?: boolean;
  reports?: boolean;
  worksheet?: boolean;
  templates?: boolean;
  users?: boolean;
  delete?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  status: string;
  license_number: string | null;
  signature: string | null;
  auto_signature_enabled: number;
  auto_signature_until: string | null;
  permissions: UserPermissions;
  created_at: string;
  last_login: string | null;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  status: string;
  license_number: string | null;
  signature: string | null;
  auto_signature_enabled: number;
  auto_signature_until: string | null;
  permissions: string; // JSON string in DB
  created_at: string;
  last_login: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    ...row,
    permissions: JSON.parse(row.permissions || '{}'),
  };
}

export const UserModel = {
  findAll(): User[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
    return rows.map(rowToUser);
  },

  findById(id: string): User | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  },

  findByEmail(email: string): User | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  },

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    license_number?: string;
    permissions?: UserPermissions;
  }): Promise<User> {
    const db = getDb();
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, password, role, status, license_number, permissions, created_at)
      VALUES (?, ?, ?, ?, ?, 'Active', ?, ?, ?)
    `).run(
      id,
      data.name,
      data.email,
      hashedPassword,
      data.role || 'Encoder',
      data.license_number || null,
      JSON.stringify(data.permissions || {}),
      now
    );

    return this.findById(id)!;
  },

  update(id: string, data: Partial<{
    name: string;
    email: string;
    password: string;
    role: string;
    status: string;
    license_number: string;
    signature: string;
    auto_signature_enabled: number;
    auto_signature_until: string;
    permissions: UserPermissions;
    last_login: string;
  }>): User | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (data.password !== undefined) { fields.push('password = ?'); values.push(data.password); }
    if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.license_number !== undefined) { fields.push('license_number = ?'); values.push(data.license_number); }
    if (data.signature !== undefined) { fields.push('signature = ?'); values.push(data.signature); }
    if (data.auto_signature_enabled !== undefined) { fields.push('auto_signature_enabled = ?'); values.push(data.auto_signature_enabled); }
    if (data.auto_signature_until !== undefined) { fields.push('auto_signature_until = ?'); values.push(data.auto_signature_until); }
    if (data.permissions !== undefined) { fields.push('permissions = ?'); values.push(JSON.stringify(data.permissions)); }
    if (data.last_login !== undefined) { fields.push('last_login = ?'); values.push(data.last_login); }

    if (fields.length === 0) return existing;

    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  },

  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  },

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
};
