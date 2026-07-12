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

  // 模型选择下拉菜单
  const MODE_TRIGGER_SELECTORS = [
    'div[class*="model-select"]',
    'div[class*="model-picker"]',
    'button[class*="model"]',
    'div[class*="model-switch"]',
    '[class*="model-name"]',
    '[class*="select-model"]'
  ];
  // 工具栏/头部容器候选
  const TRIGGER_CONTAINERS = [
    'div[class*="header"]',
    'div[class*="toolbar"]',
    'div[class*="chat-header"]',
    'div[class*="top-bar"]',
    'div[class*="nav"]'
  ];
  // 模型名称关键词（用于识别触发器）
  const MODEL_TRIGGER_TEXTS = ['K2.6', 'Kimi', '思考', '快速', 'Agent'];
  // 深度思考模式名称（按优先级匹配）
  const DEEP_MODE_NAMES = ['思考', '深度思考', 'Deep Thinking'];
  // 菜单项选择器
  const MENU_ITEM_SELECTORS = [
    '[role="menuitem"]',
    '[role="option"]',
    'div[class*="menu-item"]',
    'div[class*="dropdown-item"]',
    'div[class*="option"]',
    'li[class*="item"]',
    'div[class*="item"]'
  ];

  A.runPlatform({
    key: 'kimi',
    answerSelectors: [
      'div[class*="chat-content"] div[class*="segment"][class*="assistant"]',
      'div[class*="chat-content"] div[class*="segment-content"]',
      'div[class*="conversation"] div[class*="answer"]',
      'div[class*="receive-message"]',
      'div[class*="markdown-body"]:last-of-type',
      'div[class*="segment"]:last-of-type'
    ],
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
    // Kimi 深度思考：点开模型下拉菜单，选择"思考"模式
    async applyDeepThinking(enabled) {
      if (!enabled) return true;

      A.log('kimi: applyDeepThinking start');

      // ========== 1. 查找模型选择触发器 ==========
      let trigger = null;

      // 1.1 优先用选择器找
      trigger = A.dom.first(MODE_TRIGGER_SELECTORS);
      if (trigger) {
        const btn = trigger.querySelector('button, [role="button"]');
        if (btn) trigger = btn;
      }

      // 1.2 在头部/工具栏容器内按文本找
      if (!trigger) {
        for (const sel of TRIGGER_CONTAINERS) {
          const scope = document.querySelector(sel);
          if (!scope) continue;
          const nodes = scope.querySelectorAll('button, [role="button"], div[class*="select"], div[class*="picker"], span[class*="model"]');
          for (const n of nodes) {
            const txt = (n.textContent || '').trim();
            if (txt && MODEL_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 30) {
              trigger = n;
              break;
            }
          }
          if (trigger) break;
        }
      }

      // 1.3 终极兜底：全页找（排除消息区干扰）
      if (!trigger) {
        const allClickables = document.querySelectorAll('button, [role="button"], div[class*="select"], div[class*="picker"], span[class*="model"]');
        for (const n of allClickables) {
          if (n.closest('[class*="message"], [class*="chat-list"], [class*="conversation"], [class*="segment-content"], [class*="sidebar"]')) continue;
          const txt = (n.textContent || '').trim();
          if (txt && MODEL_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 30) {
            // 必须包含 K 或 思考 或 快速 等模型特征词
            if (/K\d|思考|快速|Agent/i.test(txt)) {
              trigger = n;
              break;
            }
          }
        }
      }

      if (!trigger) {
        A.warn('kimi: model trigger not found');
        return false;
      }
      const triggerText = (trigger.textContent || '').trim();
      A.log('kimi: found model trigger, text=', triggerText.slice(0, 40));

      // ========== 2. 检查是否已经是思考模式 ==========
      const isAlreadyDeep = DEEP_MODE_NAMES.some((t) => triggerText.includes(t));
      if (isAlreadyDeep) {
        A.log('kimi: already in think mode');
        return true;
      }

      // ========== 3. 点击触发器打开下拉菜单 ==========
      A.dom.click(trigger);
      await new Promise((r) => setTimeout(r, 300));

      // ========== 4. 等待菜单项渲染 ==========
      let menuItems = [];
      for (let i = 0; i < 8; i++) {
        const items = document.querySelectorAll(MENU_ITEM_SELECTORS.join(','));
        const filtered = [];
        for (const item of items) {
          const txt = (item.textContent || '').trim();
          if (txt && MODEL_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 60) {
            filtered.push(item);
          }
        }
        if (filtered.length >= 2) {
          menuItems = filtered;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!menuItems.length) {
        A.warn('kimi: menu items not found');
        document.body.click();
        return false;
      }
      A.log('kimi: found menu items count=', menuItems.length);

      // ========== 5. 找到并点击"思考"模式选项 ==========
      for (const item of menuItems) {
        const txt = (item.textContent || '').trim();
        if (txt && DEEP_MODE_NAMES.some((t) => txt.includes(t))) {
          A.dom.click(item);
          A.log('kimi: clicked think mode option:', txt.slice(0, 40));

          // 等待切换完成并验证
          await new Promise((r) => setTimeout(r, 600));
          const newText = (trigger.textContent || '').trim();
          const success = DEEP_MODE_NAMES.some((t) => newText.includes(t));
          A.log('kimi: think mode switch', success ? 'success' : 'failed', 'newText=', newText.slice(0, 40));
          return success;
        }
      }

      A.warn('kimi: think mode option not found in menu');
      document.body.click();
      return false;
    },
    findDeepThinkingToggle() {
      return null; // 使用自定义 applyDeepThinking
    },
    getAnswerText() {
      return A.dom.lastAnswerText([
        'div[class*="chat-content"] div[class*="segment"][class*="assistant"]',
        'div[class*="chat-content"] div[class*="segment-content"]',
        'div[class*="conversation"] div[class*="answer"]',
        'div[class*="receive-message"]',
        'div[class*="markdown-body"]:last-of-type',
        'div[class*="segment"]:last-of-type'
      ]);
    }
  });
})();
