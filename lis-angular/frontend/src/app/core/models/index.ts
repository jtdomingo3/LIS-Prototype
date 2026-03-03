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
  delete?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
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
