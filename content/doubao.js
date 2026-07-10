/*
 * 豆包 (www.doubao.com) 平台适配
 * 豆包输入区为 flow/contenteditable 富文本编辑器，选择器随改版可能失效。
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  if (!A) return;

  const INPUT_SELECTORS = [
    'div[contenteditable="true"][data-lexical-editor]',
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
    'div[class*="input-area"]',
    'div[class*="footer"]',
    'div[class*="toolbar"]',
    'div[class*="chat-input"]',
    'div[class*="flow"]'
  ];
  const THINK_TEXTS = ['深度思考', '深度搜索', '深度联网', '思考', 'Deep Thinking'];

  A.runPlatform({
    key: 'doubao',
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      return A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, ['深度思考', '深度搜索']) ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    }
  });
})();
