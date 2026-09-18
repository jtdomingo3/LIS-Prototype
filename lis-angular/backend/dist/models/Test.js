"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestModel = void 0;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
function rowToTest(row) {
    const base = {
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
        const parts = [];
        if (row.patient_last_name)
            parts.push(row.patient_last_name);
        const sub = [];
        if (row.patient_first_name)
            sub.push(row.patient_first_name);
        if (row.patient_middle_name)
            sub.push(row.patient_middle_name);
        if (sub.length) {
            parts.push(sub.join(' '));
        }
        base.patient_name = parts.join(', ').trim();
    }
    return base;
}
exports.TestModel = {
    findAll(options = {}) {
        const db = (0, connection_1.getDb)();
        const page = options.page || 1;
        const limit = options.limit || 50;
        const offset = (page - 1) * limit;
        // base where clause on tests table
        let where = 'WHERE 1=1';
        const params = [];
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
        const countRow = db.prepare(`SELECT COUNT(*) as count FROM tests t LEFT JOIN patients p ON p.id = t.patient_id ${where}`).get(...params);
        const rows = db.prepare(`
      SELECT t.*, p.first_name AS patient_first_name, p.middle_name AS patient_middle_name, p.last_name AS patient_last_name
      FROM tests t
      LEFT JOIN patients p ON p.id = t.patient_id
      ${where}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
        return {
            tests: rows.map(rowToTest),
            total: countRow.count,
        };
    },
    findById(id) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare(`
      SELECT t.*, p.first_name AS patient_first_name, p.middle_name AS patient_middle_name,
             p.last_name AS patient_last_name
      FROM tests t
      LEFT JOIN patients p ON p.id = t.patient_id
      WHERE t.id = ?
    `).get(id);
        return row ? rowToTest(row) : null;
    },
    findByPatientId(patientId) {
        const db = (0, connection_1.getDb)();
        const rows = db.prepare('SELECT * FROM tests WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);
        return rows.map(rowToTest);
    },
    findByStatus(status) {
        const db = (0, connection_1.getDb)();
        const rows = db.prepare('SELECT * FROM tests WHERE status = ? ORDER BY created_at DESC').all(status);
        return rows.map(rowToTest);
    },
    create(data) {
        const db = (0, connection_1.getDb)();
        const id = data.id || (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO tests (
        id, test_id, patient_id, test_type, test_date, status,
        specimen_numbers, assigned_doctor_id, assigned_doctor_name,
        results, notes, priority, requested_by, performed_by,
        completed_at, requested_tests, awaiting_only, status_history,
        payment_history, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.test_id || null, data.patient_id, data.test_type, data.test_date || now, data.status || 'Pending', JSON.stringify(data.specimen_numbers || {}), data.assigned_doctor_id || null, data.assigned_doctor_name || null, JSON.stringify(data.results || {}), data.notes || null, data.priority || 'Normal', data.requested_by || null, data.performed_by || null, data.completed_at || null, JSON.stringify(data.requested_tests || []), data.awaiting_only ? 1 : 0, JSON.stringify(data.status_history || []), JSON.stringify(data.payment_history || {}), data.created_at || now, data.updated_at || now);
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
            'test_id', 'patient_id', 'test_type', 'test_date', 'status',
            'assigned_doctor_id', 'assigned_doctor_name', 'notes', 'priority',
            'requested_by', 'performed_by', 'completed_at'
        ];
        for (const field of simpleFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(data[field]);
            }
        }
        if (data.awaiting_only !== undefined) {
            fields.push('awaiting_only = ?');
            values.push(data.awaiting_only ? 1 : 0);
        }
        const jsonFields = ['specimen_numbers', 'results', 'requested_tests', 'status_history', 'payment_history'];
        for (const field of jsonFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(JSON.stringify(data[field]));
            }
        }
        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(id);
        db.prepare(`UPDATE tests SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },
    delete(id) {
        const db = (0, connection_1.getDb)();
        const result = db.prepare('DELETE FROM tests WHERE id = ?').run(id);
        return result.changes > 0;
    },
    countByStatus(dateFilter) {
        const db = (0, connection_1.getDb)();
        let query = 'SELECT status, COUNT(*) as count FROM tests';
        const params = [];
        if (dateFilter) {
            query += ' WHERE DATE(test_date) = DATE(?)';
            params.push(dateFilter);
        }
        query += ' GROUP BY status';
        const rows = db.prepare(query).all(...params);
        const result = {};
        for (const row of rows) {
            result[row.status] = row.count;
        }
        return result;
    },
    countByType(dateFilter) {
        const db = (0, connection_1.getDb)();
        let query = 'SELECT test_type, COUNT(*) as count FROM tests';
        const params = [];
        if (dateFilter) {
            query += ' WHERE DATE(test_date) = DATE(?)';
            params.push(dateFilter);
        }
        query += ' GROUP BY test_type';
        const rows = db.prepare(query).all(...params);
        const result = {};
        for (const row of rows) {
            result[row.test_type] = row.count;
        }
        return result;
    },
    getNextTestId(prefix) {
        const db = (0, connection_1.getDb)();
        const key = `test_${prefix}`;
        // Upsert counter
        const row = db.prepare('SELECT value FROM counters WHERE key = ?').get(key);
        const next = (row?.value || 0) + 1;
        if (row) {
            db.prepare('UPDATE counters SET value = ? WHERE key = ?').run(next, key);
        }
        else {
            db.prepare('INSERT INTO counters (key, value) VALUES (?, ?)').run(key, next);
        }
        return `${prefix}${String(next).padStart(7, '0')}`;
    }
};
//# sourceMappingURL=Test.js.map