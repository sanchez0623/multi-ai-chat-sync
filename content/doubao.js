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

  // 豆包模式选择器（Radix UI / 自研下拉菜单）
  // 触发器：底部工具栏显示当前模式名的按钮（"专家"、"快速"等）
  const MODE_TRIGGER_SELECTORS = [
    '[data-valid-btn="mode-select-action-btn"]',
    '[data-slot="dropdown-menu-trigger"]',
    'div[class*="mode-select"]',
    'div[class*="model-select"]',
    'button[class*="mode-select"]',
    'div[role="combobox"]'
  ];
  // 触发器容器候选（输入框附近的工具栏）
  const TOOLBAR_CONTAINERS = [
    'div[class*="input-area"]',
    'div[class*="chat-input"]',
    'div[class*="editor-footer"]',
    'div[class*="footer"]',
    'div[class*="toolbar"]',
    'div[class*="bottom"]'
  ];
  // 用于识别触发器：当前显示的模式名
  const MODE_TRIGGER_TEXTS = ['专家', '快速', '深度思考', '标准', '对话'];
  // 深度思考目标模式名（按优先级尝试匹配菜单项）
  const DEEP_MODE_NAMES = ['专家', '深度思考', '思考'];
  // 菜单容器选择器（下拉菜单可能 portal 到 body）
  const MENU_ITEM_SELECTORS = [
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    'div[class*="menu-item"]',
    'div[class*="dropdown-item"]',
    'li[class*="item"]'
  ];

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
    // 豆包深度思考：点开模式下拉菜单，选择"专家"模式
    async applyDeepThinking(enabled) {
      if (!enabled) return true;

      A.log('doubao: applyDeepThinking start');

      // ========== 1. 查找模式触发器 ==========
      let trigger = null;

      // 1.1 优先用选择器找
      trigger = A.dom.first(MODE_TRIGGER_SELECTORS);
      if (trigger) {
        const btn = trigger.querySelector('button, [role="button"]');
        if (btn) trigger = btn;
      }

      // 1.2 兜底：在工具栏容器内按文本找
      if (!trigger) {
        for (const sel of TOOLBAR_CONTAINERS) {
          const scope = document.querySelector(sel);
          if (!scope) continue;
          const nodes = scope.querySelectorAll('button, [role="button"], div[class*="select"], div[class*="trigger"]');
          for (const n of nodes) {
            const txt = (n.textContent || '').trim();
            if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 25) {
              trigger = n;
              break;
            }
          }
          if (trigger) break;
        }
      }

      // 1.3 终极兜底：全页按文本找模式触发器（过滤掉非工具栏区域）
      if (!trigger) {
        const allClickables = document.querySelectorAll('button, [role="button"], div[class*="select"]');
        for (const n of allClickables) {
          if (n.closest('[class*="message"], [class*="chat-list"], [class*="conversation"], [class*="sidebar"], nav, header')) continue;
          const txt = (n.textContent || '').trim();
          if (txt && MODE_TRIGGER_TEXTS.some((t) => txt === t || txt.startsWith(t)) && txt.length < 25) {
            trigger = n;
            break;
          }
        }
      }

      if (!trigger) {
        A.warn('doubao: mode trigger not found');
        return false;
      }
      A.log('doubao: found mode trigger, text=', (trigger.textContent || '').trim().slice(0, 30));

      // ========== 2. 检查是否已经是深度模式 ==========
      const currentText = (trigger.textContent || '').trim();
      const isAlreadyDeep = DEEP_MODE_NAMES.some((t) => currentText.includes(t));
      if (isAlreadyDeep) {
        A.log('doubao: already in deep mode:', currentText);
        return true;
      }

      // ========== 3. 点击触发器打开下拉菜单 ==========
      A.dom.click(trigger);
      await new Promise((r) => setTimeout(r, 300));

      // ========== 4. 等待菜单项渲染 ==========
      let menuItems = [];
      for (let i = 0; i < 8; i++) {
        const items = document.querySelectorAll(MENU_ITEM_SELECTORS.join(','));
        // 过滤：文本中包含模式关键词的才是菜单项
        const filtered = [];
        for (const item of items) {
          const txt = (item.textContent || '').trim();
          if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 50) {
            filtered.push(item);
          }
        }
        if (filtered.length) {
          menuItems = filtered;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!menuItems.length) {
        A.warn('doubao: dropdown menu items not found');
        document.body.click();
        return false;
      }
      A.log('doubao: found menu items count=', menuItems.length);

      // ========== 5. 找到并点击深度模式选项 ==========
      for (const item of menuItems) {
        const txt = (item.textContent || '').trim();
        if (txt && DEEP_MODE_NAMES.some((t) => txt.includes(t))) {
          A.dom.click(item);
          A.log('doubao: clicked deep mode option:', txt.slice(0, 30));

          // 等待切换完成并验证
          await new Promise((r) => setTimeout(r, 500));
          const newText = (trigger.textContent || '').trim();
          const success = DEEP_MODE_NAMES.some((t) => newText.includes(t));
          A.log('doubao: deep mode switch', success ? 'success' : 'failed', 'newText=', newText.slice(0, 30));
          return success;
        }
      }

      A.warn('doubao: deep mode option not found in menu');
      document.body.click();
      return false;
    },
    findDeepThinkingToggle() {
      return null; // 豆包使用自定义 applyDeepThinking，不需要 toggle
    },
    getAnswerText() {
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
