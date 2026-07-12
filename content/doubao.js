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
  // 触发器外层：<div data-valid-btn="mode-select-action-btn">（稳定属性）
  //   内层 <button data-checked="true|false">：
  //     - "专家"激活时 data-checked="true"，按钮文字显示"专家"，图标 active_mode_pro.png
  //     - 非深度模式（如"快速"）时无 data-checked 或 data-checked="false"
  const MODE_TRIGGER_SELECTORS = [
    '[data-valid-btn="mode-select-action-btn"]',
    '[data-slot="dropdown-menu-trigger"]',
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
    // 豆包深度思考：通过 data-checked 判断当前态，未激活则点开 dropdown 选"专家"
    async applyDeepThinking(enabled) {
      if (!enabled) return true;

      // 1. 查找模式触发器外层（div[data-valid-btn]）或兜底
      let wrap = A.dom.first(MODE_TRIGGER_SELECTORS);
      if (!wrap) {
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
              wrap = n; break;
            }
          }
          if (wrap) break;
        }
      }
      if (!wrap) { A.warn('doubao: mode trigger not found'); return false; }

      // 触发器是 wrap 内的 button（带 data-checked），点击它打开下拉
      const triggerBtn = wrap.querySelector('button[data-checked], button[data-dbx-name="button"]') || wrap;

      // 2. 用 data-checked 精准判断当前是否已激活深度模式
      const checked = triggerBtn.getAttribute('data-checked');
      if (checked === 'true') {
        A.log('doubao: already deep mode (data-checked=true)');
        return true;
      }
      // 兜底：按文字判断
      const currentText = (wrap.textContent || '').trim();
      if (DEEP_MODE_NAMES.some((t) => currentText.includes(t))) {
        A.log('doubao: already deep mode by text', currentText);
        return true;
      }

      // 3. 点击打开 radix dropdown 菜单
      A.dom.click(triggerBtn);

      // 4. 等待菜单项渲染（radix 菜单 portal 到 body，选项为 [role="menuitem"]）
      const menu = await A.dom.waitFor(
        () => document.querySelector('[role="menuitem"], [role="menuitemradio"], [role="option"]'),
        { timeout: 2500 }
      );
      if (!menu) {
        A.warn('doubao: dropdown menu not rendered');
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
