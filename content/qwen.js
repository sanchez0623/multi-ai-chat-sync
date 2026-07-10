/*
 * 通义千问 (www.qianwen.com) 平台适配
 * 选择器随前端改版可能失效，已保留多组兜底。
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  if (!A) return;

  const INPUT_SELECTORS = [
    '#chat-textbox',
    'textarea[id*="chat"]',
    'textarea[id*="input"]',
    'textarea[class*="chat"]',
    'textarea[class*="input"]',
    'div[contenteditable="true"][class*="chat"]',
    'div[contenteditable="true"][class*="input"]',
    'div[contenteditable="true"][class*="editor"]',
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
    'div[class*="input"] button:last-child',
    'div[class*="footer"] button:last-child',
    'div[class*="bottom"] button:last-child'
  ];

  const SEND_TEXTS = ['发送', 'Send', '发送消息', 'submit', 'send'];

  const TOOLBAR_SELECTORS = [
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="chat-input"]',
    'div[class*="operate"]',
    'div[class*="action"]',
    'div[class*="bottom"]'
  ];
  const THINK_TEXTS = ['深度思考', '思考模式', '深度搜索', '思考', 'Deep Thinking', 'Think'];

  A.runPlatform({
    key: 'qwen',
    // 千问 SPA 对合成 Enter 事件敏感，禁用回车兜底避免崩页
    noEnterFallback: true,
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      // 1. 选择器 + 文本匹配（限定在输入区附近，避免命中页头/侧边栏）
      const input = A.dom.first(INPUT_SELECTORS);
      let scope = input;
      if (scope) {
        let p = scope;
        for (let i = 0; i < 6 && p; i++) {
          const cls = (typeof p.className === 'string' ? p.className : '');
          if (/footer|input|editor|bottom|operate|action/i.test(cls)) { scope = p; break; }
          p = p.parentElement;
        }
      }
      const root = scope || document;
      const btn = A.dom.findSendButtonIn(root, SEND_SELECTORS, SEND_TEXTS);
      if (btn && !A.dom.isDisabled(btn)) return btn;
      // 2. 通过 SVG 图标引用定位（千问发送按钮：<use xlink:href="#qwpcicon-sendChat">）
      const uses = root.querySelectorAll('use');
      for (const use of uses) {
        const href = use.getAttribute('xlink:href') ||
                     use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                     use.getAttribute('href') || '';
        if (/send|发送/i.test(href)) {
          const clickable = use.closest('button, a, div[role="button"], [type="submit"], div[class*="send"]') || use.parentElement;
          if (clickable && !A.dom.isDisabled(clickable)) return clickable;
        }
      }
      return null;
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, ['深度思考', '思考模式']) ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    }
  });
})();
