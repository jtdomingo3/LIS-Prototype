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
}
export interface ConsultationRow {
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
    smoking: string;
    alcohol: string;
    family_history: string;
    social_history: string;
    vital_signs: string;
    physical_exam_findings: string | null;
    primary_diagnosis: string | null;
    differential_diagnosis: string;
    suspected_pathology: string | null;
    clinical_impression: string | null;
    treatment_plan: string | null;
    prescriptions: string;
    lab_request_tests: string;
    referrals: string | null;
    follow_up_date: string | null;
    follow_up_notes: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}
export declare function calculateBmi(weightKg: number | string | undefined, heightCm: number | string | undefined): {
    bmi: number | null;
    category: string;
};
export declare const ConsultationModel: {
    findAll(options?: {
        patient_id?: string;
        test_id?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): {
        consultations: Consultation[];
        total: number;
    };
    findById(id: string): Consultation | null;
    findByTestId(testId: string): Consultation | null;
    findByPatientId(patientId: string): Consultation[];
    create(data: Partial<Consultation>): Consultation;
    update(id: string, data: Partial<Consultation>): Consultation | null;
    delete(id: string): boolean;
};
//# sourceMappingURL=Consultation.d.ts.map