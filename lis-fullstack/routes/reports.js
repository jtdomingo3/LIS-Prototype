const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Template = require('../models/Template');
const pdf = require('html-pdf');
const { requireAuth, canAccessPatient } = require('../middleware/auth');

// GET /reports - Reports page
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // Get all completed tests for report generation
    const completedTests = await Test.find({ status: 'Completed' });
    
    // Manually populate patient data and sort by testDate
    let testsWithPatients = [];
    if (Array.isArray(completedTests)) {
      testsWithPatients = await Promise.all(
        completedTests
          .sort((a, b) => new Date(b.testDate) - new Date(a.testDate))
          .map(async (test) => {
            const patient = await Patient.findById(test.patient);
            return {
              ...test,
              patient: patient ? {
                firstName: patient.firstName,
                lastName: patient.lastName,
                patientId: patient.patientId
              } : null
            };
          })
      );
    }

    res.render('reports/index', {
      title: 'Generate & View Reports',
      tests: testsWithPatients
    });

  } catch (error) {
    console.error('Reports page error:', error);
    req.flash('error_msg', 'Error loading reports page');
    res.render('reports/index', {
      title: 'Generate & View Reports',
      tests: []
    });
  }
});

// GET /reports/preview/:testId - Preview report
router.get('/preview/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'Report can only be generated for completed tests');
      return res.redirect('/reports');
    }

    // Manually populate patient, requestedBy, and performedBy
    const patient = await Patient.findById(test.patient);
    const requestedBy = await User.findById(test.requestedBy);
    const performedBy = await User.findById(test.performedBy);

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    res.render('reports/preview', {
      title: 'Report Preview',
      test: populatedTest,
      currentDate: new Date().toLocaleDateString()
    });

  } catch (error) {
    console.error('Report preview error:', error);
    req.flash('error_msg', 'Error loading report preview');
    res.redirect('/reports');
  }
});

// GET /reports/pdf/:testId - Generate PDF report
router.get('/pdf/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'PDF can only be generated for completed tests');
      return res.redirect('/reports');
    }

    // When generating a report, ensure completedAt is set so reception will map to Releasing.
    // Do NOT set completedAt for Doctor's Check-up or Registration (those should not go to Releasing).
    if (!test.completedAt && (test.results && String(test.results).trim()) && test.testType !== "Doctor's Check-up" && test.testType !== 'Registration') {
      await Test.findByIdAndUpdate(test.id, { completedAt: new Date() }, { new: true });
      test.completedAt = new Date();
    }

    // Manually populate patient and users
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const requestedBy = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedBy = test.performedBy ? await User.findById(test.performedBy) : null;

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    // Generate HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Laboratory Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          .header { text-align: center; border-bottom: 3px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0 0 10px 0; color: #1a1a1a; }
          .header p { margin: 0; color: #10b981; font-weight: bold; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-section { background: #f9f9f9; padding: 15px; border-radius: 5px; }
          .info-section h3 { margin: 0 0 10px 0; color: #10b981; font-size: 14px; text-transform: uppercase; }
          .info-section p { margin: 5px 0; font-size: 12px; }
          .results { margin-top: 30px; padding-top: 20px; border-top: 2px solid #ddd; }
          .results h3 { color: #10b981; margin-bottom: 15px; }
          .results p { margin: 10px 0; font-size: 13px; white-space: pre-line; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; font-size: 11px; color: #666; }
          .footer p { margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LABORATORY TEST REPORT</h1>
          <p>Professional Clinical Laboratory Services</p>
        </div>

        <div class="info-grid">
          <div class="info-section">
            <h3>PATIENT INFORMATION</h3>
          <p><strong>Name:</strong> ${populatedTest.patient ? `${populatedTest.patient.firstName} ${populatedTest.patient.lastName}` : 'N/A'}</p>
          <p><strong>Patient ID:</strong> ${populatedTest.patient ? populatedTest.patient.patientId : 'N/A'}</p>
          <p><strong>Date of Birth:</strong> ${populatedTest.patient && populatedTest.patient.dateOfBirth ? new Date(populatedTest.patient.dateOfBirth).toLocaleDateString() : 'N/A'}</p>
          <p><strong>Gender:</strong> ${populatedTest.patient ? populatedTest.patient.gender : 'N/A'}</p>
          <p><strong>Phone:</strong> ${populatedTest.patient && populatedTest.patient.phone ? populatedTest.patient.phone : 'N/A'}</p>
          </div>
          <div class="info-section">
            <h3>TEST INFORMATION</h3>
            <p><strong>Test ID:</strong> ${populatedTest.testId}</p>
            <p><strong>Test Type:</strong> ${populatedTest.testType}</p>
            <p><strong>Test Date:</strong> ${populatedTest.testDate ? new Date(populatedTest.testDate).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Status:</strong> ${populatedTest.status}</p>
            <p><strong>Priority:</strong> ${populatedTest.priority}</p>
          </div>
        </div>

        <div class="results">
          <h3>TEST RESULTS</h3>
          <p>${populatedTest.results || 'No results recorded yet. Results pending.'}</p>
          ${populatedTest.notes ? `<p><strong>Additional Notes:</strong> ${populatedTest.notes}</p>` : ''}
        </div>

        <div class="footer">
          <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Requested By:</strong> ${populatedTest.requestedBy ? populatedTest.requestedBy.name : 'N/A'}</p>
          ${populatedTest.performedBy ? `<p><strong>Performed By:</strong> ${populatedTest.performedBy.name}</p>` : ''}
          <p><strong>Laboratory Name:</strong> Professional Clinical Laboratory Services</p>
          <p><strong>Authorized By:</strong> Dr. Medical Professional, MD</p>
          <p style="margin-top: 15px; font-style: italic;">
            This report contains confidential patient information. Please consult with your healthcare provider regarding test results and recommendations.
          </p>
        </div>
      </body>
      </html>
    `;

    // PDF options
    const options = {
      format: 'A4',
      orientation: 'portrait',
      border: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      }
    };

    // Generate PDF
    pdf.create(htmlContent, options).toBuffer((err, buffer) => {
      if (err) {
        console.error('PDF generation error:', err);
        req.flash('error_msg', 'Error generating PDF');
        return res.redirect('/reports');
      }

      // Send PDF as download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Lab_Report_${populatedTest.testId}_${populatedTest.patient ? populatedTest.patient.lastName : 'patient'}.pdf`);
  res.send(buffer);
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    req.flash('error_msg', 'Error generating PDF');
    res.redirect('/reports');
  }
});

// GET /reports/print/:testId - Print report
router.get('/print/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'Report can only be printed for completed tests');
      return res.redirect('/reports');
    }

    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const requestedBy = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedBy = test.performedBy ? await User.findById(test.performedBy) : null;

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    res.render('reports/print', {
      title: 'Print Report',
      test: populatedTest,
      currentDate: new Date().toLocaleDateString(),
      layout: 'print'
    });

  } catch (error) {
    console.error('Print report error:', error);
    req.flash('error_msg', 'Error loading print view');
    res.redirect('/reports');
  }
});

module.exports = router;