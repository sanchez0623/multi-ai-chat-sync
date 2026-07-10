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
    'button[aria-label*="Send"]',
    'div[role="button"][aria-label*="发送"]',
    'div[role="button"][aria-label*="Send"]',
    'button[type="submit"]',
    'div[class*="input"] button:last-child',
    'div[class*="footer"] button:last-child',
    'div[class*="bottom"] button:last-child'
  ];

  const SEND_TEXTS = ['发送', 'Send', 'submit', 'send'];

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
      // 1. 选择器 + 文本匹配
      const btn = A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
      if (btn && !A.dom.isDisabled(btn)) return btn;
      // 2. 通过发送图标定位（智谱发送按钮为 <img class="enter_icon">，取其可点击祖先）
      const icon = document.querySelector('img.enter_icon, .enter_icon');
      if (icon) {
        const clickable = icon.closest('button, a, div[role="button"], [type="submit"], div[class*="send"], div[class*="submit"]');
        if (clickable && !A.dom.isDisabled(clickable)) return clickable;
        // 兜底：逐层向上找带点击事件的容器
        let parent = icon.parentElement;
        while (parent && parent !== document.body) {
          if (parent.tagName === 'BUTTON' || parent.tagName === 'A' ||
              parent.getAttribute('role') === 'button' ||
              /send|submit|enter/i.test(parent.className || '')) {
            if (!A.dom.isDisabled(parent)) return parent;
          }
          parent = parent.parentElement;
        }
      }
      return null;
    },
    findDeepThinkingToggle() {
      return A.dom.findByText(TOOLBAR_SELECTORS, ['深度思考', '深度搜索']) ||
             A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
    }
  });
})();
