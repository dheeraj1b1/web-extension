// All field IDs
const ALL_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'dob', 'linkedin', 'website',
  'fullName', 'jobTitle', 'experience', 'company', 'currentCTC', 'expectedCTC', 'noticePeriod', 'summary',
  'street', 'city', 'state', 'zip', 'country', 'workAuth', 'relocate', 'preferredLocation'
];

const SECTION_FIELDS = {
  personal: ['firstName', 'lastName', 'email', 'phone', 'dob', 'linkedin', 'website'],
  professional: ['fullName', 'jobTitle', 'experience', 'company', 'currentCTC', 'expectedCTC', 'noticePeriod', 'summary'],
  address: ['street', 'city', 'state', 'zip', 'country', 'workAuth', 'relocate', 'preferredLocation']
};

// ── Load saved data on open ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  chrome.storage.local.get(ALL_FIELDS, function (data) {
    ALL_FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && data[id]) el.value = data[id];
    });
    updateProfileStatus(data);
  });

  // ── Tab clicks ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var tabName = this.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
      document.getElementById('tab-' + tabName).classList.add('active');
      this.classList.add('active');
    });
  });

  // ── Fill Now button ─────────────────────────────────────────────────────────
  document.getElementById('btn-fill-now').addEventListener('click', function () {
    triggerAutofill();
  });

  // ── Save buttons (data-save="true") ────────────────────────────────────────
  document.querySelectorAll('[data-save]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      saveAll();
    });
  });

  // ── Clear buttons (data-clear="section") ────────────────────────────────────
  document.querySelectorAll('[data-clear]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      clearSection(this.getAttribute('data-clear'));
    });
  });
});

// ── Save all fields ──────────────────────────────────────────────────────────
function saveAll() {
  var data = {};
  ALL_FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) data[id] = el.value.trim();
  });
  chrome.storage.local.set(data, function () {
    showToast('✅ Profile saved!', 'success');
    updateProfileStatus(data);
  });
}

// ── Clear a section ──────────────────────────────────────────────────────────
function clearSection(section) {
  var fields = SECTION_FIELDS[section] || [];
  fields.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  showToast('🗑️ Section cleared', 'success');
}

// ── Trigger autofill on active page ─────────────────────────────────────────
function triggerAutofill() {
  chrome.storage.local.get(ALL_FIELDS, function (data) {
    var filled = Object.values(data).filter(function (v) { return v && v.length > 0; }).length;
    if (filled === 0) {
      showToast('⚠️ Save your profile first!', 'error');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0]) { showToast('⚠️ No active tab found', 'error'); return; }
      var tabId = tabs[0].id;
      chrome.tabs.sendMessage(tabId, { action: 'autofill', data: data }, function (response) {
        if (chrome.runtime.lastError) {
          // Content script not loaded yet — inject it first
          chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] }, function () {
            chrome.tabs.sendMessage(tabId, { action: 'autofill', data: data }, function (res) {
              handleFillResponse(res);
            });
          });
        } else {
          handleFillResponse(response);
        }
      });
    });
  });
}

function handleFillResponse(response) {
  if (response && response.filled > 0) {
    showToast('✅ Filled ' + response.filled + ' field(s)!', 'success');
  } else if (response && response.filled === 0) {
    showToast('ℹ️ No matching fields found', 'error');
  } else {
    showToast('✅ Autofill triggered!', 'success');
  }
}

// ── Profile status summary ───────────────────────────────────────────────────
function updateProfileStatus(data) {
  var el = document.getElementById('profile-status');
  if (!el) return;
  var name = [data.firstName, data.lastName].filter(Boolean).join(' ') || '—';
  var email = data.email || '—';
  var job = data.jobTitle || '—';
  var city = data.city || '—';
  var count = ALL_FIELDS.filter(function (id) { return data[id] && data[id].length > 0; }).length;
  el.innerHTML =
    '<div>👤 <strong>' + name + '</strong></div>' +
    '<div>📧 ' + email + '</div>' +
    '<div>💼 ' + job + ' &nbsp;|&nbsp; 📍 ' + city + '</div>' +
    '<div style="margin-top:8px;color:var(--accent2)">✦ ' + count + ' / ' + ALL_FIELDS.length + ' fields saved</div>';
}

// ── Toast notification ───────────────────────────────────────────────────────
function showToast(msg, type) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + (type || 'success') + ' show';
  setTimeout(function () { toast.className = 'toast'; }, 3000);
}
