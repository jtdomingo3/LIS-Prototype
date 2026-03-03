import { getDb } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

export interface Test {
  id: string;
  test_id: string | null;
  patient_id: string;
  test_type: string;
  test_date: string | null;
  status: string;
  specimen_numbers: Record<string, string>;
  assigned_doctor_id: string | null;
  assigned_doctor_name: string | null;
  results: Record<string, any>;
  notes: string | null;
  priority: string;
  requested_by: string | null;
  performed_by: string | null;
  completed_at: string | null;
  requested_tests: any[];
  awaiting_only: number;
  status_history: any[];
  payment_history: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface TestRow {
  id: string;
  test_id: string | null;
  patient_id: string;
  test_type: string;
  test_date: string | null;
  status: string;
  specimen_numbers: string;
  assigned_doctor_id: string | null;
  assigned_doctor_name: string | null;
  results: string;
  notes: string | null;
  priority: string;
  requested_by: string | null;
  performed_by: string | null;
  completed_at: string | null;
  requested_tests: string;
  awaiting_only: number;
  status_history: string;
  payment_history: string;
  created_at: string;
  updated_at: string;
  // joined patient info (if using JOIN in queries)
  patient_first_name?: string | null;
  patient_middle_name?: string | null;
  patient_last_name?: string | null;
}

function rowToTest(row: TestRow): Test {
  const base: any = {
    ...row,
    specimen_numbers: JSON.parse(row.specimen_numbers || '{}'),
    results: JSON.parse(row.results || '{}'),
    requested_tests: JSON.parse(row.requested_tests || '[]'),
    status_history: JSON.parse(row.status_history || '[]'),
    payment_history: JSON.parse(row.payment_history || '{}'),
  };

  // compute patient_name if joined columns are present
  if (row.patient_last_name || row.patient_first_name || row.patient_middle_name) {
    // format Lastname, Firstname Middle
    const parts: string[] = [];
    if (row.patient_last_name) parts.push(row.patient_last_name);
    const sub: string[] = [];
    if (row.patient_first_name) sub.push(row.patient_first_name);
    if (row.patient_middle_name) sub.push(row.patient_middle_name);
    if (sub.length) {
      parts.push(sub.join(' '));
    }
    base.patient_name = parts.join(', ').trim();
  }

  return base as Test;
}

export interface TestListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  testType?: string;
  date?: string;
  patientId?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export const TestModel = {
  findAll(options: TestListOptions = {}): { tests: Test[]; total: number } {
    const db = getDb();
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    // base where clause on tests table
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (options.search) {
      // search both test fields and patient name/code
      where += ' AND (t.test_id LIKE ? OR t.test_type LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.patient_code LIKE ?)';
      const s = `%${options.search}%`;
      params.push(s, s, s, s, s);
    }

    if (options.status) {
      where += ' AND t.status = ?';
      params.push(options.status);
    }

    if (options.testType) {
      where += ' AND LOWER(t.test_type) = LOWER(?)';
      params.push(options.testType);
    }

    if (options.date) {
      where += ' AND DATE(t.test_date) = DATE(?)';
      params.push(options.date);
    }

    if (options.patientId) {
      where += ' AND t.patient_id = ?';
      params.push(options.patientId);
    }

    const sortBy = options.sortBy ? `t.${options.sortBy}` : 't.created_at';
    const sortOrder = options.sortOrder || 'DESC';

    // count query (no join needed since filtering by patient won't change total?)
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM tests t LEFT JOIN patients p ON p.id = t.patient_id ${where}`).get(...params) as { count: number };

    const rows = db.prepare(`
      SELECT t.*, p.first_name AS patient_first_name, p.middle_name AS patient_middle_name, p.last_name AS patient_last_name
      FROM tests t
      LEFT JOIN patients p ON p.id = t.patient_id
      ${where}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as TestRow[];

    return {
      tests: rows.map(rowToTest),
      total: countRow.count,
    };
  },

  findById(id: string): Test | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tests WHERE id = ?').get(id) as TestRow | undefined;
    return row ? rowToTest(row) : null;
  },

  findByPatientId(patientId: string): Test[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM tests WHERE patient_id = ? ORDER BY created_at DESC').all(patientId) as TestRow[];
    return rows.map(rowToTest);
  },

  findByStatus(status: string): Test[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM tests WHERE status = ? ORDER BY created_at DESC').all(status) as TestRow[];
    return rows.map(rowToTest);
  },

  create(data: Partial<Test> & { patient_id: string; test_type: string }): Test {
    const db = getDb();
    const id = data.id || uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tests (
        id, test_id, patient_id, test_type, test_date, status,
        specimen_numbers, assigned_doctor_id, assigned_doctor_name,
        results, notes, priority, requested_by, performed_by,
        completed_at, requested_tests, awaiting_only, status_history,
        payment_history, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.test_id || null,
      data.patient_id,
      data.test_type,
      data.test_date || now,
      data.status || 'Pending',
      JSON.stringify(data.specimen_numbers || {}),
      data.assigned_doctor_id || null,
      data.assigned_doctor_name || null,
      JSON.stringify(data.results || {}),
      data.notes || null,
      data.priority || 'Normal',
      data.requested_by || null,
      data.performed_by || null,
      data.completed_at || null,
      JSON.stringify(data.requested_tests || []),
      data.awaiting_only ? 1 : 0,
      JSON.stringify(data.status_history || []),
      JSON.stringify(data.payment_history || {}),
      data.created_at || now,
      data.updated_at || now
    );

    return this.findById(id)!;
  },

  update(id: string, data: Partial<Test>): Test | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    const simpleFields = [
      'test_id', 'patient_id', 'test_type', 'test_date', 'status',
      'assigned_doctor_id', 'assigned_doctor_name', 'notes', 'priority',
      'requested_by', 'performed_by', 'completed_at'
    ] as const;

    for (const field of simpleFields) {
      if ((data as any)[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push((data as any)[field]);
      }
    }

    if (data.awaiting_only !== undefined) {
      fields.push('awaiting_only = ?');
      values.push(data.awaiting_only ? 1 : 0);
    }

    const jsonFields = ['specimen_numbers', 'results', 'requested_tests', 'status_history', 'payment_history'] as const;
    for (const field of jsonFields) {
      if ((data as any)[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(JSON.stringify((data as any)[field]));
      }
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);
    db.prepare(`UPDATE tests SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM tests WHERE id = ?').run(id);
    return result.changes > 0;
  },

  countByStatus(dateFilter?: string): Record<string, number> {
    const db = getDb();
    let query = 'SELECT status, COUNT(*) as count FROM tests';
    const params: any[] = [];
    if (dateFilter) {
      query += ' WHERE DATE(test_date) = DATE(?)';
      params.push(dateFilter);
    }
    query += ' GROUP BY status';

    const rows = db.prepare(query).all(...params) as { status: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result;
  },

  countByType(dateFilter?: string): Record<string, number> {
    const db = getDb();
    let query = 'SELECT test_type, COUNT(*) as count FROM tests';
    const params: any[] = [];
    if (dateFilter) {
      query += ' WHERE DATE(test_date) = DATE(?)';
      params.push(dateFilter);
    }
    query += ' GROUP BY test_type';

    const rows = db.prepare(query).all(...params) as { test_type: string; count: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.test_type] = row.count;
    }
    return result;
  },

  getNextTestId(prefix: string): string {
    const db = getDb();
    const key = `test_${prefix}`;

    // Upsert counter
    const row = db.prepare('SELECT value FROM counters WHERE key = ?').get(key) as { value: number } | undefined;
    const next = (row?.value || 0) + 1;

    if (row) {
      db.prepare('UPDATE counters SET value = ? WHERE key = ?').run(next, key);
    } else {
      db.prepare('INSERT INTO counters (key, value) VALUES (?, ?)').run(key, next);
    }

    return `${prefix}${String(next).padStart(7, '0')}`;
  }
};
