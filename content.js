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

  // 1. Map robust regex patterns to your saved data (STRICTER PRIORITIES)
  const matchers = [
    // 👤 Names
    { regex: /first\s*name|given\s*name/i, val: data.firstName },
    { regex: /last\s*name|surname|family\s*name|local\s*family\s*name/i, val: data.lastName },
    { regex: /full\s*name|applicant\s*name/i, val: data.fullName },

    // 📞 Contact
    { regex: /e-?mail/i, val: data.email },
    { regex: /phone|mobile|contact\s*number/i, val: data.phone },

    // 💼 Professional (Highly Specific Fields First)
    { regex: /current\s*ctc|current\s*salary|current\s*compensation/i, val: data.currentCTC },
    { regex: /expected\s*ctc|expected\s*salary|expected\s*compensation/i, val: data.expectedCTC },
    { regex: /notice\s*period|joining\s*time/i, val: data.noticePeriod },

    // Catch "Role Description" BEFORE the generic "Role" catcher grabs it
    { regex: /role\s*description|responsibilities|summary|bio/i, val: data.summary },
    { regex: /job\s*title|title|position|role/i, val: data.jobTitle },
    { regex: /company|employer|organization/i, val: data.company },

    // FIXED: Changed loose "experience" to strict "years of experience" to ignore the Workday section header
    { regex: /years\s*of\s*experience|total\s*experience|yoe/i, val: data.experience },
    { regex: /linkedin/i, val: data.linkedin },

    // 📍 Address & Locations
    { regex: /postal\s*code|zip\s*code|pincode|pin\s*code/i, val: data.zip },
    { regex: /city|location/i, val: data.city }, // Fixed: Added loose "location" for the Work Experience block
    { regex: /state|province/i, val: data.state },
    { regex: /country|nation/i, val: data.country },

    // 📍 Address (Broad fallback goes LAST)
    { regex: /address\s*line\s*1|street\s*address|address/i, val: data.street }
  ];

  // 2. Grab all visible, interactable inputs
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select');

  inputs.forEach(input => {
    // Fixed: Workday sometimes puts a hidden space " " in empty fields. Trim it to check if it's TRULY empty.
    if (input.disabled || input.readOnly || (input.value && input.value.trim() !== '')) return;

    // 3. Gather Context: Aggressively hunt for detached labels (The Workday Fix)
    let parentText = "";

    // Strategy A: Look for a strictly linked HTML label
    if (input.id) {
      const linkedLabel = document.querySelector(`label[for="${input.id}"]`);
      if (linkedLabel) parentText += linkedLabel.innerText + " ";
    }

    // Strategy B: Look for an ARIA labelledby reference
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      ariaLabelledBy.split(' ').forEach(id => {
        const linkedAria = document.getElementById(id);
        if (linkedAria) parentText += linkedAria.innerText + " ";
      });
    }

    // Strategy C: Walk up the DOM tree a few levels to catch sibling labels
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
    const autoIdContext = input.getAttribute('data-automation-id') || ""; // Fixed: Workday heavily uses this

    // Smash all clues together into one string
    const fullContext = `${parentText} ${idContext} ${nameContext} ${placeholderContext} ${ariaContext} ${autoIdContext}`.toLowerCase();

    // 4. Test against our matchers
    for (const matcher of matchers) {
      if (matcher.val && matcher.regex.test(fullContext)) {
        if (fillReactInput(input, matcher.val)) {
          filled++;
          // Add a visual flash so you know it worked
          input.style.backgroundColor = '#f0fdf4';
          input.style.border = '1px solid #10b981';
          input.style.transition = 'all 0.3s';
        }
        break; // Stop checking matchers for this input
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