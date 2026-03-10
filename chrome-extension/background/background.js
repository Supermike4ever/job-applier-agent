// ================================================================
// SmartApply AI - Background Service Worker
// 处理扩展安装、消息路由等后台任务
// ================================================================

// 安装/更新时初始化
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[SmartApply AI] Extension installed!");
    // 可以在这里设置默认配置
    chrome.storage.local.set({
      settings: {
        apiBase: "http://localhost:8000",
        autoDetect: true,
        showFab: true,
      },
    });
  }
});

// 监听来自 content script 或 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSettings") {
    chrome.storage.local.get("settings", (data) => {
      sendResponse(data.settings || {});
    });
    return true;
  }

  if (message.action === "log") {
    console.log("[SmartApply AI]", message.data);
    sendResponse({ ok: true });
  }
});
