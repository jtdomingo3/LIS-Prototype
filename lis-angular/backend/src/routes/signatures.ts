import { Router, Request, Response } from 'express';
import { TestModel } from '../models/Test';
import { PatientModel } from '../models/Patient';
import { UserModel } from '../models/User';
import { requireAuth, requirePermission } from '../middleware/auth';
import { getDb } from '../db/connection';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/signatures - List tests where current user's name appears (signable documents)
 */
router.get('/', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const currentUser = req.user;
    // Look up user name from DB since JwtPayload only has userId/email/role
    const userRecord = currentUser?.userId ? UserModel.findById(currentUser.userId) : null;
    const userName = (userRecord?.name || '').toLowerCase();

    if (!userName) {
      return res.json({ tests: [], total: 0, pagination: { totalPages: 1, page: 1 } });
    }

    // Get all tests
    const { tests: allTests } = TestModel.findAll({ limit: 10000 });

    // Filter tests where user's name appears in signatory fields
    const matches = allTests.filter(t => {
      try {
        const fields: string[] = [];
        if (t.results) {
          Object.keys(t.results).forEach(k => {
            if (typeof t.results[k] === 'string') fields.push(t.results[k]);
          });
        }
        if (t.assigned_doctor_name) fields.push(t.assigned_doctor_name);
        return fields.some(f => f && f.toLowerCase().includes(userName));
      } catch { return false; }
    });

    // Read filters
    const searchQuery = (req.query.search as string) || '';
    const typeFilter = (req.query.type as string) || '';
    const dateFilter = (req.query.date as string) || '';

    // Get available test types
    const availableTestTypes = [...new Set(matches.map(t => t.test_type).filter(Boolean))].sort();

    // Apply filters
    let filtered = matches;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => {
        const patient = PatientModel.findById(t.patient_id);
        const patientName = patient ? `${patient.first_name || ''} ${patient.last_name || ''}`.toLowerCase() : '';
        return (t.test_id || '').toLowerCase().includes(q) ||
               (t.test_type || '').toLowerCase().includes(q) ||
               patientName.includes(q);
      });
    }
    if (typeFilter) filtered = filtered.filter(t => t.test_type === typeFilter);
    if (dateFilter) {
      filtered = filtered.filter(t => {
        const dt = t.test_date || t.created_at || null;
        try { return dt ? new Date(dt).toISOString().slice(0, 10) === dateFilter : false; } catch { return false; }
      });
    }

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.test_date || b.created_at).getTime() - new Date(a.test_date || a.created_at).getTime());

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = 10;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIdx = (page - 1) * limit;
    const pagedTests = filtered.slice(startIdx, startIdx + limit);

    // Attach patient info
    const testsWithPatient = pagedTests.map(t => {
      const patient = PatientModel.findById(t.patient_id);
      return {
        ...t,
        patient: patient ? { firstName: patient.first_name, lastName: patient.last_name, patientId: patient.patient_id } : null,
      };
    });

    return res.json({
      tests: testsWithPatient,
      total,
      availableTestTypes,
      currentUser: { id: currentUser?.userId, name: userRecord?.name || '', email: currentUser?.email },
      pagination: {
        page,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (err: any) {
    console.error('[signatures] list error:', err);
    return res.status(500).json({ error: 'Failed to list signatures' });
  }
});

/**
 * POST /api/signatures/:id/sign - Apply signature to a test
 */
router.post('/:id/sign', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const currentUser = req.user;
    const test = TestModel.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Get user's signature filename from users table
    const db = getDb();
    const userRow = db.prepare('SELECT signature FROM users WHERE id = ?').get(currentUser?.userId) as { signature: string } | undefined;
    if (!userRow?.signature) {
      return res.status(400).json({ error: 'No profile signature found. Upload one in your profile.' });
    }

    // Store signature in test results
    const results = { ...test.results };
    results.signatures = results.signatures || {};
    const uid = currentUser?.userId || currentUser?.email || 'unknown';
    const signUserRecord = currentUser?.userId ? UserModel.findById(currentUser.userId) : null;
    results.signatures[uid] = {
      filename: userRow.signature,
      name: signUserRecord?.name || currentUser?.email || 'Unknown',
      uploadedAt: new Date().toISOString(),
    };

    TestModel.update(req.params.id, { results });

    return res.json({ message: 'Signature applied successfully' });
  } catch (err: any) {
    console.error('[signatures] sign error:', err);
    return res.status(500).json({ error: 'Failed to apply signature' });
  }
});

export default router;
