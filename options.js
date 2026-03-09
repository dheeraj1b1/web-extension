document.addEventListener('DOMContentLoaded', loadProfiles);

function loadProfiles() {
    chrome.storage.local.get(null, function (data) {
        if (!data.profiles) return;
        const list = document.getElementById('profiles-list');
        list.innerHTML = '';

        Object.keys(data.profiles).forEach(id => {
            const p = data.profiles[id];
            const isActive = id === data.activeProfileId ? '<span style="color:var(--success); font-size:10px"> (Active)</span>' : '';

            const div = document.createElement('div');
            div.className = 'profile-item';
            div.innerHTML = `
        <div><strong>${p.name}</strong> ${isActive}</div>
        <div class="profile-actions">
          <button class="btn btn-secondary btn-clone" data-id="${id}">Clone</button>
          <button class="btn btn-secondary btn-del" data-id="${id}" style="color:var(--error); border-color:rgba(239,68,68,0.3)">Delete</button>
        </div>
      `;
            list.appendChild(div);
        });

        document.querySelectorAll('.btn-clone').forEach(b => b.addEventListener('click', cloneProfile));
        document.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', deleteProfile));
    });
}

function cloneProfile(e) {
    const id = e.target.getAttribute('data-id');
    chrome.storage.local.get(null, function (data) {
        const newId = 'prof_' + Date.now();
        const cloned = JSON.parse(JSON.stringify(data.profiles[id]));
        cloned.name = cloned.name + " (Copy)";
        data.profiles[newId] = cloned;
        chrome.storage.local.set({ profiles: data.profiles }, loadProfiles);
    });
}

function deleteProfile(e) {
    const id = e.target.getAttribute('data-id');
    chrome.storage.local.get(null, function (data) {
        if (Object.keys(data.profiles).length <= 1) {
            alert("You must have at least one profile.");
            return;
        }
        delete data.profiles[id];
        if (data.activeProfileId === id) data.activeProfileId = Object.keys(data.profiles)[0];
        chrome.storage.local.set(data, loadProfiles);
    });
}

document.getElementById('btn-create').addEventListener('click', () => {
    const name = prompt("Enter new profile name (e.g., 'SDET Remote'):");
    if (!name) return;
    const newId = 'prof_' + Date.now();
    chrome.storage.local.get(null, function (data) {
        data.profiles[newId] = { name: name, fields: {}, toggles: {} };
        chrome.storage.local.set({ profiles: data.profiles }, loadProfiles);
    });
});

document.getElementById('btn-export').addEventListener('click', () => {
    chrome.storage.local.get(null, function (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'qa_autofill_personal_profiles_backup.json'; a.click();
    });
});

document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());

document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const importedData = JSON.parse(evt.target.result);
            if (importedData.profiles) {
                chrome.storage.local.set(importedData, () => { alert("Import successful!"); loadProfiles(); });
            }
        } catch (err) { alert("Invalid JSON file."); }
    };
    reader.readAsText(file);
});
