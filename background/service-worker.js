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
  qwen:    ['https://www.qianwen.com/*'],
  kimi:    ['https://www.kimi.com/*'],
  zhipu:   ['https://chatglm.cn/*', 'https://chat.zhipu.ai/*']
};

// 新建 Tab 时打开的入口 URL
const HOME_URLS = {
  yuanbao: 'https://yuanbao.tencent.com/',
  doubao:  'https://www.doubao.com/',
  qwen:    'https://www.qianwen.com/',
  kimi:    'https://www.kimi.com/',
  zhipu:   'https://chatglm.cn/'
};

// 各平台内容脚本文件列表（用于编程式注入兜底）
const CONTENT_SCRIPTS = {
  yuanbao: ['content/common.js', 'content/yuanbao.js'],
  doubao:  ['content/common.js', 'content/doubao.js'],
  qwen:    ['content/common.js', 'content/qwen.js'],
  kimi:    ['content/common.js', 'content/kimi.js'],
  zhipu:   ['content/common.js', 'content/zhipu.js']
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

// 与 content/common.js 中 CONTENT_VERSION 保持一致
// 不一致时 PING 会带上 pageVersion 字段回来，提示用户需要刷新扩展或重新打开标签页
const EXPECTED_CONTENT_VERSION = '1.1.11';

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

/** 获取标签页下所有 frame 的 frameId */
async function getAllFrames(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return frames ? frames.map((f) => f.frameId) : [undefined];
  } catch (e) {
    return [undefined];
  }
}

/** 探测内容脚本是否就绪，最多重试若干次；遍历所有 frame，返回就绪的 frameId */
async function pingTab(tabId, retries = 10) {
  for (let i = 0; i < retries; i++) {
    const frameIds = await getAllFrames(tabId);
    for (const frameId of frameIds) {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId });
        if (resp && resp.ok) return frameId;
      } catch (e) {
        // Receiving end does not exist in this frame yet
      }
    }
    await sleep(400);
  }
  return null;
}

/** 带诊断信息的 PING：返回 pageVersion / ready / href，方便排查 "老 content script 卡在页面里" 的情况 */
async function pingTabVerbose(tabId) {
  let lastErr = null;
  for (let i = 0; i < 10; i++) {
    const frameIds = await getAllFrames(tabId);
    for (const frameId of frameIds) {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId });
        if (resp && resp.ok) {
          return { ok: true, frameId, resp };
        }
      } catch (e) {
        lastErr = e;
      }
    }
    await sleep(400);
  }
  return { ok: false, error: lastErr && lastErr.message };
}

/** 编程式注入内容脚本（兜底：标签页在扩展安装/更新前已打开时 manifest 不会补注入） */
async function injectContentScripts(tabId, platformKey) {
  const files = CONTENT_SCRIPTS[platformKey];
  if (!files) return false;
  try {
    // allFrames: 豆包等平台可能在子 frame 渲染聊天界面
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
    return true;
  } catch (e) {
    console.warn('[AISync] inject failed:', platformKey, e && e.message);
    return false;
  }
}

/** 向单个平台转发问题 */
async function sendToPlatform(platformKey, question, deepThinking, settings, sessionId) {
  console.log('[AISync] sendToPlatform:', platformKey, 'dt=', deepThinking, 'q=', (question || '').slice(0, 40));
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

  // 先用 verbose 探一次，能拿到 version / href 等诊断信息
  let probe = await pingTabVerbose(tab.id);
  let readyFrameId = probe.ok ? probe.frameId : null;
  let pageVersion = probe.ok ? probe.resp.version : null;
  let pageHref = probe.ok ? probe.resp.href : null;
  let pageReady = probe.ok ? probe.resp.ready : null;

  if (readyFrameId === null) {
    // 内容脚本可能未注入（标签页在扩展安装/更新前已打开），尝试编程式注入后重试
    const injected = await injectContentScripts(tab.id, platformKey);
    if (injected) {
      await sleep(500);
      probe = await pingTabVerbose(tab.id);
      readyFrameId = probe.ok ? probe.frameId : null;
      if (probe.ok) {
        pageVersion = probe.resp.version;
        pageHref = probe.resp.href;
        pageReady = probe.resp.ready;
      }
    }
  }
  if (readyFrameId === null) {
    console.warn('[AISync] sendToPlatform: content script not ready for', platformKey,
      'lastErr=', probe.error, 'tabId=', tab.id, 'tabUrl=', tab && tab.url);
    return { platform: platformKey, ok: false, error: '内容脚本未就绪（可能未登录或页面异常）' };
  }

  // 检测到老 content script：返回了 ok 但 version 不匹配。这种情况下 SUBMIT_QUESTION
  // 协议可能不兼容，最稳的做法是主动重注一次。
  if (pageVersion && pageVersion !== EXPECTED_CONTENT_VERSION) {
    console.warn('[AISync] sendToPlatform: stale content script for', platformKey,
      'expected=', EXPECTED_CONTENT_VERSION, 'got=', pageVersion, 're-injecting...');
    const injected = await injectContentScripts(tab.id, platformKey);
    if (injected) {
      await sleep(500);
      probe = await pingTabVerbose(tab.id);
      if (probe.ok) {
        readyFrameId = probe.frameId;
        pageVersion = probe.resp.version;
        pageHref = probe.resp.href;
        pageReady = probe.resp.ready;
      }
    }
  }
  console.log('[AISync] sendToPlatform: PING ok for', platformKey,
    'frameId=', readyFrameId, 'version=', pageVersion, 'ready=', pageReady, 'href=', pageHref);

  // 向就绪的 frame 发送 SUBMIT_QUESTION（带 sessionId 以便内容脚本回传回答）
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'SUBMIT_QUESTION', question, deepThinking, sessionId
    }, { frameId: readyFrameId });
    console.log('[AISync] sendToPlatform done:', platformKey, 'resp=', resp);
    return { platform: platformKey, ok: !!(resp && resp.ok), error: resp && resp.error };
  } catch (e) {
    console.warn('[AISync] sendToPlatform sendMessage failed:', platformKey, e && e.message);
    return { platform: platformKey, ok: false, error: String(e && e.message) };
  }
}

// ---------- 会话状态存储 ----------
const MAX_SESSIONS = 50;

async function getSessions() {
  const res = await chrome.storage.local.get('sessions');
  return res.sessions || [];
}

async function saveSessions(list) {
  // 限制条数，超出按时间裁剪（最新在前）
  if (list.length > MAX_SESSIONS) list = list.slice(0, MAX_SESSIONS);
  await chrome.storage.local.set({ sessions: list });
}

/** 新建会话并写入存储，返回 session 对象 */
async function createSession(question, source, platformKeys) {
  const list = await getSessions();
  const now = Date.now();
  const session = {
    id: 's_' + now + '_' + Math.random().toString(36).slice(2, 8),
    question,
    createdAt: now,
    source: source || null,
    platforms: { __order: platformKeys.slice() }
  };
  for (const k of platformKeys) {
    session.platforms[k] = { status: 'pending', answer: '', error: null, updatedAt: now };
  }
  list.unshift(session);
  await saveSessions(list);
  return session;
}

/** 更新某会话中某平台的状态/回答 */
async function updateSessionPlatform(sessionId, platformKey, patch) {
  const list = await getSessions();
  const idx = list.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;
  const sess = list[idx];
  if (!sess.platforms[platformKey]) return null;
  sess.platforms[platformKey] = {
    ...sess.platforms[platformKey],
    ...patch,
    updatedAt: Date.now()
  };
  await saveSessions(list);
  return sess;
}

/** 标记某平台提交失败（用于 sendToPlatform 返回错误时） */
async function markSessionError(sessionId, platformKey, error) {
  return updateSessionPlatform(sessionId, platformKey, { status: 'error', error });
}

/**
 * 向多个平台广播问题，并创建会话记录
 * @param question 问题文本
 * @param excludeKey 排除的平台（来源平台），可空
 * @param source 来源平台（用于会话记录），可空
 * @returns { sessionId, results }
 */
async function broadcast(question, excludeKey, source) {
  const settings = await getSettings();
  const targets = PLATFORM_ORDER.filter((k) => settings.targets[k] && k !== excludeKey);
  if (!targets.length) return { sessionId: null, results: [] };

  // 会话中包含来源平台（若有），以便展示来源平台回答
  const sessionPlatforms = source ? (targets.includes(source) ? targets : [source].concat(targets)) : targets;
  const session = await createSession(question, source, sessionPlatforms);

  const results = await Promise.all(
    targets.map((k) => sendToPlatform(k, question, !!settings.deepThinking[k], settings, session.id))
  );
  // 根据转发结果更新会话状态：失败的标记 error，成功的保持 pending（等待内容脚本上报回答）
  for (const r of results) {
    if (r && !r.ok) {
      await markSessionError(session.id, r.platform, r.error || '发送失败');
    }
  }
  return { sessionId: session.id, results };
}

// ---------- 消息中枢 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return sendResponse({ ok: false, error: 'no type' });

    if (msg.type === 'QUESTION_SUBMITTED') {
      // 某平台用户发起提问 -> 转发到其它已启用平台，并创建会话
      const { sessionId, results } = await broadcast(msg.question, msg.source, msg.source);
      return sendResponse({ ok: true, sessionId, results });
    }

    if (msg.type === 'BROADCAST') {
      // 侧边栏手动广播 -> 发送到所有已启用平台，并创建会话
      const { sessionId, results } = await broadcast(msg.question, null, null);
      return sendResponse({ ok: true, sessionId, results });
    }

    if (msg.type === 'ANSWER_UPDATE') {
      // 内容脚本上报某平台回答 -> 更新会话存储（侧边栏订阅 storage 变化自动刷新）
      if (msg.sessionId && msg.platform) {
        await updateSessionPlatform(msg.sessionId, msg.platform, {
          status: msg.status || 'sending',
          answer: msg.answer || '',
          error: msg.status === 'error' ? (msg.error || null) : null
        });
      }
      return sendResponse({ ok: true });
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
  // 允许在所有平台页面打开侧边栏
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (e) {}
  console.log('[AISync] installed, defaults ensured');
});

// 点击扩展图标打开侧边栏（无 default_popup 时由 onClicked 触发）
chrome.action.onClicked.addListener((tab) => {
  try { chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId }); } catch (e) {
    console.warn('[AISync] open sidePanel failed', e && e.message);
  }
});
