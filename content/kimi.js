/*
 * Kimi (www.kimi.com) 平台适配
 * Kimi 输入区为 textarea 或 contenteditable，深度思考视账号是否开放"思考"模式。
 * 选择器随前端改版可能失效，已保留多组兜底。
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  if (!A) return;

  const INPUT_SELECTORS = [
    'textarea.editor',
    'textarea[class*="editor"]',
    '#chat-input textarea',
    'textarea[id*="chat"]',
    'textarea[id*="input"]',
    'div[contenteditable="true"][class*="editor"]',
    'div[contenteditable="true"][class*="chat"]',
    'div[contenteditable="true"][class*="input"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea'
  ];

  const SEND_SELECTORS = [
    'button[class*="send"]',
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'div[role="button"][aria-label*="发送"]',
    'div[role="button"][aria-label*="Send"]',
    'button[type="submit"]',
    'button[class*="submit"]'
  ];

  const SEND_TEXTS = ['发送', 'Send', '发送消息'];

  const TOOLBAR_SELECTORS = [
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="chat-input"]',
    'div[class*="editor-footer"]',
    'div[class*="action"]',
    'div[class*="bottom"]'
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
