/*
 * AI 多模型同步提问助手 - 内容脚本公共模块
 * 在各平台 content script 之前注入，提供：
 *  - 平台元数据 / 消息常量
 *  - chrome.storage 读写
 *  - 与 background 通信
 *  - DOM 操作工具（查找输入框、写入文本、点击发送、深度思考开关）
 *  - 回环防护（转发产生的提交不再二次广播）
 */
(function () {
  'use strict';

  if (globalThis.AISYNC && globalThis.AISYNC.__loaded) return;

  const PLATFORMS = {
    yuanbao: { key: 'yuanbao', name: '元宝', host: 'yuanbao.tencent.com' },
    doubao:  { key: 'doubao',  name: '豆包', host: 'www.doubao.com' },
    qwen:    { key: 'qwen',    name: '通义千问', host: 'www.qianwen.com' },
    kimi:    { key: 'kimi',    name: 'Kimi', host: 'www.kimi.com' },
    zhipu:   { key: 'zhipu',   name: '智谱清言', host: 'chatglm.cn' }
  };

  const MSG = {
    QUESTION_SUBMITTED: 'QUESTION_SUBMITTED', // content -> bg: 用户在某平台发起提问
    SUBMIT_QUESTION: 'SUBMIT_QUESTION',       // bg -> content: 转发问题到目标平台
    BROADCAST: 'BROADCAST',                   // popup -> bg: 手动广播一个问题
    PING: 'PING',                             // bg -> content: 探测页面是否就绪
    STATUS: 'STATUS'                          // content -> bg/popup: 当前页面状态
  };

  const DEFAULTS = {
    targets: { yuanbao: true, doubao: true, qwen: true, kimi: true, zhipu: true },
    deepThinking: { yuanbao: false, doubao: false, qwen: false, kimi: false, zhipu: false },
    autoSync: true,
    openNewTab: true
  };

  const DEBUG = true;
  const TAG = '[AISync]';

  const log = (...a) => { if (DEBUG) console.log(TAG, ...a); };
  const warn = (...a) => { if (DEBUG) console.warn(TAG, ...a); };

  // ---------- storage ----------
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

  async function saveSettings(partial) {
    const cur = await getSettings();
    const next = { ...cur };
    if (partial.targets) next.targets = { ...next.targets, ...partial.targets };
    if (partial.deepThinking) next.deepThinking = { ...next.deepThinking, ...partial.deepThinking };
    if (partial.autoSync !== undefined) next.autoSync = partial.autoSync;
    if (partial.openNewTab !== undefined) next.openNewTab = partial.openNewTab;
    await chrome.storage.local.set(next);
    return next;
  }

  // ---------- messaging ----------
  function sendToBackground(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => {
          if (chrome.runtime.lastError) warn('bg msg error:', chrome.runtime.lastError.message);
          resolve(resp);
        });
      } catch (e) { warn('sendToBackground failed', e); resolve(undefined); }
    });
  }

  function onBackgroundMessage(handler) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      const r = handler(msg, sender);
      if (r instanceof Promise) {
        r.then(sendResponse).catch((e) => { warn('msg handler err', e); sendResponse({ ok: false, error: String(e) }); });
        return true; // async
      }
      if (r !== undefined) sendResponse(r);
      return false;
    });
  }

  // ---------- DOM utilities ----------
  const dom = {
    /** 等待条件成立，返回 Promise<boolean>（超时为 false） */
    waitFor(predicate, { timeout = 8000, interval = 150 } = {}) {
      return new Promise((resolve) => {
        const start = Date.now();
        (function tick() {
          let v;
          try { v = predicate(); } catch (e) { v = null; }
          if (v) return resolve(v);
          if (Date.now() - start >= timeout) return resolve(null);
          setTimeout(tick, interval);
        })();
      });
    },

    /** 依次尝试多个选择器，返回第一个匹配 */
    first(selectors, root = document) {
      for (const s of selectors) {
        try {
          const el = root.querySelector(s);
          if (el) return el;
        } catch (e) { /* bad selector */ }
      }
      return null;
    },

    /** 在候选选择器范围内，按文本匹配可点击元素 */
    findByText(containerSelectors, texts, root = document) {
      const containers = [];
      for (const s of containerSelectors) {
        try { root.querySelectorAll(s).forEach((e) => containers.push(e)); } catch (e) {}
      }
      const scope = containers.length ? containers : [root];
      const want = texts.map((t) => t.trim());
      for (const c of scope) {
        const nodes = c.querySelectorAll('button, div[role="button"], a, span, label, [class*="toggle"], [class*="mode"], [class*="think"]');
        for (const n of nodes) {
          const txt = (n.textContent || '').trim();
          if (txt && want.some((w) => txt === w || txt.includes(w))) {
            // 优先返回文本最接近的（避免外层容器）
            if (txt.length < 30) return n;
          }
        }
      }
      return null;
    },

    /** 读取输入框文本（textarea/input/contenteditable 通用） */
    readText(el) {
      if (!el) return '';
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
      return el.innerText || el.textContent || '';
    },

    /** 写入文本（兼容 React 受控组件） */
    async setInputText(el, text) {
      if (!el) return false;
      el.focus();
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      // contenteditable
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (document.execCommand('insertText', false, text)) {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
          return true;
        }
      } catch (e) {}
      // 兜底
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return true;
    },

    /** 查找发送按钮：先按选择器，再按 aria-label/文本匹配，最后兜底输入框附近的提交类按钮 */
    findSendButton(selectorCandidates, textCandidates) {
      return dom.findSendButtonIn(document, selectorCandidates, textCandidates);
    },

    /** 查找发送按钮（限定在 root 范围内）：先按选择器，再按 aria-label/文本匹配 */
    findSendButtonIn(root, selectorCandidates, textCandidates) {
      root = root || document;
      // 1. 选择器优先
      const el = dom.first(selectorCandidates || [], root);
      if (el && !dom.isDisabled(el)) return el;
      // 2. aria-label / 文本匹配
      if (textCandidates && textCandidates.length) {
        const want = textCandidates.map((t) => t.trim());
        const btns = root.querySelectorAll('button, a, div[role="button"], [type="submit"]');
        for (const b of btns) {
          if (dom.isDisabled(b)) continue;
          const al = (b.getAttribute('aria-label') || '').trim();
          const txt = (b.textContent || '').trim();
          const title = (b.getAttribute('title') || '').trim();
          for (const w of want) {
            if (al === w || txt === w || title === w || al.includes(w) || txt.includes(w)) return b;
          }
        }
      }
      return null;
    },

    /** 判断元素是否处于禁用态 */
    isDisabled(el) {
      if (!el) return true;
      if (el.disabled) return true;
      if (el.getAttribute('aria-disabled') === 'true') return true;
      const cls = typeof el.className === 'string' ? el.className : '';
      if (/disabled|is-disabled/i.test(cls)) return true;
      return false;
    },

    /** 真实点击 */
    click(el) {
      if (!el) return false;
      try {
        el.focus();
        ['mousedown', 'mouseup', 'click'].forEach((type) => {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
      } catch (e) { warn('click fallback', e); el.click(); }
      return true;
    },

    /** 判断开关是否处于激活态 */
    isToggleActive(el) {
      if (!el) return false;
      const ap = el.getAttribute('aria-pressed');
      if (ap !== null) return ap === 'true';
      const ac = el.getAttribute('aria-checked');
      if (ac !== null) return ac === 'true';
      const cls = el.className || '';
      if (typeof cls === 'string' && /active|selected|on|checked|enabled/i.test(cls)) return true;
      const ds = el.dataset || {};
      if (ds.active === 'true' || ds.checked === 'true' || ds.selected === 'true') return true;
      return false;
    },

    /** 把开关切到目标态（若当前不符则点击） */
    async setToggle(el, wantActive) {
      if (!el) return false;
      const isActive = dom.isToggleActive(el);
      if (isActive === wantActive) return true;
      dom.click(el);
      await new Promise((r) => setTimeout(r, 250));
      return dom.isToggleActive(el) === wantActive;
    }
  };

  // ---------- 平台运行器：各平台 content script 调用 ----------
  /*
   * config: {
   *   key,                  // 平台 key
   *   getInputEl(),         // 返回输入框（textarea/input/contenteditable）
   *   getSendBtn(),         // 返回发送按钮
   *   findDeepThinkingToggle(),  // 可选：返回深度思考开关元素
   *   applyDeepThinking(enabled),  // 可选：自定义深度思考逻辑（如下拉框选择）
   *   noEnterFallback,      // 可选：禁用回车兜底（部分 SPA 对合成 Enter 事件敏感会崩页）
   * }
   */
  function runPlatform(config) {
    const A = globalThis.AISYNC;
    if (A.__registered && A.__registered[config.key]) {
      A.log('platform already registered:', config.key);
      return A.__registered[config.key];
    }
    A.log('platform runner start:', config.key);

    let settings = null;
    getSettings().then((s) => { settings = s; A.log('settings loaded', config.key, s); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      getSettings().then((s) => { settings = s; });
    });

    const readQuestion = () => {
      const el = config.getInputEl();
      return (dom.readText(el) || '').trim();
    };

    // 用户在本平台发起提问时，捕获并广播给其它平台
    const captureAndBroadcast = () => {
      if (A.forwarding) return;            // 转发产生的提交，不二次广播
      if (!settings || !settings.autoSync) return;
      const q = readQuestion();
      if (!q) return;
      A.log('broadcast question from', config.key, q.slice(0, 60));
      A.sendToBackground({ type: MSG.QUESTION_SUBMITTED, source: config.key, question: q });
    };

    // 监听发送按钮点击（capture 阶段，先于平台清空输入框）
    document.addEventListener('click', (e) => {
      const btn = config.getSendBtn();
      if (btn && (btn === e.target || btn.contains(e.target))) {
        captureAndBroadcast();
      }
    }, true);

    // 监听输入框内回车提交
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const input = config.getInputEl();
      if (input && (input === e.target || input.contains(e.target))) {
        captureAndBroadcast();
      }
    }, true);

    // 应用深度思考开关
    async function applyDeepThinking(enabled) {
      // 优先使用平台自定义的深度思考逻辑（如下拉框选择）
      if (config.applyDeepThinking) return config.applyDeepThinking(enabled);
      if (!config.findDeepThinkingToggle) return true;
      const toggle = await dom.waitFor(config.findDeepThinkingToggle, { timeout: 2500 });
      if (!toggle) { warn('deep-thinking toggle not found', config.key); return false; }
      return dom.setToggle(toggle, enabled);
    }

    // 用回车键提交（兜底方案，适用于找不到发送按钮时）
    function submitByEnter(input) {
      try {
        input.focus();
        const opts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keypress', opts));
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
        return true;
      } catch (e) {
        warn('submitByEnter error', e);
        return false;
      }
    }

    // 转发提问：填入文本 -> (可选)开启深度思考 -> 点击发送（或回车兜底）
    async function submitQuestion(question, deepThinking) {
      A.forwarding = true;
      try {
        const input = await dom.waitFor(config.getInputEl, { timeout: 8000 });
        if (!input) return { ok: false, error: '输入框未找到' };
        await dom.setInputText(input, question);
        await new Promise((r) => setTimeout(r, 300));
        if (deepThinking) await applyDeepThinking(true);

        // 优先点击发送按钮
        const btn = await dom.waitFor(config.getSendBtn, { timeout: 6000 });
        if (btn) {
          dom.click(btn);
          A.log('forwarded question to', config.key, 'via button');
          return { ok: true };
        }

        // 兜底：回车提交（部分平台对合成 Enter 敏感，可通过 noEnterFallback 禁用）
        if (config.noEnterFallback) {
          warn('send button not found, enter fallback disabled', config.key);
          return { ok: false, error: '发送按钮未找到' };
        }
        warn('send button not found, fallback to Enter', config.key);
        submitByEnter(input);
        A.log('forwarded question to', config.key, 'via Enter');
        return { ok: true };
      } catch (e) {
        warn('submitQuestion error', config.key, e);
        return { ok: false, error: String(e) };
      } finally {
        // 稍后释放，避免自身提交触发再次广播
        setTimeout(() => { A.forwarding = false; }, 2000);
      }
    }

    onBackgroundMessage((msg) => {
      if (msg.type === MSG.PING) return { ok: true, platform: config.key, ready: !!config.getInputEl() };
      if (msg.type === MSG.SUBMIT_QUESTION) {
        return submitQuestion(msg.question, !!msg.deepThinking);
      }
      return undefined;
    });

    A.log('platform runner ready:', config.key);
    const api = { submitQuestion, applyDeepThinking, captureAndBroadcast };
    if (!A.__registered) A.__registered = {};
    A.__registered[config.key] = api;
    return api;
  }

  globalThis.AISYNC = {
    __loaded: true,
    PLATFORMS,
    MSG,
    DEFAULTS,
    log,
    warn,
    getSettings,
    saveSettings,
    sendToBackground,
    onBackgroundMessage,
    dom,
    runPlatform,
    // 回环防护：当 content script 因转发而提交时置 true，避免再次广播
    forwarding: false
  };

  log('common loaded');
})();
