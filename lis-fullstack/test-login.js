const path = require('path');
const { createDb } = require('./lib/sqliteDb');
const User = require('./models/User');

const DATA_DIR = path.join(require('os').homedir(), 'Documents', 'LIS', 'data');
console.log('Using DATA_DIR:', DATA_DIR);

global.db = createDb(path.join(DATA_DIR, 'lis-data.db'), { verbose: true });

async function run() {
  console.log('Waiting for ready promise...');
  if (global.db._readyPromise) {
    await global.db._readyPromise;
  }
  
  console.log('Counting users...');
  try {
    const totalUsers = await User.countDocuments();
    console.log('Total users:', totalUsers);
  } catch (e) {
    console.error('Error counting users:', e);
  }

  console.log('Finding admin...');
  try {
    const adminEmail = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@lab.com';
    const user = await User.findOne({ email: adminEmail });
    console.log('Found user:', user ? user.email : null);
    if (user) {
      console.log('Comparing password...');
      const pass = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
      const isMatch = pass ? await user.comparePassword(pass) : false;
      console.log('Match:', isMatch);
    }
  } catch (e) {
    console.error('Error finding user:', e);
  }
}

run().catch(console.error);
