/*
 * 元宝 (yuanbao.tencent.com) 平台适配
 * 选择器随前端改版可能失效，已在每处保留多组兜底；如失效请更新下方候选选择器。
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  if (!A) return;

  const INPUT_SELECTORS = [
    '#chat-input textarea',
    '#chat-input [contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea'
  ];

  const SEND_SELECTORS = [
    '#yuanbao-send-btn',
    '#chat-input button[class*="send"]',
    'button[class*="send"]',
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]',
    '#chat-input button:last-child',
    'div[class*="input"] button:last-child',
    'div[class*="footer"] button:last-child'
  ];

  const SEND_TEXTS = ['发送', '发送消息', 'Send', 'submit', 'send'];

  // 深度思考开关所在容器（输入框工具栏）候选
  const TOOLBAR_SELECTORS = [
    '#chat-input',
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="bottom"]'
  ];
  const THINK_TEXTS = ['深度思考', '深度搜索', '思考', 'Deep Thinking'];

  // 助手回答容器候选（取最后一条）
  const ANSWER_SELECTORS = [
    '#chat-area div[class*="answer"]',
    '#chat-area div[class*="receive"]',
    '#chat-area div[class*="assistant"]',
    '#chat-area div[class*="agent"]',
    'div[class*="conversation"] div[class*="answer"]',
    'div[class*="message-list"] div[class*="answer"]',
    'div[class*="chat-list"] div[class*="receive"]',
    'div[class*="agent-text"]',
    'div[class*="answer-text"]',
    'div[class*="markdown-body"]:last-of-type'
  ];

  A.runPlatform({
    key: 'yuanbao',
    answerSelectors: ANSWER_SELECTORS,
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      return A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
    },
    // 元宝深度思考：点击输入框左下角的"深度思考"toggle 按钮
    async applyDeepThinking(enabled) {
      A.log('yuanbao: applyDeepThinking start, enable=', enabled);

      // ========== 1. 精准查找深度思考 toggle 按钮 ==========
      let toggle = null;
      let findMethod = '';

      // 1.1 最精准：dt-button-id 属性
      toggle = document.querySelector('[dt-button-id="deep_think"]');
      if (toggle) { findMethod = 'dt-button-id'; }

      // 1.2 兜底：aria-label
      if (!toggle) {
        toggle = document.querySelector('[aria-label="深度思考"]');
        if (toggle) { findMethod = 'aria-label'; }
      }

      // 1.3 再兜底：按文本在工具栏找
      if (!toggle) {
        const input = A.dom.first(INPUT_SELECTORS);
        if (input) {
          let scope = input;
          let p = input.parentElement;
          for (let i = 0; i < 8 && p; i++) {
            const cls = (typeof p.className === 'string' ? p.className : '');
            if (/input-area|editor|footer|bottom|toolbar|chat-input/i.test(cls)) { scope = p; break; }
            p = p.parentElement;
          }
          toggle = A.dom.findByText([scope], THINK_TEXTS);
          if (toggle) { findMethod = 'text-in-input'; }
        }
      }

      // 1.4 终极兜底：全页文本找
      if (!toggle) {
        const allClickables = document.querySelectorAll('button, [role="button"], div[class*="think"], div[class*="toggle"]');
        for (const n of allClickables) {
          if (n.closest('[class*="message"], [class*="chat-list"], [class*="conversation"], [class*="sidebar"], nav, header')) continue;
          const txt = (n.textContent || '').trim();
          if (txt && THINK_TEXTS.some((t) => txt === t || txt.includes(t)) && txt.length < 20) {
            toggle = n;
            findMethod = 'text-scan';
            break;
          }
        }
      }

      if (!toggle) {
        A.warn('yuanbao: deep-thinking toggle not found');
        return false;
      }
      const toggleText = (toggle.textContent || '').trim();
      const toggleClass = (toggle.className || '').toString();
      A.log('yuanbao: found deep-thinking toggle, text=', toggleText.slice(0, 30),
            'tag=', toggle.tagName,
            'findMethod=', findMethod,
            'aria-pressed=', toggle.getAttribute('aria-pressed'),
            'aria-checked=', toggle.getAttribute('aria-checked'),
            'class=', toggleClass.slice(0, 80));

      // ========== 2. 检查当前状态 ==========
      const checkActive = (el) => {
        // 优先检查 aria 属性
        if (el.getAttribute('aria-pressed') === 'true') return true;
        if (el.getAttribute('aria-checked') === 'true') return true;
        // 检查 class 中是否有激活态关键词
        const cls = (el.className || '').toString();
        if (/(?:active|selected|on|enabled|_active|_on|isActive|isOn)/i.test(cls)) return true;
        // 检查父元素的 class 和 aria
        const parent = el.parentElement;
        if (parent) {
          const pCls = (parent.className || '').toString();
          if (/(?:active|selected|on|enabled|_active|_on|isActive|isOn)/i.test(pCls)) return true;
          if (parent.getAttribute('aria-pressed') === 'true') return true;
          if (parent.getAttribute('aria-checked') === 'true') return true;
        }
        return false;
      };

      const isActive = checkActive(toggle);
      A.log('yuanbao: current state isActive=', isActive, ', target enabled=', enabled);

      if (isActive === enabled) {
        A.log('yuanbao: already in target state, skip');
        return true;
      }

      // ========== 3. 点击切换 ==========
      const clickEl = (el) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: cx,
          clientY: cy,
          button: 0,
          buttons: 1
        };
        try {
          el.dispatchEvent(new PointerEvent('pointerdown', opts));
          el.dispatchEvent(new PointerEvent('pointerup', opts));
        } catch (e) { /* 忽略 */ }
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        el.click();
      };

      clickEl(toggle);
      await new Promise((r) => setTimeout(r, 500));

      // ========== 4. 验证切换结果 ==========
      const nowActive = checkActive(toggle);
      A.log('yuanbao: deep-thinking toggle', nowActive ? 'active' : 'inactive',
            'success=', nowActive === enabled,
            'newClass=', (toggle.className || '').toString().slice(0, 80));

      // 如果第一次点击没生效，再点一次
      if (nowActive !== enabled) {
        A.log('yuanbao: first click did not work, clicking again');
        clickEl(toggle);
        await new Promise((r) => setTimeout(r, 500));
        const retryActive = checkActive(toggle);
        A.log('yuanbao: after retry, active=', retryActive);
        return retryActive === enabled;
      }

      return nowActive === enabled;
    },
    findDeepThinkingToggle() {
      return document.querySelector('[dt-button-id="deep_think"]') ||
             document.querySelector('[aria-label="深度思考"]') ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    },
    getAnswerText() {
      return A.dom.lastAnswerText(ANSWER_SELECTORS);
    }
  });
})();
