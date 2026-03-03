import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import os from 'os';

// Load env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { initializeDb, closeDb } from './db/connection';
import { UserModel } from './models/User';

// Initialize database on startup
initializeDb();

// Auto-seed admin user if no users exist
(async () => {
  try {
    if (UserModel.count() === 0) {
      await UserModel.create({
        name: 'Admin User',
        email: 'admin@lab.com',
        password: 'password123',
        role: 'Admin',
        permissions: {
          dashboard: true, patients: true, reception: true,
          tests: true, reports: true, worksheet: true,
          templates: true, users: true, delete: true,
        },
      });
      console.log('[seed] Default admin created: admin@lab.com / password123');
    }
  } catch (e: any) {
    console.error('[seed] Auto-seed error:', e.message);
  }
})();

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import patientRoutes from './routes/patients';
import testRoutes from './routes/tests';
import templateRoutes from './routes/templates';
import dashboardRoutes from './routes/dashboard';
import receptionRoutes from './routes/reception';
import settingsRoutes from './routes/settings';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ──────────────────────────────────────────────────────────

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Relax for development
}));

// CORS - allow Angular dev server
app.use(cors({
  origin: [
    'http://localhost:4200',  // Angular dev server
    'http://127.0.0.1:4200',
    `http://localhost:${PORT}`,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // generous limit for local use
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static assets (signatures, images, etc.)
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// Request logger
app.use((req, _res, next) => {
  const now = new Date().toISOString();
  const body = req.body && Object.keys(req.body).length > 0 ? ' body=...' : '';
  console.log(`[${now}] ${req.method} ${req.originalUrl}${body}`);
  next();
});

// ── API Routes ─────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve Angular frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'lis-angular', 'browser');
  app.use(express.static(frontendPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ── Error handling ─────────────────────────────────────────────────────

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.stack || err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// ── Start server ───────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  const now = new Date();

  let ips: string[] = [];
  try {
    ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
      .map(i => i.address);
  } catch { /* ignore */ }

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
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  process.exit(0);
});

export default app;
