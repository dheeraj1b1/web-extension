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

  // 1. Map robust regex patterns to your saved data
  const matchers = [
    { regex: /first\s*name|given\s*name/i, val: data.firstName },
    { regex: /last\s*name|surname|family\s*name/i, val: data.lastName },
    { regex: /full\s*name|applicant\s*name/i, val: data.fullName },
    { regex: /e-?mail/i, val: data.email },
    { regex: /phone|mobile|contact\s*number/i, val: data.phone },
    { regex: /current\s*ctc|current\s*salary|current\s*compensation/i, val: data.currentCTC },
    { regex: /expected\s*ctc|expected\s*salary|expected\s*compensation/i, val: data.expectedCTC },
    { regex: /notice\s*period|joining\s*time/i, val: data.noticePeriod },
    { regex: /experience|yoe/i, val: data.experience },
    { regex: /current\s*location|city/i, val: data.city },
    { regex: /state|province/i, val: data.state },
    { regex: /country|nation/i, val: data.country },
    { regex: /linkedin/i, val: data.linkedin },
    { regex: /title|position|role/i, val: data.jobTitle },
    { regex: /company|employer/i, val: data.company }
  ];

  // 2. Grab all visible, interactable inputs
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select');

  inputs.forEach(input => {
    if (input.disabled || input.readOnly || input.value) return; // Skip if already filled

    // 3. Gather Context: Read the text surrounding the input just like a human would
    const parentText = (input.closest('div[class], label, fieldset, tr') || input.parentElement).innerText || "";
    const idContext = input.id || "";
    const nameContext = input.name || "";
    const placeholderContext = input.getAttribute('placeholder') || "";
    const ariaContext = input.getAttribute('aria-label') || "";

    // Smash all clues together into one string
    const fullContext = `${parentText} ${idContext} ${nameContext} ${placeholderContext} ${ariaContext}`.toLowerCase();

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