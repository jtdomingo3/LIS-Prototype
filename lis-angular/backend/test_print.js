const { TestModel } = require('./dist/models/Test');
const { PatientModel } = require('./dist/models/Patient');
const { renderReportHtml } = require('./dist/lib/reportHtmlRenderer');

const ids = [
  'f81a22c0-a449-45dc-8ba4-3a0c13a91323',
  '5dcce10a-5c29-42ee-bb3c-34833d88a814'
];

try {
  console.log('Starting diagnostic...');
  const pages = [];
  for (const id of ids) {
    console.log('Finding test id:', id);
    const test = TestModel.findById(id);
    if (!test) {
      console.log('Test not found for ID:', id);
      continue;
    }
    console.log('Finding patient id:', test.patient_id);
    const patient = PatientModel.findById(test.patient_id);
    console.log('Rendering report html...');
    const html = renderReportHtml(test, patient || {}, 'http://localhost:3020', { print: false });
    console.log('Extracting body...');
    const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/i);
    pages.push(bodyMatch ? bodyMatch[1] : html);
  }
  const combined = pages.join('\n<div style="page-break-after:always;"></div>\n');
  console.log('Success! Combined HTML length:', combined.length);
} catch (e) {
  console.error('DIAGNOSTIC ERROR:', e);
}
