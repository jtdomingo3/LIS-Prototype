const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const methodOverride = require('method-override');
const fs = require('fs');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;
// Default host/IP for the server. Override with the HOST env var if needed.
const HOST = process.env.HOST || '192.168.31.86';
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    users: [],
    patients: [],
    tests: [],
    templates: []
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Simple file-based database functions
const db = {
  read: () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')),
  write: (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)),
  getUsers: () => db.read().users,
  getPatients: () => db.read().patients,
  getTests: () => db.read().tests,
  getTemplates: () => db.read().templates,
  saveUsers: (users) => { const data = db.read(); data.users = users; db.write(data); },
  savePatients: (patients) => { const data = db.read(); data.patients = patients; db.write(data); },
  saveTests: (tests) => { const data = db.read(); data.tests = tests; db.write(data); },
  saveTemplates: (templates) => { const data = db.read(); data.templates = templates; db.write(data); }
};

// Make db available globally
global.db = db;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
// Serve assets folder (for notification sounds, logos, etc.)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Simple request logger to help debug routes and payloads
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.originalUrl}` + (Object.keys(req.body || {}).length ? ` body=${JSON.stringify(req.body)}` : ''));
  next();
});

// EJS Layouts - enable the global layout wrapper so views get the
// shared HTML, CSS and JS defined in `views/layout.ejs`.
app.use(expressLayouts);
app.set('layout', 'layout');
// Allow extracting scripts/styles from individual views into the layout
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(flash());

// Diagnostic: log when reception complete is hit at the top-level (after session is available)
app.use((req, res, next) => {
  try {
    if (req.method === 'POST' && req.originalUrl && req.originalUrl.indexOf('/reception/complete') === 0) {
      const now = new Date().toISOString();
      console.log(`[${now}] TOP-LEVEL capture: ${req.method} ${req.originalUrl} body=${JSON.stringify(req.body || {})}`);
      try { console.log('TOP-LEVEL headers.cookie:', req.headers && req.headers.cookie ? req.headers.cookie : null); } catch (e) {}
      try { console.log('TOP-LEVEL session.user:', req.session && req.session.user ? req.session.user : null); } catch (e) {}
    }
  } catch (e) {}
  next();
});

// Global variables for flash messages
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const patientRoutes = require('./routes/patients');
const testRoutes = require('./routes/tests');
const reportRoutes = require('./routes/reports');
const templateRoutes = require('./routes/templates');
const userRoutes = require('./routes/users');
const receptionRoutes = require('./routes/reception');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/patients', patientRoutes);
app.use('/tests', testRoutes);
app.use('/reports', reportRoutes);
app.use('/templates', templateRoutes);
app.use('/users', userRoutes);
app.use('/reception', receptionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  // Show the error details in development, otherwise show generic message
  res.status(500).render('500', { title: 'Server Error', error: process.env.NODE_ENV === 'development' ? err : {} });
});

app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log('LIS Server running on %s:%d', HOST, PORT);
  console.log(`Open the app in your browser: ${url}`);
  console.log('To override HOST use: HOST=127.0.0.1 (or set in your environment)');
});