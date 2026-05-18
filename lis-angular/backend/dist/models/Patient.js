"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientModel = void 0;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
function rowToPatient(row) {
    return {
        ...row,
        required_areas: JSON.parse(row.required_areas || '[]'),
        requested_tests: JSON.parse(row.requested_tests || '[]'),
        payment_history: JSON.parse(row.payment_history || '[]'),
    };
}
exports.PatientModel = {
    findAll(options = {}) {
        const db = (0, connection_1.getDb)();
        const page = options.page || 1;
        const limit = options.limit || 50;
        const offset = (page - 1) * limit;
        let where = 'WHERE 1=1';
        const params = [];
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
            }
            else if (options.philhealth.toLowerCase() === 'no') {
                where += ' AND (philhealth_consent = 0 OR philhealth_consent IS NULL)';
            }
        }
        const sortBy = options.sortBy || 'created_at';
        const sortOrder = options.sortOrder || 'DESC';
        const countRow = db.prepare(`SELECT COUNT(*) as count FROM patients ${where}`).get(...params);
        const rows = db.prepare(`SELECT * FROM patients ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`).all(...params, limit, offset);
        return {
            patients: rows.map(rowToPatient),
            total: countRow.count,
        };
    },
    findById(id) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
        return row ? rowToPatient(row) : null;
    },
    create(data) {
        const db = (0, connection_1.getDb)();
        const id = data.id || (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO patients (
        id, patient_id, patient_code, first_name, middle_name, last_name,
        date_of_birth, age_manual, gender, phone, email, address,
        physician, company, philhealth_consent, philhealth_id,
        required_areas, requested_tests, payment_history,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.patient_id || null, data.patient_code || null, data.first_name, data.middle_name || null, data.last_name, data.date_of_birth || null, data.age_manual || null, data.gender || null, data.phone || null, data.email || null, data.address || null, data.physician || null, data.company || null, data.philhealth_consent ? 1 : 0, data.philhealth_id || null, JSON.stringify(data.required_areas || []), JSON.stringify(data.requested_tests || []), JSON.stringify(data.payment_history || []), data.created_by || null, data.created_at || now, data.updated_at || now);
        return this.findById(id);
    },
    update(id, data) {
        const db = (0, connection_1.getDb)();
        const existing = this.findById(id);
        if (!existing)
            return null;
        const fields = [];
        const values = [];
        const simpleFields = [
            'patient_id', 'patient_code', 'first_name', 'middle_name', 'last_name',
            'date_of_birth', 'age_manual', 'gender', 'phone', 'email', 'address',
            'physician', 'company', 'philhealth_id', 'created_by'
        ];
        for (const field of simpleFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        }
        if (data.philhealth_consent !== undefined) {
            fields.push('philhealth_consent = ?');
            values.push(data.philhealth_consent ? 1 : 0);
        }
        const jsonFields = ['required_areas', 'requested_tests', 'payment_history'];
        for (const field of jsonFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(JSON.stringify(data[field]));
            }
        }
        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        if (fields.length === 1)
            return existing; // only updated_at
        values.push(id);
        db.prepare(`UPDATE patients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },
    delete(id) {
        const db = (0, connection_1.getDb)();
        const result = db.prepare('DELETE FROM patients WHERE id = ?').run(id);
        return result.changes > 0;
    },
    count(dateFilter) {
        const db = (0, connection_1.getDb)();
        if (dateFilter) {
            const row = db.prepare('SELECT COUNT(*) as count FROM patients WHERE DATE(created_at) = DATE(?)').get(dateFilter);
            return row.count;
        }
        const row = db.prepare('SELECT COUNT(*) as count FROM patients').get();
        return row.count;
    },
    getNextPatientId() {
        const db = (0, connection_1.getDb)();
        const row = db.prepare("SELECT MAX(CAST(REPLACE(patient_id, 'P', '') AS INTEGER)) as maxId FROM patients").get();
        const next = (row.maxId || 0) + 1;
        return `P${String(next).padStart(3, '0')}`;
    },
    generatePatientCode() {
        const db = (0, connection_1.getDb)();
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const pattern = `GCL-${today}-%`;
        const row = db.prepare("SELECT COUNT(*) as count FROM patients WHERE patient_code LIKE ?").get(pattern);
        const seq = row.count + 1;
        return `GCL-${today}-${String(seq).padStart(5, '0')}`;
    }
};
//# sourceMappingURL=Patient.js.map