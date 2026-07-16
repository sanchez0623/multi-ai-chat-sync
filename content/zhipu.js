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

  const TOOLBAR_CONTAINERS = [
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="chat-input"]',
    'div[class*="operate"]',
    'div[class*="bottom"]'
  ];

  function robustClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
    } catch (e) {}
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    el.click();
  }

  function findDeepThinkTrigger() {
    let trigger = document.querySelector('[class*="think-mode-trigger"]');
    if (!trigger) {
      for (const sel of TOOLBAR_CONTAINERS) {
        const scope = document.querySelector(sel);
        if (!scope) continue;
        trigger = scope.querySelector('[class*="think-mode-trigger"], [class*="mode-button"]');
        if (trigger) break;
      }
    }
    if (!trigger) {
      const allClickables = document.querySelectorAll('button, [role="button"], div[class*="mode"]');
      for (const n of allClickables) {
        if (n.closest('[class*="message"], [class*="chat-list"], [class*="conversation"], [class*="sidebar"], nav, header')) continue;
        const txt = (n.textContent || '').trim();
        if (txt && ['快速', '思考', '标准', '深度'].some(t => txt === t || txt.startsWith(t)) && txt.length < 20) {
          trigger = n;
          break;
        }
      }
    }
    return trigger;
  }

  function isDeepThinkActive(trigger) {
    if (!trigger) return false;
    const label = trigger.querySelector('[class*="think-label"]');
    if (label) {
      const txt = (label.textContent || '').trim();
      return txt === '深度' || txt.includes('深度');
    }
    const txt = (trigger.textContent || '').trim();
    return txt === '深度' || txt.includes('深度');
  }

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
      const btn = A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
      if (btn && !A.dom.isDisabled(btn)) return btn;
      const icon = document.querySelector('img.enter_icon, .enter_icon');
      if (icon) {
        const clickable = icon.closest('button, a, div[role="button"], [type="submit"], div[class*="send"], div[class*="submit"]');
        if (clickable && !A.dom.isDisabled(clickable)) return clickable;
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
    async applyDeepThinking(enabled) {
      A.log('zhipu: applyDeepThinking start, enabled=', enabled);

      const trigger = findDeepThinkTrigger();
      if (!trigger) {
        A.warn('zhipu: deep thinking trigger not found');
        return false;
      }

      const isActive = isDeepThinkActive(trigger);
      A.log('zhipu: current state=', isActive, 'target=', !!enabled);
      if (isActive === !!enabled) {
        A.log('zhipu: already in target state');
        return true;
      }

      robustClick(trigger);
      await new Promise((r) => setTimeout(r, 400));

      let targetItem = null;

      if (enabled) {
        const thinkItem = document.querySelector('[class*="think-mode-item"][class*="has-submenu"]');
        if (!thinkItem) {
          A.warn('zhipu: "思考" submenu item not found');
          document.body.click();
          return false;
        }
        robustClick(thinkItem);
        try {
          thinkItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          thinkItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 400));

        const submenu = document.querySelector('[class*="think-submenu"]');
        if (!submenu) {
          A.warn('zhipu: think submenu not found');
          document.body.click();
          return false;
        }

        const items = submenu.querySelectorAll('[class*="think-mode-item"]');
        for (const item of items) {
          const name = item.querySelector('[class*="item-name"]');
          if (name && ((name.textContent || '').trim() === '深度')) {
            targetItem = item;
            break;
          }
        }
      } else {
        const allItems = document.querySelectorAll('[class*="think-mode-item"]');
        for (const item of allItems) {
          if (item.querySelector('[class*="has-submenu"]')) continue;
          const name = item.querySelector('[class*="item-name"], [class*="think-label"]');
          const txt = (name ? name.textContent : item.textContent || '').trim();
          if (txt === '快速') {
            targetItem = item;
            break;
          }
        }
      }

      if (!targetItem) {
        A.warn('zhipu: target menu item not found for enabled=', enabled);
        document.body.click();
        return false;
      }

      robustClick(targetItem);
      await new Promise((r) => setTimeout(r, 500));

      const afterActive = isDeepThinkActive(trigger);
      A.log('zhipu: after click, state=', afterActive, 'success=', afterActive === !!enabled);

      if (afterActive !== !!enabled) {
        await new Promise((r) => setTimeout(r, 800));
        const recheck = isDeepThinkActive(trigger);
        A.log('zhipu: recheck state=', recheck);
        return recheck === !!enabled;
      }
      return true;
    },
    findDeepThinkingToggle() {
      return findDeepThinkTrigger();
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