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

      // ========== 1. 精准查找模式触发器 ==========
      let trigger = null;
      let triggerWrapper = null;
      let findMethod = '';

      // 1.1 最精准：通过 data-valid-btn 属性
      triggerWrapper = document.querySelector('[data-valid-btn="mode-select-action-btn"]');
      if (triggerWrapper) {
        const btn = triggerWrapper.querySelector('button');
        if (btn) {
          trigger = btn;
          findMethod = 'data-valid-btn';
        }
      }

      // 1.2 兜底：用 MODE_TRIGGER_SELECTORS
      if (!trigger) {
        trigger = A.dom.first(MODE_TRIGGER_SELECTORS);
        if (trigger) {
          findMethod = 'MODE_TRIGGER_SELECTORS';
          if (trigger.tagName !== 'BUTTON') {
            const btn = trigger.querySelector('button, [role="button"]');
            if (btn) trigger = btn;
          }
        }
      }

      // 1.3 终极兜底：全按钮文本匹配
      if (!trigger) {
        const allBtns = document.querySelectorAll('button');
        for (const b of allBtns) {
          const txt = (b.textContent || '').trim();
          if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.startsWith(t)) && txt.length < 20) {
            trigger = b;
            findMethod = 'text-scan';
            break;
          }
        }
      }

      if (!trigger) {
        A.warn('doubao: mode trigger not found');
        return false;
      }
      const triggerText = (trigger.textContent || '').trim();
      A.log('doubao: found mode trigger, text=', triggerText.slice(0, 30),
            'tag=', trigger.tagName,
            'findMethod=', findMethod,
            'hasWrapper=', !!triggerWrapper,
            'aria-expanded=', trigger.getAttribute('aria-expanded'),
            'data-state=', trigger.getAttribute('data-state'));

      // ========== 2. 检查是否已经是深度模式 ==========
      const isAlreadyDeep = DEEP_MODE_NAMES.some((t) => triggerText.includes(t));
      if (isAlreadyDeep) {
        A.log('doubao: already in deep mode:', triggerText);
        return true;
      }

      // ========== 3. 点击触发器（多种方式确保生效）==========
      const clickEl = (el) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const makeOpts = (type) => ({
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: cx,
          clientY: cy,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true
        });

        // pointer 事件（Radix UI 可能依赖这个）
        try {
          el.dispatchEvent(new PointerEvent('pointerdown', makeOpts('pointerdown')));
          el.dispatchEvent(new PointerEvent('pointerup', makeOpts('pointerup')));
        } catch (e) { /* PointerEvent 不支持就跳过 */ }

        // mouse 事件
        el.dispatchEvent(new MouseEvent('mousedown', makeOpts('mousedown')));
        el.dispatchEvent(new MouseEvent('mouseup', makeOpts('mouseup')));
        el.dispatchEvent(new MouseEvent('click', makeOpts('click')));

        // 原生 click 兜底
        el.click();
      };

      const openMenu = () => {
        // 先尝试点击外层容器
        if (triggerWrapper && triggerWrapper !== trigger) {
          clickEl(triggerWrapper);
        } else {
          // 直接点按钮
          clickEl(trigger);
        }
      };

      // ========== 4. 等待菜单打开并找到菜单项 ==========
      let menuItems = [];
      const MAX_ATTEMPTS = 20;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // 第 0 次点击
        if (attempt === 0) {
          openMenu();
        }
        // 第 8 次还没打开，换个方式再点
        if (attempt === 8) {
          A.log('doubao: menu not opened after 8 attempts, trying alternate click target');
          // 如果之前点的是 wrapper，这次点 button；反之亦然
          if (triggerWrapper && triggerWrapper !== trigger) {
            clickEl(trigger); // 直接点按钮
          } else {
            // 向上找可能的触发器容器
            let p = trigger.parentElement;
            for (let i = 0; i < 4 && p && p !== document.body; i++) {
              const cls = (p.className || '').toString();
              if (/(?:select|dropdown|trigger|menu|popover)/i.test(cls)) {
                clickEl(p);
                break;
              }
              p = p.parentElement;
            }
          }
        }

        // 4.1 优先用 data-slot 精准找菜单项
        const itemsBySlot = document.querySelectorAll('[data-slot="dropdown-menu-item"]');
        if (itemsBySlot.length >= 2) {
          menuItems = Array.from(itemsBySlot);
          A.log('doubao: found menu via data-slot, count=', menuItems.length);
          break;
        }

        // 4.2 用 role=menuitem
        const itemsByRole = document.querySelectorAll('[role="menuitem"]');
        if (itemsByRole.length >= 2) {
          // 过滤：必须包含模式关键词
          const filtered = Array.from(itemsByRole).filter((item) => {
            const txt = (item.textContent || '').trim();
            return MODE_TRIGGER_TEXTS.some((t) => txt.includes(t));
          });
          if (filtered.length >= 2) {
            menuItems = filtered;
            A.log('doubao: found menu via role, count=', menuItems.length);
            break;
          }
        }

        // 4.3 文本扫描兜底（收紧条件：必须包含至少2个模式关键词）
        const allDivs = document.querySelectorAll('[role="menuitem"] > div, div[class*="menu"] > div, div[class*="dropdown"] > div');
        const candidates = [];
        const seen = new Set();
        for (const d of allDivs) {
          const txt = (d.textContent || '').trim();
          if (!txt || txt.length > 80) continue;
          // 必须包含至少1个模式关键词，且看起来像菜单项
          const matchCount = MODE_TRIGGER_TEXTS.filter((t) => txt.includes(t)).length;
          if (matchCount === 0) continue;
          const rect = d.getBoundingClientRect();
          if (rect.width < 80 || rect.height < 15) continue;
          if (d.offsetParent === null && getComputedStyle(d).display === 'none') continue;
          const key = txt.slice(0, 12);
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ el: d, text: txt, rect });
        }
        if (candidates.length >= 2) {
          // 进一步过滤：必须有"专家"或"深度思考"在候选里
          const hasDeep = candidates.some((c) => DEEP_MODE_NAMES.some((t) => c.text.includes(t)));
          if (hasDeep) {
            menuItems = candidates.map((c) => c.el);
            A.log('doubao: found menu via text scan, count=', menuItems.length,
                  'texts=', candidates.map((c) => c.text.slice(0, 15)).join(' | '));
            break;
          }
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      if (!menuItems.length) {
        // 调试：打印点击后按钮的状态变化
        A.warn('doubao: dropdown menu not opened, items not found',
               'aria-expanded=', trigger.getAttribute('aria-expanded'),
               'data-state=', trigger.getAttribute('data-state'));
        // 打印页面上所有可见的 menuitem
        const allMenuItems = document.querySelectorAll('[role="menuitem"], [data-slot*="menu"]');
        A.warn('doubao: all menu-like elements on page:', allMenuItems.length);
        return false;
      }
      A.log('doubao: found menu items count=', menuItems.length,
            'texts=', menuItems.map((m) => (m.textContent || '').trim().slice(0, 20)).join(' | '));

      // ========== 5. 找到深度模式选项并点击 ==========
      let targetItem = null;
      for (const name of DEEP_MODE_NAMES) {
        for (const item of menuItems) {
          const txt = (item.textContent || '').trim();
          if (txt.includes(name)) {
            targetItem = item;
            break;
          }
        }
        if (targetItem) break;
      }

      if (!targetItem) {
        A.warn('doubao: deep mode item not found in menu');
        document.body.click();
        return false;
      }

      const targetText = (targetItem.textContent || '').trim();
      A.log('doubao: clicking deep mode item:', targetText.slice(0, 30));
      clickEl(targetItem);

      // ========== 6. 验证切换结果 ==========
      await new Promise((r) => setTimeout(r, 800));
      const afterText = (trigger.textContent || '').trim();
      const success = DEEP_MODE_NAMES.some((t) => afterText.includes(t));
      A.log('doubao: deep thinking apply result, current text=', afterText.slice(0, 20), 'success=', success);
      return success;
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
