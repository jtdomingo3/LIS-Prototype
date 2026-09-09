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
export declare const SHARED_CSS = "\n@page { size: Letter; margin: 0.25in; }\nbody { margin:0; padding:0; box-sizing:border-box; font-family: 'Times New Roman', Times, serif; color:#000; font-size:12px; }\n*, *:before, *:after { box-sizing:inherit; }\n.report-page{ position:relative; width:100%; max-width:calc(8.5in - 0.5in); margin:0 auto; padding:8px; }\n.report-container{ position:relative; z-index:1; }\n.header{ display:flex; align-items:flex-start; gap:8px; }\n.logo{ width:68px; height:auto; margin-right:6px; }\n.lab-title{ text-align:center; flex:1; min-width:0; }\n.lab-title h1{ margin:0; font-size:20px; color:#009957; letter-spacing:1px; }\n.lab-sub{ font-size:9px; margin-top:3px; color:#009957; }\n.date-table{ min-width:180px; font-size:12px; text-align:right; }\n.date-table table{ border-collapse:collapse; width:100%; font-size:12px; }\n.date-table td{ border:1px solid #000; padding:4px; }\n.patient-box{ margin-top:6px; width:100%; border-collapse:collapse; font-size:11px; }\n.patient-box td{ padding:3px 5px; border:1px solid #000; }\n.section-title{ text-align:center; margin:10px 0; font-size:15px; font-weight:bold; }\n.results-frame{ width:100%; border:2px solid #000; border-collapse:collapse; margin-top:6px; }\n.results-frame th, .results-frame td{ border:1px solid #000; padding:4px; vertical-align:middle; font-size:11px; }\n.test-col{ width:50%; font-size:12px; font-weight:400; padding-left:8px; text-align:left; }\n.result-col{ width:50%; font-size:12px; text-align:center; text-transform:uppercase; font-weight:700; }\n.center{ text-align:center; }\n.flag{ display:inline-block; min-width:18px; margin-left:4px; color:#d00; font-weight:700; }\n.note{ margin-top:8px; font-size:11px; }\n.note-text{ color:#c00; }\n.result-highlight{ color:#d00; font-weight:700; }\n.signatures{ display:flex; justify-content:space-between; margin-top:28px; }\n.sig{ position:relative; text-align:center; width:32%; min-height:80px; }\n.sig-line{ border-top:1px solid #000; height:10px; margin-bottom:6px; }\n.sig .name{ font-weight:700; }\n.sig .role{ font-size:11px; }\n.sig .license{ font-size:10px; }\n.signature-overlay{ position:absolute; pointer-events:none; left:50%; transform-origin:center; max-height:96px; z-index:2; }\n.watermark{ position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); width:52%; opacity:0.06; pointer-events:none; z-index:0; }\n.normal-small{ font-size:11px; color:#333; }\n.two-col{ display:flex; }\n.col{ width:50%; padding:6px; }\n.inner-table{ width:100%; border-collapse:collapse; }\n.inner-table td, .inner-table th{ padding:4px 6px; border-bottom:1px dotted #999; font-size:12px; }\n.inner-table th{ font-weight:700; }\n.blood-results th{ padding:4px 8px; font-size:inherit; font-weight:700; }\n.blood-results td{ padding:4px 8px; font-size:inherit; }\n@media print {\n  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n}\n";
export declare function renderReportHtml(test: TestRow, patient: PatientRow, baseUrl: string, options?: {
    print?: boolean;
    inlineImages?: boolean;
}): string;
export {};
//# sourceMappingURL=reportHtmlRenderer.d.ts.map