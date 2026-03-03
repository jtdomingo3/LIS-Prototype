import { Router, Request, Response } from 'express';
import { TestModel } from '../models/Test';
import { PatientModel } from '../models/Patient';
import { requireAuth, requirePermission } from '../middleware/auth';
import { EventEmitter } from 'events';

const router = Router();
const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100);

// Export for use in other routes
export { sseEmitter };

/**
 * GET /api/reception - Reception overview: areas with patient/test counts
 */
router.get('/', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    // Get all non-released, non-completed tests
    const { tests } = TestModel.findAll({ limit: 10000 });
    const activeTests = tests.filter(t => !['Released', 'Completed'].includes(t.status));

    // Group by area/status
    const areas: Record<string, { count: number; patients: Set<string> }> = {};

    for (const test of activeTests) {
      const area = test.status || 'Pending';
      if (!areas[area]) {
        areas[area] = { count: 0, patients: new Set() };
      }
      areas[area].count++;
      areas[area].patients.add(test.patient_id);
    }

    const areaSummary = Object.entries(areas).map(([name, data]) => ({
      name,
      testCount: data.count,
      patientCount: data.patients.size,
    }));

    return res.json({ areas: areaSummary });
  } catch (err: any) {
    console.error('[reception] overview error:', err);
    return res.status(500).json({ error: 'Failed to load reception data' });
  }
});

/**
 * GET /api/reception/area/:name - Get patients/tests for a specific area
 */
router.get('/area/:name', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    const areaName = decodeURIComponent(req.params.name);
    const { tests } = TestModel.findAll({ limit: 10000 });
    const areaTests = tests.filter(t => t.status === areaName);

    // Group by patient
    const patientMap = new Map<string, { patient: any; tests: any[] }>();

    for (const test of areaTests) {
      if (!patientMap.has(test.patient_id)) {
        const patient = PatientModel.findById(test.patient_id);
        patientMap.set(test.patient_id, {
          patient: patient || { id: test.patient_id, first_name: 'Unknown', last_name: '' },
          tests: [],
        });
      }
      patientMap.get(test.patient_id)!.tests.push(test);
    }

    return res.json({
      area: areaName,
      entries: Array.from(patientMap.values()),
    });
  } catch (err: any) {
    console.error('[reception] area error:', err);
    return res.status(500).json({ error: 'Failed to load area data' });
  }
});

/**
 * POST /api/reception/assign - Assign test to an area (update status)
 */
router.post('/assign', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    const { testId, area, specimenNumber, doctorId, doctorName } = req.body;

    if (!testId || !area) {
      return res.status(400).json({ error: 'testId and area are required' });
    }

    const test = TestModel.findById(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const updateData: any = {
      status: area,
      status_history: [...test.status_history, {
        from: test.status,
        to: area,
        user: req.user?.userId,
        area,
        timestamp: new Date().toISOString(),
      }],
    };

    if (specimenNumber) {
      updateData.specimen_numbers = { ...test.specimen_numbers, [area]: specimenNumber };
    }

    if (doctorId) {
      updateData.assigned_doctor_id = doctorId;
      updateData.assigned_doctor_name = doctorName || '';
    }

    const updated = TestModel.update(testId, updateData);

    // Emit SSE event
    sseEmitter.emit('test-update', { type: 'assign', test: updated });

    return res.json({ test: updated });
  } catch (err: any) {
    console.error('[reception] assign error:', err);
    return res.status(500).json({ error: 'Failed to assign test' });
  }
});

/**
 * POST /api/reception/complete - Mark test(s) complete for an area
 */
router.post('/complete', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    const { testIds, patientId, area, nextArea } = req.body;

    if ((!testIds || testIds.length === 0) && !patientId) {
      return res.status(400).json({ error: 'testIds or patientId is required' });
    }

    let testsToUpdate: string[] = testIds || [];

    if (patientId && (!testIds || testIds.length === 0)) {
      // Get all tests for this patient in the specified area
      const patientTests = TestModel.findByPatientId(patientId);
      testsToUpdate = patientTests
        .filter(t => t.status === area)
        .map(t => t.id);
    }

    const updated: any[] = [];
    for (const testId of testsToUpdate) {
      const test = TestModel.findById(testId);
      if (!test) continue;

      const newStatus = nextArea || 'Completed';
      const updateData: any = {
        status: newStatus,
        status_history: [...test.status_history, {
          from: test.status,
          to: newStatus,
          user: req.user?.userId,
          area: area,
          timestamp: new Date().toISOString(),
        }],
      };

      if (newStatus === 'Completed' || newStatus === 'Released') {
        if (!test.completed_at) {
          updateData.completed_at = new Date().toISOString();
        }
      }

      const result = TestModel.update(testId, updateData);
      if (result) updated.push(result);
    }

    // Emit SSE event
    sseEmitter.emit('test-update', { type: 'complete', tests: updated, area });

    return res.json({ updated, count: updated.length });
  } catch (err: any) {
    console.error('[reception] complete error:', err);
    return res.status(500).json({ error: 'Failed to complete tests' });
  }
});

/**
 * GET /api/reception/events - SSE endpoint for live updates
 */
router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');

  const handler = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sseEmitter.on('test-update', handler);

  // Keep-alive ping every 30s
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    sseEmitter.off('test-update', handler);
    clearInterval(keepAlive);
  });
});

/**
 * GET /api/reception/assigned-data - JSON of all assigned data
 */
router.get('/assigned-data', requireAuth, (req: Request, res: Response) => {
  try {
    const { tests } = TestModel.findAll({ limit: 10000 });
    const activeTests = tests.filter(t => !['Released', 'Completed'].includes(t.status));

    // Group by area
    const areas: Record<string, any[]> = {};
    for (const test of activeTests) {
      const area = test.status || 'Pending';
      if (!areas[area]) areas[area] = [];

      const patient = PatientModel.findById(test.patient_id);
      areas[area].push({
        test,
        patient: patient || { id: test.patient_id, first_name: 'Unknown', last_name: '' },
      });
    }

    return res.json({ areas });
  } catch (err: any) {
    console.error('[reception] assigned-data error:', err);
    return res.status(500).json({ error: 'Failed to load assigned data' });
  }
});

export default router;
