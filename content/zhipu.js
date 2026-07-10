/*
 * 智谱清言 (chatglm.cn / chat.zhipu.ai) 平台适配
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  if (!A) return;

  const INPUT_SELECTORS = [
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea',
    '#chat-input'
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
    'div[class*="operate"]'
  ];
  const THINK_TEXTS = ['深度思考', '深度搜索', '思考', 'Deep Thinking'];

  A.runPlatform({
    key: 'zhipu',
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
