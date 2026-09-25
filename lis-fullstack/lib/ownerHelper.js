/**
 * Owner Resolution Helper for Gezyne Clinical Laboratory & X-Ray Section
 * 
 * Policy:
 * - If there is only one owner in the system, it is the same for both Clinical Laboratory and X-Ray.
 * - If a separate owner is configured for X-Ray / Radiology, that owner is used for X-Ray staff and reports.
 */

function getLaboratoryOwner(department = '') {
  const users = (global.db && typeof global.db.getUsers === 'function')
    ? global.db.getUsers()
    : [];

  const owners = users.filter(u => (u.role || '').toLowerCase() === 'owner');

  const deptStr = String(department || '').toLowerCase();
  const isXray = deptStr.includes('xray') ||
                 deptStr.includes('x-ray') ||
                 deptStr.includes('radiolog') ||
                 deptStr.includes('imaging');

  // If there are multiple owners, see if one is designated for X-Ray / Radiology
  if (isXray && owners.length > 1) {
    const xrayOwner = owners.find(u => {
      const uDept = String(u.department || '').toLowerCase();
      const uTitle = String(u.title || '').toLowerCase();
      const uName = String(u.name || '').toLowerCase();
      const uEmail = String(u.email || '').toLowerCase();
      return uDept.includes('xray') || uDept.includes('x-ray') || uDept.includes('radiolog') ||
             uTitle.includes('xray') || uTitle.includes('x-ray') || uTitle.includes('radiolog') ||
             uName.includes('xray') || uName.includes('x-ray') || uName.includes('radiolog') ||
             uEmail.includes('xray') || uEmail.includes('radiolog');
    });

    if (xrayOwner) {
      return {
        id: xrayOwner.id,
        name: xrayOwner.name,
        role: 'Owner',
        title: 'Laboratory Owner — X-Ray & Imaging Section',
        signature: xrayOwner.signature || null,
        email: xrayOwner.email || ''
      };
    }
  }

  // If only one owner (or default fallback), it is the same for Clinical and X-Ray
  if (owners.length > 0) {
    const primary = owners[0];
    return {
      id: primary.id,
      name: primary.name,
      role: 'Owner',
      title: 'Laboratory Owner',
      signature: primary.signature || null,
      email: primary.email || ''
    };
  }

  // Default fallback if no user is found with role Owner
  return {
    id: null,
    name: 'Genalyn Lopez',
    role: 'Owner',
    title: 'Laboratory Owner',
    signature: null,
    email: 'genalyn@lab.com'
  };
}

module.exports = { getLaboratoryOwner };
