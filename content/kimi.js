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
      // 1. 选择器 + 文本匹配（限定在输入区附近，避免命中侧边栏的同类元素）
      const input = A.dom.first(INPUT_SELECTORS);
      let scope = input;
      if (scope) {
        // 向上找到输入区/页脚容器，限定搜索范围
        let p = scope;
        for (let i = 0; i < 6 && p; i++) {
          const cls = (typeof p.className === 'string' ? p.className : '');
          if (/footer|input|editor|bottom|action/i.test(cls)) { scope = p; break; }
          p = p.parentElement;
        }
      }
      const root = scope || document;
      const btn = A.dom.findSendButtonIn(root, SEND_SELECTORS, SEND_TEXTS);
      if (btn && !A.dom.isDisabled(btn)) return btn;
      // 2. 在输入区附近查找发送图标（<svg class="iconify send-icon" name="Send">），点击其父容器
      const icon = root.querySelector('svg.send-icon, .send-icon, svg[name="Send"]') ||
                   document.querySelector('svg.send-icon, .send-icon, svg[name="Send"]');
      if (icon) {
        // 直接点击 svg 的父元素（Kimi 的发送按钮结构是 div > svg.send-icon）
        const parent = icon.parentElement;
        if (parent && !A.dom.isDisabled(parent)) return parent;
      }
      return null;
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, ['深度思考']) ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    }
  });
})();
