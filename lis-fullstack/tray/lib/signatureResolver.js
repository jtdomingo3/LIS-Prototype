const fs = require('fs');
const path = require('path');

const sigDir = path.join(__dirname, '..', 'assets', 'signature');

/**
 * Ensures that signatures attached to a test record point to existing image files on disk.
 * If a signature points to a missing file, it attempts to resolve to the user's active signature file.
 * If a signatory is listed but missing from signatures map, it attempts auto-resolution.
 * If no valid file is found, it nulls the filename so a broken image icon is never rendered.
 */
function sanitizeTestSignatures(populatedTest) {
  if (!populatedTest) return populatedTest;
  populatedTest.results = populatedTest.results || {};
  populatedTest.results.signatures = populatedTest.results.signatures || {};
  const sigs = populatedTest.results.signatures;

  let allUsers = [];
  try {
    allUsers = (global.db && typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];
  } catch (_) {}

  // 1. Sanitize existing signature entries
  for (const [key, sig] of Object.entries(sigs)) {
    if (!sig) continue;
    let filename = sig.filename;
    let exists = false;
    if (filename) {
      try {
        exists = fs.existsSync(path.join(sigDir, filename));
      } catch (_) {}
    }

    if (!exists) {
      // Attempt to resolve valid signature from users by ID, email, or name
      const user = allUsers.find(u =>
        (u.id && String(u.id) === String(key)) ||
        (u.name && sig.name && String(u.name).trim().toLowerCase() === String(sig.name).trim().toLowerCase()) ||
        (populatedTest.results.requestedByName && u.name && String(u.name).trim().toLowerCase() === String(populatedTest.results.requestedByName).trim().toLowerCase()) ||
        (populatedTest.results.performedByName && u.name && String(u.name).trim().toLowerCase() === String(populatedTest.results.performedByName).trim().toLowerCase()) ||
        (populatedTest.results.validatedByName && u.name && String(u.name).trim().toLowerCase() === String(populatedTest.results.validatedByName).trim().toLowerCase())
      );

      let resolvedFilename = null;
      if (user && user.signature && fs.existsSync(path.join(sigDir, user.signature))) {
        resolvedFilename = user.signature;
      } else if (user && user.email) {
        const safe = String(user.email).toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fallbackName = `${safe}_signature.png`;
        if (fs.existsSync(path.join(sigDir, fallbackName))) {
          resolvedFilename = fallbackName;
        }
      }

      sig.filename = resolvedFilename;
    }
  }

  // 2. Check if requestedBy / pathologist is named but missing from signatures
  const requestedName = (populatedTest.results && populatedTest.results.requestedByName) ||
                        (populatedTest.requestedBy && populatedTest.requestedBy.name) || '';
  if (requestedName) {
    const hasRequestedSig = Object.values(sigs).some(s =>
      s && s.name && String(s.name).trim().toLowerCase() === requestedName.trim().toLowerCase() && s.filename
    );
    if (!hasRequestedSig) {
      const u = allUsers.find(u => u.name && String(u.name).trim().toLowerCase() === requestedName.trim().toLowerCase());
      if (u) {
        let fn = u.signature;
        if (!fn || !fs.existsSync(path.join(sigDir, fn))) {
          const safe = String(u.email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
          const fallback = `${safe}_signature.png`;
          if (fs.existsSync(path.join(sigDir, fallback))) {
            fn = fallback;
          } else {
            fn = null;
          }
        }
        if (fn) {
          const uid = u.id || 'requestedBy';
          sigs[uid] = {
            filename: fn,
            name: u.name,
            placement: { x: 0, y: -56, scale: 1 }
          };
        }
      }
    }
  }

  return populatedTest;
}

module.exports = {
  sigDir,
  sanitizeTestSignatures
};
