/**
 * Report HTML renderer — generates standalone HTML matching the original
 * lis-fullstack EJS result templates.  Each test-type gets a specific
 * body renderer; unknown types fall back to a generic key-value table.
 *
 * Usage:  renderReportHtml(test, patient, baseUrl)
 *   - test:     the tests row  (with parsed results JSON)
 *   - patient:  the patients row
 *   - baseUrl:  backend origin for absolute asset URLs (e.g. "http://localhost:3020")
 */
interface TestRow {
    test_id?: string;
    test_type?: string;
    test_date?: string;
    completed_at?: string;
    results?: any;
    template?: string;
    [k: string]: any;
}
interface PatientRow {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    date_of_birth?: string;
    age_manual?: any;
    gender?: string;
    physician?: string;
    patient_id?: string;
    patient_code?: string;
    [k: string]: any;
}
export declare function renderReportHtml(test: TestRow, patient: PatientRow, baseUrl: string, options?: {
    print?: boolean;
}): string;
export {};
//# sourceMappingURL=reportHtmlRenderer.d.ts.map