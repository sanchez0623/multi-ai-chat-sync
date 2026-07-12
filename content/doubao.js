/*
 * 豆包 (www.doubao.com) 平台适配
 * 豆包输入区为 flow/contenteditable 富文本编辑器，选择器随改版可能失效。
 * 豆包深度思考通过下拉框选择"专家"模式实现，而非 toggle 开关。
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

  // 模式选择器下拉框相关候选
  const MODE_TRIGGER_SELECTORS = [
    'div[class*="mode-select"]',
    'div[class*="model-select"]',
    'div[role="combobox"]',
    'div[class*="dropdown-trigger"]',
    'div[class*="select-trigger"]'
  ];
  const MODE_TRIGGER_TEXTS = ['专家', '深度思考', '标准', '对话'];

  A.runPlatform({
    key: 'doubao',
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      return A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
    },
    // 豆包深度思考：点击模式下拉框 -> 选择"专家"
    async applyDeepThinking(enabled) {
      if (!enabled) return true;
      // 查找模式选择器触发器（显示当前模式文本的元素）
      let trigger = A.dom.first(MODE_TRIGGER_SELECTORS);
      if (!trigger) {
        // 兜底：在输入区附近查找包含模式文本的可点击元素
        const containers = [
          'div[class*="input-area"]',
          'div[class*="footer"]',
          'div[class*="toolbar"]',
          'div[class*="chat-input"]'
        ];
        for (const sel of containers) {
          const scope = document.querySelector(sel);
          if (!scope) continue;
          const nodes = scope.querySelectorAll('div[role="button"], div[class*="select"], div[class*="trigger"], button');
          for (const n of nodes) {
            const txt = (n.textContent || '').trim();
            if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 20) {
              trigger = n;
              break;
            }
          }
          if (trigger) break;
        }
      }
      if (!trigger) { A.warn('doubao: mode trigger not found'); return false; }

      // 如果当前已经是"专家"模式则无需操作
      const currentText = (trigger.textContent || '').trim();
      if (currentText.includes('专家')) return true;

      // 点击打开下拉框
      A.dom.click(trigger);
      await new Promise((r) => setTimeout(r, 500));

      // 在下拉列表中查找"专家"选项
      const optionSelectors = [
        'div[class*="option"]',
        'div[class*="item"]',
        'li[role="option"]',
        'div[role="option"]',
        'div[class*="menu"] div',
        'div[class*="dropdown"] div'
      ];
      for (const sel of optionSelectors) {
        const options = document.querySelectorAll(sel);
        for (const opt of options) {
          const txt = (opt.textContent || '').trim();
          if (txt === '专家' || (txt.includes('专家') && txt.length < 20)) {
            A.dom.click(opt);
            A.log('doubao: selected 专家 mode');
            await new Promise((r) => setTimeout(r, 300));
            return true;
          }
        }
      }
      A.warn('doubao: 专家 option not found in dropdown');
      return false;
    },
    findDeepThinkingToggle() {
      return null; // 豆包使用自定义 applyDeepThinking，不需要 toggle
    },
    getAnswerText() {
      // 豆包回答区：消息流中助手侧消息容器
      return A.dom.lastAnswerText([
        'div[class*="receive-message"]',
        'div[class*="message-content"][class*="receive"]',
        'div[class*="chat-content"] div[class*="receive"]',
        'div[class*="conversation"] div[class*="receive"]',
        'div[data-type="assistant"]',
        'div[class*="answer-item"]',
        'div[class*="markdown-body"]:last-of-type',
        'div[class*="bubble-content"]:last-of-type'
      ]);
    }
  });
})();
