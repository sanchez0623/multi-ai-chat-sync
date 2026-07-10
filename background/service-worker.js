/*
 * AI 多模型同步提问助手 - 后台 Service Worker
 * 职责：
 *  1. 收到某平台 QUESTION_SUBMITTED -> 向其它已启用平台转发
 *  2. 收到 popup BROADCAST -> 向所有已启用平台转发
 *  3. 查找/打开目标平台 Tab，等待内容脚本就绪后下发 SUBMIT_QUESTION
 *  4. 初始化默认设置
 */
'use strict';

const PLATFORM_ORDER = ['yuanbao', 'doubao', 'qwen', 'kimi', 'zhipu'];

// 用于 chrome.tabs.query 的 match pattern
const MATCH_PATTERNS = {
  yuanbao: ['https://yuanbao.tencent.com/*'],
  doubao:  ['https://www.doubao.com/*'],
  qwen:    ['https://tongyi.aliyun.com/*', 'https://qianwen.aliyun.com/*'],
  kimi:    ['https://kimi.moonshot.cn/*', 'https://kimi.com/*'],
  zhipu:   ['https://chatglm.cn/*', 'https://chat.zhipu.ai/*']
};

// 新建 Tab 时打开的入口 URL
const HOME_URLS = {
  yuanbao: 'https://yuanbao.tencent.com/',
  doubao:  'https://www.doubao.com/',
  qwen:    'https://tongyi.aliyun.com/',
  kimi:    'https://kimi.moonshot.cn/',
  zhipu:   'https://chatglm.cn/'
};

const DEFAULTS = {
  targets: { yuanbao: true, doubao: true, qwen: true, kimi: true, zhipu: true },
  deepThinking: { yuanbao: false, doubao: false, qwen: false, kimi: false, zhipu: false },
  autoSync: true,
  openNewTab: true
};

async function getSettings() {
  const keys = Object.keys(DEFAULTS);
  const stored = await chrome.storage.local.get(keys);
  const out = {};
  for (const k of keys) {
    if (k === 'targets' || k === 'deepThinking') {
      out[k] = { ...DEFAULTS[k], ...(stored[k] || {}) };
    } else {
      out[k] = stored[k] === undefined ? DEFAULTS[k] : stored[k];
    }
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等待 Tab 加载完成 */
async function waitTabComplete(tabId, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t.status === 'complete') return true;
    } catch (e) { return false; }
    await sleep(250);
  }
  return false;
}

/** 探测内容脚本是否就绪，最多重试若干次 */
async function pingTab(tabId, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (resp && resp.ok) return true;
    } catch (e) {
      // Receiving end does not exist yet
    }
    await sleep(400);
  }
  return false;
}

/** 向单个平台转发问题 */
async function sendToPlatform(platformKey, question, deepThinking, settings) {
  const patterns = MATCH_PATTERNS[platformKey];
  if (!patterns) return { platform: platformKey, ok: false, error: '未知平台' };

  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: patterns }); } catch (e) {}
  let tab = tabs[0];

  if (!tab) {
    if (!settings.openNewTab) {
      return { platform: platformKey, ok: false, error: '无已打开的标签页（未开启自动开标签）' };
    }
    try {
      tab = await chrome.tabs.create({ url: HOME_URLS[platformKey], active: false });
    } catch (e) {
      return { platform: platformKey, ok: false, error: '打开标签页失败: ' + e.message };
    }
    await waitTabComplete(tab.id);
  }

  const ready = await pingTab(tab.id);
  if (!ready) {
    return { platform: platformKey, ok: false, error: '内容脚本未就绪（可能未登录或页面异常）' };
  }

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'SUBMIT_QUESTION', question, deepThinking
    });
    return { platform: platformKey, ok: !!(resp && resp.ok), error: resp && resp.error };
  } catch (e) {
    return { platform: platformKey, ok: false, error: String(e && e.message) };
  }
}

/**
 * 向多个平台广播问题
 * @param question 问题文本
 * @param excludeKey 排除的平台（来源平台），可空
 * @returns 各平台结果数组
 */
async function broadcast(question, excludeKey) {
  const settings = await getSettings();
  const targets = PLATFORM_ORDER.filter((k) => settings.targets[k] && k !== excludeKey);
  if (!targets.length) return [];

  const results = await Promise.all(
    targets.map((k) => sendToPlatform(k, question, !!settings.deepThinking[k], settings))
  );
  return results;
}

// ---------- 消息中枢 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return sendResponse({ ok: false, error: 'no type' });

    if (msg.type === 'QUESTION_SUBMITTED') {
      // 某平台用户发起提问 -> 转发到其它已启用平台
      const results = await broadcast(msg.question, msg.source);
      return sendResponse({ ok: true, results });
    }

    if (msg.type === 'BROADCAST') {
      // popup 手动广播 -> 发送到所有已启用平台
      const results = await broadcast(msg.question, null);
      return sendResponse({ ok: true, results });
    }

    if (msg.type === 'GET_SETTINGS') {
      return sendResponse({ ok: true, settings: await getSettings() });
    }

    sendResponse({ ok: false, error: 'unknown type' });
  })();
  return true; // async
});

// ---------- 初始化默认设置 ----------
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (stored[k] === undefined) patch[k] = DEFAULTS[k];
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  console.log('[AISync] installed, defaults ensured');
});
