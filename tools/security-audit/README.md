# LIS Security Risk Assessment & Compliance Suite (v2.3.0 / 2026 Standards)

Comprehensive defensive penetration testing, security risk assessment, and compliance audit suite designed for clinical laboratory systems.

---

## 🛡️ Audited Standards & Baselines

1. **OWASP Top 10 (2025/2026 Edition)**
   - A01: Broken Access Control
   - A02: Cryptographic Failures & Password Salting
   - A03: Injection & Parameterized SQL Placeholders
   - A04: Insecure Design & Rate Limiting
   - A05: Security Misconfiguration & HTTP Security Headers
   - A07: Identification and Authentication Failures
   - A09: Security Logging & Monitoring Failures (PII/Token Masking)
2. **NIST SP 800-63B Guidelines**
   - Minimum bcrypt salt rounds (>= 10)
   - Secure token entropy & session cookie security
3. **Healthcare Data Protection (PHI / PII Sanitization)**
   - Automatic masking of passwords, Bearer tokens, and clinical identifiers in application logs.

---

## 🚀 Running the Security Audit

From the repository root or audit directory:

```bash
# From workspace root
node tools/security-audit/run-security-audit.js

# Or via npm script
npm run security-audit
```

The tool audits both:
- **`lis-fullstack`** (Central Server: HTTP headers, authentication, rate limits, SQL queries, log masking)
- **`lis-app-standalone`** (Local-First Desktop App: SQLite queries, offline queue, token storage, local server headers)

An aggregated report is automatically saved to `tools/security-audit/audit-report-latest.json`.

---

## ⚡ Zero-Downtime Deployment & High Availability Architecture

Achieving **100% uptime with zero downtime** during server updates, database maintenance, and network interruptions is built into the architecture:

### 1. Local-First Standalone Failover (Client-Side Zero Downtime)
- If the central server is rebooted or undergoing maintenance, `lis-app-standalone` automatically switches to local SQLite mode seamlessly.
- Staff can continue admitting patients, collecting specimens, and inputting test results without interruption.
- All offline operations are stored in `OperationQueue` and automatically synced to the central server when it returns online.

### 2. SQLite WAL (Write-Ahead Logging) Mode
- Both repositories use `PRAGMA journal_mode = WAL`.
- Readers (dashboard views, test queries, report downloads) **never block writers**, and writers **never block readers**. Queries return instantaneously even during heavy data synchronization.

### 3. Production Process Clustering & Graceful Reload
For server deployments on Linux/Windows Server, use PM2 cluster mode:

```bash
# Start server in cluster mode with 2+ workers
pm2 start server.js -i max --name "lis-server"

# Perform zero-downtime rolling update
git pull
npm install
pm2 reload lis-server --update-env
```
`pm2 reload` restarts workers sequentially one-by-one, ensuring active HTTP requests finish while new traffic routes to updated workers with **zero downtime**.
