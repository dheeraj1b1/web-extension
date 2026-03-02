const ALL_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'dob', 'gender', 'linkedin', 'website', 'portfolio', 'github', 'leetcode', 'otherLink',
  'fullName', 'jobTitle', 'experience', 'company', 'education', 'degree', 'university', 'graduationYear',
  'currentCTC', 'expectedCTC', 'noticePeriod', 'startDate', 'summary', 'description', 'skills',
  'street', 'city', 'state', 'zip', 'country', 'workAuth', 'relocate', 'preferredLocation'
];

let appState = {
  activeProfileId: 'default',
  profiles: {
    'default': { name: 'Main Profile', fields: {}, toggles: {} }
  }
};

document.addEventListener('DOMContentLoaded', function () {
  // Load State & Migrate old flat data if necessary
  chrome.storage.local.get(null, function (data) {
    if (data.profiles) {
      appState = data;
    } else if (data.firstName || data.email) {
      // Automatic Migration from V1 to V3 schema
      ALL_FIELDS.forEach(f => {
        appState.profiles['default'].fields[f] = data[f] || '';
        appState.profiles['default'].toggles[f] = true;
      });
      chrome.storage.local.set(appState);
    }

    populateDropdown();
    loadProfileToUI();
  });

  document.getElementById('profile-selector').addEventListener('change', function (e) {
    appState.activeProfileId = e.target.value;
    chrome.storage.local.set({ activeProfileId: appState.activeProfileId });
    loadProfileToUI();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var tabName = this.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      this.classList.add('active');
    });
  });

  document.getElementById('btn-fill-now').addEventListener('click', triggerAutofill);

  document.querySelectorAll('[data-save]').forEach(function (btn) {
    btn.addEventListener('click', saveActiveProfile);
  });

  const addBtn = document.getElementById('btn-add-custom');
  if (addBtn) addBtn.addEventListener('click', addCustomField);
});

function populateDropdown() {
  const sel = document.getElementById('profile-selector');
  sel.innerHTML = '';
  Object.keys(appState.profiles).forEach(id => {
    let opt = document.createElement('option');
    opt.value = id;
    opt.textContent = appState.profiles[id].name;
    if (id === appState.activeProfileId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function loadProfileToUI() {
  const profile = appState.profiles[appState.activeProfileId];
  // populate known/static fields
  ALL_FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    var toggle = document.getElementById('toggle-' + id);
    if (el) el.value = profile.fields[id] || '';
    if (toggle) toggle.checked = profile.toggles[id] !== false; // default true
  });
  // build custom field rows
  renderCustomFields(profile);
  updateProfileStatus();
}

function saveActiveProfile() {
  const profile = appState.profiles[appState.activeProfileId];
  // save static fields
  ALL_FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    var toggle = document.getElementById('toggle-' + id);
    if (el) profile.fields[id] = el.value.trim();
    if (toggle) profile.toggles[id] = toggle.checked;
  });
  // save custom fields from DOM
  const container = document.getElementById('custom-fields-container');
  if (container) {
    container.querySelectorAll('.custom-input').forEach(input => {
      const key = input.getAttribute('data-key');
      profile.fields[key] = input.value.trim();
    });
    container.querySelectorAll('.toggle-custom').forEach(input => {
      const key = input.getAttribute('data-key');
      profile.toggles[key] = input.checked;
    });
  }

  chrome.storage.local.set(appState, function () {
    showToast('✅ Profile saved!', 'success');
    updateProfileStatus();
  });
}

// THIS IS THE MAGIC: It creates a flat object to send to content.js, 
// completely omitting fields that are toggled off.
// THIS IS THE MAGIC: It creates a flat object and force-injects it into ALL frames, bypassing iFrame blocks!
function triggerAutofill() {
  saveActiveProfile();

  const profile = appState.profiles[appState.activeProfileId];
  const payloadToInject = {};

  ALL_FIELDS.forEach(field => {
    if (profile.toggles[field] !== false) {
      payloadToInject[field] = profile.fields[field] || '';
    }
  });

  var filledCount = Object.values(payloadToInject).filter(v => v.length > 0).length;
  if (filledCount === 0) {
    showToast('⚠️ No fields enabled or filled!', 'error');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) return;
    var tabId = tabs[0].id;

    // Inject the command directly into EVERY frame simultaneously
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      func: function (payload) {
        // If content.js is loaded, force it to run the engine!
        if (window.aqaFillPage) {
          const count = window.aqaFillPage(payload);
          return count; // Return how many were filled
        }
        return 0;
      },
      args: [payloadToInject]
    }, function (results) {
      // Tally up the total fields filled across all frames on the page
      if (results && results.length > 0) {
        let totalFilled = 0;
        results.forEach(res => { if (res.result) totalFilled += res.result; });

        if (totalFilled > 0) {
          showToast(`✅ Filled ${totalFilled} field(s)!`, 'success');
        } else {
          showToast('ℹ️ No matching fields found', 'error');
        }
      }
    });
  });
}

function handleFillResponse(response) {
  if (response && response.filled > 0) {
    showToast(`✅ Filled ${response.filled} field(s)!`, 'success');
  } else {
    showToast('ℹ️ No matching fields found', 'error');
  }
}

// ---------- custom field helpers ----------

function renderCustomFields(profile) {
  const container = document.getElementById('custom-fields-container');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(profile.fields).forEach(key => {
    if (ALL_FIELDS.includes(key)) return; // skip built‑ins
    const value = profile.fields[key] || '';
    const enabled = profile.toggles[key] !== false;
    const row = document.createElement('div');
    row.className = 'field-group';
    row.innerHTML = `
      <div class="field" style="flex:1;display:flex;gap:6px;align-items:center;">
        <div style="flex:1">
          <div class="field-header">
            <label>${key}</label>
            <label class="switch"><input type="checkbox" data-key="${key}" class="toggle-custom" ${enabled ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <input type="text" data-key="${key}" class="custom-input" value="${value}">
        </div>
        <button class="delete-custom" data-key="${key}" title="Delete" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:16px;">🗑️</button>
      </div>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('.delete-custom').forEach(btn => {
    btn.addEventListener('click', function () {
      const k = this.getAttribute('data-key');
      delete profile.fields[k];
      delete profile.toggles[k];
      renderCustomFields(profile);
    });
  });
}

function addCustomField() {
  const raw = prompt('Enter a unique field name (e.g. certification, university)');
  if (raw === null) return;
  const key = raw.trim();
  if (!key) return;
  const profile = appState.profiles[appState.activeProfileId];
  if (profile.fields[key] !== undefined) {
    alert('That field already exists');
    return;
  }
  profile.fields[key] = '';
  profile.toggles[key] = true;
  renderCustomFields(profile);
}

function updateProfileStatus() {
  const profile = appState.profiles[appState.activeProfileId];
  var el = document.getElementById('profile-status');
  var name = [profile.fields.firstName, profile.fields.lastName].filter(Boolean).join(' ') || profile.name;
  // count every field (static + custom) that is enabled and non-empty
  var enabledCount = Object.keys(profile.fields).filter(id => profile.toggles[id] !== false && profile.fields[id]).length;
  el.innerHTML = `<div>👤 <strong>${name}</strong></div><div style="margin-top:8px;color:var(--accent2)">✦ ${enabledCount} fields ready to inject</div>`;
}

function showToast(msg, type) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + (type || 'success') + ' show';
  setTimeout(function () { toast.className = 'toast'; }, 3000);
}
