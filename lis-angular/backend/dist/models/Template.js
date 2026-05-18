"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateModel = void 0;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
function rowToTemplate(row) {
    return {
        ...row,
        fields: JSON.parse(row.fields || '[]'),
    };
}
exports.TemplateModel = {
    findAll(activeOnly = true) {
        const db = (0, connection_1.getDb)();
        const where = activeOnly ? 'WHERE is_active = 1' : '';
        const rows = db.prepare(`SELECT * FROM templates ${where} ORDER BY name ASC`).all();
        return rows.map(rowToTemplate);
    },
    findById(id) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
        return row ? rowToTemplate(row) : null;
    },
    findByTestType(testType) {
        const db = (0, connection_1.getDb)();
        const rows = db.prepare('SELECT * FROM templates WHERE LOWER(test_type) = LOWER(?) AND is_active = 1').all(testType);
        return rows.map(rowToTemplate);
    },
    create(data) {
        const db = (0, connection_1.getDb)();
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO templates (id, name, test_type, fields, footer_notes, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, data.name, data.test_type || null, JSON.stringify(data.fields || []), data.footer_notes || null, data.created_by || null, now, now);
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
        if (data.test_type !== undefined) {
            fields.push('test_type = ?');
            values.push(data.test_type);
        }
        if (data.fields !== undefined) {
            fields.push('fields = ?');
            values.push(JSON.stringify(data.fields));
        }
        if (data.footer_notes !== undefined) {
            fields.push('footer_notes = ?');
            values.push(data.footer_notes);
        }
        if (data.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(data.is_active);
        }
        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(id);
        db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },
    delete(id) {
        // Soft delete
        const db = (0, connection_1.getDb)();
        const result = db.prepare('UPDATE templates SET is_active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
        return result.changes > 0;
    },
    count() {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT COUNT(*) as count FROM templates WHERE is_active = 1').get();
        return row.count;
    }
};
//# sourceMappingURL=Template.js.map