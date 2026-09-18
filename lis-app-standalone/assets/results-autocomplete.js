/**
 * Standalone Desktop App - Results Data Entry Smart Autocomplete
 * Only active on test results entry pages (/tests/:id/results).
 * Injects clean native datalists and learns frequent clinical values.
 */

(function () {
  'use strict';

  // Standard Clinical Reference Vocabulary
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

  function initResultsAutocomplete() {
    // Strictly execute ONLY on results entry pages
    const isResultsPage = window.location.pathname.includes('/results');
    if (!isResultsPage) return;

    const resultsForm = document.querySelector('form[action$="/results"]');
    if (!resultsForm) return;

    // Retrieve learned vocabulary from localStorage
    let savedVocab = {};
    try {
      savedVocab = JSON.parse(localStorage.getItem('gezyne_desktop_vocab') || '{}');
    } catch (e) {}

    // Attach native HTML5 datalists to text inputs
    const inputs = resultsForm.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
      const name = (input.getAttribute('name') || '').toLowerCase();
      if (!name || input.type === 'hidden' || input.type === 'date' || input.type === 'time') return;

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
        const listId = `dl_dt_${name.replace(/[^a-z0-9]/g, '_')}`;
        let dl = document.getElementById(listId);
        if (!dl) {
          dl = document.createElement('datalist');
          dl.id = listId;
          document.body.appendChild(dl);
        }
        dl.innerHTML = suggestions.map(s => `<option value="${s}"></option>`).join('');
        input.setAttribute('list', listId);
        input.setAttribute('autocomplete', 'on');
      }
    });

    // Learn newly entered values upon form submission
    resultsForm.addEventListener('submit', () => {
      try {
        const updatedVocab = JSON.parse(localStorage.getItem('gezyne_desktop_vocab') || '{}');
        inputs.forEach(input => {
          const name = (input.getAttribute('name') || '').toLowerCase();
          const val = (input.value || '').trim();
          if (val && val.length > 1 && val.length < 150) {
            if (!updatedVocab[name]) updatedVocab[name] = [];
            if (!updatedVocab[name].includes(val)) {
              updatedVocab[name].unshift(val);
              if (updatedVocab[name].length > 30) updatedVocab[name].pop();
            }
          }
        });
        localStorage.setItem('gezyne_desktop_vocab', JSON.stringify(updatedVocab));
      } catch (e) {}
    });

    // Keyboard shortcut: Ctrl+Enter to save test results
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const submitBtn = resultsForm.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          e.preventDefault();
          submitBtn.click();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResultsAutocomplete);
  } else {
    initResultsAutocomplete();
  }
})();
