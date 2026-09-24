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
  measured_value: number;
  mean_target: number | null;
  sd_target: number | null;
  z_score: number | null;
  status: string; // IN_CONTROL, WARNING, OUT_OF_CONTROL
  violated_rules: string[];
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
    }));
  },

  addQcEntry(data: {
    equipment_id?: string | null;
    control_id: string;
    analyte_code: string;
    analyte_name?: string | null;
    measured_value: number;
    mean_target?: number;
    sd_target?: number;
    performed_by?: string | null;
    notes?: string | null;
    run_date?: string;
  }): QcEntry {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const runDate = data.run_date || now;

    // Evaluate Z-Score and Westgard rules
    let zScore: number | null = null;
    let status = 'IN_CONTROL';
    const violatedRules: string[] = [];

    if (data.mean_target !== undefined && data.sd_target && data.sd_target > 0) {
      zScore = +((data.measured_value - data.mean_target) / data.sd_target).toFixed(2);
      const absZ = Math.abs(zScore);
      if (absZ >= 3) {
        status = 'OUT_OF_CONTROL';
        violatedRules.push('1-3s (Value exceeds 3 SD limit)');
      } else if (absZ >= 2) {
        status = 'WARNING';
        violatedRules.push('1-2s (Value exceeds 2 SD warning limit)');
      }
    }

    db.prepare(`
      INSERT INTO qc_entries (
        id, equipment_id, control_id, analyte_code, analyte_name,
        run_date, measured_value, mean_target, sd_target, z_score,
        status, violated_rules, performed_by, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.equipment_id || null,
      data.control_id,
      data.analyte_code,
      data.analyte_name || null,
      runDate,
      data.measured_value,
      data.mean_target || null,
      data.sd_target || null,
      zScore,
      status,
      JSON.stringify(violatedRules),
      data.performed_by || null,
      data.notes || null,
      now
    );

    const row = db.prepare('SELECT * FROM qc_entries WHERE id = ?').get(id) as any;
    return {
      ...row,
      violated_rules: JSON.parse(row.violated_rules || '[]'),
    };
  },

  findQcEntries(controlId: string, analyteCode?: string): QcEntry[] {
    const db = getDb();
    let query = 'SELECT * FROM qc_entries WHERE control_id = ?';
    const params: any[] = [controlId];
    if (analyteCode) {
      query += ' AND analyte_code = ?';
      params.push(analyteCode);
    }
    query += ' ORDER BY run_date ASC, created_at ASC';
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      violated_rules: JSON.parse(r.violated_rules || '[]'),
    }));
  },

  // NEQAS records
  findNeqasRecords(year?: string): NeqasRecord[] {
    const db = getDb();
    let query = 'SELECT * FROM neqas_records';
    const params: any[] = [];
    if (year) {
      query += ' WHERE cycle_year = ?';
      params.push(year);
    }
    query += ' ORDER BY cycle_year DESC, nrl_name ASC';
    return db.prepare(query).all(...params) as NeqasRecord[];
  }
};
