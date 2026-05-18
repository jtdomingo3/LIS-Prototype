"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const os_1 = __importDefault(require("os"));
// Load env
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '.env') });
const connection_1 = require("./db/connection");
const User_1 = require("./models/User");
const Template_1 = require("./models/Template");
// Initialize database on startup
(0, connection_1.initializeDb)();
// Auto-seed admin user if no users exist
(async () => {
    try {
        if (User_1.UserModel.count() === 0) {
            // Use env var or generate a random secure password (shown once in logs)
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD ||
                Math.random().toString(36).slice(-10) + Math.random().toString(36).toUpperCase().slice(-4) + '!';
            await User_1.UserModel.create({
                name: 'Admin User',
                email: 'admin@lab.com',
                password: defaultPassword,
                role: 'Admin',
                permissions: {
                    dashboard: true, patients: true, reception: true,
                    tests: true, reports: true, worksheet: true,
                    templates: true, users: true, delete: true,
                },
            });
            if (process.env.DEFAULT_ADMIN_PASSWORD) {
                console.log('[seed] Default admin created: admin@lab.com (password from DEFAULT_ADMIN_PASSWORD env var)');
            }
            else {
                console.log(`[seed] Default admin created: admin@lab.com / ${defaultPassword}`);
                console.log('[seed] ⚠️  Save this password now — it will not be shown again.');
            }
        }
    }
    catch (e) {
        console.error('[seed] Auto-seed error:', e.message);
    }
})();
// Auto-seed templates if none exist
(() => {
    try {
        if (Template_1.TemplateModel.count() === 0) {
            console.log('[seed] Seeding default templates...');
            const templates = [
                { name: 'Fecalysis', test_type: 'fecalysis', fields: [
                        { key: 'color', label: 'Color', type: 'text' }, { key: 'consistency', label: 'Consistency', type: 'text' },
                        { key: 'wbc', label: 'WBC', type: 'text' }, { key: 'rbc', label: 'RBC', type: 'text' },
                        { key: 'bacteria', label: 'Bacteria', type: 'text' }, { key: 'ova', label: 'Ova/Parasite', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'ESR (Erythrocyte Sedimentation Rate)', test_type: 'esr', fields: [
                        { key: 'esr_result', label: 'ESR Result (mm/hr)', type: 'text' }, { key: 'method', label: 'Method', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Clotting Time / Bleeding Time', test_type: 'ct-bt', fields: [
                        { key: 'clotting_time', label: 'Clotting Time', type: 'text' }, { key: 'bleeding_time', label: 'Bleeding Time', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Urinalysis', test_type: 'urinalysis', fields: [
                        { key: 'color', label: 'Color', type: 'text' }, { key: 'transparency', label: 'Transparency', type: 'text' },
                        { key: 'ph', label: 'pH', type: 'text' }, { key: 'specific_gravity', label: 'Specific Gravity', type: 'text' },
                        { key: 'sugar', label: 'Sugar', type: 'text' }, { key: 'protein', label: 'Protein', type: 'text' },
                        { key: 'wbc', label: 'WBC', type: 'text' }, { key: 'rbc', label: 'RBC', type: 'text' },
                        { key: 'epithelial_cells', label: 'Epithelial Cells', type: 'text' }, { key: 'bacteria', label: 'Bacteria', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Blood Typing', test_type: 'blood-typing', fields: [
                        { key: 'blood_type', label: 'Blood Type (ABO)', type: 'text' }, { key: 'rh_factor', label: 'Rh Factor', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Pregnancy Test', test_type: 'pregnancy-test', fields: [
                        { key: 'result', label: 'Result', type: 'text' }, { key: 'method', label: 'Method', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Dengue Duo', test_type: 'dengue-duo', fields: [
                        { key: 'ns1_antigen', label: 'NS1 Antigen', type: 'text' }, { key: 'igm', label: 'IgM', type: 'text' },
                        { key: 'igg', label: 'IgG', type: 'text' }, { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Blood Chemistry', test_type: 'blood-chemistry', fields: [
                        { key: 'fbs', label: 'FBS (mg/dL)', type: 'text' }, { key: 'bun', label: 'BUN (mg/dL)', type: 'text' },
                        { key: 'creatinine', label: 'Creatinine (mg/dL)', type: 'text' }, { key: 'uric_acid', label: 'Uric Acid (mg/dL)', type: 'text' },
                        { key: 'sgpt', label: 'SGPT (U/L)', type: 'text' }, { key: 'sgot', label: 'SGOT (U/L)', type: 'text' },
                        { key: 'cholesterol', label: 'Cholesterol (mg/dL)', type: 'text' }, { key: 'triglycerides', label: 'Triglycerides (mg/dL)', type: 'text' },
                        { key: 'hdl', label: 'HDL (mg/dL)', type: 'text' }, { key: 'ldl', label: 'LDL (mg/dL)', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Blood Chemistry — Lipid Profile', test_type: 'blood-chemistry-lipid', fields: [
                        { key: 'cholesterol', label: 'Total Cholesterol', type: 'text' }, { key: 'triglycerides', label: 'Triglycerides', type: 'text' },
                        { key: 'hdl', label: 'HDL', type: 'text' }, { key: 'ldl', label: 'LDL', type: 'text' }, { key: 'vldl', label: 'VLDL', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Blood Chemistry — BUN/Creatinine', test_type: 'blood-chemistry-bun-crea', fields: [
                        { key: 'bun', label: 'BUN', type: 'text' }, { key: 'creatinine', label: 'Creatinine', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Blood Chemistry — SGPT/SGOT', test_type: 'blood-chemistry-sgpt-sgot', fields: [
                        { key: 'sgpt', label: 'SGPT', type: 'text' }, { key: 'sgot', label: 'SGOT', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Blood Chemistry — HbA1c', test_type: 'blood-chemistry-hba1c', fields: [
                        { key: 'hba1c', label: 'HbA1c (%)', type: 'text' }, { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'X-Ray', test_type: 'xray', fields: [
                        { key: 'findings', label: 'Findings', type: 'textarea' }, { key: 'impression', label: 'Impression', type: 'textarea' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'ECG', test_type: 'ecg', fields: [
                        { key: 'rate', label: 'Rate', type: 'text' }, { key: 'rhythm', label: 'Rhythm', type: 'text' },
                        { key: 'axis', label: 'Axis', type: 'text' }, { key: 'findings', label: 'Findings', type: 'textarea' },
                        { key: 'impression', label: 'Impression', type: 'textarea' }
                    ] },
                { name: 'Hematology (CBC)', test_type: 'hematology', fields: [
                        { key: 'hemoglobin', label: 'Hemoglobin', type: 'text' }, { key: 'hematocrit', label: 'Hematocrit', type: 'text' },
                        { key: 'wbc', label: 'WBC', type: 'text' }, { key: 'rbc', label: 'RBC', type: 'text' },
                        { key: 'platelet', label: 'Platelet Count', type: 'text' },
                        { key: 'neutrophil', label: 'Neutrophil', type: 'text' }, { key: 'lymphocyte', label: 'Lymphocyte', type: 'text' },
                        { key: 'monocyte', label: 'Monocyte', type: 'text' }, { key: 'eosinophil', label: 'Eosinophil', type: 'text' },
                        { key: 'basophil', label: 'Basophil', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Serology', test_type: 'serology', fields: [
                        { key: 'hbsag', label: 'HBsAg', type: 'text' }, { key: 'anti_hbs', label: 'Anti-HBs', type: 'text' },
                        { key: 'anti_hav', label: 'Anti-HAV', type: 'text' }, { key: 'vdrl', label: 'VDRL', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Ultrasound — Abdominal/KUB/HBT', test_type: 'ultrasound-abd-kubp-hbt', fields: [
                        { key: 'liver', label: 'Liver', type: 'textarea' }, { key: 'gallbladder', label: 'Gallbladder', type: 'textarea' },
                        { key: 'kidneys', label: 'Kidneys', type: 'textarea' }, { key: 'pancreas', label: 'Pancreas', type: 'textarea' },
                        { key: 'spleen', label: 'Spleen', type: 'textarea' }, { key: 'impression', label: 'Impression', type: 'textarea' }
                    ] },
                { name: '2D Echocardiography', test_type: 'echocardiography-2d', fields: [
                        { key: 'findings', label: 'Findings', type: 'textarea' }, { key: 'ef', label: 'Ejection Fraction', type: 'text' },
                        { key: 'impression', label: 'Impression', type: 'textarea' }
                    ] },
                { name: 'Drug Test', test_type: 'drugtest', fields: [
                        { key: 'methamphetamine', label: 'Methamphetamine', type: 'text' }, { key: 'thc', label: 'THC', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'PT/aPTT', test_type: 'pt-aptt', fields: [
                        { key: 'pt_test', label: 'PT (sec)', type: 'text' }, { key: 'pt_control', label: 'PT Control', type: 'text' },
                        { key: 'inr', label: 'INR', type: 'text' }, { key: 'aptt_test', label: 'aPTT (sec)', type: 'text' },
                        { key: 'aptt_control', label: 'aPTT Control', type: 'text' }, { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Fecal Occult Blood', test_type: 'fecal-occult-blood', fields: [
                        { key: 'result', label: 'Result', type: 'text' }, { key: 'method', label: 'Method', type: 'text' },
                        { key: 'remarks', label: 'Remarks', type: 'text' }
                    ] },
                { name: 'Ultrasound — Transvaginal', test_type: 'ultrasound-transvaginal', fields: [
                        { key: 'uterus', label: 'Uterus', type: 'textarea' }, { key: 'ovaries', label: 'Ovaries', type: 'textarea' },
                        { key: 'findings', label: 'Findings', type: 'textarea' }, { key: 'impression', label: 'Impression', type: 'textarea' }
                    ] },
                { name: 'Ultrasound — Pelvic', test_type: 'ultrasound-pelvic', fields: [
                        { key: 'findings', label: 'Findings', type: 'textarea' }, { key: 'impression', label: 'Impression', type: 'textarea' }
                    ] },
            ];
            for (const tmpl of templates) {
                Template_1.TemplateModel.create(tmpl);
            }
            console.log(`[seed] ${templates.length} templates seeded.`);
        }
    }
    catch (e) {
        console.error('[seed] Template seed error:', e.message);
    }
})();
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const patients_1 = __importDefault(require("./routes/patients"));
const tests_1 = __importDefault(require("./routes/tests"));
const templates_1 = __importDefault(require("./routes/templates"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const reception_1 = __importDefault(require("./routes/reception"));
const settings_1 = __importDefault(require("./routes/settings"));
const reports_1 = __importDefault(require("./routes/reports"));
const signatures_1 = __importDefault(require("./routes/signatures"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
// ── Middleware ──────────────────────────────────────────────────────────
// Security headers
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Relax for development
}));
// CORS - allow Angular dev server
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:4200', // Angular dev server
        'http://127.0.0.1:4200',
        `http://localhost:${PORT}`,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // generous limit for local use
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
// Body parsing
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Serve static assets (signatures, images, etc.)
app.use('/assets', express_1.default.static(path_1.default.join(__dirname, '..', 'assets')));
// Request logger
app.use((req, _res, next) => {
    const now = new Date().toISOString();
    const body = req.body && Object.keys(req.body).length > 0 ? ' body=...' : '';
    console.log(`[${now}] ${req.method} ${req.originalUrl}${body}`);
    next();
});
// ── API Routes ─────────────────────────────────────────────────────────
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/patients', patients_1.default);
app.use('/api/tests', tests_1.default);
app.use('/api/templates', templates_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/reception', reception_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/signatures', signatures_1.default);
// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve Angular frontend in production
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path_1.default.join(__dirname, '..', '..', 'frontend', 'dist', 'lis-angular', 'browser');
    app.use(express_1.default.static(frontendPath));
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(frontendPath, 'index.html'));
    });
}
// ── Error handling ─────────────────────────────────────────────────────
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Global error handler
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err.stack || err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    });
});
// ── Start server ───────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
    const now = new Date();
    let ips = [];
    try {
        ips = Object.values(os_1.default.networkInterfaces())
            .flat()
            .filter((i) => !!i && i.family === 'IPv4' && !i.internal)
            .map(i => i.address);
    }
    catch { /* ignore */ }
    const lines = [
        '='.repeat(72),
        'LIS Angular - Laboratory Information System (SQLite Backend)',
        '',
        'API Server:',
        `  Local:   http://localhost:${PORT}/api`,
        ...ips.map(ip => `  Network: http://${ip}:${PORT}/api`),
        '',
        'Angular Frontend (dev): http://localhost:4200',
        '',
        `Started: ${now.toLocaleString()}`,
        '='.repeat(72),
    ];
    console.log(lines.join('\n'));
});
// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    (0, connection_1.closeDb)();
    process.exit(0);
});
process.on('SIGTERM', () => {
    (0, connection_1.closeDb)();
    process.exit(0);
});
exports.default = app;
//# sourceMappingURL=server.js.map