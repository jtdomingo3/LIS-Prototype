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
export declare const PatientModel: {
    findAll(options?: PatientListOptions): {
        patients: Patient[];
        total: number;
    };
    findById(id: string): Patient | null;
    create(data: Partial<Patient> & {
        first_name: string;
        last_name: string;
    }): Patient;
    update(id: string, data: Partial<Patient>): Patient | null;
    delete(id: string): boolean;
    count(dateFilter?: string): number;
    getNextPatientId(): string;
    generatePatientCode(): string;
};
//# sourceMappingURL=Patient.d.ts.map