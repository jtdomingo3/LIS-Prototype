import { Router, Request, Response } from 'express';
import { PatientModel } from '../models/Patient';
import { TestModel } from '../models/Test';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/dashboard - Dashboard statistics
 */
router.get('/', requirePermission('dashboard'), (req: Request, res: Response) => {
  try {
    const dateFilter = req.query.date as string | undefined;

    // Patient counts
    const totalPatients = PatientModel.count(dateFilter);

    // Test status counts
    const statusCounts = TestModel.countByStatus(dateFilter);
    const pending = statusCounts['Pending'] || 0;
    const inProgress = (statusCounts['In Progress'] || 0) + (statusCounts['Extraction Area'] || 0);
    const completed = statusCounts['Completed'] || 0;
    const released = statusCounts['Released'] || 0;

    // Test type counts
    const typeCounts = TestModel.countByType(dateFilter);

    // Total tests
    const totalTests = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    return res.json({
      stats: {
        totalPatients,
        totalTests,
        pending,
        inProgress,
        completed,
        released,
      },
      statusBreakdown: statusCounts,
      typeBreakdown: typeCounts,
      date: dateFilter || new Date().toISOString().slice(0, 10),
    });
  } catch (err: any) {
    console.error('[dashboard] error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

export default router;
