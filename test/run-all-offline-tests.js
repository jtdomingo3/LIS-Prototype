/**
 * Master Standalone Offline Test Runner
 * Directory: test/run-all-offline-tests.js
 * 
 * Runs all standalone offline test suites:
 * 1. SQLite DataStore & Models Offline CRUD
 * 2. Reception Multi-Station Pipeline Offline
 * 3. Local Server HTTP Routes & Queuing
 * 4. Offline Queue & Deterministic ID Mapping
 * 5. Complete Reception, Multi-Category Results Entry & Sync Readiness
 */
const { runDatastoreCrudTests } = require('./standalone-offline-crud.test');
const { runReceptionPipelineTests } = require('./standalone-offline-pipeline.test');
const { runLocalServerRouteTests } = require('./standalone-offline-routes.test');
const { runQueueIdMappingTests } = require('./standalone-offline-id-mapping.test');
const { runE2EAllFunctionsTest } = require('./standalone-offline-e2e-all-functions.test');
const { runDeletionSyncTest } = require('./standalone-offline-deletion-sync.test');

async function runAllOfflineTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING STANDALONE LIS FULL OFFLINE TEST SUITE');
  console.log('====================================================\n');

  const startTime = Date.now();

  try {
    await runDatastoreCrudTests();
    await runReceptionPipelineTests();
    await runLocalServerRouteTests();
    await runQueueIdMappingTests();
    await runE2EAllFunctionsTest();
    await runDeletionSyncTest();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('====================================================');
    console.log(`🎉 ALL 6 OFFLINE TEST SUITES PASSED SUCCESSFULLY (${elapsed}s)`);
    console.log('All offline capabilities (CRUD, Pipeline, Express, Results, Queue, Deletion) are 100% verified!');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ TEST RUNNER TERMINATED WITH ERROR:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runAllOfflineTests();
}

module.exports = { runAllOfflineTests };
