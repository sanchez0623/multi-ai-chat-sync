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

      // ========== 1.5 找到真正的可点击祖先 ==========
      // 有时找到的是内部子元素（如 span），需要向上找真正响应点击的容器
      const findClickableAncestor = (el) => {
        let p = el;
        // 先向上找有点击特征的元素
        for (let i = 0; i < 6 && p && p !== document.body; i++) {
          const tag = p.tagName;
          const role = p.getAttribute && p.getAttribute('role');
          const tab = p.getAttribute && p.getAttribute('tabindex');
          const hasClick = p.onclick != null;
          const cls = (p.className || '').toString();
          if (tag === 'BUTTON' || role === 'button' || tab === '0' || hasClick ||
              /(?:cursor-pointer|select|dropdown|trigger|toggle|menu-button)/i.test(cls)) {
            // 找到可点击元素，继续往上看有没有更大的容器
            el = p;
          }
          p = p.parentElement;
        }
        // 再向上找 2 层，可能有包含下拉触发器的容器
        p = el;
        for (let i = 0; i < 3 && p && p.parentElement && p !== document.body; i++) {
          const parent = p.parentElement;
          const parentCls = (parent.className || '').toString();
          if (/(?:select|dropdown|trigger|menu|popover|popup)/i.test(parentCls)) {
            // 检查父元素是否可点击
            const innerBtn = parent.querySelector('button, [role="button"]');
            if (innerBtn && innerBtn === p) {
              // 父元素是容器，子元素是按钮，点按钮就行
              break;
            }
            if (parent.querySelector('button, [role="button"]') === null) {
              // 父元素里没有其他按钮，父元素本身可能是触发器
              el = parent;
            }
          }
          p = parent;
        }
        return el;
      };

      const originalTrigger = trigger;
      trigger = findClickableAncestor(trigger);
      const triggerRect = trigger.getBoundingClientRect();
      const triggerText = (trigger.textContent || '').trim();
      A.log('doubao: found mode trigger, text=', triggerText.slice(0, 30),
            'tag=', trigger.tagName,
            'originalTag=', originalTrigger.tagName,
            'class=', (trigger.className || '').toString().slice(0, 60),
            'pos=', Math.round(triggerRect.left) + ',' + Math.round(triggerRect.top),
            'aria-expanded=', trigger.getAttribute && trigger.getAttribute('aria-expanded'),
            'aria-haspopup=', trigger.getAttribute && trigger.getAttribute('aria-haspopup'));

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
      const triggerRect2 = trigger.getBoundingClientRect();
      // 先尝试找菜单容器，再在容器内找选项
      const menuContainerSelectors = [
        '[class*="menu-content"]',
        '[class*="menu-list"]',
        '[class*="dropdown-menu"]',
        '[class*="dropdown-content"]',
        '[class*="popover-content"]',
        '[class*="select-panel"]',
        '[class*="select-dropdown"]',
        '[class*="popup"]',
        '[role="menu"]',
        '[role="listbox"]',
        '[data-radix-menu-content]',
        '[data-radix-select-content]'
      ];

      for (let attempt = 0; attempt < 12; attempt++) {
        let candidates = [];

        // 4.1 先在菜单容器里找
        for (const sel of menuContainerSelectors) {
          const containers = document.querySelectorAll(sel);
          for (const c of containers) {
            // 必须是可见的
            if (c.offsetParent === null && getComputedStyle(c).display === 'none') continue;
            const rect = c.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) continue;
            // 菜单应该在触发器附近（上下左右一定范围内）
            const nearTrigger =
              rect.left < triggerRect2.right + 200 &&
              rect.right > triggerRect2.left - 200 &&
              rect.bottom > triggerRect2.top - 200 &&
              rect.top < triggerRect2.bottom + 300;
            if (!nearTrigger) continue;
            const items = c.querySelectorAll('button, [role="menuitem"], [role="option"], div[class*="item"], div[class*="option"], li, [class*="menu"] > div');
            items.forEach((it) => candidates.push(it));
          }
        }

        // 4.2 兜底：用 elementFromPoint 在触发器下方几个点找菜单元素
        if (!candidates.length) {
          const testPoints = [
            { x: triggerRect2.left + triggerRect2.width / 2, y: triggerRect2.bottom + 10 },
            { x: triggerRect2.left + triggerRect2.width / 2, y: triggerRect2.bottom + 30 },
            { x: triggerRect2.left + 20, y: triggerRect2.bottom + 20 },
            { x: triggerRect2.right - 20, y: triggerRect2.bottom + 20 }
          ];
          for (const pt of testPoints) {
            const el = document.elementFromPoint(pt.x, pt.y);
            if (el) {
              // 向上找可能的菜单容器
              let p = el;
              for (let i = 0; i < 8 && p && p !== document.body; i++) {
                const cls = (p.className || '').toString();
                if (/menu|dropdown|popover|popup|select/i.test(cls)) {
                  const items = p.querySelectorAll('button, [role="menuitem"], [role="option"], div[class*="item"], li');
                  items.forEach((it) => candidates.push(it));
                  break;
                }
                p = p.parentElement;
              }
            }
          }
        }

        // 4.3 再兜底：全页找带 role 的菜单项
        if (!candidates.length) {
          candidates = Array.from(document.querySelectorAll(MENU_ITEM_SELECTORS.join(',')));
        }

        // 4.4 终极兜底：全页找包含模式关键词的可点击元素
        if (!candidates.length) {
          const all = document.querySelectorAll('div, span, button, li, a');
          for (const n of all) {
            const txt = (n.textContent || '').trim();
            if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 40) {
              if (n.offsetParent !== null || getComputedStyle(n).display !== 'none') {
                candidates.push(n);
              }
            }
          }
        }

        // 过滤：文本包含模式关键词
        const filtered = [];
        const seenTexts = new Set();
        for (const item of candidates) {
          const txt = (item.textContent || '').trim();
          if (txt && MODE_TRIGGER_TEXTS.some((t) => txt.includes(t)) && txt.length < 60) {
            // 去重（相同文本只保留一个）
            const key = txt.slice(0, 20);
            if (!seenTexts.has(key)) {
              seenTexts.add(key);
              filtered.push(item);
            }
          }
        }

        if (filtered.length >= 2) {
          menuItems = filtered;
          break;
        }
        // 打印调试信息
        if (attempt === 3) {
          A.log('doubao: menu search attempt', attempt,
                'candidates=', candidates.length,
                'filtered=', filtered.length);
          if (candidates.length > 0) {
            const sample = candidates.slice(0, 5).map((c) => {
              const t = (c.textContent || '').trim().slice(0, 25);
              const cls = (c.className || '').toString().slice(0, 30);
              return t + '(' + cls + ')';
            });
            A.log('doubao: candidate samples:', sample.join(' | '));
          }
          // 检查点击后页面上新增的可见元素
          const allVisible = document.querySelectorAll('div[class*="menu"], div[class*="dropdown"], div[class*="popover"], div[class*="popup"]');
          const visibleOnes = [];
          for (const v of allVisible) {
            if (v.offsetParent !== null && getComputedStyle(v).display !== 'none') {
              const r = v.getBoundingClientRect();
              if (r.width > 50 && r.height > 30) {
                visibleOnes.push({
                  cls: (v.className || '').toString().slice(0, 50),
                  text: (v.textContent || '').trim().slice(0, 50),
                  pos: Math.round(r.left) + ',' + Math.round(r.top)
                });
              }
            }
          }
          A.log('doubao: visible menu-like elements count=', visibleOnes.length,
                visibleOnes.slice(0, 3).map((v) => v.cls + ':' + v.text.slice(0, 20)).join(' | '));
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!menuItems.length) {
        A.warn('doubao: dropdown menu items not found after all attempts');
        document.body.click();
        return false;
      }
      A.log('doubao: found menu items count=', menuItems.length,
            'texts=', menuItems.map((m) => (m.textContent || '').trim().slice(0, 20)).join(' | '));

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
