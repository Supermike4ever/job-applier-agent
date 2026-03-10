# ⚡ SmartApply AI

**AI-powered job application autofill Chrome extension — Powered by Amazon Nova**

> Quality over Quantity: 不做海投机器，做你的智能求职顾问

## 🏗️ 项目结构

```
smartapply/
├── chrome-extension/          # Chrome 插件
│   ├── manifest.json          # 插件配置（权限、匹配 URL、脚本注册）
│   ├── icons/                 # 插件图标 (16/48/128px)
│   ├── popup/                 # 点击插件图标弹出的面板
│   │   ├── popup.html         # UI 结构
│   │   ├── popup.css          # 样式
│   │   └── popup.js           # 交互逻辑（Tab切换、API调用、填表触发）
│   ├── content/               # 注入到目标网页的脚本
│   │   ├── content.js         # 核心：提取JD、自动填表、插入Cover Letter
│   │   └── content.css        # 浮动按钮和通知样式
│   └── background/
│       └── background.js      # 后台 Service Worker
│
└── backend/                   # FastAPI 后端
    ├── main.py                # API 服务（简历解析、匹配分析、Cover Letter生成）
    └── requirements.txt       # Python 依赖
```

## 🚀 快速开始

### 1. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置 AWS 凭证（用于调用 Nova 2 Lite）
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1

# 启动服务
uvicorn main:app --reload --port 8000
```

验证后端运行：访问 http://localhost:8000/health

### 2. 加载 Chrome 插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **Developer mode（开发者模式）**
3. 点击 **Load unpacked（加载已解压的扩展程序）**
4. 选择 `chrome-extension` 文件夹
5. 插件图标出现在工具栏中 ✅

### 3. 添加插件图标

在 `chrome-extension/icons/` 目录下放置 PNG 图标：
- `icon16.png` (16x16)
- `icon48.png` (48x48)  
- `icon128.png` (128x128)

（开发阶段可以暂时不加，插件会显示默认图标）

### 4. 使用

1. 打开任意 Greenhouse 招聘页面（如 `https://boards.greenhouse.io/xxx`）
2. 点击工具栏的 SmartApply 图标
3. **Profile Tab**: 上传简历 → Nova AI 自动解析填充个人信息 → Save
4. **Apply Tab**: 检测当前页面 → 分析匹配度 → 一键自动填表
5. **Cover Letter Tab**: AI 生成针对该 JD 的定制 Cover Letter

## 🔧 支持的平台

| 平台 | 状态 | URL 模式 |
|------|------|----------|
| Greenhouse | ✅ 完整支持 | `boards.greenhouse.io/*` |
| Lever | ✅ 完整支持 | `jobs.lever.co/*` |
| Workday | 🔶 基础支持 | `*.myworkdayjobs.com/*` |
| 其他 ATS | 🔶 通用填表 | 按 label 匹配 |

## 🧠 Nova 能力映射

| 功能 | Nova 能力 | 说明 |
|------|----------|------|
| 简历解析 | Nova 2 Lite | PDF 文本 → 结构化 JSON |
| JD 关键词提取 | Nova 2 Lite | 提取技能要求、资格等关键词 |
| 匹配评分 | Nova 2 Lite (Extended Thinking) | 深度语义匹配，非简单关键词对比 |
| Cover Letter | Nova 2 Lite | 根据 JD + 简历定制生成 |
| 智能问答 | Nova 2 Lite | 自动回答筛选问题 |
| 自动填表 | Chrome Content Script | DOM 操作，不需要 Nova |

## 📁 关键代码说明

### Content Script (`content/content.js`)
这是最核心的文件，负责：
- `detectPlatform()` - 识别当前是 Greenhouse/Lever/Workday
- `extractJobDescription()` - 提取 JD 文本
- `autofillForm(profile)` - 自动填写表单
- `setFieldValue(element, value)` - 兼容 React 的字段设置（关键！）
- `insertCoverLetter(text)` - 插入 Cover Letter

### Popup (`popup/popup.js`)
用户交互层：
- Tab 切换（Profile / Apply / Cover Letter）
- 简历上传 + 调用后端解析
- Profile 保存到 Chrome Storage
- 触发 content script 执行填表

### Backend (`backend/main.py`)
AI 能力层：
- `/api/parse-resume` - 简历解析
- `/api/analyze-match` - JD 匹配分析
- `/api/generate-cover-letter` - Cover Letter 生成

## 🔑 开发注意事项

### React 表单兼容性
Greenhouse 使用 React，直接设置 `input.value` 不会触发 React 的 state 更新。
`setFieldValue()` 函数使用 `nativeInputValueSetter` 并触发 `input`/`change` 事件来解决这个问题。

### Chrome Extension Manifest V3
- 使用 Service Worker 替代 Background Page
- Content Scripts 通过 `chrome.runtime.onMessage` 通信
- 数据存储使用 `chrome.storage.local`

### 添加新 ATS 平台
1. 在 `manifest.json` 的 `host_permissions` 和 `content_scripts.matches` 添加 URL
2. 在 `content.js` 的 `detectPlatform()` 添加识别逻辑
3. 添加对应的 `fillXxx(profile)` 函数

## 🚢 部署到 AWS

后端部署选项：
- **AWS Lambda + API Gateway** — 最简单，serverless
- **ECS/Fargate** — 容器化部署
- **EC2** — 传统虚拟机

部署后将 `popup.js` 中的 `API_BASE` 改为你的 API Gateway URL。

## 📋 TODO

- [ ] 添加插件图标
- [ ] 支持更多 ATS 平台（iCIMS, Taleo, SmartRecruiters）
- [ ] 简历文件上传到 Greenhouse（通过 Content Script 触发文件选择）
- [ ] 投递记录追踪 Dashboard
- [ ] Nova Act 批量自动投递功能
- [ ] 面试准备材料生成

---

**#AmazonNova | SmartApply AI | Quality over Quantity**
