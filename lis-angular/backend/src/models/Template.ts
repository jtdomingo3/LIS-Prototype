import { getDb } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

export interface Template {
  id: string;
  name: string;
  test_type: string | null;
  fields: any[];
  footer_notes: string | null;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  name: string;
  test_type: string | null;
  fields: string;
  footer_notes: string | null;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): Template {
  return {
    ...row,
    fields: JSON.parse(row.fields || '[]'),
  };
}

export const TemplateModel = {
  findAll(activeOnly = true): Template[] {
    const db = getDb();
    const where = activeOnly ? 'WHERE is_active = 1' : '';
    const rows = db.prepare(`SELECT * FROM templates ${where} ORDER BY name ASC`).all() as TemplateRow[];
    return rows.map(rowToTemplate);
  },

  findById(id: string): Template | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  },

  findByTestType(testType: string): Template[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM templates WHERE LOWER(test_type) = LOWER(?) AND is_active = 1').all(testType) as TemplateRow[];
    return rows.map(rowToTemplate);
  },

  create(data: { name: string; test_type?: string; fields?: any[]; footer_notes?: string; created_by?: string }): Template {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO templates (id, name, test_type, fields, footer_notes, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.test_type || null,
      JSON.stringify(data.fields || []),
      data.footer_notes || null,
      data.created_by || null,
      now,
      now
    );

    return this.findById(id)!;
  },

  update(id: string, data: Partial<Template>): Template | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.test_type !== undefined) { fields.push('test_type = ?'); values.push(data.test_type); }
    if (data.fields !== undefined) { fields.push('fields = ?'); values.push(JSON.stringify(data.fields)); }
    if (data.footer_notes !== undefined) { fields.push('footer_notes = ?'); values.push(data.footer_notes); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);
    db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  },

  delete(id: string): boolean {
    // Soft delete
    const db = getDb();
    const result = db.prepare('UPDATE templates SET is_active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return result.changes > 0;
  },

  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM templates WHERE is_active = 1').get() as { count: number };
    return row.count;
  }
};
