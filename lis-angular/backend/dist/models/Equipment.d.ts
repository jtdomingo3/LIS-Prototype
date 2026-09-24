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
    radiation_safety_details: RadiationSafetyDetails;
    documents: string[];
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    days_until_calibration?: number | null;
    is_calibration_due?: boolean;
    is_calibration_overdue?: boolean;
}
export interface EquipmentLog {
    id: string;
    equipment_id: string;
    log_type: string;
    service_date: string;
    next_service_date: string | null;
    performed_by: string | null;
    service_provider: string | null;
    certificate_number: string | null;
    result_status: string;
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
    target_values: Record<string, {
        mean: number;
        sd: number;
        unit?: string;
    }>;
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
    status: string;
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
export declare const EquipmentModel: {
    findAll(options?: {
        department?: string;
        status?: string;
        search?: string;
    }): Equipment[];
    findById(id: string): Equipment | null;
    create(data: Partial<Equipment>): Equipment;
    update(id: string, data: Partial<Equipment>): Equipment | null;
    delete(id: string): boolean;
    findLogs(equipmentId: string): EquipmentLog[];
    addLog(data: Partial<EquipmentLog>): EquipmentLog;
    findQcControls(equipmentId?: string): QcControl[];
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
    }): QcEntry;
    findQcEntries(controlId: string, analyteCode?: string): QcEntry[];
    findNeqasRecords(year?: string): NeqasRecord[];
};
//# sourceMappingURL=Equipment.d.ts.map