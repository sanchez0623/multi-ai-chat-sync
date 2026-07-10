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
    'div[class*="footer"]'
  ];
  const THINK_TEXTS = ['深度思考', '深度搜索', '思考', 'Deep Thinking'];

  A.runPlatform({
    key: 'yuanbao',
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
