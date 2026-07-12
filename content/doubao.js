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
  // 普通/快速模式名（用于关闭深度思考时切换回去）
  const FAST_MODE_NAMES = ['快速', '标准', '对话'];
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
      A.log('doubao: applyDeepThinking start, enable=', enabled);

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
            'hasWrapper=', !!triggerWrapper);

      // ========== 2. 检查是否已经是目标模式 ==========
      const targetNames = enabled ? DEEP_MODE_NAMES : FAST_MODE_NAMES;
      const isAlreadyTarget = targetNames.some((t) => triggerText.includes(t));
      if (isAlreadyTarget) {
        A.log('doubao: already in target mode, enabled=', enabled, 'current=', triggerText);
        return true;
      }

      // ========== 3. 点击触发器（多种方式确保生效）==========
      const clickEl = (el) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const makeOpts = () => ({
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
          el.dispatchEvent(new PointerEvent('pointerdown', makeOpts()));
          el.dispatchEvent(new PointerEvent('pointerup', makeOpts()));
        } catch (e) { /* PointerEvent 不支持就跳过 */ }

        // mouse 事件
        el.dispatchEvent(new MouseEvent('mousedown', makeOpts()));
        el.dispatchEvent(new MouseEvent('mouseup', makeOpts()));
        el.dispatchEvent(new MouseEvent('click', makeOpts()));

        // 原生 click 兜底
        el.click();
      };

      const openMenu = () => {
        if (triggerWrapper && triggerWrapper !== trigger) {
          clickEl(triggerWrapper);
        } else {
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
          if (triggerWrapper && triggerWrapper !== trigger) {
            clickEl(trigger);
          } else {
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

        // 4.3 文本扫描兜底
        const allDivs = document.querySelectorAll('[role="menuitem"] > div, div[class*="menu"] > div, div[class*="dropdown"] > div');
        const candidates = [];
        const seen = new Set();
        for (const d of allDivs) {
          const txt = (d.textContent || '').trim();
          if (!txt || txt.length > 80) continue;
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
          const hasTarget = candidates.some((c) => targetNames.some((t) => c.text.includes(t)));
          if (hasTarget) {
            menuItems = candidates.map((c) => c.el);
            A.log('doubao: found menu via text scan, count=', menuItems.length);
            break;
          }
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      if (!menuItems.length) {
        A.warn('doubao: dropdown menu not opened, items not found');
        return false;
      }
      A.log('doubao: found menu items count=', menuItems.length,
            'texts=', menuItems.map((m) => (m.textContent || '').trim().slice(0, 20)).join(' | '));

      // ========== 5. 找到目标模式选项并点击 ==========
      let targetItem = null;
      for (const name of targetNames) {
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
        A.warn('doubao: target mode item not found in menu, targetNames=', targetNames.join(','));
        document.body.click();
        return false;
      }

      const targetText = (targetItem.textContent || '').trim();
      A.log('doubao: clicking target mode item:', targetText.slice(0, 30));
      clickEl(targetItem);

      // ========== 6. 验证切换结果 ==========
      await new Promise((r) => setTimeout(r, 800));
      const afterText = (trigger.textContent || '').trim();
      const success = targetNames.some((t) => afterText.includes(t));
      A.log('doubao: deep thinking apply result, enabled=', enabled,
            'current text=', afterText.slice(0, 20), 'success=', success);
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
