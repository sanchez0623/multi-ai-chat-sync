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
      if (!enabled) return true;

      A.log('yuanbao: applyDeepThinking start');

      // ========== 1. 查找深度思考 toggle 按钮 ==========
      let toggle = null;

      // 1.1 在输入框附近找（向上找输入区容器，再在里面找）
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
      }

      // 1.2 兜底：在工具栏容器里找
      if (!toggle) {
        toggle = A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
      }

      // 1.3 终极兜底：全页按文本找（排除消息区干扰）
      if (!toggle) {
        const allClickables = document.querySelectorAll('button, [role="button"], label, div[class*="toggle"], div[class*="think"]');
        for (const n of allClickables) {
          if (n.closest('[class*="message"], [class*="chat-list"], [class*="conversation"], [class*="sidebar"], nav, header')) continue;
          const txt = (n.textContent || '').trim();
          if (txt && THINK_TEXTS.some((t) => txt === t || txt.includes(t)) && txt.length < 20) {
            toggle = n;
            break;
          }
        }
      }

      if (!toggle) {
        A.warn('yuanbao: deep-thinking toggle not found');
        return false;
      }
      A.log('yuanbao: found deep-thinking toggle, text=', (toggle.textContent || '').trim().slice(0, 30));

      // ========== 2. 检查是否已经激活 ==========
      const isActive = A.dom.isToggleActive(toggle);
      if (isActive) {
        A.log('yuanbao: deep-thinking already active');
        return true;
      }

      // ========== 3. 点击切换 ==========
      A.dom.click(toggle);
      await new Promise((r) => setTimeout(r, 400));

      // ========== 4. 验证切换结果 ==========
      const nowActive = A.dom.isToggleActive(toggle);
      A.log('yuanbao: deep-thinking toggle', nowActive ? 'success' : 'failed');
      return nowActive;
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    },
    getAnswerText() {
      return A.dom.lastAnswerText(ANSWER_SELECTORS);
    }
  });
})();
