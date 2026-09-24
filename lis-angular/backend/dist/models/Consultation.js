"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsultationModel = void 0;
exports.calculateBmi = calculateBmi;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
// DOH Philippines / Asia-Pacific (PhilPEN & FNRI) adult BMI classification:
function calculateBmi(weightKg, heightCm) {
    const w = parseFloat(String(weightKg || ''));
    const h = parseFloat(String(heightCm || ''));
    if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
        return { bmi: null, category: '' };
    }
    const hM = h / 100.0;
    const val = +(w / (hM * hM)).toFixed(1);
    let cat = 'Normal';
    if (val < 18.5)
        cat = 'Underweight';
    else if (val <= 22.9)
        cat = 'Normal';
    else if (val <= 24.9)
        cat = 'Overweight';
    else if (val <= 29.9)
        cat = 'Obese I';
    else
        cat = 'Obese II';
    return { bmi: val, category: cat };
}
function parseJson(val, fallback) {
    if (!val)
        return fallback;
    try {
        return JSON.parse(val);
    }
    catch {
        return fallback;
    }
}
function rowToConsultation(row) {
    return {
        ...row,
        smoking: parseJson(row.smoking, { status: 'Never Smoked' }),
        alcohol: parseJson(row.alcohol, { status: 'Non-drinker' }),
        family_history: parseJson(row.family_history, { diseases: [] }),
        social_history: parseJson(row.social_history, {}),
        vital_signs: parseJson(row.vital_signs, {}),
        differential_diagnosis: parseJson(row.differential_diagnosis, []),
        prescriptions: parseJson(row.prescriptions, []),
        lab_request_tests: parseJson(row.lab_request_tests, []),
    };
}
exports.ConsultationModel = {
    findAll(options = {}) {
        const db = (0, connection_1.getDb)();
        const where = [];
        const params = [];
        if (options.patient_id) {
            where.push('patient_id = ?');
            params.push(options.patient_id);
        }
        if (options.test_id) {
            where.push('test_id = ?');
            params.push(options.test_id);
        }
        if (options.status) {
            where.push('status = ?');
            params.push(options.status);
        }
        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const countRow = db.prepare(`SELECT COUNT(*) as total FROM consultations ${whereClause}`).get(...params);
        let query = `SELECT * FROM consultations ${whereClause} ORDER BY consultation_date DESC, created_at DESC`;
        if (options.limit) {
            query += ` LIMIT ${Number(options.limit)}`;
            if (options.offset) {
                query += ` OFFSET ${Number(options.offset)}`;
            }
        }
        const rows = db.prepare(query).all(...params);
        return {
            consultations: rows.map(rowToConsultation),
            total: countRow.total,
        };
    },
    findById(id) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM consultations WHERE id = ?').get(id);
        return row ? rowToConsultation(row) : null;
    },
    findByTestId(testId) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM consultations WHERE test_id = ? ORDER BY created_at DESC LIMIT 1').get(testId);
        return row ? rowToConsultation(row) : null;
    },
    findByPatientId(patientId) {
        const db = (0, connection_1.getDb)();
        const rows = db.prepare('SELECT * FROM consultations WHERE patient_id = ? ORDER BY consultation_date DESC').all(patientId);
        return rows.map(rowToConsultation);
    },
    create(data) {
        const db = (0, connection_1.getDb)();
        const id = data.id || (0, uuid_1.v4)();
        const now = new Date().toISOString();
        // Auto calculate BMI
        const vitals = data.vital_signs || {};
        const { bmi, category } = calculateBmi(vitals.weight, vitals.height);
        if (bmi !== null) {
            vitals.bmi = bmi;
            vitals.bmiCategory = category;
        }
        // Auto compute pack-years if smoking sticks/years provided
        const smoking = data.smoking || { status: 'Never Smoked' };
        if (smoking.sticksPerDay && smoking.years && (smoking.packYears === undefined || smoking.packYears === '')) {
            const spd = parseFloat(String(smoking.sticksPerDay));
            const yrs = parseFloat(String(smoking.years));
            if (!isNaN(spd) && !isNaN(yrs)) {
                smoking.packYears = +((spd / 20) * yrs).toFixed(1);
            }
        }
        const completedAt = data.status === 'Completed' ? (data.completed_at || now) : null;
        db.prepare(`
      INSERT INTO consultations (
        id, patient_id, test_id, doctor_id, doctor_name, doctor_license_number, doctor_designation,
        visit_type, consultation_date, status, chief_complaint, history_of_present_illness,
        past_medical_history, current_medications, allergies, review_of_systems, smoking,
        alcohol, family_history, social_history, vital_signs, physical_exam_findings,
        primary_diagnosis, differential_diagnosis, suspected_pathology, clinical_impression,
        treatment_plan, prescriptions, lab_request_tests, referrals, follow_up_date,
        follow_up_notes, created_at, updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(id, data.patient_id, data.test_id || null, data.doctor_id || null, data.doctor_name || null, data.doctor_license_number || null, data.doctor_designation || null, data.visit_type || 'New', data.consultation_date || now, data.status || 'In Progress', data.chief_complaint || null, data.history_of_present_illness || null, data.past_medical_history || null, data.current_medications || null, data.allergies || null, data.review_of_systems || null, JSON.stringify(smoking), JSON.stringify(data.alcohol || { status: 'Non-drinker' }), JSON.stringify(data.family_history || { diseases: [] }), JSON.stringify(data.social_history || {}), JSON.stringify(vitals), data.physical_exam_findings || null, data.primary_diagnosis || null, JSON.stringify(data.differential_diagnosis || []), data.suspected_pathology || null, data.clinical_impression || null, data.treatment_plan || null, JSON.stringify(data.prescriptions || []), JSON.stringify(data.lab_request_tests || []), data.referrals || null, data.follow_up_date || null, data.follow_up_notes || null, data.created_at || now, now, completedAt);
        return this.findById(id);
    },
    update(id, data) {
        const db = (0, connection_1.getDb)();
        const existing = this.findById(id);
        if (!existing)
            return null;
        const fields = [];
        const values = [];
        const now = new Date().toISOString();
        if (data.doctor_id !== undefined) {
            fields.push('doctor_id = ?');
            values.push(data.doctor_id);
        }
        if (data.doctor_name !== undefined) {
            fields.push('doctor_name = ?');
            values.push(data.doctor_name);
        }
        if (data.doctor_license_number !== undefined) {
            fields.push('doctor_license_number = ?');
            values.push(data.doctor_license_number);
        }
        if (data.doctor_designation !== undefined) {
            fields.push('doctor_designation = ?');
            values.push(data.doctor_designation);
        }
        if (data.visit_type !== undefined) {
            fields.push('visit_type = ?');
            values.push(data.visit_type);
        }
        if (data.consultation_date !== undefined) {
            fields.push('consultation_date = ?');
            values.push(data.consultation_date);
        }
        if (data.status !== undefined) {
            fields.push('status = ?');
            values.push(data.status);
            if (data.status === 'Completed' && !existing.completed_at) {
                fields.push('completed_at = ?');
                values.push(now);
            }
        }
        if (data.chief_complaint !== undefined) {
            fields.push('chief_complaint = ?');
            values.push(data.chief_complaint);
        }
        if (data.history_of_present_illness !== undefined) {
            fields.push('history_of_present_illness = ?');
            values.push(data.history_of_present_illness);
        }
        if (data.past_medical_history !== undefined) {
            fields.push('past_medical_history = ?');
            values.push(data.past_medical_history);
        }
        if (data.current_medications !== undefined) {
            fields.push('current_medications = ?');
            values.push(data.current_medications);
        }
        if (data.allergies !== undefined) {
            fields.push('allergies = ?');
            values.push(data.allergies);
        }
        if (data.review_of_systems !== undefined) {
            fields.push('review_of_systems = ?');
            values.push(data.review_of_systems);
        }
        if (data.smoking !== undefined) {
            const s = data.smoking;
            if (s.sticksPerDay && s.years && (s.packYears === undefined || s.packYears === '')) {
                const spd = parseFloat(String(s.sticksPerDay));
                const yrs = parseFloat(String(s.years));
                if (!isNaN(spd) && !isNaN(yrs)) {
                    s.packYears = +((spd / 20) * yrs).toFixed(1);
                }
            }
            fields.push('smoking = ?');
            values.push(JSON.stringify(s));
        }
        if (data.alcohol !== undefined) {
            fields.push('alcohol = ?');
            values.push(JSON.stringify(data.alcohol));
        }
        if (data.family_history !== undefined) {
            fields.push('family_history = ?');
            values.push(JSON.stringify(data.family_history));
        }
        if (data.social_history !== undefined) {
            fields.push('social_history = ?');
            values.push(JSON.stringify(data.social_history));
        }
        if (data.vital_signs !== undefined) {
            const v = { ...existing.vital_signs, ...data.vital_signs };
            const { bmi, category } = calculateBmi(v.weight, v.height);
            if (bmi !== null) {
                v.bmi = bmi;
                v.bmiCategory = category;
            }
            fields.push('vital_signs = ?');
            values.push(JSON.stringify(v));
        }
        if (data.physical_exam_findings !== undefined) {
            fields.push('physical_exam_findings = ?');
            values.push(data.physical_exam_findings);
        }
        if (data.primary_diagnosis !== undefined) {
            fields.push('primary_diagnosis = ?');
            values.push(data.primary_diagnosis);
        }
        if (data.differential_diagnosis !== undefined) {
            fields.push('differential_diagnosis = ?');
            values.push(JSON.stringify(data.differential_diagnosis));
        }
        if (data.suspected_pathology !== undefined) {
            fields.push('suspected_pathology = ?');
            values.push(data.suspected_pathology);
        }
        if (data.clinical_impression !== undefined) {
            fields.push('clinical_impression = ?');
            values.push(data.clinical_impression);
        }
        if (data.treatment_plan !== undefined) {
            fields.push('treatment_plan = ?');
            values.push(data.treatment_plan);
        }
        if (data.prescriptions !== undefined) {
            fields.push('prescriptions = ?');
            values.push(JSON.stringify(data.prescriptions));
        }
        if (data.lab_request_tests !== undefined) {
            fields.push('lab_request_tests = ?');
            values.push(JSON.stringify(data.lab_request_tests));
        }
        if (data.referrals !== undefined) {
            fields.push('referrals = ?');
            values.push(data.referrals);
        }
        if (data.follow_up_date !== undefined) {
            fields.push('follow_up_date = ?');
            values.push(data.follow_up_date);
        }
        if (data.follow_up_notes !== undefined) {
            fields.push('follow_up_notes = ?');
            values.push(data.follow_up_notes);
        }
        fields.push('updated_at = ?');
        values.push(now);
        values.push(id);
        db.prepare(`UPDATE consultations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },
    delete(id) {
        const db = (0, connection_1.getDb)();
        const result = db.prepare('DELETE FROM consultations WHERE id = ?').run(id);
        return result.changes > 0;
    }
};
//# sourceMappingURL=Consultation.js.map