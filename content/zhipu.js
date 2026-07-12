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

  // 工具栏容器候选（输入框附近）
  const TOOLBAR_CONTAINERS = [
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="chat-input"]',
    'div[class*="operate"]',
    'div[class*="bottom"]'
  ];
  // 一级菜单触发器文本（模式切换按钮）
  const MODE_TRIGGER_TEXTS = ['快速', '思考', '标准', '深度'];
  // 一级菜单项
  const FIRST_LEVEL_TEXTS = ['快速', '思考'];
  // 二级菜单项（思考子菜单）
  const SECOND_LEVEL_DEEP_TEXT = '深度';
  const SECOND_LEVEL_TEXTS = ['标准', '深度'];
  // 菜单项选择器
  const MENU_ITEM_SELECTORS = [
    '[role="menuitem"]',
    '[role="option"]',
    'div[class*="menu-item"]',
    'div[class*="dropdown-item"]',
    'li[class*="item"]',
    'div[class*="item"]'
  ];

  A.runPlatform({
    key: 'zhipu',
    answerSelectors: [
      'div[class*="conversation"] div[class*="answer"]',
      'div[class*="message-list"] div[class*="assistant"]',
      'div[class*="chat-content"] div[class*="answer"]',
      'div[class*="receive-message"]',
      'div[class*="answer-content"]',
      'div[class*="markdown-body"]:last-of-type'
    ],
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
    // 智谱深度思考：两级级联菜单，先点"思考"，再在子菜单选"深度"
    async applyDeepThinking(enabled) {
      if (!enabled) return true;

      A.log('zhipu: applyDeepThinking start');

      // ========== 1. 查找模式切换触发器 ==========
      let trigger = null;

      // 1.1 在工具栏容器内按文本找
      for (const sel of TOOLBAR_CONTAINERS) {
        const scope = document.querySelector(sel);
        if (!scope) continue;
        const nodes = scope.querySelectorAll('button, [role="button"], div[class*="select"], div[class*="trigger"], div[class*="mode"]');
        for (const n of nodes) {
          const txt = (n.textContent || '').trim();
          if (txt && MODE_TRIGGER_TEXTS.some((t) => txt === t || txt.startsWith(t)) && txt.length < 20) {
            trigger = n;
            break;
          }
        }
        if (trigger) break;
      }

      // 1.2 兜底：全页找（排除消息区等干扰）
      if (!trigger) {
        const allClickables = document.querySelectorAll('button, [role="button"], div[class*="select"], div[class*="mode"]');
        for (const n of allClickables) {
          if (n.closest('[class*="message"], [class*="chat-list"], [class*="conversation"], [class*="sidebar"], nav, header')) continue;
          const txt = (n.textContent || '').trim();
          if (txt && MODE_TRIGGER_TEXTS.some((t) => txt === t || txt.startsWith(t)) && txt.length < 20) {
            trigger = n;
            break;
          }
        }
      }

      if (!trigger) {
        A.warn('zhipu: mode trigger not found');
        return false;
      }
      const triggerText = (trigger.textContent || '').trim();
      A.log('zhipu: found mode trigger, text=', triggerText.slice(0, 30));

      // ========== 2. 检查是否已经是深度模式 ==========
      if (triggerText.includes(SECOND_LEVEL_DEEP_TEXT)) {
        A.log('zhipu: already in deep mode');
        return true;
      }

      // ========== 3. 点击触发器打开一级菜单 ==========
      A.dom.click(trigger);
      await new Promise((r) => setTimeout(r, 300));

      // ========== 4. 查找一级菜单项，点击"思考" ==========
      let firstItems = [];
      for (let i = 0; i < 6; i++) {
        const items = document.querySelectorAll(MENU_ITEM_SELECTORS.join(','));
        const filtered = [];
        for (const item of items) {
          const txt = (item.textContent || '').trim();
          if (txt && FIRST_LEVEL_TEXTS.some((t) => txt === t || txt.startsWith(t)) && txt.length < 20) {
            filtered.push(item);
          }
        }
        if (filtered.length) {
          firstItems = filtered;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!firstItems.length) {
        A.warn('zhipu: first level menu items not found');
        document.body.click();
        return false;
      }
      A.log('zhipu: found first level items count=', firstItems.length);

      // 找到"思考"并点击
      let thinkItem = null;
      for (const item of firstItems) {
        const txt = (item.textContent || '').trim();
        if (txt === '思考' || txt.startsWith('思考')) {
          thinkItem = item;
          break;
        }
      }

      if (!thinkItem) {
        A.warn('zhipu: "思考" option not found');
        document.body.click();
        return false;
      }

      // 悬停或点击"思考"以展开子菜单
      A.dom.click(thinkItem);
      // 有些菜单是 hover 展开，尝试 mouseover
      try {
        thinkItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        thinkItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 400));

      // ========== 5. 查找二级菜单项，点击"深度" ==========
      let secondItems = [];
      for (let i = 0; i < 6; i++) {
        const items = document.querySelectorAll(MENU_ITEM_SELECTORS.join(','));
        const filtered = [];
        for (const item of items) {
          const txt = (item.textContent || '').trim();
          if (txt && SECOND_LEVEL_TEXTS.some((t) => txt === t || txt.startsWith(t)) && txt.length < 20) {
            // 排除一级菜单里已经见过的（简单去重：比较元素引用）
            if (!firstItems.includes(item)) {
              filtered.push(item);
            }
          }
        }
        if (filtered.length) {
          secondItems = filtered;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // 如果没找到二级菜单，可能点击"思考"后直接切换了模式
      if (!secondItems.length) {
        A.log('zhipu: no second level menu, checking if switched to think mode');
        // 检查触发器文本是否变成"思考"相关
        const newTriggerText = (trigger.textContent || '').trim();
        if (newTriggerText.includes('思考') || newTriggerText.includes('深度')) {
          A.log('zhipu: think mode activated (no submenu)');
          // 如果当前只是"思考"但不是"深度"，可能需要再次点击触发器选择深度
          if (newTriggerText.includes('深度')) {
            return true;
          }
          // 再点一次看看有没有二级
          A.dom.click(trigger);
          await new Promise((r) => setTimeout(r, 300));
          // 重新查找菜单项
          const items2 = document.querySelectorAll(MENU_ITEM_SELECTORS.join(','));
          for (const item of items2) {
            const txt = (item.textContent || '').trim();
            if (txt && (txt === '深度' || txt.startsWith('深度')) && txt.length < 20) {
              A.dom.click(item);
              await new Promise((r) => setTimeout(r, 400));
              const finalText = (trigger.textContent || '').trim();
              const ok = finalText.includes('深度');
              A.log('zhipu: deep mode switch', ok ? 'success' : 'failed', 'text=', finalText.slice(0, 20));
              return ok;
            }
          }
          // 还是没找到，就算思考模式也返回 true（至少开启了思考）
          return true;
        }
        document.body.click();
        return false;
      }

      A.log('zhipu: found second level items count=', secondItems.length);

      // 找到"深度"并点击
      let deepItem = null;
      for (const item of secondItems) {
        const txt = (item.textContent || '').trim();
        if (txt === '深度' || txt.startsWith('深度')) {
          deepItem = item;
          break;
        }
      }

      if (!deepItem) {
        A.warn('zhipu: "深度" option not found in second level');
        document.body.click();
        return false;
      }

      A.dom.click(deepItem);
      await new Promise((r) => setTimeout(r, 500));

      // 验证切换结果
      const finalText = (trigger.textContent || '').trim();
      const success = finalText.includes('深度');
      A.log('zhipu: deep mode switch', success ? 'success' : 'failed', 'final text=', finalText.slice(0, 20));
      return success;
    },
    findDeepThinkingToggle() {
      return null; // 使用自定义 applyDeepThinking
    },
    getAnswerText() {
      return A.dom.lastAnswerText([
        'div[class*="conversation"] div[class*="answer"]',
        'div[class*="message-list"] div[class*="assistant"]',
        'div[class*="chat-content"] div[class*="answer"]',
        'div[class*="receive-message"]',
        'div[class*="answer-content"]',
        'div[class*="markdown-body"]:last-of-type'
      ]);
    }
  });
})();
