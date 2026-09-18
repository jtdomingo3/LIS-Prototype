// Generates a secure random INSTALLER_KEY and runs encrypt-installer-resources.js
(async () => {
  try {
    const crypto = require('crypto');
    const key = crypto.randomBytes(32).toString('base64');
    process.env.INSTALLER_KEY = key;
    console.log('Generated INSTALLER_KEY for this run:', key);
    require('./encrypt-installer-resources.js');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
