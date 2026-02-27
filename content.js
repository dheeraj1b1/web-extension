// ============================================================
// AQA AutoFill Pro — Enhanced Content Script
// Uses Contextual DOM scraping to defeat React/Angular forms
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'autofill') {
    const count = fillPage(msg.data);
    sendResponse({ filled: count });
  }
  return true;
});

function fillPage(data) {
  let filled = 0;

  // 1. Map robust regex patterns (ADDED isDate FLAG FOR WORKDAY MASKS)
  const matchers = [
    { regex: /first\s*name|given\s*name/i, val: data.firstName },
    { regex: /last\s*name|surname|family\s*name|local\s*family\s*name/i, val: data.lastName },
    { regex: /full\s*name|applicant\s*name/i, val: data.fullName },
    { regex: /e-?mail/i, val: data.email },
    { regex: /phone|mobile|contact\s*number/i, val: data.phone },

    // 🗓️ DATES (Flagged for mask processing)
    { regex: /\bfrom\b|start\s*date/i, val: data.startDate, isDate: true },

    // 💼 PROFESSIONAL
    { regex: /\bskills\b|type\s*to\s*add\s*skills/i, val: data.skills },
    { regex: /current\s*ctc|current\s*salary|current\s*compensation/i, val: data.currentCTC },
    { regex: /expected\s*ctc|expected\s*salary|expected\s*compensation/i, val: data.expectedCTC },
    { regex: /notice\s*period|joining\s*time/i, val: data.noticePeriod },
    { regex: /role\s*description|responsibilities|summary|bio/i, val: data.summary },
    { regex: /job\s*title|title|position|role/i, val: data.jobTitle },
    { regex: /company|employer|organization/i, val: data.company },
    { regex: /years\s*of\s*experience|total\s*experience|yoe/i, val: data.experience },
    { regex: /linkedin/i, val: data.linkedin },

    // 📍 ADDRESS
    { regex: /postal\s*code|zip\s*code|pincode|pin\s*code/i, val: data.zip },
    { regex: /city|location/i, val: data.city },
    { regex: /state|province/i, val: data.state },
    { regex: /country|nation/i, val: data.country },
    { regex: /address\s*line\s*1|street\s*address|address/i, val: data.street }
  ];

  // 2. Grab all visible, interactable inputs
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select');

  inputs.forEach(input => {
    // Trim invisible spaces to check if truly empty
    if (input.disabled || input.readOnly || (input.value && input.value.trim() !== '')) return;

    // 3. Gather Context (The Workday DOM Hunter)
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
      for (let i = 0; i < 3 && currentEl; i++) {
        parentText += currentEl.innerText + " ";
        currentEl = currentEl.parentElement;
      }
    }

    const idContext = input.id || "";
    const nameContext = input.name || "";
    const placeholderContext = input.getAttribute('placeholder') || "";
    const ariaContext = input.getAttribute('aria-label') || "";
    const autoIdContext = input.getAttribute('data-automation-id') || "";

    const fullContext = `${parentText} ${idContext} ${nameContext} ${placeholderContext} ${ariaContext} ${autoIdContext}`.toLowerCase();

    // 4. Match and Inject
    for (const matcher of matchers) {
      if (matcher.val && matcher.regex.test(fullContext)) {

        let injectValue = matcher.val;

        // 🛠️ THE DATE FIX: If it's a date field but NOT a native HTML5 date picker,
        // strip everything except numbers. (e.g., "02/2022" becomes "022022")
        // This bypasses the Workday mask bug.
        if (matcher.isDate && input.type !== 'date') {
          injectValue = injectValue.replace(/[^0-9]/g, '');
        }

        if (fillReactInput(input, injectValue)) {
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

// 5. The "React Defeater": Forces custom UI frameworks to register the change
function fillReactInput(el, value) {
  try {
    if (el.tagName === 'SELECT') {
      const options = Array.from(el.options);
      const match = options.find(o => o.text.toLowerCase().includes(value.toLowerCase()) || o.value.toLowerCase().includes(value.toLowerCase()));
      if (match) {
        el.value = match.value;
        dispatchAllEvents(el);
        return true;
      }
      return false;
    }

    // Bypass standard setter to trigger framework state updates
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');

    if (el.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.set.call(el, value);
    } else if (nativeInputValueSetter) {
      nativeInputValueSetter.set.call(el, value);
    } else {
      el.value = value;
    }

    dispatchAllEvents(el);
    return true;
  } catch (e) {
    return false;
  }
}

function dispatchAllEvents(el) {
  el.dispatchEvent(new Event('focus', { bubbles: true }));
  el.dispatchEvent(new Event('keydown', { bubbles: true }));
  el.dispatchEvent(new Event('keypress', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('keyup', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}