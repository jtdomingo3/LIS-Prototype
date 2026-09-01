/**
 * Gezyne LIS - Smart Clinical Test Entry & Autocomplete Supercharger
 * 
 * Features:
 * 1. ⚡ 1-Click "Fill Normal Baseline" for routine clinical tests (Urinalysis, CBC, Fecalysis, X-ray, ECG, etc.)
 * 2. 🧠 Self-learning autocomplete datalists for findings, impressions, colors, microscopics, and notes
 * 3. 💾 Custom user preset templates with instant recall
 * 4. ⌨️ Keyboard Shortcuts (Ctrl+Enter to save, Tab navigation)
 */

(function () {
  'use strict';

  // Standard Philippine Clinical Reference Baseline Normal Values
  const CLINICAL_NORMAL_PRESETS = {
    urinalysis: {
      color: 'Yellow',
      appearance: 'Clear',
      ph: '6.0',
      specificGravity: '1.015',
      glucose: 'Negative',
      protein: 'Negative',
      wbcMicro: '0-2 /hpf',
      rbcMicro: '0-1 /hpf',
      epithelialCells: 'Rare',
      mucusThreads: 'None',
      bacteria: 'Negative',
      amorphousUrates: 'None',
      amorphousPhosphates: 'None',
      casts: 'None',
      crystals: 'None',
      pregnancy: 'Negative'
    },
    fecalysis: {
      color: 'Brown',
      consistency: 'Formed',
      rbc: '0-1 /hpf',
      wbc: '0-2 /hpf',
      fatGlobules: 'Negative',
      yeastCells: 'Negative',
      bacteria: 'Normal Flora',
      amoeba: 'No Ova or Parasite Seen',
      helminths: 'No Ova or Parasite Seen',
      occultBlood: 'Negative'
    },
    hematology: {
      wbc: '6.5',
      rbc: '4.8',
      hemoglobin: '14.5',
      hematocrit: '42.0',
      plateletCount: '250',
      neutrophils: '60',
      lymphocytes: '32',
      monocytes: '5',
      eosinophils: '3',
      basophils: '0',
      bloodType: 'O+',
      rhFactor: 'Positive'
    },
    xray: {
      view: 'PA Chest',
      findings: 'Lungs are clear of active infiltrates. Heart is not enlarged. Diaphragmatic contours and costophrenic sulci are sharp and intact. Visualized bony thorax and soft tissues are unremarkable.',
      impression: 'NORMAL CHEST RADIOGRAPH (PA VIEW).'
    },
    ecg: {
      rate: '75',
      rhythm: 'Normal Sinus Rhythm',
      axis: 'Normal Axis',
      prInterval: '0.16',
      qrsDuration: '0.08',
      qtcInterval: '0.40',
      pWave: 'Normal',
      qrsComplex: 'Normal',
      stSegment: 'Isoelectric',
      tWave: 'Upright and Normal',
      impression: 'NORMAL 12-LEAD ELECTROCARDIOGRAM'
    },
    drugtest: {
      methamphetamine: 'NEGATIVE',
      tetrahydrocannabinol: 'NEGATIVE',
      remarks: 'Negative for Methamphetamine and THC metabolites.'
    },
    dengue_duo: {
      ns1: 'NEGATIVE',
      igg: 'NEGATIVE',
      igm: 'NEGATIVE',
      impression: 'Negative for Dengue NS1 Antigen, IgG and IgM Antibodies.'
    },
    pregnancy_test: {
      result: 'NEGATIVE',
      remarks: 'Negative for human chorionic gonadotropin (hCG).'
    },
    fecal_occult_blood: {
      result: 'NEGATIVE',
      remarks: 'No occult blood detected in stool specimen.'
    }
  };

  // Clinical Reference Vocabulary for Datalists
  const CLINICAL_VOCABULARY = {
    color: ['Yellow', 'Light Yellow', 'Dark Yellow', 'Straw', 'Amber', 'Clear', 'Red', 'Reddish Brown', 'Brown', 'Greenish'],
    appearance: ['Clear', 'Slightly Turbid', 'Turbid', 'Hazy', 'Slightly Hazy'],
    transparency: ['Clear', 'Slightly Turbid', 'Turbid', 'Hazy'],
    consistency: ['Formed', 'Semi-Formed', 'Soft', 'Watery', 'Mucoid'],
    qualitative: ['Negative', 'Positive', 'Trace', '+', '++', '+++', '++++', 'Normal', 'Reactive', 'Non-Reactive'],
    microscopic: ['None', 'Rare', 'Few', 'Moderate', 'Many', 'Loaded', '0-1 /hpf', '0-2 /hpf', '1-3 /hpf', '2-4 /hpf', '3-5 /hpf', '5-10 /hpf'],
    findings: [
      'Lungs are clear of active infiltrates. Heart is not enlarged.',
      'Chest radiograph is within normal limits.',
      'No evidence of acute cardiopulmonary disease.',
      'Heart and lungs are within normal limits.',
      'Normal liver size, parenchyma, and contours. Gallbladder is normal with no stones seen.'
    ],
    impression: [
      'NORMAL CHEST RADIOGRAPH (PA VIEW).',
      'UNREMARKABLE CHEST STUDY.',
      'NORMAL 12-LEAD ELECTROCARDIOGRAM (NORMAL SINUS RHYTHM).',
      'NO SIGNIFICANT CARDIOPULMONARY ABNORMALITY.',
      'NEGATIVE FOR SIGNIFICANT PATHOLOGY.'
    ]
  };

  function initSmartClinicalAssistant() {
    const resultsForm = document.querySelector('form[action*="/results"]') || 
                        document.querySelector('form[action*="/tests/"][method="POST"]');
    if (!resultsForm) return;

    // Detect test type from URL, form title, or hidden fields
    const testType = detectCurrentTestType(resultsForm);

    // 1. Inject Smart Action Toolbar
    injectPresetToolbar(resultsForm, testType);

    // 2. Attach Intelligent Autocomplete Datalists
    attachClinicalDatalists(resultsForm);

    // 3. Setup Keyboard Shortcuts
    setupKeyboardShortcuts(resultsForm);

    // 4. Auto-save custom vocabulary on submission
    resultsForm.addEventListener('submit', () => {
      saveCustomVocabulary(resultsForm);
    });
  }

  function detectCurrentTestType(form) {
    const action = (form.getAttribute('action') || '').toLowerCase();
    const titleText = (document.querySelector('h1, h2, h3, .card h3') || {}).textContent || '';
    const fullText = (action + ' ' + titleText + ' ' + window.location.pathname).toLowerCase();

    if (fullText.includes('urinalysis') || fullText.includes('urine')) return 'urinalysis';
    if (fullText.includes('fecalysis') || fullText.includes('stool')) return 'fecalysis';
    if (fullText.includes('hematology') || fullText.includes('cbc')) return 'hematology';
    if (fullText.includes('xray') || fullText.includes('x-ray') || fullText.includes('radiology')) return 'xray';
    if (fullText.includes('ecg') || fullText.includes('electrocardio')) return 'ecg';
    if (fullText.includes('drug') || fullText.includes('drugtest')) return 'drugtest';
    if (fullText.includes('dengue')) return 'dengue_duo';
    if (fullText.includes('pregnancy')) return 'pregnancy_test';
    if (fullText.includes('occult')) return 'fecal_occult_blood';

    return 'general';
  }

  function injectPresetToolbar(form, testType) {
    if (document.getElementById('smartPresetToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'smartPresetToolbar';
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.06);
    `;

    const hasPreset = CLINICAL_NORMAL_PRESETS[testType] != null;

    toolbar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: 700; color: #047857; font-size: 0.9em; display: flex; align-items: center; gap: 6px;">
          <i class="fa fa-magic" style="color: #10b981;"></i> Smart Clinical Presets
        </span>
        <span style="background: #10b981; color: white; font-size: 0.72em; padding: 2px 8px; border-radius: 20px; font-weight: 600;">
          Desktop Supercharger
        </span>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        ${hasPreset ? `
        <button type="button" id="btnFillNormal" style="
          background: #059669;
          color: #ffffff;
          border: none;
          padding: 6px 14px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.85em;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 6px rgba(5, 150, 105, 0.2);
          transition: all 0.2s;
        ">
          <i class="fa fa-bolt" style="color:#fef08a;"></i> 1-Click Normal Baseline
        </button>
        ` : ''}

        <button type="button" id="btnSaveCustomPreset" style="
          background: #ffffff;
          color: #0f766e;
          border: 1px solid #99f6e4;
          padding: 6px 12px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.85em;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        ">
          <i class="fa fa-save"></i> Save As My Preset
        </button>

        <button type="button" id="btnApplySavedPreset" style="
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.85em;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        ">
          <i class="fa fa-folder-open"></i> Load Saved Preset
        </button>

        <button type="button" id="btnClearForm" style="
          background: transparent;
          color: #dc2626;
          border: 1px solid transparent;
          padding: 6px 10px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.82em;
          cursor: pointer;
        " title="Clear all entered fields">
          <i class="fa fa-eraser"></i> Clear
        </button>
      </div>
    `;

    // Insert at top of form
    form.insertBefore(toolbar, form.firstChild);

    // Wire up Fill Normal Baseline
    const btnFillNormal = toolbar.querySelector('#btnFillNormal');
    if (btnFillNormal) {
      btnFillNormal.addEventListener('click', () => {
        fillNormalPreset(form, testType);
        showToast('⚡ Standard normal baseline values filled!', '#059669');
      });
    }

    // Wire up Save Custom Preset
    const btnSaveCustom = toolbar.querySelector('#btnSaveCustomPreset');
    if (btnSaveCustom) {
      btnSaveCustom.addEventListener('click', () => {
        saveCustomPreset(form, testType);
      });
    }

    // Wire up Load Saved Preset
    const btnApplySaved = toolbar.querySelector('#btnApplySavedPreset');
    if (btnApplySaved) {
      btnApplySaved.addEventListener('click', () => {
        applyCustomPreset(form, testType);
      });
    }

    // Wire up Clear
    const btnClear = toolbar.querySelector('#btnClearForm');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Clear all entered result fields?')) {
          clearFormInputs(form);
        }
      });
    }
  }

  function fillNormalPreset(form, testType) {
    const preset = CLINICAL_NORMAL_PRESETS[testType];
    if (!preset) return;

    Object.entries(preset).forEach(([fieldKey, val]) => {
      // Find element by name (exact, bracketed, or lowercase match)
      const inputs = form.querySelectorAll(
        `[name="${fieldKey}"], [name="results[${fieldKey}]"], [name$="[${fieldKey}]"], [name="${fieldKey.toLowerCase()}"]`
      );

      inputs.forEach(input => {
        if (input.tagName === 'SELECT') {
          // Select exact or case-insensitive matching option
          let matched = false;
          Array.from(input.options).forEach(opt => {
            if (opt.value.trim().toLowerCase() === String(val).trim().toLowerCase()) {
              input.value = opt.value;
              matched = true;
            }
          });
          if (!matched && input.options.length > 0) input.value = val;
        } else if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
          if (input.type !== 'hidden' && input.type !== 'date' && input.type !== 'time') {
            input.value = val;
          }
        }
        // Trigger change event so any formula/calc listeners fire
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  function saveCustomPreset(form, testType) {
    const presetName = prompt('Enter a name for this custom clinical preset (e.g., "Clear Lungs Baseline", "Routine Normal"):', 'Custom Normal');
    if (!presetName) return;

    const data = {};
    const formData = new FormData(form);
    for (const [k, v] of formData.entries()) {
      if (!['_method', 'entryDate', 'timeRequested', 'timeReleased'].includes(k)) {
        data[k] = v;
      }
    }

    try {
      const storageKey = `gezyne_preset_${testType}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
      existing[presetName] = data;
      localStorage.setItem(storageKey, JSON.stringify(existing));
      showToast(`💾 Preset "${presetName}" saved successfully!`, '#047857');
    } catch (e) {
      alert('Failed to save preset.');
    }
  }

  function applyCustomPreset(form, testType) {
    try {
      const storageKey = `gezyne_preset_${testType}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const names = Object.keys(existing);

      if (!names.length) {
        alert('No custom presets saved for this test type yet. Click "Save As My Preset" to create one!');
        return;
      }

      const choice = prompt(`Select preset to load:\n\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nEnter number:`, '1');
      if (!choice) return;

      const idx = parseInt(choice, 10) - 1;
      const selectedName = names[idx];
      if (!selectedName || !existing[selectedName]) {
        alert('Invalid selection.');
        return;
      }

      const data = existing[selectedName];
      Object.entries(data).forEach(([k, val]) => {
        const input = form.querySelector(`[name="${k}"]`);
        if (input) {
          input.value = val;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      showToast(`📋 Applied preset: "${selectedName}"`, '#0891b2');
    } catch (e) {}
  }

  function clearFormInputs(form) {
    form.querySelectorAll('input:not([type="hidden"]):not([type="date"]):not([type="time"]), textarea, select').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  }

  function attachClinicalDatalists(form) {
    // Collect custom vocabulary from localStorage
    let savedVocab = {};
    try {
      savedVocab = JSON.parse(localStorage.getItem('gezyne_clinical_vocab') || '{}');
    } catch (e) {}

    // Attach to inputs
    const inputs = form.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
      const name = (input.getAttribute('name') || '').toLowerCase();
      let suggestions = [];

      if (name.includes('color')) suggestions = CLINICAL_VOCABULARY.color;
      else if (name.includes('appearance') || name.includes('transparency')) suggestions = CLINICAL_VOCABULARY.appearance;
      else if (name.includes('consistency')) suggestions = CLINICAL_VOCABULARY.consistency;
      else if (name.includes('finding')) suggestions = CLINICAL_VOCABULARY.findings;
      else if (name.includes('impression')) suggestions = CLINICAL_VOCABULARY.impression;
      else if (name.includes('micro') || name.includes('cells') || name.includes('crystal') || name.includes('cast')) suggestions = CLINICAL_VOCABULARY.microscopic;
      else suggestions = CLINICAL_VOCABULARY.qualitative;

      // Merge saved user custom values
      if (savedVocab[name] && Array.isArray(savedVocab[name])) {
        suggestions = Array.from(new Set([...suggestions, ...savedVocab[name]]));
      }

      if (suggestions.length > 0 && input.tagName === 'INPUT') {
        const listId = `dl_${name.replace(/[^a-z0-9]/g, '_')}`;
        let dl = document.getElementById(listId);
        if (!dl) {
          dl = document.createElement('datalist');
          dl.id = listId;
          document.body.appendChild(dl);
        }
        dl.innerHTML = suggestions.map(s => `<option value="${s}"></option>`).join('');
        input.setAttribute('list', listId);
      }
    });
  }

  function saveCustomVocabulary(form) {
    try {
      const savedVocab = JSON.parse(localStorage.getItem('gezyne_clinical_vocab') || '{}');
      const inputs = form.querySelectorAll('input[type="text"], textarea');

      inputs.forEach(input => {
        const name = (input.getAttribute('name') || '').toLowerCase();
        const val = (input.value || '').trim();
        if (val && val.length > 1 && val.length < 150) {
          if (!savedVocab[name]) savedVocab[name] = [];
          if (!savedVocab[name].includes(val)) {
            savedVocab[name].unshift(val);
            if (savedVocab[name].length > 30) savedVocab[name].pop(); // cap at 30
          }
        }
      });

      localStorage.setItem('gezyne_clinical_vocab', JSON.stringify(savedVocab));
    } catch (e) {}
  }

  function setupKeyboardShortcuts(form) {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Enter or Cmd+Enter to submit test results
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          e.preventDefault();
          submitBtn.click();
        }
      }
    });
  }

  function showToast(msg, color = '#10b981') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${color};
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.9em;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideInToast 0.3s ease;
    `;
    toast.innerHTML = `<i class="fa fa-check-circle"></i> <span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartClinicalAssistant);
  } else {
    initSmartClinicalAssistant();
  }
})();
