// TypeScript interfaces matching the SQLite backend models

export interface UserPermissions {
  dashboard?: boolean;
  patients?: boolean;
  reception?: boolean;
  tests?: boolean;
  reports?: boolean;
  worksheet?: boolean;
  templates?: boolean;
  users?: boolean;
  consultations?: boolean;
  inventory?: boolean;
  equipment?: boolean;
  chatbot?: boolean;
  admin?: boolean;
  delete?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  designation?: string | null;
  license_number: string | null;
  signature: string | null;
  auto_signature_enabled: number;
  auto_signature_until: string | null;
  permissions: UserPermissions;
  created_at: string;
  last_login: string | null;
}

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
  // flag for whether the patient already has one or more tests
  hasTests?: boolean;
  philhealth_consent: number;
  philhealth_id: string | null;
  required_areas: string[];
  requested_tests: any[];
  payment_history: any[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Aliases used in UI
  age?: string | null;
  sex?: string | null;
  birthday?: string | null;
  room?: string | null;
  [key: string]: any;
}

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
  status_history: StatusHistoryEntry[];
  created_at: string;
  updated_at: string;
  // Joined fields
  patient_name?: string;
  physician?: string;
  [key: string]: any;
}

export interface StatusHistoryEntry {
  from: string;
  to: string;
  user: string;
  area?: string;
  timestamp: string;
}

export interface Template {
  id: string;
  name: string;
  test_type: string | null;
  fields: any[];
  header_html: string | null;
  footer_html: string | null;
  footer_notes: string | null;
  styles: string | null;
  version: number;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DashboardStats {
  stats: {
    totalPatients: number;
    totalTests: number;
    pending: number;
    inProgress: number;
    completed: number;
    released: number;
    totalSales: number;
    clinicalSales: number;
    xraySales: number;
    testTotals: Record<string, number>;
    testTotalsSelected: Record<string, number>;
    selectedDate: string;
  };
  dateStats: {
    totalPatients: number;
    totalTests: number;
    pending: number;
    inProgress: number;
    completed: number;
    released: number;
    totalSales: number;
    clinicalSales: number;
    xraySales: number;
  };
  statusBreakdown: Record<string, number>;
  typeBreakdown: Record<string, number>;
  recentTests: Array<{
    id: string;
    testId: string;
    testType: string;
    status: string;
    testDate: string;
    patient: { firstName: string; lastName: string } | null;
  }>;
  date: string;
}

export interface AreaSummary {
  name: string;
  testCount: number;
  patientCount: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  pagination: { totalPages: number; page: number; limit: number; total: number };
  [key: string]: any;
}

// ── Consultation Models ──────────────────────────────────────────────────

export interface SmokingAssessment {
  status: string;
  sticksPerDay?: number | string;
  years?: number | string;
  packYears?: number | string;
  quitYears?: number | string;
  notes?: string;
}

export interface AlcoholAssessment {
  status: string;
  frequency?: string;
  drinksPerSession?: number | string;
  bingeDrinking?: string;
  notes?: string;
}

export interface FamilyHistoryAssessment {
  diseases: string[];
  notes?: string;
}

export interface SocialHistoryAssessment {
  occupation?: string;
  physicalActivity?: string;
  dietaryHabits?: string;
  notes?: string;
}

export interface VitalSignsAssessment {
  bloodPressureSystolic?: string | number;
  bloodPressureDiastolic?: string | number;
  pulseRate?: string | number;
  respiratoryRate?: string | number;
  temperature?: string | number;
  oxygenSaturation?: string | number;
  weight?: string | number;
  height?: string | number;
  bmi?: string | number;
  bmiCategory?: string;
  painScale?: string | number;
  bloodGlucose?: string | number;
  waistCircumference?: string | number;
}

export interface PrescriptionItem {
  id?: string;
  medication: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface Consultation {
  id: string;
  patient_id: string;
  test_id: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  doctor_license_number: string | null;
  doctor_designation: string | null;
  visit_type: string;
  consultation_date: string;
  status: string;
  chief_complaint: string | null;
  history_of_present_illness: string | null;
  past_medical_history: string | null;
  current_medications: string | null;
  allergies: string | null;
  review_of_systems: string | null;
  smoking: SmokingAssessment;
  alcohol: AlcoholAssessment;
  family_history: FamilyHistoryAssessment;
  social_history: SocialHistoryAssessment;
  vital_signs: VitalSignsAssessment;
  physical_exam_findings: string | null;
  primary_diagnosis: string | null;
  differential_diagnosis: string[];
  suspected_pathology: string | null;
  clinical_impression: string | null;
  treatment_plan: string | null;
  prescriptions: PrescriptionItem[];
  lab_request_tests: string[];
  referrals: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  patient?: Patient;
  test?: Test;
}

// ── Inventory Models ─────────────────────────────────────────────────────

export interface InventoryBatch {
  id: string;
  inventory_id: string;
  lot_number: string;
  initial_quantity: number;
  current_quantity: number;
  received_date: string | null;
  expiration_date: string | null;
  opened_date: string | null;
  opened_by: string | null;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  item_mode: string;
  unit: string;
  package_size: string | null;
  min_threshold: number;
  critical_threshold: number;
  max_threshold: number | null;
  supplier: string | null;
  supplier_part_number: string | null;
  manufacturer: string | null;
  cost: number;
  storage_temp: string | null;
  location: string | null;
  area: string;
  requires_refrigeration: number;
  hazard_class: string | null;
  msds_url: string | null;
  open_vial_stability_days: number | null;
  barcode: string | null;
  target_roles: string[];
  is_active: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  total_stock?: number;
  stock_status?: 'NORMAL' | 'LOW' | 'CRITICAL' | 'OUT_OF_STOCK';
  batches?: InventoryBatch[];
  transactions?: any[];
}

// ── Equipment Models ─────────────────────────────────────────────────────

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
  logs?: any[];
  qc_controls?: any[];
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

// ── Chatbot Models ───────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  conversation_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  user_id: string | null;
  title: string;
  last_model: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

export interface ChatModelOption {
  id: string;
  name: string;
}

