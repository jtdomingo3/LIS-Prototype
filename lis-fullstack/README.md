# Laboratory Information System (LIS)

A full-stack web application for managing laboratory operations, built with Node.js, Express, and file-based storage.

## Features

- **User Authentication & Authorization**: Role-based access control (Admin, Doctor, Technician, Receptionist)
- **Patient Management**: Complete CRUD operations for patient records
- **Test Management**: Create, update, and track laboratory tests
- **Report Generation**: Generate and download PDF reports
- **Template System**: Create and manage report templates
- **Dashboard**: Overview of system statistics and recent activity
- **Security**: Helmet for security headers, rate limiting, input validation

## Prerequisites

- Node.js (v18 or higher)
- npm

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd lis-fullstack
```

2. Install dependencies:

```bash
npm install
```

3. Seed the database with sample data:

```bash
node seed.js
```

4. Start the server (development):

```bash
node server.js
```

5. Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
lis-fullstack/
├── models/           # Data models (User, Patient, Test, Template)
├── routes/           # Express routes for different modules
├── views/            # EJS templates
├── public/           # Static assets (CSS, JS, images)
├── data.json         # File-based database
├── server.js         # Main application file
├── seed.js           # Database seeding script
└── package.json      # Dependencies and scripts
```

## Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: EJS templating, Bootstrap CSS
- **Database**: File-based JSON storage
- **Security**: bcryptjs, helmet, express-rate-limit
- **PDF Generation**: html-pdf
- **Session Management**: express-session

## API Endpoints

### Authentication

- `GET /login` - Login page
- `POST /login` - Authenticate user
- `POST /logout` - Logout user

### Dashboard

- `GET /` - Dashboard with statistics

### Patients

- `GET /patients` - List all patients
- `GET /patients/new` - New patient form
- `POST /patients` - Create patient
- `GET /patients/:id` - View patient details
- `GET /patients/:id/edit` - Edit patient form
- `PUT /patients/:id` - Update patient
- `DELETE /patients/:id` - Delete patient

### Tests

- `GET /tests` - List all tests
- `GET /tests/new` - New test form
- `POST /tests` - Create test
- `GET /tests/:id` - View test details
- `GET /tests/:id/edit` - Edit test form
- `PUT /tests/:id` - Update test
- `DELETE /tests/:id` - Delete test

### Reports

- `GET /reports` - Generate reports
- `GET /reports/download/:id` - Download PDF report

### Templates

- `GET /templates` - List templates
- `GET /templates/new` - New template form
- `POST /templates` - Create template
- `GET /templates/:id/edit` - Edit template
- `PUT /templates/:id` - Update template
- `DELETE /templates/:id` - Delete template

### Users (Admin only)

- `GET /users` - List all users
- `GET /users/new` - New user form
- `POST /users` - Create user
- `GET /users/:id/edit` - Edit user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## Security Features

- Password hashing with bcryptjs
- Session-based authentication
- Role-based access control
- Security headers with Helmet
- Rate limiting for API endpoints
- Input validation and sanitization
- CSRF protection

## Development

To run in development mode with auto-restart:

```bash
npm install -g nodemon
nodemon server.js
```

## Environment Variables

The server can be configured via environment variables. The most commonly used are already
highlighted earlier, but there are a few additional flags you may find useful:

- `DISABLE_REPORT_GENERATION=1` or `SKIP_REPORT_GENERATION=1`
  disables the background startup scan that generates any missing PDF reports. This is
  handy when running in CI, during automated tests, or on hosts where report creation
  should be skipped.  *By default the PM2 ecosystem config and the Windows
  `start-lis.ps1` launcher set this flag to `1`, so no reports are generated on boot
  unless you explicitly unset it.*

> **Note:** When editing the `.env` file manually a space on either side of the equals
> sign is permitted, but older versions of the settings page ignored such entries. The
> web UI now trims whitespace and will show every variable present in the file.

## Production Deployment

Recommended production options

- Run under PM2 (recommended): the repo includes `ecosystem.config.js` used to start the app in production mode.

  Linux/macOS example:

  ```bash
  export PORT=3000
  export NODE_ENV=production
  npm install -g pm2
  pm2 start ecosystem.config.js --env production
  pm2 save
  ```

  Windows PowerShell example (current session):

  ```powershell
  $env:PORT = '3000'
  $env:NODE_ENV = 'production'
  npm install -g pm2
  pm2 start ecosystem.config.js --env production
  pm2 save
  ```
- Native Windows launcher: see `START_ON_WINDOWS.md`. The project ships `scripts/start-lis.ps1` which is compiled into `dist/start-lis.exe` (via `ps2exe`) and prefers PM2 when available. The launcher forces `NODE_ENV=production`, runs `pm2 save` and opens `pm2 monit` so you can watch status.
- Packaged single EXE (optional): use `pkg` to produce `dist/laboratory-information-system.exe`. See package.json `pkg` config — note that large native assets (Chromium for Puppeteer, Sharp libs) often must be shipped alongside the EXE.

If you plan to run PM2 as a Windows service so saved processes resurrect on reboot, consider `pm2-windows-service` or NSSM (instructions in `START_ON_WINDOWS.md`).

## License

This project is licensed under the MIT License.
