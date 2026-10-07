// Prevent double-clicks and show a loading label for buttons and form submits
(function(){
  'use strict';

  function injectSpinnerCss(){
    if (document.getElementById('button-guard-spinner-css')) return;
    const css = '\n.btn-loading-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,0.12);border-top-color:rgba(0,0,0,0.6);border-radius:50%;vertical-align:middle;margin-right:6px;animation:btnspin .8s linear infinite}\n@keyframes btnspin{to{transform:rotate(360deg)}}\n';
    const s = document.createElement('style');
    s.id = 'button-guard-spinner-css';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function setButtonLoading(btn, label){
    if (!btn) return;
    if (btn.dataset.__loading === '1') return;
    btn.dataset.__loading = '1';
    btn.disabled = true;
    const tag = btn.tagName && btn.tagName.toUpperCase();
    if (!label) label = 'Loading...';

    if (tag === 'INPUT') {
      if (typeof btn.value !== 'undefined') btn.dataset.__orig = btn.value;
      try { btn.value = label; } catch(e){}
    } else {
      if (typeof btn.innerHTML !== 'undefined') btn.dataset.__orig = btn.innerHTML;
      try { btn.innerHTML = '<span class="btn-loading-spinner" aria-hidden="true"></span>' + label; } catch(e){}
    }

    // Safety timeout: automatically restore button after 5 seconds in case the action does not navigate or reload
    try {
      if (btn.__guardTimer) clearTimeout(btn.__guardTimer);
      btn.__guardTimer = setTimeout(function(){
        restoreButton(btn);
      }, 5000);
    } catch(e){}
  }

  function restoreButton(btn){
    if (!btn || btn.dataset.__loading !== '1') return;
    if (btn.__guardTimer) {
      clearTimeout(btn.__guardTimer);
      delete btn.__guardTimer;
    }
    btn.disabled = false;
    if (btn.dataset.__orig) {
      const tag = btn.tagName && btn.tagName.toUpperCase();
      if (tag === 'INPUT') btn.value = btn.dataset.__orig;
      else btn.innerHTML = btn.dataset.__orig;
    }
    delete btn.dataset.__orig;
    delete btn.dataset.__loading;
  }

  // Helper to detect if an element is a form submit button (including default-type buttons)
  function isFormSubmitButton(el){
    if (!el) return false;
    const tag = el.tagName && el.tagName.toUpperCase();
    if (tag === 'INPUT') return (el.type && String(el.type).toLowerCase() === 'submit');
    if (tag === 'BUTTON') {
      // If type attribute is missing, the default is "submit"
      const t = el.getAttribute('type');
      return (t === null || String(t).toLowerCase() === 'submit');
    }
    return false;
  }

  // EXCLUSION: buttons we should NOT guard
  function isExcludedButton(el){
    if (!el) return false;
    // Exempt all buttons on Dashboard page
    if (typeof window !== 'undefined' && window.location && window.location.pathname && (window.location.pathname === '/dashboard' || window.location.pathname === '/')) return true;
    if (el.closest && el.closest('.dashboard-container, #dashboardView, [data-page="dashboard"]')) return true;
    if (el.classList && (el.classList.contains('no-guard') || el.classList.contains('template-btn') || el.classList.contains('preset-btn') || el.classList.contains('preset-pill') || el.classList.contains('auto-gen-btn') || el.classList.contains('comment-chip') || el.classList.contains('calc-btn'))) return true;
    if (el.getAttribute && (el.getAttribute('data-no-guard') === '1' || el.getAttribute('data-no-guard') === 'true' || el.getAttribute('data-template'))) return true;
    if (el.matches && el.matches('.no-guard, [data-no-guard], .template-btn, .preset-pill, .preset-btn, .comment-chip, .auto-gen-btn, .calc-btn, [data-template]')) return true;

    // 1. Exclude tabs and tab navigation elements (Settings, Equipment QC, Consultations, HR Profiles, Ultrasound, etc.)
    if (el.matches && el.matches('[role="tab"], .settings-tab-btn, .eq-tab-btn, .consult-tab-btn, .profile-tab, .proc-tab, .echo-preview-tab-btn, [class*="tab-btn"], [class*="tab-nav"], [data-tab], [data-bs-toggle="tab"], [data-toggle="tab"]')) return true;
    if (el.closest && el.closest('.settings-nav-tabs, .eq-tabs, [role="tablist"], .nav-tabs, .tabs, .tab-nav, .tab-buttons, .tab-bar, .profile-tabs, .echo-preview-tabs')) return true;

    // 2. Exclude client-side UI actions (tabs, modal dismissals, accordions, toggles, text formatting, add/remove row, templates, calculations, chip presets)
    const oc = (el.getAttribute && el.getAttribute('onclick')) || '';
    if (oc && /switch|tab|toggle|modal|close|cancel|back|reset|clear|filter|wrapSelection|insertParagraph|addRow|removeRow|selectProcedure|setPreview|template|setImpressionTemplate|autoGenerate|preset|presetBpsScore|copy|copyCrl|copyGs|calculate|calculateAOA|insertComment|toggleCommentChip|chip|bps|aoa|clearImpression/i.test(oc)) return true;

    // 3. Exclude modal close & dialog dismiss buttons
    if (el.matches && el.matches('.close, .modal-close, [data-dismiss], [data-bs-dismiss]')) return true;

    // prefer explicit attributes (aria-label/title/data-label), fallback to text/value
    const attrLabel = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-label')));
    const raw = (attrLabel || el.textContent || el.innerText || el.value || '').replace(/[→←↶↷]/g, '').trim();
    if (!raw) return false;
    const txt = raw.toLowerCase();
    const exceptions = [
      'previous', 'next', 'print', 'print filtered', 'download', 'clear filter', 'clear filters', 'reset', 'reset filters',
      'all test types', 'patient queue display', 'kiosk', 'open kiosk', 'open kiosk queue display', 
      'add new test field', 'add test field', 'add field', 'remove field', 'preview', 'fullscreen', 
      'create new template', 'edit', 'view', 'clear reception queue', 'clear queue', 'clear queues', 
      'total', 'selected', 'today', 'yesterday', 'monthly', 'daily', 'hourly',
      'clinical workflow', 'sse real-time', 'printer & hardware', 'ai assistant', 'data & backup', 'system & .env',
      'equipment registry', 'quality control', 'external quality assessment',
      'live ob', 'early tvs', 'tvs follow-up', 'twin ob', 'normal pelvic', 'clear', 'auto-generate', 'auto-generate impression',
      'normal (8/8)', 'equivocal (6/8)', 'abnormal (4/8)', 'set aoa from crl', 'set aoa from gs', 'auto-calculate', 'calculate aoa',
      '+ yolk sac', '+ cardiac activity', '- hemorrhage'
    ];
    for (let i=0; i<exceptions.length; i++) {
      if (txt.indexOf(exceptions[i]) !== -1) return true;
    }
    if (el.id === 'addFieldBtn' || el.classList.contains('add-field-btn') || el.classList.contains('remove-field-btn') || el.classList.contains('preset-pill') || el.classList.contains('template-btn') || el.classList.contains('preset-btn') || el.classList.contains('comment-chip') || el.classList.contains('auto-gen-btn') || el.classList.contains('calc-btn')) return true;
    return false;
  }

  // Global click guard for buttons/inputs
  document.addEventListener('click', function(ev){
    const el = ev.target.closest('button, input[type="submit"], input[type="button"], .button');
    if (!el) return;
    // Respect explicit exclusions
    if (el.classList.contains('no-guard')) return;
    if (isExcludedButton(el)) return;
    // If already loading, prevent duplicate actions
    if (el.disabled || el.dataset.__loading === '1') {
      ev.preventDefault(); ev.stopImmediatePropagation(); return;
    }
    // If this is a form submit button (including button with no type attr), DON'T disable it here.
    // Let the browser perform HTML5 validation and allow the 'submit' event to handle disabling.
    if (isFormSubmitButton(el)) return;

    // For other buttons (non-form-submits) set loading immediately
    injectSpinnerCss();
    setButtonLoading(el);
  }, true);

  // On form submit, mark the actual submit button (if available) or all submit buttons in the form
  document.addEventListener('submit', function(ev){
    const form = ev.target;
    if (!form) return;
    injectSpinnerCss();
    // modern browsers provide ev.submitter
    const submitter = ev.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitter) {
      if (!isExcludedButton(submitter)) setButtonLoading(submitter);
    } else {
      Array.prototype.forEach.call(form.querySelectorAll('button[type="submit"], input[type="submit"]'), function(b){ if (!isExcludedButton(b)) setButtonLoading(b); });
    }
  }, true);

  // Expose a small API for pages that need to restore buttons after async failure
  window.__buttonGuard = {
    setLoading: function(el, label){ injectSpinnerCss(); setButtonLoading(el, label); },
    restore: restoreButton
  };

})();
