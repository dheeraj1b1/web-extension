// ============================================================
// AQA AutoFill Pro — Content Script (V3.3)
// Features: Universal iFrame Engine + Fixed Viewport Suggestions
// ============================================================

// Prevent crash if extension is re-injected
if (!window.aqaAutoFillLoaded) {
  window.aqaAutoFillLoaded = true;
  console.log('AQA AutoFill content script injected');
  // PART 1: The "Fill All" Engine
  // ────────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'autofill') {
      const count = fillPage(msg.data);
      sendResponse({ filled: count });
    }
    return true;
  });

  // Expose function globally so popup can bypass iFrame messaging block
  window.aqaFillPage = function (data) {
    return fillPage(data);
  };

  function fillPage(data) {
    let filled = 0;

    // start with built‑in common field patterns, but note the `key` property so we can detect duplicates
    const matchers = [
      { key: 'firstName', regex: /first\s*name|given\s*name|^fname$|^fn$|firstname/i, val: data.firstName },
      { key: 'lastName', regex: /last\s*name|surname|family\s*name|^lname$|^ln$|lastname/i, val: data.lastName },
      { key: 'fullName', regex: /full\s*name|applicant\s*name|^name$|fullname/i, val: data.fullName },
      { key: 'email', regex: /e-?mail/i, val: data.email },
      { key: 'phone', regex: /phone|mobile|contact\s*number/i, val: data.phone },
      { key: 'dob', regex: /date\s*of\s*birth|birth\s*date|^dob$/i, val: data.dob, isDate: true },
      { key: 'gender', regex: /\bgender\b|^sex$/i, val: data.gender },
      { key: 'startDate', regex: /\bfrom\b|start\s*date/i, val: data.startDate, isDate: true },
      { key: 'skills', regex: /\bskills\b|type\s*to\s*add\s*skills/i, val: data.skills },
      { key: 'currentCTC', regex: /current\s*ctc|current\s*salary|current\s*compensation/i, val: data.currentCTC, isSalary: true },
      { key: 'expectedCTC', regex: /expected\s*ctc|expected\s*salary|expected\s*compensation/i, val: data.expectedCTC, isSalary: true },
      { key: 'noticePeriod', regex: /notice\s*period|joining\s*time/i, val: data.noticePeriod },
      { key: 'summary', regex: /role\s*description|responsibilities|summary|bio/i, val: data.summary },
      { key: 'description', regex: /message\s*to\s*(the\s*)?hiring\s*team|why\s*(do\s*you|are\s*you)\s*interested|cover\s*letter|about\s*you|additional\s*information|motivation|statement/i, val: data.description || data.summary },
      { key: 'jobTitle', regex: /job\s*title|title|position|role/i, val: data.jobTitle },
      { key: 'company', regex: /company|employer|organization/i, val: data.company },
      { key: 'experience', regex: /years\s*of\s*experience|total\s*experience|yoe/i, val: data.experience },
      { key: 'education', regex: /highest\s*education|education|qualification|academic/i, val: data.education },
      { key: 'degree', regex: /degree|stream|major|speciali[sz]ation/i, val: data.degree },
      { key: 'university', regex: /university|college|institution|school/i, val: data.university },
      { key: 'graduationYear', regex: /graduation\s*year|year\s*of\s*passing|passout|passing\s*year/i, val: data.graduationYear },
      { key: 'linkedin', regex: /linkedin/i, val: data.linkedin },
      { key: 'website', regex: /website|personal\s*site|url|portfolio\s*site/i, val: data.website },
      { key: 'portfolio', regex: /portfolio/i, val: data.portfolio || data.website },
      { key: 'github', regex: /github/i, val: data.github || data.website },
      { key: 'leetcode', regex: /leetcode|coding\s*profile|problem\s*solving\s*profile/i, val: data.leetcode },
      { key: 'otherLink', regex: /other\s*link|profile\s*link|additional\s*link/i, val: data.otherLink },
      { key: 'workAuth', regex: /work\s*authorization|visa|sponsorship/i, val: data.workAuth },
      { key: 'relocate', regex: /relocate|relocation/i, val: data.relocate },
      { key: 'preferredLocation', regex: /preferred\s*location|desired\s*location/i, val: data.preferredLocation },
      { key: 'zip', regex: /postal\s*code|zip\s*code|pincode|pin\s*code|^zip$/i, val: data.zip },
      { key: 'city', regex: /city|location/i, val: data.city },
      { key: 'state', regex: /state|province/i, val: data.state },
      { key: 'country', regex: /country|nation/i, val: data.country },
      { key: 'street', regex: /address\s*line\s*1|street\s*address|address/i, val: data.street }
    ];
    // add any extra fields that user has added dynamically – simply match on the key name
    Object.keys(data).forEach(key => {
      if (!matchers.some(m => m.key === key)) {
        const human = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/[_-]+/g, ' ')
          .trim();
        const escaped = human.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
        if (escaped) {
          matchers.push({ key: key, regex: new RegExp(escaped, 'i'), val: data[key] });
        }
      }
    });

    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select');

    inputs.forEach(input => {
      if (input.disabled || input.readOnly) return;
      if (input.type !== 'checkbox' && input.type !== 'radio' && input.value && input.value.trim() !== '') return;

      let parentText = "";
      if (input.id) {
        const linkedLabel = document.querySelector(`label[for="${input.id}"]`);
        if (linkedLabel) parentText += linkedLabel.innerText + " ";
      }
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        ariaLabelledBy.split(' ').forEach(id => {
          const linkedAria = document.getElementById(id);
          if (linkedAria) parentText += linkedAria.innerText + " ";
        });
      }
      if (!parentText.trim()) {
        let currentEl = input.parentElement;
        for (let i = 0; i < 4 && currentEl; i++) {
          if (currentEl.tagName !== 'FORM' && currentEl.tagName !== 'BODY') {
            parentText += currentEl.innerText + " ";
          }
          currentEl = currentEl.parentElement;
        }
      }

      // Added data-test and data-qa (SmartRecruiters & Greenhouse use these heavily)
      const fullContext = `${parentText} ${input.id || ""} ${input.name || ""} ${input.getAttribute('placeholder') || ""} ${input.getAttribute('aria-label') || ""} ${input.getAttribute('data-automation-id') || ""} ${input.getAttribute('data-test') || ""} ${input.getAttribute('data-qa') || ""} ${input.getAttribute('autocomplete') || ""}`.toLowerCase();

      for (const matcher of matchers) {
        if (matcher.val && matcher.regex.test(fullContext)) {
          const isDateField = !!matcher.isDate;
          const injectValue = adaptValueForInput(matcher.key, matcher.val, input, fullContext);

          if (fillReactInput(input, injectValue, isDateField)) {
            filled++;
            input.style.backgroundColor = '#f0fdf4';
            input.style.border = '1px solid #10b981';
            input.style.transition = 'all 0.3s';
          }
          break;
        }
      }
    });

    return filled;
  }

  function adaptValueForInput(fieldKey, rawValue, input, contextText) {
    let value = String(rawValue ?? '').trim();
    if (!value) return value;

    const key = String(fieldKey || '').toLowerCase();
    const isDateLikeField = key.includes('date') || key === 'dob';
    const isSalaryField = key.includes('ctc') || key.includes('salary') || key.includes('compensation');

    if (isSalaryField) {
      const salaryValue = pickSalaryValueForInput(value, input, contextText);
      if (salaryValue) value = salaryValue;
    }

    if (isDateLikeField && input && input.type !== 'date') {
      value = value.replace(/[^0-9]/g, '');
    }

    return value;
  }

  function pickSalaryValueForInput(rawSalary, input, contextText) {
    const annualAmount = parseSalaryToAnnual(rawSalary);
    if (!annualAmount) return rawSalary;

    const lakhs = annualAmount / 100000;
    const monthly = annualAmount / 12;
    const lakhsText = trimDecimal(lakhs);
    const annualDigits = String(Math.round(annualAmount));
    const annualIndian = formatIndianNumber(Math.round(annualAmount));
    const monthlyDigits = String(Math.round(monthly));
    const monthlyIndian = formatIndianNumber(Math.round(monthly));

    const inputContext = `${contextText || ''} ${(input && input.getAttribute && input.getAttribute('placeholder')) || ''} ${(input && input.name) || ''} ${(input && input.id) || ''}`.toLowerCase();
    const maxLength = input && typeof input.maxLength === 'number' ? input.maxLength : -1;

    const expectsLakhs = /lpa|lakh|lakhs|lac|in\s*lakhs/.test(inputContext);
    const expectsMonthly = /monthly|per\s*month|month|\/\s*month|p\.?\s*m\.?/.test(inputContext);
    const expectsDigits = /annual|yearly|ctc|salary|amount|inr|rupees|₹|rs\b|gross|fixed/.test(inputContext) || (maxLength >= 6);

    const candidates = [];
    const pushUnique = (val) => {
      const v = String(val || '').trim();
      if (!v) return;
      if (!candidates.includes(v)) candidates.push(v);
    };

    if (expectsMonthly) {
      pushUnique(monthlyDigits);
      pushUnique(monthlyIndian);
      pushUnique(trimDecimal(monthly));
      pushUnique(rawSalary);
      return candidates[0];
    }

    if (expectsLakhs) {
      pushUnique(lakhsText);
      pushUnique(`${lakhsText} LPA`);
      pushUnique(`${lakhsText} Lakhs`);
      pushUnique(rawSalary);
      return candidates[0];
    }

    if (expectsDigits) {
      pushUnique(annualDigits);
      pushUnique(annualIndian);
      pushUnique(rawSalary);
      return candidates[0];
    }

    // Default order keeps your original value first, then useful variants.
    pushUnique(rawSalary);
    pushUnique(annualDigits);
    pushUnique(annualIndian);
    pushUnique(lakhsText);
    pushUnique(`${lakhsText} LPA`);
    return candidates[0];
  }

  function parseSalaryToAnnual(rawSalary) {
    const raw = String(rawSalary ?? '').trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const numberToken = lower.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!numberToken) return null;

    const numeric = parseFloat(numberToken[0]);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;

    let multiplier = 1;
    if (/crore|\bcr\b/.test(lower)) {
      multiplier = 10000000;
    } else if (/lpa|lakh|lakhs|lac|lacs/.test(lower)) {
      multiplier = 100000;
    } else if (/thousand|\bk\b/.test(lower)) {
      multiplier = 1000;
    } else if (/million|\bmn\b/.test(lower)) {
      multiplier = 1000000;
    } else if (numeric < 1000) {
      // Bare small numbers in job forms are commonly entered as LPA.
      multiplier = 100000;
    }

    return Math.round(numeric * multiplier);
  }

  function trimDecimal(num) {
    if (!Number.isFinite(num)) return '';
    return num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  }

  function formatIndianNumber(num) {
    if (!Number.isFinite(num)) return '';
    try {
      return new Intl.NumberFormat('en-IN').format(num);
    } catch (e) {
      return String(num);
    }
  }

  // ────────────────────────────────────────────────────────────
  // PART 2: The React Defeater
  // ────────────────────────────────────────────────────────────

  function fillReactInput(el, value, isDate = false) {
    try {
      if (el.type === 'checkbox' || el.type === 'radio') {
        const isPositive = /yes|true|authorized|1|y/i.test(value.toString());
        const labelText = (el.parentElement.innerText + " " + el.id).toLowerCase();
        const isYesRadio = /yes|true/.test(labelText);
        const isNoRadio = /no|false/.test(labelText);

        if ((isPositive && isYesRadio) || (!isPositive && isNoRadio) || (el.type === 'checkbox' && isPositive)) {
          if (!el.checked) el.click();
        }
        return true;
      }

      if (el.tagName === 'SELECT') {
        const options = Array.from(el.options);
        const match = options.find(o => o.text.toLowerCase().includes(value.toLowerCase()) || o.value.toLowerCase().includes(value.toLowerCase()));
        if (match) { el.value = match.value; dispatchAllEvents(el, false); return true; }
        return false;
      }

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');

      if (el.tagName === 'TEXTAREA' && nativeTextAreaValueSetter && nativeTextAreaValueSetter.set) {
        nativeTextAreaValueSetter.set.call(el, value);
      } else if (nativeInputValueSetter && nativeInputValueSetter.set) {
        nativeInputValueSetter.set.call(el, value);
      } else {
        el.value = value;
      }

      dispatchAllEvents(el, isDate);
      return true;
    } catch (e) { return false; }
  }

  function dispatchAllEvents(el, isDate) {
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    if (!isDate) {
      el.dispatchEvent(new Event('keydown', { bubbles: true }));
      el.dispatchEvent(new Event('keypress', { bubbles: true }));
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (!isDate) { el.dispatchEvent(new Event('keyup', { bubbles: true })); }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }


  // ────────────────────────────────────────────────────────────
  // PART 3: Inline Suggestion Engine (Floating Dropdown)
  // ────────────────────────────────────────────────────────────

  let activeDropdown = null;
  let currentInput = null;
  let dismissedInput = null;
  let reopenButton = null;

  const IGNORED_INPUT_TYPES = ['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'color'];
  const FIELD_SYNONYMS = {
    firstName: [/first\s*name/i, /given\s*name/i, /\bfname\b/i, /\bfn\b/i],
    lastName: [/last\s*name/i, /surname/i, /family\s*name/i, /\blname\b/i, /\bln\b/i],
    fullName: [/full\s*name/i, /applicant\s*name/i, /\bname\b/i],
    email: [/e-?mail/i],
    phone: [/phone/i, /mobile/i, /contact\s*number/i, /telephone/i],
    gender: [/\bgender\b/i, /^sex$/i],
    city: [/\bcity\b/i, /\btown\b/i],
    state: [/\bstate\b/i, /province/i],
    zip: [/zip/i, /postal/i, /pin\s*code/i, /pincode/i],
    country: [/country/i, /nation/i],
    street: [/street/i, /address/i, /line\s*1/i],
    company: [/company/i, /employer/i, /organization/i],
    jobTitle: [/job\s*title/i, /position/i, /\brole\b/i],
    experience: [/experience/i, /\byoe\b/i],
    linkedin: [/linkedin/i],
    website: [/website/i, /portfolio/i, /\burl\b/i],
    portfolio: [/portfolio/i, /personal\s*site/i, /showcase/i],
    github: [/github/i, /git\s*profile/i],
    leetcode: [/leetcode/i, /coding\s*profile/i, /problem\s*solving/i],
    otherLink: [/additional\s*link/i, /other\s*link/i, /profile\s*link/i],
    education: [/education/i, /qualification/i, /academic/i],
    degree: [/degree/i, /major/i, /stream/i, /speciali[sz]ation/i],
    university: [/university/i, /college/i, /institution/i, /school/i],
    graduationYear: [/graduation\s*year/i, /year\s*of\s*passing/i, /passing\s*year/i],
    dob: [/date\s*of\s*birth/i, /\bdob\b/i, /birth\s*date/i],
    startDate: [/start\s*date/i, /available\s*from/i, /\bfrom\b/i],
    currentCTC: [/current\s*ctc/i, /current\s*salary/i, /current\s*compensation/i],
    expectedCTC: [/expected\s*ctc/i, /expected\s*salary/i, /expected\s*compensation/i],
    noticePeriod: [/notice\s*period/i, /joining\s*time/i],
    description: [/message\s*to\s*(the\s*)?hiring\s*team/i, /cover\s*letter/i, /about\s*you/i, /why\s*interested/i],
    workAuth: [/work\s*authorization/i, /visa/i, /sponsorship/i],
    relocate: [/relocate/i, /relocation/i],
    preferredLocation: [/preferred\s*location/i, /desired\s*location/i]
  };

  document.addEventListener('pointerdown', handleInputInteraction, true);
  document.addEventListener('focusin', handleInputInteraction, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    setTimeout(() => {
      const el = document.activeElement;
      if (isEditableInput(el)) {
        fetchProfileAndShowMenu(el);
      }
    }, 0);
  }, true);

  function isEditableInput(el) {
    return !!(el &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
      !IGNORED_INPUT_TYPES.includes((el.type || '').toLowerCase()) &&
      !el.readOnly &&
      !el.disabled
    );
  }

  function getInputFromEvent(event) {
    if (isEditableInput(event.target)) return event.target;
    if (!event.composedPath) return null;
    const path = event.composedPath();
    return path.find(node => isEditableInput(node)) || null;
  }

  function handleInputInteraction(event) {
    const input = getInputFromEvent(event);
    if (!input) return;
    if (event.type === 'pointerdown') {
      setTimeout(() => {
        if (document.contains(input)) fetchProfileAndShowMenu(input);
      }, 0);
      return;
    }
    fetchProfileAndShowMenu(input);
  }

  // Close menu if clicking elsewhere.
  document.addEventListener('mousedown', (e) => {
    if (!activeDropdown) return;
    if (!activeDropdown.contains(e.target) && e.target !== currentInput) {
      closeDropdown();
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    if (!currentInput || e.target !== currentInput) return;
    setTimeout(() => {
      if (!activeDropdown) return;
      const activeEl = document.activeElement;
      if (activeEl === currentInput || activeDropdown.contains(activeEl)) return;
      closeDropdown();
    }, 120);
  }, true);

  // Reposition instead of closing so the menu stays usable in scrolling containers.
  window.addEventListener('scroll', repositionDropdown, true);
  window.addEventListener('resize', repositionDropdown, true);

  function hasValidExtensionContext() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function safeStorageGetAll(callback) {
    if (!hasValidExtensionContext()) return false;
    try {
      chrome.storage.local.get(null, (data) => {
        // Ignore runtime errors (for example during reload/context invalidation).
        if (!hasValidExtensionContext()) return;
        if (chrome.runtime.lastError) return;
        callback(data || {});
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function fetchProfileAndShowMenu(input, options = {}) {
    if (!input || !input.isConnected) return;
    if (options.forceOpen) {
      dismissedInput = null;
      removeReopenButton();
    } else if (dismissedInput === input) {
      closeDropdown();
      showReopenButton(input);
      return;
    } else {
      removeReopenButton();
    }

    currentInput = input;
    const started = safeStorageGetAll((data) => {
      if (!hasValidExtensionContext()) return;
      const profileData = resolveActiveProfileData(data);
      if (!profileData) return;

      const availableData = [];
      Object.keys(profileData.fields).forEach(key => {
        if (profileData.toggles[key] === false) return;
        const value = String(profileData.fields[key] ?? '').trim();
        if (!value) return;
        availableData.push({ key, value });
      });

      if (!availableData.length) {
        closeDropdown();
        removeReopenButton();
        return;
      }

      const ranked = rankSuggestionsForInput(input, availableData);
      renderDropdown(input, ranked);
    });
    if (!started) closeDropdown();
  }

  function resolveActiveProfileData(data) {
    if (data && data.profiles) {
      const profileIds = Object.keys(data.profiles);
      if (!profileIds.length) return null;
      const activeId = (data.activeProfileId && data.profiles[data.activeProfileId]) ? data.activeProfileId : profileIds[0];
      const profile = data.profiles[activeId] || {};
      return {
        fields: profile.fields || {},
        toggles: profile.toggles || {}
      };
    }

    // Legacy fallback: older storage schema with flat keys.
    if (!data) return null;
    const fields = {};
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') fields[key] = data[key];
    });
    return {
      fields,
      toggles: {}
    };
  }

  function rankSuggestionsForInput(input, suggestions) {
    const context = getInputContext(input);
    const scored = suggestions.map(item => {
      const keyLower = item.key.toLowerCase();
      const humanKey = item.key.replace(/([A-Z])/g, ' $1').toLowerCase();
      let score = 0;

      if (context.includes(keyLower)) score += 100;
      if (context.includes(humanKey)) score += 90;
      if (context.includes(item.value.toLowerCase())) score += 20;

      const aliases = FIELD_SYNONYMS[item.key] || [];
      aliases.forEach(alias => {
        if (alias.test(context)) score += 120;
      });

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score || a.item.key.localeCompare(b.item.key));
    return scored.map(x => x.item);
  }

  function getInputContext(input) {
    let labelText = '';
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) labelText += ` ${label.textContent || ''}`;
    }

    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      ariaLabelledBy.split(/\s+/).forEach(id => {
        const el = document.getElementById(id);
        if (el) labelText += ` ${el.textContent || ''}`;
      });
    }

    return [
      input.id || '',
      input.name || '',
      input.getAttribute('placeholder') || '',
      input.getAttribute('aria-label') || '',
      input.getAttribute('autocomplete') || '',
      input.getAttribute('data-automation-id') || '',
      input.getAttribute('data-test') || '',
      input.getAttribute('data-qa') || '',
      labelText
    ].join(' ').toLowerCase();
  }

  function renderDropdown(input, dataList) {
    closeDropdown();
    if (!input || !input.isConnected) return;
    removeReopenButton();

    const div = document.createElement('div');
    div.id = 'aqa-inline-menu';

    div.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        background: #13131c;
        border: 1px solid #7c3aed;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        max-height: min(280px, calc(100vh - 16px));
        overflow-y: auto;
        min-width: 280px;
        max-width: calc(100vw - 16px);
        font-family: 'DM Sans', sans-serif;
        padding: 6px;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#6b6b8a;font-weight:bold;text-transform:uppercase;padding:4px 8px;margin-bottom:4px;border-bottom:1px solid rgba(124,58,237,0.2);letter-spacing:1px;';

    const title = document.createElement('span');
    title.textContent = 'AQA Suggestions';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close suggestions');
    closeBtn.style.cssText = 'all:unset;color:#9ca3af;font-size:14px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:4px;';
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(124,58,237,0.15)'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'transparent'; });
    closeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissedInput = input;
      closeDropdown();
      showReopenButton(input);
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    div.appendChild(header);

    dataList.forEach(item => {
      const option = document.createElement('button');
      option.type = 'button';
      option.style.cssText = 'all:unset;display:flex;flex-direction:column;width:100%;box-sizing:border-box;padding:8px 10px;cursor:pointer;border-radius:6px;margin-bottom:2px;';

      option.addEventListener('mouseenter', () => { option.style.background = 'rgba(124,58,237,0.15)'; });
      option.addEventListener('mouseleave', () => { option.style.background = 'transparent'; });

      const formattedLabel = item.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      const displayValue = item.value.length > 80 ? `${item.value.slice(0, 77)}...` : item.value;

      const valueEl = document.createElement('span');
      valueEl.style.cssText = 'font-size:13px;font-weight:600;color:#e8e8f0;line-height:1.2;word-break:break-word;';
      valueEl.textContent = displayValue;

      const labelEl = document.createElement('span');
      labelEl.style.cssText = 'font-size:10px;color:#a855f7;margin-top:2px;';
      labelEl.textContent = formattedLabel;

      option.appendChild(valueEl);
      option.appendChild(labelEl);

      option.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetInput = currentInput;
        if (!targetInput || !targetInput.isConnected) {
          closeDropdown();
          return;
        }

        const context = getInputContext(targetInput);
        const injectValue = adaptValueForInput(item.key, item.value, targetInput, context);
        const isDateLikeField = item.key.toLowerCase().includes('date') || item.key.toLowerCase() === 'dob';

        fillReactInput(targetInput, injectValue, isDateLikeField);

        targetInput.style.backgroundColor = '#f0fdf4';
        targetInput.style.border = '1px solid #10b981';
        targetInput.style.transition = 'all 0.3s';

        dismissedInput = null;
        removeReopenButton();
        closeDropdown();
      });
      div.appendChild(option);
    });

    (document.body || document.documentElement).appendChild(div);
    activeDropdown = div;
    currentInput = input;
    positionDropdown(activeDropdown, currentInput);
  }

  function positionDropdown(dropdown, input) {
    if (!dropdown || !input || !input.isConnected) return;

    const rect = input.getBoundingClientRect();
    const viewportW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const horizontalPadding = 8;
    const gap = 4;
    const desiredWidth = Math.max(280, Math.round(rect.width));
    const width = Math.min(desiredWidth, viewportW - (horizontalPadding * 2));

    dropdown.style.width = `${width}px`;
    dropdown.style.left = `${Math.max(horizontalPadding, Math.min(rect.left, viewportW - width - horizontalPadding))}px`;
    dropdown.style.top = `${Math.min(rect.bottom + gap, viewportH - horizontalPadding)}px`;

    const menuHeight = dropdown.offsetHeight;
    let top = rect.bottom + gap;
    if (top + menuHeight > viewportH - horizontalPadding) {
      top = Math.max(horizontalPadding, rect.top - menuHeight - gap);
    }
    dropdown.style.top = `${top}px`;
  }

  function repositionDropdown() {
    if (activeDropdown && currentInput) {
      if (!currentInput.isConnected) {
        closeDropdown();
      } else {
        positionDropdown(activeDropdown, currentInput);
      }
    }
    positionReopenButton();
  }

  function showReopenButton(input) {
    if (!input || !input.isConnected) return;
    dismissedInput = input;
    if (!reopenButton) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'aqa-inline-reopen';
      btn.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        background: #111827;
        color: #e5e7eb;
        border: 1px solid #374151;
        border-radius: 9999px;
        padding: 4px 10px;
        font-size: 11px;
        font-family: 'DM Sans', sans-serif;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(0,0,0,0.35);
      `;
      btn.textContent = 'Show AQA';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetchProfileAndShowMenu(input, { forceOpen: true });
      });
      (document.body || document.documentElement).appendChild(btn);
      reopenButton = btn;
    }
    positionReopenButton();
  }

  function positionReopenButton() {
    if (!reopenButton || !dismissedInput) return;
    if (!dismissedInput.isConnected) {
      dismissedInput = null;
      removeReopenButton();
      return;
    }
    const rect = dismissedInput.getBoundingClientRect();
    const viewportW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const horizontalPadding = 8;
    const gap = 6;
    const top = Math.min(rect.bottom + gap, viewportH - horizontalPadding - 30);
    const left = Math.max(horizontalPadding, Math.min(rect.right - 80, viewportW - horizontalPadding - 80));
    reopenButton.style.top = `${top}px`;
    reopenButton.style.left = `${left}px`;
  }

  function removeReopenButton() {
    if (reopenButton) {
      reopenButton.remove();
      reopenButton = null;
    }
  }

  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }
    currentInput = null;
  }
}
