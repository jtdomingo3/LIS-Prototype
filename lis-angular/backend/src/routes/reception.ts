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

// In-memory advertisement text for kiosk
let kioskAdText = '';

// Configurable Doctor names from env (matches original app)
const DOCTOR_1_NAME = process.env.DOCTOR_1_NAME || "Doctor's Check-up 1";
const DOCTOR_2_NAME = process.env.DOCTOR_2_NAME || "Doctor's Check-up 2";

// Define all reception areas as in the original app
const DISPLAY_AREAS = [
  'Payment Area',
  'Sendout',
  'Collection Area',
  'Extraction Area',
  'Drug Test',
  'Ultrasound',
  '2D Echo',
  'X-ray',
  'ECG',
  'Releasing of Result',
  DOCTOR_1_NAME,
  DOCTOR_2_NAME,
];

// Kiosk display areas: hide internal queues (Sendout, Collection Area)
const KIOSK_AREAS = DISPLAY_AREAS.filter(
  a => !['Sendout', 'Collection Area'].includes(a)
);

/**
 * Map test type to its target area after Payment Area (matches original reception.js)
 */
function mapTestToArea(testType: string): string {
  const lower = (testType || '').toLowerCase();

  // Urine / stool tests => Collection Area (no extraction needed)
  if (['urinalysis', 'fecalysis', 'pregnancy test', 'fecal occult blood', 'fobt'].some(t => lower.includes(t))) {
    return 'Collection Area';
  }

  // Lab tests that need extraction
  if (['blood chemistry', 'hematology', 'serology', 'esr', 'ct-bt', 'blood typing',
       'dengue duo', 'thyroid panel', 'pt-aptt'].some(t => lower.includes(t))) {
    return 'Extraction Area';
  }
  if (lower.includes('drug') && lower.includes('test')) return 'Drug Test';
  if (lower.includes('drugtest')) return 'Drug Test';
  if (lower.includes('x-ray') || lower === 'xray') return 'X-ray';
  if (lower.includes('ultrasound')) return 'Ultrasound';
  if (lower.includes('2d echo') || lower.includes('echocardiography')) return '2D Echo';
  if (lower.includes('ecg')) return 'ECG';
  if (lower.includes('sendout') || lower.includes('send out') || lower.includes('send-out')) return 'Sendout';

  // Default: extraction
  return 'Extraction Area';
}

/**
 * GET /api/reception - Reception overview: areas with patient/test counts
 */
router.get('/', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    // Get all non-released, non-completed tests
    const { tests } = TestModel.findAll({ limit: 10000 });

    // Count unique patients per area
    const areaCounts: Record<string, Set<string>> = {};
    DISPLAY_AREAS.forEach(a => areaCounts[a] = new Set());

    for (const test of tests) {
      const status = test.status || 'Pending';
      // Map test status to display area
      if (areaCounts[status]) {
        areaCounts[status].add(test.patient_id);
      }
    }

    const areas = DISPLAY_AREAS.map(name => ({
      name,
      testCount: 0,
      patientCount: areaCounts[name]?.size || 0,
      count: areaCounts[name]?.size || 0,
    }));

    // Also count actual test counts per area
    for (const test of tests) {
      const status = test.status || 'Pending';
      const area = areas.find(a => a.name === status);
      if (area) area.testCount++;
    }

    return res.json({ areas, ad: kioskAdText });
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
    const { testIds, patientId, area, nextArea, clinicalAmount, xrayAmount } = req.body;

    if ((!testIds || testIds.length === 0) && !patientId) {
      return res.status(400).json({ error: 'testIds or patientId is required' });
    }

    let testsToUpdate: string[] = testIds || [];

    if (patientId && (!testIds || testIds.length === 0)) {
      const patientTests = TestModel.findByPatientId(patientId);
      testsToUpdate = patientTests
        .filter(t => t.status === area)
        .map(t => t.id);
    }

    const updated: any[] = [];
    for (const testId of testsToUpdate) {
      const test = TestModel.findById(testId);
      if (!test) continue;

      // Determine next status
      let newStatus: string;
      if (nextArea) {
        newStatus = nextArea;
      } else if (area === 'Payment Area') {
        // After payment, route each test to its appropriate area
        newStatus = mapTestToArea(test.test_type);
      } else if (area === 'Releasing of Result') {
        newStatus = 'Released';
      } else if (area === DOCTOR_1_NAME || area === DOCTOR_2_NAME) {
        newStatus = 'Checked';
      } else {
        // Non-payment areas: move to Awaiting (for result entry)
        newStatus = 'Awaiting';
      }

      const updateData: any = {
        status: newStatus,
        status_history: [...(test.status_history || []), {
          from: test.status,
          to: newStatus,
          user: req.user?.userId,
          area: area,
          timestamp: new Date().toISOString(),
        }],
      };

      // Record payment amounts
      if (area === 'Payment Area' && (clinicalAmount || xrayAmount)) {
        updateData.payment_history = {
          ...(test.payment_history || {}),
          clinicalAmount: clinicalAmount || 0,
          xrayAmount: xrayAmount || 0,
          paidAt: new Date().toISOString(),
        };
      }

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
 * POST /api/reception/delete - Remove test(s) from a queue area (reset to Pending)
 */
router.post('/delete', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    const { testIds, area } = req.body;
    if (!testIds || testIds.length === 0) {
      return res.status(400).json({ error: 'testIds required' });
    }

    const updated: any[] = [];
    for (const testId of testIds) {
      const test = TestModel.findById(testId);
      if (!test) continue;

      const updateData: any = {
        status: 'Pending',
        status_history: [...(test.status_history || []), {
          from: test.status,
          to: 'Pending',
          user: req.user?.userId,
          area: area,
          action: 'deleted_from_queue',
          timestamp: new Date().toISOString(),
        }],
      };

      const result = TestModel.update(testId, updateData);
      if (result) updated.push(result);
    }

    sseEmitter.emit('test-update', { type: 'delete', tests: updated, area });
    return res.json({ updated, count: updated.length });
  } catch (err: any) {
    console.error('[reception] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete from queue' });
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

/**
 * POST /api/reception/advert - Save advertisement text
 */
router.post('/advert', requireAuth, requirePermission('reception'), (req: Request, res: Response) => {
  try {
    kioskAdText = req.body.text || '';
    return res.json({ message: 'Advertisement saved', ad: kioskAdText });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save advertisement' });
  }
});

/**
 * GET /api/reception/advert - Get advertisement text
 */
router.get('/advert', (req: Request, res: Response) => {
  return res.json({ ad: kioskAdText });
});

/**
 * GET /api/reception/kiosk - Kiosk data (areas with patient codes) - no auth required
 */
router.get('/kiosk', (req: Request, res: Response) => {
  try {
    const { tests } = TestModel.findAll({ limit: 10000 });

    const areaData: Record<string, string[]> = {};
    KIOSK_AREAS.forEach(a => areaData[a] = []);

    for (const test of tests) {
      const status = test.status || 'Pending';
      if (areaData[status]) {
        const patient = PatientModel.findById(test.patient_id);
        const code = patient?.patient_code || patient?.patient_id || test.patient_id;
        if (!areaData[status].includes(code)) {
          areaData[status].push(code);
        }
      }
    }

    return res.json({ areas: areaData, ad: kioskAdText });
  } catch (err: any) {
    console.error('[reception] kiosk error:', err);
    return res.status(500).json({ error: 'Failed to load kiosk data' });
  }
});

export default router;
