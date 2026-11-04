const { v4: uuidv4 } = require('uuid');

const DEFAULT_PACKAGES = [
  {
    id: 'pkg-1',
    code: 'PKG1',
    name: 'Package 1',
    price: 680,
    category: 'Blood Chemistry Packages',
    bloodChemParams: ['FBS', 'Cholesterol', 'Uric Acid', 'Creatinine'],
    otherTests: [], // keys corresponding to test catalog
    urinalysis: { include: true, seniorPwdFree: true, regularPrice: 100 },
    active: true,
    order: 1,
    note: 'With free urinalysis for Senior Citizen & PWD (+₱100 for regular)'
  },
  {
    id: 'pkg-2',
    code: 'PKG2',
    name: 'Package 2',
    price: 880,
    category: 'Blood Chemistry Packages',
    bloodChemParams: ['FBS', 'Cholesterol', 'Uric Acid', 'Creatinine', 'Triglycerides'],
    otherTests: [],
    urinalysis: { include: true, seniorPwdFree: true, regularPrice: 100 },
    active: true,
    order: 2,
    note: 'With free urinalysis for Senior Citizen & PWD (+₱100 for regular)'
  },
  {
    id: 'pkg-3',
    code: 'PKG3',
    name: 'Package 3',
    price: 1130,
    category: 'Blood Chemistry Packages',
    bloodChemParams: ['FBS', 'Cholesterol', 'Uric Acid', 'Creatinine', 'Triglycerides', 'HDL', 'LDL'],
    otherTests: [],
    urinalysis: { include: true, seniorPwdFree: true, regularPrice: 100 },
    active: true,
    order: 3,
    note: 'With free urinalysis for Senior Citizen & PWD (+₱100 for regular)'
  },
  {
    id: 'pkg-4',
    code: 'PKG4',
    name: 'Package 4',
    price: 1380,
    category: 'Blood Chemistry Packages',
    bloodChemParams: ['FBS', 'Cholesterol', 'Uric Acid', 'Creatinine', 'HDL', 'LDL', 'SGPT'],
    otherTests: [],
    urinalysis: { include: true, seniorPwdFree: true, regularPrice: 100 },
    active: true,
    order: 4,
    note: 'With free urinalysis for Senior Citizen & PWD (+₱100 for regular)'
  },
  {
    id: 'pkg-5',
    code: 'PKG5',
    name: 'Package 5',
    price: 1500,
    category: 'Blood Chemistry Packages',
    bloodChemParams: ['FBS', 'Cholesterol', 'Uric Acid', 'Creatinine', 'HDL', 'LDL', 'SGPT'],
    otherTests: ['hematology'], // CBC
    urinalysis: { include: true, seniorPwdFree: true, regularPrice: 100 },
    active: true,
    order: 5,
    note: 'Includes CBC + free urinalysis for Senior/PWD (+₱100 for regular)'
  },
  {
    id: 'pkg-6',
    code: 'PKG6',
    name: 'Package 6',
    price: 2200,
    category: 'Blood Chemistry Packages',
    bloodChemParams: ['FBS', 'Cholesterol', 'Uric Acid', 'Creatinine', 'Triglycerides', 'HDL', 'LDL', 'SGPT'],
    otherTests: ['hematology', 'X-ray', 'ecg'], // CBC, Chest X-ray, ECG
    urinalysis: { include: true, seniorPwdFree: true, regularPrice: 100 },
    active: true,
    order: 6,
    note: 'Includes CBC, Chest X-ray, ECG + free urinalysis for Senior/PWD (+₱100 for regular)'
  }
];

function getSettingsObject() {
  if (global.db && typeof global.db.getSettings === 'function') {
    return global.db.getSettings() || {};
  }
  if (!global.db) return {};
  try {
    const data = (typeof global.db.read === 'function') ? global.db.read() : null;
    return (data && data.settings) || {};
  } catch (e) {
    return {};
  }
}

function saveSettingsObject(settings) {
  if (!global.db) return;
  if (typeof global.db.setSettings === 'function') {
    global.db.setSettings(settings);
    return;
  }
  try {
    const data = (typeof global.db.read === 'function') ? global.db.read() : null;
    if (data && typeof global.db.write === 'function') {
      data.settings = settings;
      global.db.write(data);
    }
  } catch (e) {
    console.warn('[packageHelper] Failed to persist settings:', e.message);
  }
}

function getPackages(onlyActive = false) {
  const settings = getSettingsObject();
  let list = settings.testPackages;

  if (!Array.isArray(list) || list.length === 0) {
    // Seed default packages 1-6
    list = JSON.parse(JSON.stringify(DEFAULT_PACKAGES));
    settings.testPackages = list;
    saveSettingsObject(settings);
  }

  if (onlyActive) {
    return list.filter(p => p.active !== false);
  }
  return list;
}

function getPackageById(id) {
  const list = getPackages();
  return list.find(p => String(p.id) === String(id)) || null;
}

function savePackage(data) {
  const settings = getSettingsObject();
  let list = settings.testPackages;
  if (!Array.isArray(list)) {
    list = JSON.parse(JSON.stringify(DEFAULT_PACKAGES));
  }

  const id = data.id || `pkg-${uuidv4().slice(0, 8)}`;
  const existingIdx = list.findIndex(p => String(p.id) === String(id));

  const pkg = {
    id,
    code: data.code || `PKG${list.length + 1}`,
    name: String(data.name || '').trim() || 'Untitled Package',
    price: Math.max(0, parseFloat(data.price) || 0),
    category: data.category || 'Laboratory Packages',
    bloodChemParams: Array.isArray(data.bloodChemParams) ? data.bloodChemParams : [],
    otherTests: Array.isArray(data.otherTests) ? data.otherTests : [],
    urinalysis: {
      include: data.urinalysis && data.urinalysis.include !== undefined ? !!data.urinalysis.include : true,
      seniorPwdFree: data.urinalysis && data.urinalysis.seniorPwdFree !== undefined ? !!data.urinalysis.seniorPwdFree : true,
      regularPrice: data.urinalysis && data.urinalysis.regularPrice !== undefined ? Math.max(0, parseFloat(data.urinalysis.regularPrice) || 0) : 100
    },
    active: data.active !== undefined ? !!data.active : true,
    order: parseInt(data.order, 10) || (existingIdx >= 0 ? list[existingIdx].order : list.length + 1),
    note: data.note || ''
  };

  if (existingIdx >= 0) {
    list[existingIdx] = pkg;
  } else {
    list.push(pkg);
  }

  // Sort by order
  list.sort((a, b) => (a.order || 0) - (b.order || 0));

  settings.testPackages = list;
  saveSettingsObject(settings);
  return pkg;
}

function deletePackage(id) {
  const settings = getSettingsObject();
  let list = settings.testPackages;
  if (!Array.isArray(list)) return false;

  const idx = list.findIndex(p => String(p.id) === String(id));
  if (idx >= 0) {
    list.splice(idx, 1);
    settings.testPackages = list;
    saveSettingsObject(settings);
    return true;
  }
  return false;
}

function canUserManagePackages(user) {
  if (!user) return false;
  const role = String(user.role || '').trim();
  if (role === 'Admin' || role === 'Owner' || role === 'Manager' || role === 'Receptionist') return true;
  let perms = user.permissions || {};
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
  }
  return !!(perms.reception || perms.settings || perms.tests || perms.templates);
}

module.exports = {
  DEFAULT_PACKAGES,
  getPackages,
  getPackageById,
  savePackage,
  deletePackage,
  canUserManagePackages
};
