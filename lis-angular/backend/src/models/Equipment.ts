import { getDb } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

export interface RadiationSafetyDetails {
  isRadiationEmitter?: boolean;
  fdaCdrrhrRegNumber?: string;
  radiationSafetyOfficer?: string;
  tubeModel?: string;
  tubeSerialNumber?: string;
  maxKvp?: number | null;
  maxMa?: number | null;
  totalFiltrationHvl?: string;
  lastRadiationSurveyDate?: string | null;
  nextRadiationSurveyDate?: string | null;
  leadApronCheckDate?: string | null;
}

export interface Equipment {
  id: string;
  equipment_code: string;
  name: string;
  category: string;
  department: string;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  location: string | null;
  status: string; // OPERATIONAL, CALIBRATION_DUE, CALIBRATION_OVERDUE, MAINTENANCE_DUE, OUT_OF_SERVICE, DECOMMISSIONED
  criticality: string;
  acquisition_date: string | null;
  installation_date: string | null;
  warranty_expiry_date: string | null;
  supplier_vendor: string | null;
  service_engineer: string | null;
  service_contact: string | null;
  calibration_cycle_days: number;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  pm_cycle_days: number;
  last_pm_date: string | null;
  next_pm_date: string | null;
  radiation_safety_details: RadiationSafetyDetails;
  documents: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Helpers
  days_until_calibration?: number | null;
  is_calibration_due?: boolean;
  is_calibration_overdue?: boolean;
}

export interface EquipmentLog {
  id: string;
  equipment_id: string;
  log_type: string; // CALIBRATION, PREVENTIVE_MAINTENANCE, REPAIR, INSPECTION
  service_date: string;
  next_service_date: string | null;
  performed_by: string | null;
  service_provider: string | null;
  certificate_number: string | null;
  result_status: string; // PASSED, FAILED, PENDING
  findings: string | null;
  actions_taken: string | null;
  cost: number | null;
  documents: string[];
  created_at: string;
}

export interface QcControl {
  id: string;
  equipment_id: string | null;
  control_name: string;
  lot_number: string;
  level: string;
  expiration_date: string | null;
  target_values: Record<string, { mean: number; sd: number; unit?: string }>;
  analytes?: any[];
  is_active: number;
  created_at: string;
}

export interface QcEntry {
  id: string;
  equipment_id: string | null;
  control_id: string;
  analyte_code: string;
  analyte_name: string | null;
  control_lot: string | null;
  run_date: string;
  run_number?: number;
  measured_value: number;
  mean_target: number | null;
  sd_target: number | null;
  z_score: number | null;
  status: string; // IN_CONTROL / ACCEPTED, WARNING, REJECTED / OUT_OF_CONTROL
  violated_rules: string[];
  violation_type?: string | null;
  reagent_lot_number?: string | null;
  corrective_action?: any;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface NeqasRecord {
  id: string;
  equipment_id: string | null;
  cycle_year: string;
  event_number: string | null;
  nrl_name: string;
  sample_id: string | null;
  analyte_code: string | null;
  target_score: number | null;
  achieved_score: number | null;
  status: string;
  certificate_number: string | null;
  survey_date: string | null;
  notes: string | null;
  created_at: string;
}

interface EquipmentRow {
  id: string;
  equipment_code: string;
  name: string;
  category: string;
  department: string;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  criticality: string;
  acquisition_date: string | null;
  installation_date: string | null;
  warranty_expiry_date: string | null;
  supplier_vendor: string | null;
  service_engineer: string | null;
  service_contact: string | null;
  calibration_cycle_days: number;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  pm_cycle_days: number;
  last_pm_date: string | null;
  next_pm_date: string | null;
  radiation_safety_details: string;
  documents: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEquipment(row: EquipmentRow): Equipment {
  let rad: RadiationSafetyDetails = {};
  let docs: string[] = [];
  try { rad = JSON.parse(row.radiation_safety_details || '{}'); } catch {}
  try { docs = JSON.parse(row.documents || '[]'); } catch {}

  let daysUntilCal: number | null = null;
  let isCalDue = false;
  let isCalOverdue = false;

  if (row.next_calibration_date) {
    const diff = new Date(row.next_calibration_date).getTime() - Date.now();
    daysUntilCal = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (daysUntilCal <= 0) isCalOverdue = true;
    else if (daysUntilCal <= 30) isCalDue = true;
  }

  return {
    ...row,
    radiation_safety_details: rad,
    documents: docs,
    days_until_calibration: daysUntilCal,
    is_calibration_due: isCalDue,
    is_calibration_overdue: isCalOverdue,
  };
}

export const EquipmentModel = {
  findAll(options: { department?: string; status?: string; search?: string } = {}): Equipment[] {
    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];

    if (options.department) {
      where.push('department = ?');
      params.push(options.department);
    }
    if (options.status) {
      where.push('status = ?');
      params.push(options.status);
    }
    if (options.search) {
      where.push('(name LIKE ? OR equipment_code LIKE ? OR manufacturer LIKE ?)');
      const q = `%${options.search}%`;
      params.push(q, q, q);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM equipment ${whereClause} ORDER BY name ASC`).all(...params) as EquipmentRow[];
    return rows.map(rowToEquipment);
  },

  findById(id: string): Equipment | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as EquipmentRow | undefined;
    return row ? rowToEquipment(row) : null;
  },

  create(data: Partial<Equipment>): Equipment {
    const db = getDb();
    const id = data.id || uuidv4();
    const code = data.equipment_code || `EQ-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO equipment (
        id, equipment_code, name, category, department, manufacturer,
        model_number, serial_number, location, status, criticality,
        acquisition_date, installation_date, warranty_expiry_date,
        supplier_vendor, service_engineer, service_contact,
        calibration_cycle_days, last_calibration_date, next_calibration_date,
        pm_cycle_days, last_pm_date, next_pm_date,
        radiation_safety_details, documents, notes, created_by,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      id,
      code,
      data.name || 'Unnamed Equipment',
      data.category || 'General Equipment',
      data.department || 'General Laboratory',
      data.manufacturer || null,
      data.model_number || null,
      data.serial_number || null,
      data.location || null,
      data.status || 'OPERATIONAL',
      data.criticality || 'High',
      data.acquisition_date || null,
      data.installation_date || null,
      data.warranty_expiry_date || null,
      data.supplier_vendor || null,
      data.service_engineer || null,
      data.service_contact || null,
      data.calibration_cycle_days || 365,
      data.last_calibration_date || null,
      data.next_calibration_date || null,
      data.pm_cycle_days || 180,
      data.last_pm_date || null,
      data.next_pm_date || null,
      JSON.stringify(data.radiation_safety_details || {}),
      JSON.stringify(data.documents || []),
      data.notes || null,
      data.created_by || 'System',
      now,
      now
    );

    return this.findById(id)!;
  },

  update(id: string, data: Partial<Equipment>): Equipment | null {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    const now = new Date().toISOString();

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
    if (data.department !== undefined) { fields.push('department = ?'); values.push(data.department); }
    if (data.manufacturer !== undefined) { fields.push('manufacturer = ?'); values.push(data.manufacturer); }
    if (data.model_number !== undefined) { fields.push('model_number = ?'); values.push(data.model_number); }
    if (data.serial_number !== undefined) { fields.push('serial_number = ?'); values.push(data.serial_number); }
    if (data.location !== undefined) { fields.push('location = ?'); values.push(data.location); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.criticality !== undefined) { fields.push('criticality = ?'); values.push(data.criticality); }
    if (data.acquisition_date !== undefined) { fields.push('acquisition_date = ?'); values.push(data.acquisition_date); }
    if (data.installation_date !== undefined) { fields.push('installation_date = ?'); values.push(data.installation_date); }
    if (data.warranty_expiry_date !== undefined) { fields.push('warranty_expiry_date = ?'); values.push(data.warranty_expiry_date); }
    if (data.supplier_vendor !== undefined) { fields.push('supplier_vendor = ?'); values.push(data.supplier_vendor); }
    if (data.service_engineer !== undefined) { fields.push('service_engineer = ?'); values.push(data.service_engineer); }
    if (data.service_contact !== undefined) { fields.push('service_contact = ?'); values.push(data.service_contact); }
    if (data.calibration_cycle_days !== undefined) { fields.push('calibration_cycle_days = ?'); values.push(data.calibration_cycle_days); }
    if (data.last_calibration_date !== undefined) { fields.push('last_calibration_date = ?'); values.push(data.last_calibration_date); }
    if (data.next_calibration_date !== undefined) { fields.push('next_calibration_date = ?'); values.push(data.next_calibration_date); }
    if (data.pm_cycle_days !== undefined) { fields.push('pm_cycle_days = ?'); values.push(data.pm_cycle_days); }
    if (data.last_pm_date !== undefined) { fields.push('last_pm_date = ?'); values.push(data.last_pm_date); }
    if (data.next_pm_date !== undefined) { fields.push('next_pm_date = ?'); values.push(data.next_pm_date); }
    if (data.radiation_safety_details !== undefined) { fields.push('radiation_safety_details = ?'); values.push(JSON.stringify(data.radiation_safety_details)); }
    if (data.documents !== undefined) { fields.push('documents = ?'); values.push(JSON.stringify(data.documents)); }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }

    fields.push('updated_at = ?');
    values.push(now);

    values.push(id);
    db.prepare(`UPDATE equipment SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(id);
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
    return result.changes > 0;
  },

  // Equipment Logs
  findLogs(equipmentId: string): EquipmentLog[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM equipment_logs WHERE equipment_id = ? ORDER BY service_date DESC, created_at DESC').all(equipmentId) as any[];
    return rows.map(r => ({
      ...r,
      documents: JSON.parse(r.documents || '[]'),
    }));
  },

  addLog(data: Partial<EquipmentLog>): EquipmentLog {
    const db = getDb();
    const id = data.id || uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO equipment_logs (
        id, equipment_id, log_type, service_date, next_service_date,
        performed_by, service_provider, certificate_number, result_status,
        findings, actions_taken, cost, documents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.equipment_id,
      data.log_type || 'CALIBRATION',
      data.service_date || now,
      data.next_service_date || null,
      data.performed_by || null,
      data.service_provider || null,
      data.certificate_number || null,
      data.result_status || 'PASSED',
      data.findings || null,
      data.actions_taken || null,
      data.cost || null,
      JSON.stringify(data.documents || []),
      now
    );

    // If calibration log passed, update last and next calibration dates on equipment
    if (data.equipment_id && data.log_type === 'CALIBRATION' && data.result_status === 'PASSED') {
      const eq = this.findById(data.equipment_id);
      if (eq) {
        const nextDate = data.next_service_date || new Date(new Date(data.service_date || now).getTime() + (eq.calibration_cycle_days * 86400000)).toISOString();
        this.update(eq.id, {
          last_calibration_date: data.service_date || now,
          next_calibration_date: nextDate,
          status: 'OPERATIONAL',
        });
      }
    }

    return db.prepare('SELECT * FROM equipment_logs WHERE id = ?').get(id) as EquipmentLog;
  },

  findLogById(logId: string): EquipmentLog | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM equipment_logs WHERE id = ?').get(logId) as any;
    if (!row) return null;
    return { ...row, documents: JSON.parse(row.documents || '[]') };
  },

  updateLog(logId: string, data: Partial<EquipmentLog>): EquipmentLog | null {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.log_type !== undefined) { fields.push('log_type = ?'); values.push(data.log_type); }
    if (data.service_date !== undefined) { fields.push('service_date = ?'); values.push(data.service_date); }
    if (data.next_service_date !== undefined) { fields.push('next_service_date = ?'); values.push(data.next_service_date); }
    if (data.performed_by !== undefined) { fields.push('performed_by = ?'); values.push(data.performed_by); }
    if (data.service_provider !== undefined) { fields.push('service_provider = ?'); values.push(data.service_provider); }
    if (data.certificate_number !== undefined) { fields.push('certificate_number = ?'); values.push(data.certificate_number); }
    if (data.result_status !== undefined) { fields.push('result_status = ?'); values.push(data.result_status); }
    if (data.findings !== undefined) { fields.push('findings = ?'); values.push(data.findings); }
    if (data.actions_taken !== undefined) { fields.push('actions_taken = ?'); values.push(data.actions_taken); }
    if (data.cost !== undefined) { fields.push('cost = ?'); values.push(data.cost); }
    if (data.documents !== undefined) { fields.push('documents = ?'); values.push(JSON.stringify(data.documents)); }
    if (fields.length === 0) return this.findLogById(logId);
    values.push(logId);
    db.prepare(`UPDATE equipment_logs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findLogById(logId);
  },

  deleteLog(logId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM equipment_logs WHERE id = ?').run(logId);
    return result.changes > 0;
  },

  // QC Controls & Entries
  findQcControls(equipmentId?: string): QcControl[] {
    const db = getDb();
    let query = 'SELECT * FROM qc_controls WHERE is_active = 1';
    const params: any[] = [];
    if (equipmentId) {
      query += ' AND equipment_id = ?';
      params.push(equipmentId);
    }
    const rows = db.prepare(query + ' ORDER BY control_name ASC').all(...params) as any[];
    return rows.map(r => ({
      ...r,
      target_values: JSON.parse(r.target_values || '{}'),
      analytes: JSON.parse(r.analytes || '[]'),
    }));
  },

  findQcControlById(controlId: string): QcControl | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM qc_controls WHERE id = ?').get(controlId) as any;
    if (!row) return null;
    return {
      ...row,
      target_values: JSON.parse(row.target_values || '{}'),
      analytes: JSON.parse(row.analytes || '[]'),
    };
  },

  addQcControl(data: Partial<QcControl>): QcControl {
    const db = getDb();
    const id = data.id || uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO qc_controls (id, equipment_id, control_name, lot_number, level, expiration_date, target_values, analytes, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.equipment_id || null,
      data.control_name || 'QC Control',
      data.lot_number || `LOT-${Date.now()}`,
      data.level || 'Level 1',
      data.expiration_date || null,
      JSON.stringify(data.target_values || {}),
      JSON.stringify(data.analytes || []),
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      now
    );
    return this.findQcControlById(id)!;
  },

  updateQcControl(controlId: string, data: Partial<QcControl>): QcControl | null {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.control_name !== undefined) { fields.push('control_name = ?'); values.push(data.control_name); }
    if (data.lot_number !== undefined) { fields.push('lot_number = ?'); values.push(data.lot_number); }
    if (data.level !== undefined) { fields.push('level = ?'); values.push(data.level); }
    if (data.expiration_date !== undefined) { fields.push('expiration_date = ?'); values.push(data.expiration_date); }
    if (data.target_values !== undefined) { fields.push('target_values = ?'); values.push(JSON.stringify(data.target_values)); }
    if (data.analytes !== undefined) { fields.push('analytes = ?'); values.push(JSON.stringify(data.analytes)); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }
    if (fields.length === 0) return this.findQcControlById(controlId);
    values.push(controlId);
    db.prepare(`UPDATE qc_controls SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findQcControlById(controlId);
  },

  deleteQcControl(controlId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM qc_controls WHERE id = ?').run(controlId);
    return result.changes > 0;
  },

  addQcEntry(data: {
    equipment_id?: string | null;
    control_id: string;
    analyte_code: string;
    analyte_name?: string | null;
    measured_value: number;
    mean_target?: number;
    sd_target?: number;
    z_score?: number | null;
    status?: string;
    violated_rules?: string[];
    violation_type?: string | null;
    reagent_lot_number?: string | null;
    corrective_action?: any;
    run_number?: number;
    performed_by?: string | null;
    notes?: string | null;
    run_date?: string;
  }): QcEntry {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const runDate = data.run_date || now;

    // Evaluate Z-Score and Westgard rules if not pre-computed
    let zScore: number | null = data.z_score !== undefined ? data.z_score : null;
    let status = data.status || 'IN_CONTROL';
    const violatedRules: string[] = data.violated_rules || [];

    if (zScore === null && data.mean_target !== undefined && data.sd_target && data.sd_target > 0) {
      zScore = +((data.measured_value - data.mean_target) / data.sd_target).toFixed(2);
      const absZ = Math.abs(zScore);
      if (absZ >= 3) {
        status = 'REJECTED';
        violatedRules.push('1_3s');
      } else if (absZ >= 2) {
        status = 'WARNING';
        violatedRules.push('1_2s');
      }
    }

    db.prepare(`
      INSERT INTO qc_entries (
        id, equipment_id, control_id, analyte_code, analyte_name,
        run_date, run_number, measured_value, mean_target, sd_target, z_score,
        status, violated_rules, violation_type, reagent_lot_number, corrective_action,
        performed_by, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.equipment_id || null,
      data.control_id,
      data.analyte_code,
      data.analyte_name || null,
      runDate,
      data.run_number || 1,
      data.measured_value,
      data.mean_target || null,
      data.sd_target || null,
      zScore,
      status,
      JSON.stringify(violatedRules),
      data.violation_type || null,
      data.reagent_lot_number || null,
      data.corrective_action ? JSON.stringify(data.corrective_action) : null,
      data.performed_by || null,
      data.notes || null,
      now
    );

    return this.findQcEntryById(id)!;
  },

  findQcEntryById(id: string): QcEntry | null {
    const db = getDb();
    const r = db.prepare('SELECT * FROM qc_entries WHERE id = ?').get(id) as any;
    if (!r) return null;
    return {
      ...r,
      violated_rules: JSON.parse(r.violated_rules || '[]'),
      corrective_action: r.corrective_action ? JSON.parse(r.corrective_action) : null,
    };
  },

  findQcEntries(controlId?: string, analyteCode?: string, equipmentId?: string): QcEntry[] {
    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];
    if (controlId) { where.push('control_id = ?'); params.push(controlId); }
    if (analyteCode) { where.push('analyte_code = ?'); params.push(analyteCode); }
    if (equipmentId) { where.push('equipment_id = ?'); params.push(equipmentId); }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM qc_entries ${whereClause} ORDER BY run_date ASC, created_at ASC`).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      violated_rules: JSON.parse(r.violated_rules || '[]'),
      corrective_action: r.corrective_action ? JSON.parse(r.corrective_action) : null,
    }));
  },

  updateQcEntry(id: string, data: Partial<QcEntry>): QcEntry | null {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
    if (data.corrective_action !== undefined) { fields.push('corrective_action = ?'); values.push(JSON.stringify(data.corrective_action)); }
    if (data.measured_value !== undefined) { fields.push('measured_value = ?'); values.push(data.measured_value); }
    if (data.z_score !== undefined) { fields.push('z_score = ?'); values.push(data.z_score); }
    if (data.violation_type !== undefined) { fields.push('violation_type = ?'); values.push(data.violation_type); }
    if (data.violated_rules !== undefined) { fields.push('violated_rules = ?'); values.push(JSON.stringify(data.violated_rules)); }
    if (fields.length === 0) return this.findQcEntryById(id);
    values.push(id);
    db.prepare(`UPDATE qc_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findQcEntryById(id);
  },

  deleteQcEntry(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM qc_entries WHERE id = ?').run(id);
    return result.changes > 0;
  },

  deleteLastQcEntry(equipmentId: string, controlId?: string, analyteCode?: string): boolean {
    const db = getDb();
    let query = 'SELECT id FROM qc_entries WHERE equipment_id = ?';
    const params: any[] = [equipmentId];
    if (controlId) { query += ' AND control_id = ?'; params.push(controlId); }
    if (analyteCode) { query += ' AND analyte_code = ?'; params.push(analyteCode); }
    query += ' ORDER BY run_date DESC, created_at DESC LIMIT 1';
    const row = db.prepare(query).get(...params) as { id: string } | undefined;
    if (!row) return false;
    return this.deleteQcEntry(row.id);
  },

  deleteAllQcEntries(equipmentId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM qc_entries WHERE equipment_id = ?').run(equipmentId);
    return result.changes > 0;
  },

  // NEQAS records
  findNeqasRecords(year?: string, equipmentId?: string): NeqasRecord[] {
    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];
    if (year) { where.push('cycle_year = ?'); params.push(year); }
    if (equipmentId) { where.push('equipment_id = ?'); params.push(equipmentId); }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    return db.prepare(`SELECT * FROM neqas_records ${whereClause} ORDER BY cycle_year DESC, nrl_name ASC`).all(...params) as NeqasRecord[];
  },

  findNeqasRecordById(id: string): NeqasRecord | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM neqas_records WHERE id = ?').get(id) as NeqasRecord | undefined;
    return row || null;
  },

  addNeqasRecord(data: Partial<NeqasRecord>): NeqasRecord {
    const db = getDb();
    const id = data.id || uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO neqas_records (
        id, equipment_id, cycle_year, event_number, nrl_name,
        sample_id, analyte_code, target_score, achieved_score,
        status, certificate_number, survey_date, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.equipment_id || null,
      data.cycle_year || String(new Date().getFullYear()),
      data.event_number || null,
      data.nrl_name || 'NRL',
      data.sample_id || null,
      data.analyte_code || null,
      data.target_score !== undefined ? data.target_score : null,
      data.achieved_score !== undefined ? data.achieved_score : null,
      data.status || 'PARTICIPATING',
      data.certificate_number || null,
      data.survey_date || null,
      data.notes || null,
      now
    );
    return this.findNeqasRecordById(id)!;
  },

  updateNeqasRecord(id: string, data: Partial<NeqasRecord>): NeqasRecord | null {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    const keys: (keyof NeqasRecord)[] = [
      'equipment_id', 'cycle_year', 'event_number', 'nrl_name', 'sample_id',
      'analyte_code', 'target_score', 'achieved_score', 'status', 'certificate_number',
      'survey_date', 'notes'
    ];
    for (const key of keys) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return this.findNeqasRecordById(id);
    values.push(id);
    db.prepare(`UPDATE neqas_records SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findNeqasRecordById(id);
  },

  deleteNeqasRecord(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM neqas_records WHERE id = ?').run(id);
    return result.changes > 0;
  },

  // Upcoming alerts
  getUpcomingAlerts(): {
    calibrationDue: Equipment[];
    calibrationOverdue: Equipment[];
    pmDue: Equipment[];
    pmOverdue: Equipment[];
  } {
    const all = this.findAll({});
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const res = {
      calibrationDue: [] as Equipment[],
      calibrationOverdue: [] as Equipment[],
      pmDue: [] as Equipment[],
      pmOverdue: [] as Equipment[],
    };

    for (const eq of all) {
      if (eq.next_calibration_date) {
        const calTime = new Date(eq.next_calibration_date).getTime();
        const diff = calTime - now;
        if (diff <= 0) res.calibrationOverdue.push(eq);
        else if (diff <= thirtyDaysMs) res.calibrationDue.push(eq);
      }
      if (eq.next_pm_date) {
        const pmTime = new Date(eq.next_pm_date).getTime();
        const diff = pmTime - now;
        if (diff <= 0) res.pmOverdue.push(eq);
        else if (diff <= thirtyDaysMs) res.pmDue.push(eq);
      }
    }

    return res;
  },

  // X-ray Radiation Safety Compliance
  getXrayCompliance(): any[] {
    const xrays = this.findAll({ department: 'X-ray' });
    const now = new Date();

    return xrays.map(x => {
      const rad = x.radiation_safety_details || {};
      const surveyDate = rad.nextRadiationSurveyDate ? new Date(rad.nextRadiationSurveyDate) : null;
      const surveyOverdue = surveyDate ? surveyDate < now : false;

      return {
        id: x.id,
        name: x.name,
        code: x.equipment_code,
        modelNumber: x.model_number,
        serialNumber: x.serial_number,
        fdaCdrrhrRegNumber: rad.fdaCdrrhrRegNumber || 'N/A',
        radiationSafetyOfficer: rad.radiationSafetyOfficer || 'N/A',
        tubeModel: rad.tubeModel || 'N/A',
        tubeSerialNumber: rad.tubeSerialNumber || 'N/A',
        maxKvp: rad.maxKvp || 0,
        maxMa: rad.maxMa || 0,
        totalFiltrationHvl: rad.totalFiltrationHvl || 'N/A',
        lastRadiationSurveyDate: rad.lastRadiationSurveyDate || null,
        nextRadiationSurveyDate: rad.nextRadiationSurveyDate || null,
        leadApronCheckDate: rad.leadApronCheckDate || null,
        surveyOverdue,
        complianceStatus: !surveyOverdue && rad.fdaCdrrhrRegNumber ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      };
    });
  }
};
