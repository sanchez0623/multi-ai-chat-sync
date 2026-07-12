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

  // 豆包模式选择器（Radix UI dropdown-menu）
  // 触发器：<button data-slot="dropdown-menu-trigger" aria-haspopup="menu">
  //         内部 <div data-valid-btn="mode-select-action-btn">，显示当前模式名（如"快速"）
  const MODE_TRIGGER_SELECTORS = [
    '[data-slot="dropdown-menu-trigger"]',
    '[data-valid-btn="mode-select-action-btn"]',
    'div[class*="mode-select"]',
    'div[class*="model-select"]',
    'div[role="combobox"]'
  ];
  // 用于识别触发器：当前显示的模式名
  const MODE_TRIGGER_TEXTS = ['专家', '深度思考', '标准', '对话', '快速'];
  // 深度思考目标模式名（按优先级尝试匹配菜单项）
  const DEEP_MODE_NAMES = ['专家', '深度思考', '思考'];

  A.runPlatform({
    key: 'doubao',
    answerSelectors: [
      'div[class*="receive-message"]',
      'div[class*="message-content"][class*="receive"]',
      'div[class*="chat-content"] div[class*="receive"]',
      'div[class*="conversation"] div[class*="receive"]',
      'div[data-type="assistant"]',
      'div[class*="answer-item"]',
      'div[class*="markdown-body"]:last-of-type',
      'div[class*="bubble-content"]:last-of-type'
    ],
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      return A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
    },
    // 豆包深度思考：点击模式 dropdown trigger -> 在 radix menu 中选"专家"
    async applyDeepThinking(enabled) {
      if (!enabled) return true;

      // 1. 查找模式触发器
      let trigger = A.dom.first(MODE_TRIGGER_SELECTORS);
      if (!trigger) {
        // 兜底：在输入区附近找含模式文本的可点击元素
        const containers = [
          'div[class*="input-area"]', 'div[class*="footer"]',
          'div[class*="toolbar"]', 'div[class*="chat-input"]'
        ];
        for (const sel of containers) {
          const scope = document.querySelector(sel);
          if (!scope) continue;
          const nodes = scope.querySelectorAll('div[role="button"], div[class*="select"], div[class*="trigger"], button');
          for (const n of nodes) {
            const txt = (n.textContent || '').trim();
            if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 20) {
              trigger = n; break;
            }
          }
          if (trigger) break;
        }
      }
      if (!trigger) { A.warn('doubao: mode trigger not found'); return false; }

      // 2. 当前已是目标深度模式则跳过
      const currentText = (trigger.textContent || '').trim();
      if (DEEP_MODE_NAMES.some((t) => currentText.includes(t))) {
        A.log('doubao: already deep mode', currentText);
        return true;
      }

      // 3. 点击打开 radix dropdown 菜单
      A.dom.click(trigger);

      // 4. 等待菜单项渲染（radix 菜单 portal 到 body，选项为 [role="menuitem"]）
      const menu = await A.dom.waitFor(
        () => document.querySelector('[role="menuitem"], [role="menuitemradio"], [role="option"]'),
        { timeout: 2500 }
      );
      if (!menu) {
        A.warn('doubao: dropdown menu not rendered');
        // 点别处关闭
        document.body.click();
        return false;
      }
      await new Promise((r) => setTimeout(r, 200));

      // 5. 遍历菜单项，匹配目标深度模式名
      const items = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]');
      for (const item of items) {
        const txt = (item.textContent || '').trim();
        if (txt && DEEP_MODE_NAMES.some((t) => txt.includes(t)) && txt.length < 20) {
          A.dom.click(item);
          A.log('doubao: selected deep mode:', txt);
          await new Promise((r) => setTimeout(r, 300));
          return true;
        }
      }
      A.warn('doubao: deep mode option not found in menu, items=', items.length);
      // 关闭菜单
      document.body.click();
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
