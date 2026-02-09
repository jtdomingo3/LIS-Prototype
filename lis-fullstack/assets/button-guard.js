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
  }

  function restoreButton(btn){
    if (!btn || btn.dataset.__loading !== '1') return;
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

  // Global click guard for buttons/inputs
  document.addEventListener('click', function(ev){
    const el = ev.target.closest('button, input[type="submit"], input[type="button"], .button');
    if (!el) return;
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
    if (submitter) setButtonLoading(submitter);
    else Array.prototype.forEach.call(form.querySelectorAll('button[type="submit"], input[type="submit"]'), function(b){ setButtonLoading(b); });
  }, true);

  // Expose a small API for pages that need to restore buttons after async failure
  window.__buttonGuard = {
    setLoading: function(el, label){ injectSpinnerCss(); setButtonLoading(el, label); },
    restore: restoreButton
  };

})();
