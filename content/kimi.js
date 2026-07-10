/*
 * Kimi (kimi.moonshot.cn / kimi.com) 平台适配
 * Kimi 输入区为 textarea（.editor），深度思考视账号是否开放"思考"模式。
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  if (!A) return;

  const INPUT_SELECTORS = [
    'textarea.editor',
    '#chat-input textarea',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea'
  ];

  const SEND_SELECTORS = [
    'button[class*="send"]',
    'button[aria-label*="发送"]',
    'div[role="button"][aria-label*="发送"]',
    'button[type="submit"]'
  ];

  const SEND_TEXTS = ['发送', 'Send'];

  const TOOLBAR_SELECTORS = [
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="chat-input"]',
    'div[class*="editor-footer"]'
  ];
  const THINK_TEXTS = ['深度思考', '思考', 'Deep Thinking', 'Think'];

  A.runPlatform({
    key: 'kimi',
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      return A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, ['深度思考']) ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    }
  });
})();
