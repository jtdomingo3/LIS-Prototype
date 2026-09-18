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
    status_history: any[];
    payment_history: Record<string, any>;
    created_at: string;
    updated_at: string;
}
export interface TestListOptions {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    testType?: string;
    date?: string;
    patientId?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
}
export declare const TestModel: {
    findAll(options?: TestListOptions): {
        tests: Test[];
        total: number;
    };
    findById(id: string): Test | null;
    findByPatientId(patientId: string): Test[];
    findByStatus(status: string): Test[];
    create(data: Partial<Test> & {
        patient_id: string;
        test_type: string;
    }): Test;
    update(id: string, data: Partial<Test>): Test | null;
    delete(id: string): boolean;
    countByStatus(dateFilter?: string): Record<string, number>;
    countByType(dateFilter?: string): Record<string, number>;
    getNextTestId(prefix: string): string;
};
//# sourceMappingURL=Test.d.ts.map