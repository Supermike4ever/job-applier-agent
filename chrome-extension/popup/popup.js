// ================================================================
// SmartApply AI - Popup Logic
// ================================================================

// ----- Configuration -----
const MOCK_MODE = true; // ✅ 设为 true 可以不需要后端 API 直接测试插件
const API_BASE = "http://localhost:8000";
// const API_BASE = "https://your-api-gateway.amazonaws.com/prod"; // 部署到 AWS 后切换

// ----- Mock Data (MOCK_MODE = true 时使用) -----
const MOCK_RESUME_DATA = {
  first_name: "John",
  last_name: "Doe",
  email: "john.doe@gmail.com",
  phone: "+1 (555) 123-4567",
  location: "New York, NY",
  linkedin: "https://linkedin.com/in/johndoe",
  portfolio: "https://github.com/johndoe",
  skills: ["Python", "JavaScript", "React", "AWS", "PostgreSQL", "Docker", "FastAPI", "Node.js"],
  experience_years: 4,
  experiences: [
    { company: "TechCorp Inc.", title: "Software Engineer", duration: "2022 - Present",
      description: "Built microservices with Python/FastAPI, deployed on AWS ECS." },
    { company: "StartupXYZ", title: "Junior Developer", duration: "2020 - 2022",
      description: "Full-stack development with React and Node.js." }
  ],
  education: [{ school: "NYU", degree: "BS", field: "Computer Science", year: "2020" }],
  summary: "Software engineer with 4 years of experience in full-stack development and AWS."
};

const MOCK_MATCH_RESULT = {
  score: 82,
  strengths: "Strong Python/AWS experience, relevant full-stack skills, solid CS education",
  gaps: "No Kubernetes experience mentioned, limited system design examples",
  keywords: {
    matched: ["Python", "AWS", "React", "Docker", "PostgreSQL", "CI/CD", "Microservices"],
    missing: ["Kubernetes", "GraphQL", "Terraform", "System Design"]
  }
};

const MOCK_COVER_LETTER = {
  cover_letter: "Dear Hiring Manager,\n\nI'm excited to apply for this role, which aligns perfectly with my background in full-stack development and cloud infrastructure.\n\nAt TechCorp Inc., I led the migration of a legacy monolith to an event-driven microservices architecture on AWS, reducing deployment time by 70%. I designed RESTful APIs with Python/FastAPI serving 50K+ daily requests, and implemented CI/CD pipelines the entire team relies on.\n\nWhat draws me to this opportunity is the chance to work at the intersection of backend engineering and cloud infrastructure at scale. My Docker and AWS experience provides a strong foundation, and I'm eager to expand into Kubernetes as part of your team.\n\nI would welcome the opportunity to discuss how my experience can contribute to your goals.\n\nBest regards,\nJohn Doe",
  keywords: ["Python", "AWS", "Microservices", "Docker", "React", "CI/CD", "Kubernetes", "System Design"]
};

// ================================================================
// Tab Navigation
// ================================================================

// ----- Chrome API Fallback (在浏览器直接打开 popup.html 时使用) -----
if (typeof chrome === "undefined" || !chrome.storage) {
  window.chrome = {
    storage: {
      local: {
        _data: {},
        get(keys, cb) {
          const result = {};
          const keyList = typeof keys === "string" ? [keys] : keys;
          keyList.forEach((k) => { if (this._data[k]) result[k] = this._data[k]; });
          if (cb) cb(result);
          return Promise.resolve(result);
        },
        set(obj, cb) {
          Object.assign(this._data, obj);
          if (cb) cb();
          return Promise.resolve();
        },
      },
    },
    tabs: {
      query(opts) {
        return Promise.resolve([{ id: 1, url: "https://boards.greenhouse.io/test/jobs/123" }]);
      },
      sendMessage(tabId, msg) {
        // Mock content script 响应
        if (msg.action === "getPageInfo") {
          return Promise.resolve({ platform: "greenhouse", company: "Demo Corp", position: "Software Engineer" });
        }
        if (msg.action === "extractJD") {
          return Promise.resolve({ jdText: "We are looking for a Software Engineer with 3+ years of Python experience, AWS knowledge, React skills, Docker, and CI/CD pipeline experience. Kubernetes is a plus." });
        }
        if (msg.action === "autofill") {
          return Promise.resolve({ success: true, filledCount: 7, message: "Filled 7 fields" });
        }
        if (msg.action === "insertCoverLetter") {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({});
      },
    },
  };
  console.log("[SmartApply] Running in standalone mode (no Chrome extension APIs)");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");

    // 切换到 Apply tab 时自动检测当前页面
    if (tab.dataset.tab === "apply") {
      detectCurrentPage();
    }
  });
});

// ================================================================
// Resume Upload
// ================================================================
const uploadArea = document.getElementById("resume-upload");
const fileInput = document.getElementById("resume-file");
const parseBtn = document.getElementById("parse-resume");

uploadArea.addEventListener("click", () => fileInput.click());

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = "var(--primary)";
  uploadArea.style.background = "var(--primary-light)";
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.style.borderColor = "";
  uploadArea.style.background = "";
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = "";
  uploadArea.style.background = "";
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

let resumeFile = null;

function handleFileSelect(file) {
  const validTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!validTypes.includes(file.type)) {
    showStatus("parse-status", "Please upload a PDF or DOCX file", "error");
    return;
  }

  resumeFile = file;
  document.getElementById("upload-placeholder").classList.add("hidden");
  document.getElementById("upload-success").classList.remove("hidden");
  document.getElementById("resume-filename").textContent = file.name;
  parseBtn.disabled = false;
}

document.getElementById("remove-resume").addEventListener("click", (e) => {
  e.stopPropagation();
  resumeFile = null;
  fileInput.value = "";
  document.getElementById("upload-placeholder").classList.remove("hidden");
  document.getElementById("upload-success").classList.add("hidden");
  parseBtn.disabled = true;
});

// ================================================================
// Parse Resume with Nova 2 Lite
// ================================================================
parseBtn.addEventListener("click", async () => {
  if (!resumeFile) return;

  parseBtn.disabled = true;
  parseBtn.innerHTML = '<span class="spinner"></span> Parsing...';
  showStatus("parse-status", "Sending resume to Nova AI for analysis...", "loading");

  try {
    let data;

    if (MOCK_MODE) {
      // Mock 模式：模拟 1.5 秒延迟，返回假数据
      await new Promise((r) => setTimeout(r, 1500));
      data = MOCK_RESUME_DATA;
    } else {
      const formData = new FormData();
      formData.append("resume", resumeFile);

      const response = await fetch(`${API_BASE}/api/parse-resume`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      data = await response.json();
    }

    // 自动填充个人信息
    if (data.first_name) document.getElementById("first-name").value = data.first_name;
    if (data.last_name) document.getElementById("last-name").value = data.last_name;
    if (data.email) document.getElementById("email").value = data.email;
    if (data.phone) document.getElementById("phone").value = data.phone;
    if (data.location) document.getElementById("location").value = data.location;
    if (data.linkedin) document.getElementById("linkedin").value = data.linkedin;
    if (data.portfolio) document.getElementById("portfolio").value = data.portfolio;

    // 保存解析后的结构化数据（技能、经历等）到 storage
    await chrome.storage.local.set({ parsedResume: data });

    showStatus("parse-status", "✅ Resume parsed successfully! Fields auto-filled.", "success");
  } catch (err) {
    console.error("Parse error:", err);
    showStatus("parse-status", `❌ Error: ${err.message}`, "error");
  } finally {
    parseBtn.disabled = false;
    parseBtn.innerHTML = "🔍 Parse with Nova AI";
  }
});

// ================================================================
// Save Profile to Chrome Storage
// ================================================================
document.getElementById("save-profile").addEventListener("click", async () => {
  const profile = {
    firstName: document.getElementById("first-name").value,
    lastName: document.getElementById("last-name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    location: document.getElementById("location").value,
    linkedin: document.getElementById("linkedin").value,
    portfolio: document.getElementById("portfolio").value,
    workAuth: document.getElementById("work-auth").value,
    visaSponsor: document.getElementById("visa-sponsor").value,
    yearsExp: document.getElementById("years-exp").value,
    salary: document.getElementById("salary").value,
  };

  await chrome.storage.local.set({ profile });
  showStatus("parse-status", "✅ Profile saved!", "success");
});

// Load saved profile on popup open
(async function loadProfile() {
  const { profile } = await chrome.storage.local.get("profile");
  if (!profile) return;

  document.getElementById("first-name").value = profile.firstName || "";
  document.getElementById("last-name").value = profile.lastName || "";
  document.getElementById("email").value = profile.email || "";
  document.getElementById("phone").value = profile.phone || "";
  document.getElementById("location").value = profile.location || "";
  document.getElementById("linkedin").value = profile.linkedin || "";
  document.getElementById("portfolio").value = profile.portfolio || "";
  document.getElementById("work-auth").value = profile.workAuth || "";
  document.getElementById("visa-sponsor").value = profile.visaSponsor || "";
  document.getElementById("years-exp").value = profile.yearsExp || "";
  document.getElementById("salary").value = profile.salary || "";
})();

// ================================================================
// Detect Current Page (Greenhouse / Lever / Workday)
// ================================================================
async function detectCurrentPage() {
  const statusEl = document.getElementById("page-status");
  const detailsEl = document.getElementById("page-details");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;

    let platform = null;
    let supported = false;

    if (url.includes("greenhouse.io")) {
      platform = "Greenhouse";
      supported = true;
    } else if (url.includes("lever.co")) {
      platform = "Lever";
      supported = true;
    } else if (url.includes("myworkdayjobs.com")) {
      platform = "Workday";
      supported = true;
    }

    if (supported) {
      statusEl.innerHTML = `<span class="status-dot supported"></span> ✅ Supported platform detected`;
      detailsEl.classList.remove("hidden");
      document.getElementById("platform-name").textContent = platform;
      document.getElementById("analyze-jd").disabled = false;
      document.getElementById("autofill-btn").disabled = false;

      // 让 content script 提取页面信息
      const response = await chrome.tabs.sendMessage(tab.id, { action: "getPageInfo" });
      if (response) {
        document.getElementById("company-name").textContent = response.company || "Unknown";
        document.getElementById("position-name").textContent = response.position || "Unknown";
      }
    } else {
      statusEl.innerHTML = `<span class="status-dot unsupported"></span> ❌ Not a supported application page`;
      detailsEl.classList.add("hidden");
    }
  } catch (err) {
    statusEl.innerHTML = `<span class="status-dot unsupported"></span> ⚠️ Cannot access this page`;
  }
}

// ================================================================
// Analyze JD (Extract keywords + Match score)
// ================================================================
document.getElementById("analyze-jd").addEventListener("click", async () => {
  const btn = document.getElementById("analyze-jd");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyzing...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 从 content script 获取 JD 文本
    const { jdText } = await chrome.tabs.sendMessage(tab.id, { action: "extractJD" });
    const { parsedResume } = await chrome.storage.local.get("parsedResume");

    // 发送到后端让 Nova 2 Lite 分析
    let data;

    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 1200));
      data = MOCK_MATCH_RESULT;
    } else {
      const response = await fetch(`${API_BASE}/api/analyze-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_text: jdText,
          resume_data: parsedResume,
        }),
      });
      data = await response.json();
    }

    // 显示匹配分数
    const matchSection = document.getElementById("match-section");
    matchSection.classList.remove("hidden");
    document.getElementById("match-score").textContent = data.score;
    document.getElementById("match-strengths").textContent = data.strengths;
    document.getElementById("match-gaps").textContent = data.gaps;

    // 显示关键词
    const keywordsSection = document.getElementById("keywords-section");
    keywordsSection.classList.remove("hidden");
    const keywordsList = document.getElementById("keywords-list");
    keywordsList.innerHTML = "";

    data.keywords.matched.forEach((kw) => {
      keywordsList.innerHTML += `<span class="keyword-tag">${kw}</span>`;
    });
    data.keywords.missing.forEach((kw) => {
      keywordsList.innerHTML += `<span class="keyword-tag missing">${kw}</span>`;
    });
  } catch (err) {
    showStatus("fill-status", `❌ Analysis failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🔍 Analyze Job";
  }
});

// ================================================================
// Auto-Fill Application
// ================================================================
document.getElementById("autofill-btn").addEventListener("click", async () => {
  const btn = document.getElementById("autofill-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Filling...';
  showStatus("fill-status", "Auto-filling application fields...", "loading");

  try {
    const { profile } = await chrome.storage.local.get("profile");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 发送 profile 数据到 content script 执行填表
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "autofill",
      data: profile,
    });

    if (result.success) {
      showStatus("fill-status", `✅ Filled ${result.filledCount} fields successfully!`, "success");
    } else {
      showStatus("fill-status", `⚠️ Partially filled. ${result.message}`, "error");
    }
  } catch (err) {
    showStatus("fill-status", `❌ Fill failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "⚡ Auto-Fill Application";
  }
});

// ================================================================
// Generate Cover Letter
// ================================================================
document.getElementById("generate-cover").addEventListener("click", async () => {
  const btn = document.getElementById("generate-cover");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const { jdText } = await chrome.tabs.sendMessage(tab.id, { action: "extractJD" });
    const { parsedResume } = await chrome.storage.local.get("parsedResume");
    const { profile } = await chrome.storage.local.get("profile");

    let data;

    if (MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 2000));
      data = MOCK_COVER_LETTER;
    } else {
      const response = await fetch(`${API_BASE}/api/generate-cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_text: jdText,
          resume_data: parsedResume,
          profile: profile,
        }),
      });
      data = await response.json();
    }

    document.getElementById("cover-output").classList.remove("hidden");
    document.getElementById("cover-text").value = data.cover_letter;

    // 也显示关键词
    if (data.keywords) {
      const keywordsSection = document.getElementById("keywords-section");
      keywordsSection.classList.remove("hidden");
      const keywordsList = document.getElementById("keywords-list");
      keywordsList.innerHTML = "";
      data.keywords.forEach((kw) => {
        keywordsList.innerHTML += `<span class="keyword-tag">${kw}</span>`;
      });
    }
  } catch (err) {
    showStatus("fill-status", `❌ Generation failed: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "✨ Generate Cover Letter";
  }
});

// Copy cover letter
document.getElementById("copy-cover").addEventListener("click", () => {
  const text = document.getElementById("cover-text").value;
  navigator.clipboard.writeText(text);
  document.getElementById("copy-cover").textContent = "✅ Copied!";
  setTimeout(() => {
    document.getElementById("copy-cover").textContent = "📋 Copy";
  }, 2000);
});

// Insert cover letter into form
document.getElementById("insert-cover").addEventListener("click", async () => {
  const coverText = document.getElementById("cover-text").value;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, {
    action: "insertCoverLetter",
    data: coverText,
  });
});

// Regenerate
document.getElementById("regenerate-cover").addEventListener("click", () => {
  document.getElementById("generate-cover").click();
});

// ================================================================
// Utility: Show Status Message
// ================================================================
function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-msg ${type}`;
  el.classList.remove("hidden");

  if (type === "success") {
    setTimeout(() => el.classList.add("hidden"), 4000);
  }
}
