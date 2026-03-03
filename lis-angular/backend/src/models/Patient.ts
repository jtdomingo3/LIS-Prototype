import { getDb } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

export interface Patient {
  id: string;
  patient_id: string | null;
  patient_code: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  age_manual: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  physician: string | null;
  company: string | null;
  philhealth_consent: number;
  philhealth_id: string | null;
  required_areas: string[];
  requested_tests: any[];
  payment_history: any[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PatientRow {
  id: string;
  patient_id: string | null;
  patient_code: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  age_manual: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  physician: string | null;
  company: string | null;
  philhealth_consent: number;
  philhealth_id: string | null;
  required_areas: string;
  requested_tests: string;
  payment_history: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPatient(row: PatientRow): Patient {
  return {
    ...row,
    required_areas: JSON.parse(row.required_areas || '[]'),
    requested_tests: JSON.parse(row.requested_tests || '[]'),
    payment_history: JSON.parse(row.payment_history || '[]'),
  };
}

export interface PatientListOptions {
  page?: number;
  limit?: number;
  search?: string;
  date?: string;
  company?: string;
  philhealth?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export const PatientModel = {
  findAll(options: PatientListOptions = {}): { patients: Patient[]; total: number } {
    const db = getDb();
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (options.search) {
      where += ' AND (LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?) OR LOWER(middle_name) LIKE LOWER(?) OR patient_id LIKE ? OR patient_code LIKE ?)';
      const s = `%${options.search}%`;
      params.push(s, s, s, s, s);
    }

    if (options.date) {
      where += ' AND DATE(created_at) = DATE(?)';
      params.push(options.date);
    }

    if (options.company) {
      where += ' AND LOWER(company) = LOWER(?)';
      params.push(options.company);
    }

    if (options.philhealth) {
      if (options.philhealth.toLowerCase() === 'yes') {
        where += ' AND philhealth_consent = 1';
      } else if (options.philhealth.toLowerCase() === 'no') {
        where += ' AND (philhealth_consent = 0 OR philhealth_consent IS NULL)';
      }
    }

    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'DESC';

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM patients ${where}`).get(...params) as { count: number };
    const rows = db.prepare(`SELECT * FROM patients ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, limit, offset) as PatientRow[];

    return {
      patients: rows.map(rowToPatient),
      total: countRow.count,
    };
  },

  findById(id: string): Patient | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as PatientRow | undefined;
    return row ? rowToPatient(row) : null;
  },

  create(data: Partial<Patient> & { first_name: string; last_name: string }): Patient {
    const db = getDb();
    const id = data.id || uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO patients (
        id, patient_id, patient_code, first_name, middle_name, last_name,
        date_of_birth, age_manual, gender, phone, email, address,
        physician, company, philhealth_consent, philhealth_id,
        required_areas, requested_tests, payment_history,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.patient_id || null,
      data.patient_code || null,
      data.first_name,
      data.middle_name || null,
      data.last_name,
      data.date_of_birth || null,
      data.age_manual || null,
      data.gender || null,
      data.phone || null,
      data.email || null,
      data.address || null,
      data.physician || null,
      data.company || null,
      data.philhealth_consent ? 1 : 0,
      data.philhealth_id || null,
      JSON.stringify(data.required_areas || []),
      JSON.stringify(data.requested_tests || []),
      JSON.stringify(data.payment_history || []),
      data.created_by || null,
      data.created_at || now,
      data.updated_at || now
    );

    return this.findById(id)!;
  },

  update(id: string, data: Partial<Patient>): Patient | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    const simpleFields = [
      'patient_id', 'patient_code', 'first_name', 'middle_name', 'last_name',
      'date_of_birth', 'age_manual', 'gender', 'phone', 'email', 'address',
      'physician', 'company', 'philhealth_id', 'created_by'
    ] as const;

    for (const field of simpleFields) {
      if ((data as any)[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push((data as any)[field]);
      }
    }

    if (data.philhealth_consent !== undefined) {
      fields.push('philhealth_consent = ?');
      values.push(data.philhealth_consent ? 1 : 0);
    }

    const jsonFields = ['required_areas', 'requested_tests', 'payment_history'] as const;
    for (const field of jsonFields) {
      if ((data as any)[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(JSON.stringify((data as any)[field]));
      }
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    if (fields.length === 1) return existing; // only updated_at

    values.push(id);
    db.prepare(`UPDATE patients SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM patients WHERE id = ?').run(id);
    return result.changes > 0;
  },

  count(dateFilter?: string): number {
    const db = getDb();
    if (dateFilter) {
      const row = db.prepare('SELECT COUNT(*) as count FROM patients WHERE DATE(created_at) = DATE(?)').get(dateFilter) as { count: number };
      return row.count;
    }
    const row = db.prepare('SELECT COUNT(*) as count FROM patients').get() as { count: number };
    return row.count;
  },

  getNextPatientId(): string {
    const db = getDb();
    const row = db.prepare("SELECT MAX(CAST(REPLACE(patient_id, 'P', '') AS INTEGER)) as maxId FROM patients").get() as { maxId: number | null };
    const next = (row.maxId || 0) + 1;
    return `P${String(next).padStart(3, '0')}`;
  },

  generatePatientCode(): string {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pattern = `GCL-${today}-%`;
    const row = db.prepare("SELECT COUNT(*) as count FROM patients WHERE patient_code LIKE ?").get(pattern) as { count: number };
    const seq = row.count + 1;
    return `GCL-${today}-${String(seq).padStart(5, '0')}`;
  }
};
