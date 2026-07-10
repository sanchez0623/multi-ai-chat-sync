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
    'button[class*="submit"]',
    'div[class*="editor-footer"] button:last-child',
    'div[class*="footer"] button:last-child',
    'div[class*="bottom"] button:last-child'
  ];

  const SEND_TEXTS = ['发送', 'Send', '发送消息', 'submit', 'send'];

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
      // 1. 选择器 + 文本匹配
      const btn = A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
      if (btn && !A.dom.isDisabled(btn)) return btn;
      // 2. 通过发送图标定位（Kimi 发送按钮为 <svg class="iconify send-icon" name="Send">，取其可点击祖先）
      const icon = document.querySelector('svg.send-icon, .send-icon, svg[name="Send"]');
      if (icon) {
        const clickable = icon.closest('button, a, div[role="button"], [type="submit"], div[class*="send"], div[class*="submit"]');
        if (clickable && !A.dom.isDisabled(clickable)) return clickable;
        let parent = icon.parentElement;
        while (parent && parent !== document.body) {
          if (parent.tagName === 'BUTTON' || parent.tagName === 'A' ||
              parent.getAttribute('role') === 'button' ||
              /send|submit/i.test(parent.className || '')) {
            if (!A.dom.isDisabled(parent)) return parent;
          }
          parent = parent.parentElement;
        }
      }
      return null;
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, ['深度思考']) ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    }
  });
})();
