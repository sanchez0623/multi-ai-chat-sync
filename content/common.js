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
    STATUS: 'STATUS',                         // content -> bg/popup: 当前页面状态
    ANSWER_UPDATE: 'ANSWER_UPDATE'            // content -> bg: 上报当前回答文本与状态
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

    /**
     * 收集页面上所有候选回答文本（平台选择器 + 通用兜底），返回数组。
     * 用于：
     *  - 提交前快照已有回答（旧轮次），提交后只接受快照外的新文本，避免把旧回答当成新回答
     *  - 取最长者作为当前回答
     */
    listAnswerTexts(selectors, question) {
      const q = (question || '').trim();
      const qSig = q.slice(0, 40);
      const out = [];
      const seen = new Set();
      const push = (txt) => {
        if (!txt || txt.length < 20) return;
        // 排除与提问高度重合的短容器（用户消息回显）
        if (qSig && txt.includes(qSig) && txt.length < q.length + 50) return;
        if (seen.has(txt)) return;
        seen.add(txt);
        out.push(txt);
      };
      const extract = (el) => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('textarea, input, button, [contenteditable="true"], [class*="action"], [class*="toolbar"], svg, img').forEach((n) => n.remove());
        return (clone.innerText || clone.textContent || '').trim();
      };
      // 平台专用选择器
      if (selectors && selectors.length) {
        for (const s of selectors) {
          try { document.querySelectorAll(s).forEach((el) => push(extract(el))); } catch (e) {}
        }
      }
      // 通用兜底选择器
      const generic = [
        '[class*="answer"]', '[class*="reply"]', '[class*="receive"]',
        '[class*="assistant"]', '[class*="agent"]', '[class*="markdown"]',
        '[class*="bubble"]', '[class*="segment"]', '[class*="message-item"]',
        '[class*="msg-item"]', '[class*="chat-item"]', '[class*="detail"]'
      ];
      for (const s of generic) {
        try {
          document.querySelectorAll(s).forEach((el) => {
            // 跳过输入区/工具栏/导航内的元素
            if (el.closest('textarea, input, [contenteditable="true"], [class*="input-area"], [class*="editor"], [class*="toolbar"], nav, header')) return;
            push(extract(el));
          });
        } catch (e) {}
      }
      return out;
    },

    /**
     * 抽取最近一条助手回答文本：返回所有候选中文本最长者。
     * （保留供各平台 getAnswerText 使用；多轮差异比对请用 listAnswerTexts）
     */
    lastAnswerText(selectors, question) {
      const list = dom.listAnswerTexts(selectors, question);
      if (!list.length) return '';
      return list.reduce((a, b) => (b.length > a.length ? b : a), '');
    },

    /** 通用回答抽取兜底：取最长文本。 */
    answerTextGeneric(question) {
      return dom.lastAnswerText([], question);
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
   *                                 // enabled=true  进入深度思考，false 切回普通/快速模式
   *                                 // 内部应自行判断当前态，已在目标态直接 return true
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
      // 在平台真正发送前，快照当前页面上已有的回答文本（旧轮次），
      // collectAnswer 只接受快照外的新文本，避免把旧回答当成本轮回答
      const excludeTexts = new Set(dom.listAnswerTexts(config.answerSelectors || [], q));
      A.log('broadcast question from', config.key, q.slice(0, 60), 'exclude=', excludeTexts.size);
      // 不阻塞点击事件：异步获取 sessionId 后开始收集本平台回答
      A.sendToBackground({ type: MSG.QUESTION_SUBMITTED, source: config.key, question: q })
        .then((resp) => {
          if (resp && resp.ok && resp.sessionId) {
            collectAnswer(resp.sessionId, q, excludeTexts);
          }
        });
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
    // 返回 { ok, error?, _excludeTexts }：_excludeTexts 为发送前已有回答文本快照，
    // 供 collectAnswer 排除旧轮次回答
    async function submitQuestion(question, deepThinking) {
      A.forwarding = true;
      try {
        const input = await dom.waitFor(config.getInputEl, { timeout: 8000 });
        if (!input) return { ok: false, error: '输入框未找到' };
        await dom.setInputText(input, question);
        await new Promise((r) => setTimeout(r, 300));
        // 始终按目标态调用，确保页面与设置一致：
        // - 当前在 深度思考(专家) 但要求快速 -> 切回快速
        // - 当前在 快速 但要求深度思考 -> 切到专家
        // 各平台 applyDeepThinking 内部有"已在目标态则直接 return true"逻辑，
        // 对其它早已 return true 的平台（kimi/yuanbao/zhipu）无副作用。
        await applyDeepThinking(!!deepThinking);

        // 发送前快照当前页面上已有的回答文本（旧轮次），collectAnswer 只接受快照外的新文本
        const excludeTexts = new Set(dom.listAnswerTexts(config.answerSelectors || [], question));

        // 优先点击发送按钮
        const btn = await dom.waitFor(config.getSendBtn, { timeout: 6000 });
        if (btn) {
          dom.click(btn);
          A.log('forwarded question to', config.key, 'via button');
          return { ok: true, _excludeTexts: excludeTexts };
        }

        // 兜底：回车提交（部分平台对合成 Enter 敏感，可通过 noEnterFallback 禁用）
        if (config.noEnterFallback) {
          warn('send button not found, enter fallback disabled', config.key);
          return { ok: false, error: '发送按钮未找到' };
        }
        warn('send button not found, fallback to Enter', config.key);
        submitByEnter(input);
        A.log('forwarded question to', config.key, 'via Enter');
        return { ok: true, _excludeTexts: excludeTexts };
      } catch (e) {
        warn('submitQuestion error', config.key, e);
        return { ok: false, error: String(e) };
      } finally {
        // 稍后释放，避免自身提交触发再次广播
        setTimeout(() => { A.forwarding = false; }, 2000);
      }
    }

    // 收集本平台回答：轮询抽取，过滤掉 excludeTexts（旧轮次），取最长新文本；
    // 文本稳定后上报 done。同一 sessionId 仅启动一次收集
    const collecting = new Set();
    function collectAnswer(sessionId, question, excludeTexts) {
      if (!sessionId || collecting.has(sessionId)) return;
      collecting.add(sessionId);
      const exclude = excludeTexts || new Set();
      A.log('start collectAnswer', config.key, sessionId, 'exclude=', exclude.size);

      const INTERVAL = 2000;
      const MAX_WAIT = 120000;        // 最长收集 2 分钟
      const STABLE_ROUNDS = 2;        // 连续 2 轮（4s）无变化视为稳定
      const EMPTY_THRESHOLD = 6;      // 连续 6 轮（12s）没新文本，认为平台没回答
      const start = Date.now();
      let lastText = '';
      let stableCount = 0;
      let emptyCount = 0;
      let firstTickDone = false;

      const tick = () => {
        // ========== 首次 tick：刷新一次 exclude ==========
        // 修元宝/豆包这类 SPA 的"提交时旧气泡还在 transition、新气泡尚未渲染"
        // 场景：applyDeepThinking 点击工具栏可能扰动 DOM，导致初始 exclude 抓不全，
        // 几百毫秒后旧回答才"晚到"进入 chat 列表 —— 不刷新就会被当作新回答上报。
        if (!firstTickDone) {
          try {
            const list = dom.listAnswerTexts(config.answerSelectors || [], question);
            for (const t of list) exclude.add(t);
            A.log('collectAnswer: refreshed exclude on first tick, size=', exclude.size);
          } catch (e) { /* ignore */ }
          firstTickDone = true;
        }

        let text = '';
        let listLen = 0;
        try {
          const list = dom.listAnswerTexts(config.answerSelectors || [], question);
          listLen = list.length;
          // 只保留发送快照之后新出现的文本
          const fresh = list.filter((t) => !exclude.has(t));
          if (fresh.length) {
            // 取最长的新文本作为当前回答
            fresh.sort((a, b) => b.length - a.length);
            text = fresh[0];
          }
        } catch (e) { text = ''; }
        A.log('collectAnswer tick', config.key, sessionId,
              'list=', listLen,
              'fresh=', (text ? 1 : 0),
              'textLen=', text.length, 'lastTextLen=', lastText.length);

        if (text && text !== lastText) {
          stableCount = 0;
          emptyCount = 0;
          lastText = text;
          A.sendToBackground({ type: MSG.ANSWER_UPDATE, sessionId, platform: config.key, status: 'sending', answer: text });
        } else if (text && text === lastText) {
          stableCount++;
          emptyCount = 0;
          if (stableCount >= STABLE_ROUNDS) {
            A.sendToBackground({ type: MSG.ANSWER_UPDATE, sessionId, platform: config.key, status: 'done', answer: text });
            collecting.delete(sessionId);
            A.log('collectAnswer done', config.key, sessionId, text.slice(0, 60));
            return;
          }
        } else if (!text) {
          // 没新文本：可能平台没回答（敏感词、拒答、错误页等）
          emptyCount++;
          stableCount = 0;
          if (emptyCount >= EMPTY_THRESHOLD) {
            A.sendToBackground({ type: MSG.ANSWER_UPDATE, sessionId, platform: config.key, status: 'done', answer: '' });
            collecting.delete(sessionId);
            A.log('collectAnswer no answer after', EMPTY_THRESHOLD, 'ticks, marking done', config.key, sessionId);
            return;
          }
        }

        if (Date.now() - start >= MAX_WAIT) {
          // 超时：若有文本则标记 done，否则不再上报
          if (lastText) {
            A.sendToBackground({ type: MSG.ANSWER_UPDATE, sessionId, platform: config.key, status: 'done', answer: lastText });
          }
          collecting.delete(sessionId);
          A.log('collectAnswer timeout', config.key, sessionId);
          return;
        }
        setTimeout(tick, INTERVAL);
      };
      // 首次延迟，等待回答开始渲染
      setTimeout(tick, 1500);
    }

    onBackgroundMessage((msg) => {
      A.log('onBackgroundMessage:', config.key, msg && msg.type, msg && (msg.question || '').slice && (msg.question || '').slice(0, 30));
      if (msg.type === MSG.PING) return { ok: true, platform: config.key, ready: !!config.getInputEl() };
      if (msg.type === MSG.SUBMIT_QUESTION) {
        return (async () => {
          const r = await submitQuestion(msg.question, !!msg.deepThinking);
          // 提交成功后开始收集本平台回答，上报给 background 聚合
          if (r && r.ok && msg.sessionId) {
            collectAnswer(msg.sessionId, msg.question, r._excludeTexts);
          }
          // _excludeTexts 是 Set，无法跨消息序列化，从响应中剥离
          const { _excludeTexts, ...resp } = r || {};
          return resp;
        })();
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
