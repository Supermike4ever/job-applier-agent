// ================================================================
// SmartApply AI - Content Script
// 注入到 Greenhouse / Lever / Workday 页面中
// 负责：提取 JD、提取页面信息、自动填表、插入 Cover Letter
// ================================================================

// ----- 监听来自 popup 的消息 -----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getPageInfo":
      sendResponse(getPageInfo());
      break;
    case "extractJD":
      sendResponse({ jdText: extractJobDescription() });
      break;
    case "autofill":
      const result = autofillForm(message.data);
      sendResponse(result);
      break;
    case "insertCoverLetter":
      insertCoverLetter(message.data);
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: "Unknown action" });
  }
  return true; // 保持消息通道开放（异步响应需要）
});

// ================================================================
// 检测平台类型
// ================================================================
function detectPlatform() {
  const url = window.location.href;
  if (url.includes("greenhouse.io")) return "greenhouse";
  if (url.includes("lever.co")) return "lever";
  if (url.includes("myworkdayjobs.com")) return "workday";
  return "unknown";
}

// ================================================================
// 获取页面基本信息（公司名、职位名）
// ================================================================
function getPageInfo() {
  const platform = detectPlatform();
  let company = "";
  let position = "";

  switch (platform) {
    case "greenhouse":
      // Greenhouse: 公司名通常在 .company-name 或页面 title 中
      company =
        document.querySelector(".company-name")?.textContent?.trim() ||
        document.querySelector('[data-company]')?.textContent?.trim() ||
        extractFromTitle("at");
      position =
        document.querySelector(".app-title")?.textContent?.trim() ||
        document.querySelector("h1")?.textContent?.trim() ||
        "";
      break;

    case "lever":
      // Lever: 结构比较统一
      company =
        document.querySelector(".company-header .main-header-logo img")?.alt ||
        document.querySelector(".posting-headline h2")?.textContent?.trim() ||
        extractFromTitle("at");
      position =
        document.querySelector(".posting-headline h2")?.textContent?.trim() ||
        document.querySelector("h2")?.textContent?.trim() ||
        "";
      break;

    case "workday":
      company = extractFromTitle("-") || "";
      position =
        document.querySelector('[data-automation-id="jobPostingHeader"]')?.textContent?.trim() ||
        document.querySelector("h2")?.textContent?.trim() ||
        "";
      break;
  }

  return { platform, company, position };
}

function extractFromTitle(separator) {
  const title = document.title;
  if (title.includes(separator)) {
    const parts = title.split(separator);
    return parts[parts.length - 1]?.trim() || "";
  }
  return "";
}

// ================================================================
// 提取 Job Description 文本
// ================================================================
function extractJobDescription() {
  const platform = detectPlatform();
  let jdElement = null;

  switch (platform) {
    case "greenhouse":
      jdElement =
        document.getElementById("content") ||
        document.querySelector(".job-post-content") ||
        document.querySelector('[class*="job_description"]') ||
        document.querySelector(".body");
      break;

    case "lever":
      jdElement =
        document.querySelector(".posting-page .content") ||
        document.querySelector('[class*="posting-"]');
      break;

    case "workday":
      jdElement =
        document.querySelector('[data-automation-id="jobPostingDescription"]') ||
        document.querySelector(".job-description");
      break;
  }

  // Fallback: 尝试通用选择器
  if (!jdElement) {
    jdElement =
      document.querySelector('[class*="description"]') ||
      document.querySelector('[class*="job-post"]') ||
      document.querySelector("article") ||
      document.querySelector("main");
  }

  return jdElement?.innerText?.trim() || document.body.innerText.substring(0, 5000);
}

// ================================================================
// 自动填表 - Greenhouse
// ================================================================
function autofillForm(profile) {
  const platform = detectPlatform();
  let filledCount = 0;

  switch (platform) {
    case "greenhouse":
      filledCount = fillGreenhouse(profile);
      break;
    case "lever":
      filledCount = fillLever(profile);
      break;
    case "workday":
      filledCount = fillWorkday(profile);
      break;
    default:
      filledCount = fillGeneric(profile);
  }

  return { success: filledCount > 0, filledCount, message: `Filled ${filledCount} fields` };
}

// ----- Greenhouse 填表逻辑 -----
function fillGreenhouse(profile) {
  let count = 0;

  // Greenhouse 的表单字段通常有 id 属性
  const fieldMap = {
    // 常见 Greenhouse 字段 ID / name 映射
    first_name: profile.firstName,
    last_name: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    // Greenhouse 自定义字段可能用不同的 ID
  };

  // 方法 1: 按 id 填写
  for (const [fieldId, value] of Object.entries(fieldMap)) {
    if (!value) continue;
    const el = document.getElementById(fieldId) || document.querySelector(`[name*="${fieldId}"]`);
    if (el) {
      count += setFieldValue(el, value);
    }
  }

  // 方法 2: 按 label 文本匹配（更可靠）
  const labelMappings = [
    { patterns: ["first name", "given name"], value: profile.firstName },
    { patterns: ["last name", "family name", "surname"], value: profile.lastName },
    { patterns: ["email"], value: profile.email },
    { patterns: ["phone", "mobile", "telephone"], value: profile.phone },
    { patterns: ["location", "city", "address"], value: profile.location },
    { patterns: ["linkedin"], value: profile.linkedin },
    { patterns: ["website", "portfolio", "github", "url"], value: profile.portfolio },
  ];

  const labels = document.querySelectorAll("label");
  labels.forEach((label) => {
    const labelText = label.textContent.toLowerCase().trim();

    for (const mapping of labelMappings) {
      if (!mapping.value) continue;
      if (mapping.patterns.some((p) => labelText.includes(p))) {
        // 找到关联的 input
        const forAttr = label.getAttribute("for");
        let input = forAttr
          ? document.getElementById(forAttr)
          : label.querySelector("input, textarea, select") ||
            label.nextElementSibling?.querySelector("input, textarea, select") ||
            label.parentElement?.querySelector("input, textarea, select");

        if (input && !input.value) {
          count += setFieldValue(input, mapping.value);
        }
      }
    }
  });

  return count;
}

// ----- Lever 填表逻辑 -----
function fillLever(profile) {
  let count = 0;

  // Lever 表单结构
  const leverFields = [
    { selector: 'input[name="name"]', value: `${profile.firstName} ${profile.lastName}` },
    { selector: 'input[name="email"]', value: profile.email },
    { selector: 'input[name="phone"]', value: profile.phone },
    { selector: 'input[name="org"]', value: "" }, // 当前公司
    { selector: 'input[name="urls[LinkedIn]"]', value: profile.linkedin },
    { selector: 'input[name="urls[Portfolio]"]', value: profile.portfolio },
    { selector: 'input[name="urls[GitHub]"]', value: profile.portfolio },
  ];

  leverFields.forEach(({ selector, value }) => {
    if (!value) return;
    const el = document.querySelector(selector);
    if (el) count += setFieldValue(el, value);
  });

  // Lever 也用 label 匹配
  count += fillByLabels(profile);

  return count;
}

// ----- Workday 填表逻辑 -----
function fillWorkday(profile) {
  let count = 0;

  // Workday 用 data-automation-id 属性
  const workdayFields = [
    { automationId: "legalNameSection_firstName", value: profile.firstName },
    { automationId: "legalNameSection_lastName", value: profile.lastName },
    { automationId: "email", value: profile.email },
    { automationId: "phone-number", value: profile.phone },
    { automationId: "addressSection_city", value: profile.location },
  ];

  workdayFields.forEach(({ automationId, value }) => {
    if (!value) return;
    const el = document.querySelector(`[data-automation-id="${automationId}"] input`) ||
               document.querySelector(`[data-automation-id="${automationId}"]`);
    if (el) count += setFieldValue(el, value);
  });

  // Fallback to label matching
  count += fillByLabels(profile);

  return count;
}

// ----- 通用 label 匹配填表 -----
function fillByLabels(profile) {
  let count = 0;
  const labelMappings = [
    { patterns: ["first name", "given name"], value: profile.firstName },
    { patterns: ["last name", "family name", "surname"], value: profile.lastName },
    { patterns: ["email"], value: profile.email },
    { patterns: ["phone", "mobile"], value: profile.phone },
    { patterns: ["linkedin"], value: profile.linkedin },
    { patterns: ["website", "portfolio", "github"], value: profile.portfolio },
    { patterns: ["location", "city"], value: profile.location },
  ];

  document.querySelectorAll("label").forEach((label) => {
    const text = label.textContent.toLowerCase().trim();
    for (const mapping of labelMappings) {
      if (!mapping.value) continue;
      if (mapping.patterns.some((p) => text.includes(p))) {
        const forId = label.getAttribute("for");
        const input = forId
          ? document.getElementById(forId)
          : label.closest(".field, .form-group, .form-field")?.querySelector("input, textarea, select");
        if (input && !input.value) {
          count += setFieldValue(input, mapping.value);
        }
      }
    }
  });
  return count;
}

// ----- 通用填表（Fallback）-----
function fillGeneric(profile) {
  return fillByLabels(profile);
}

// ================================================================
// 设置字段值（兼容 React/Angular 等框架的输入事件）
// ================================================================
function setFieldValue(element, value) {
  if (!element || !value) return 0;

  // 获取 React 内部属性的 setter（Greenhouse 用 React）
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;

  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    const setter =
      element.tagName === "INPUT" ? nativeInputValueSetter : nativeTextareaValueSetter;

    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }

    // 触发 React / Angular / Vue 能监听到的事件
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));

    return 1;
  }

  if (element.tagName === "SELECT") {
    const option = Array.from(element.options).find(
      (opt) => opt.value.toLowerCase() === value.toLowerCase() ||
               opt.textContent.toLowerCase().includes(value.toLowerCase())
    );
    if (option) {
      element.value = option.value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return 1;
    }
  }

  return 0;
}

// ================================================================
// 插入 Cover Letter 到表单
// ================================================================
function insertCoverLetter(text) {
  // 尝试找 cover letter 字段
  const selectors = [
    'textarea[name*="cover"]',
    'textarea[id*="cover"]',
    'textarea[placeholder*="cover"]',
    'textarea[aria-label*="cover"]',
    // Greenhouse 的自定义问题 textarea
    ".field textarea",
    'textarea[name*="letter"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      setFieldValue(el, text);
      highlightElement(el);
      return;
    }
  }

  // Fallback: 找第一个空的 textarea（可能是 cover letter 字段）
  const textareas = document.querySelectorAll("textarea");
  for (const ta of textareas) {
    if (!ta.value || ta.value.trim() === "") {
      setFieldValue(ta, text);
      highlightElement(ta);
      return;
    }
  }

  // 实在找不到，复制到剪贴板
  navigator.clipboard.writeText(text);
  showFloatingNotification("Cover letter copied to clipboard! Paste it manually.");
}

// ================================================================
// UI 辅助：高亮已填写的字段
// ================================================================
function highlightElement(el) {
  el.style.transition = "box-shadow 0.3s, border-color 0.3s";
  el.style.boxShadow = "0 0 0 3px rgba(26, 115, 232, 0.3)";
  el.style.borderColor = "#1A73E8";

  setTimeout(() => {
    el.style.boxShadow = "";
    el.style.borderColor = "";
  }, 3000);
}

// ================================================================
// 浮动通知
// ================================================================
function showFloatingNotification(message) {
  const existing = document.getElementById("smartapply-notification");
  if (existing) existing.remove();

  const notification = document.createElement("div");
  notification.id = "smartapply-notification";
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 4000);
}

// ================================================================
// 页面加载时显示 SmartApply 浮动按钮
// ================================================================
function injectFloatingButton() {
  const platform = detectPlatform();
  if (platform === "unknown") return;

  const btn = document.createElement("div");
  btn.id = "smartapply-fab";
  btn.innerHTML = "⚡";
  btn.title = "SmartApply AI - Click to auto-fill";
  document.body.appendChild(btn);

  btn.addEventListener("click", async () => {
    const { profile } = await chrome.storage.local.get("profile");
    if (profile) {
      const result = autofillForm(profile);
      showFloatingNotification(
        result.success
          ? `✅ Auto-filled ${result.filledCount} fields!`
          : "⚠️ No profile saved. Open SmartApply extension first."
      );
    } else {
      showFloatingNotification("⚠️ Please set up your profile in SmartApply first.");
    }
  });
}

// 注入浮动按钮
injectFloatingButton();

console.log("[SmartApply AI] Content script loaded for", detectPlatform());
