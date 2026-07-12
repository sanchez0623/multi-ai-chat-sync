/*
 * 元宝 (yuanbao.tencent.com) 平台适配
 * 选择器随前端改版可能失效，已在每处保留多组兜底；如失效请更新下方候选选择器。
 *
 * 深度思考按钮的特殊性：选中/未选中两态的 HTML 完全一致
 * （无 aria-pressed/checked、无 active 类），状态靠 CSS 背景色 + dt-model-id 切换来体现。
 * 因此不能套用 A.dom.isToggleActive 的"看 HTML 属性/类名"判断，必须多方法综合判定。
 */
(function () {
  'use strict';
  const A = globalThis.AISYNC;
  // 用原生 console.log 而非 A.log，方便判断 "AISYNC 还没加载" 这类极端情况
  if (!A) {
    console.warn('[AISync] yuanbao: AISYNC namespace not found, aborting');
    return;
  }
  A.log('yuanbao: content script entered, AISYNC loaded');

  const INPUT_SELECTORS = [
    '#chat-input textarea',
    '#chat-input [contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea'
  ];

  const SEND_SELECTORS = [
    '#yuanbao-send-btn',
    '#chat-input button[class*="send"]',
    'button[class*="send"]',
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]',
    '#chat-input button:last-child',
    'div[class*="input"] button:last-child',
    'div[class*="footer"] button:last-child'
  ];

  const SEND_TEXTS = ['发送', '发送消息', 'Send', 'submit', 'send'];

  // 深度思考开关所在容器（输入框工具栏）候选
  const TOOLBAR_SELECTORS = [
    '#chat-input',
    'div[class*="input"]',
    'div[class*="toolbar"]',
    'div[class*="footer"]',
    'div[class*="bottom"]'
  ];
  const THINK_TEXTS = ['深度思考', '深度搜索', '思考', 'Deep Thinking'];

  // 助手回答容器候选（取最后一条）
  const ANSWER_SELECTORS = [
    '#chat-area div[class*="answer"]',
    '#chat-area div[class*="receive"]',
    '#chat-area div[class*="assistant"]',
    '#chat-area div[class*="agent"]',
    'div[class*="conversation"] div[class*="answer"]',
    'div[class*="message-list"] div[class*="answer"]',
    'div[class*="chat-list"] div[class*="receive"]',
    'div[class*="agent-text"]',
    'div[class*="answer-text"]',
    'div[class*="markdown-body"]:last-of-type'
  ];

  // 元宝深度思考按钮的 dt-button-id
  const DEEP_THINK_BTN_ID = 'deep_think';
  // 已知"非深度思考"模型（看到这些 dt-model-id 就一定没开深度思考）
  const NON_DEEP_MODEL_RE = /gpt_175b|_pro(?:[_-]|$)|_lite|_mini/;
  // 已知"深度思考"模型特征
  const DEEP_MODEL_RE = /(?:^|[_-])(?:t1|deepseek|r1|reasoning|deep|think)(?:[_-]|$)|^hunyuan_t/i;
  // 已知"选中/未选中" CSS module 类名模式
  const SELECTED_CLASS_RE = /(?:active|selected|on|checked)Icon|Icon(?:Active|Selected|On|Checked)/i;
  const UNSELECTED_CLASS_RE = /(?:all|default|normal|off)Icon|Icon(?:All|Default|Normal|Off)/i;

  /** 精准定位深度思考按钮：dt-button-id 优先，aria-label 次之，原有文本兜底 */
  function findDeepThinkButton() {
    let btn = document.querySelector(`[dt-button-id="${DEEP_THINK_BTN_ID}"]`);
    if (btn) return btn;
    const labeled = document.querySelectorAll(`[aria-label="深度思考"][dt-button-id]`);
    if (labeled.length) return labeled[0];
    return A.dom.findByText(TOOLBAR_SELECTORS, THINK_TEXTS);
  }

  /**
   * 综合判断深度思考按钮当前是否处于"激活"态。
   * 按可信度从高到低尝试：
   *   1. dt-model-id 模式（最可靠：元宝会切换到 t1/r1/deepseek 等深度模型）
   *   2. CSS module 类（activeIcon / IconActive 这类）
   *   3. 父级 active/selected 类（部分版本在父级打标记）
   *   4. 父级 aria-pressed/checked
   *   5. 计算样式：非透明背景色（兜底）
   */
  function isDeepThinkActive(btn) {
    if (!btn) return false;

    // 1. dt-model-id 模式
    const modelId = (btn.getAttribute('dt-model-id') || '').toLowerCase();
    if (modelId) {
      if (NON_DEEP_MODEL_RE.test(modelId)) return false;
      if (DEEP_MODEL_RE.test(modelId)) return true;
    }

    // 2. CSS module 类
    const cls = (typeof btn.className === 'string' ? btn.className : '');
    if (SELECTED_CLASS_RE.test(cls)) return true;
    if (UNSELECTED_CLASS_RE.test(cls)) return false;

    // 3. 父级 active/selected/on/checked/enabled 类
    let p = btn;
    for (let i = 0; i < 4 && p; i++) {
      const c = (typeof p.className === 'string' ? p.className : '');
      if (/(?:^|[\s_-])(?:active|selected|on|checked|enabled)(?:[\s_-]|$)/i.test(c)) {
        return true;
      }
      p = p.parentElement;
    }

    // 4. 父级 aria 属性
    p = btn;
    for (let i = 0; i < 4 && p; i++) {
      if (p.getAttribute('aria-pressed') === 'true') return true;
      if (p.getAttribute('aria-checked') === 'true') return true;
      p = p.parentElement;
    }

    // 5. 计算样式：非透明背景色（兜底，可能误判但能救命）
    const style = getComputedStyle(btn);
    const bg = style.backgroundColor;
    if (bg && bg !== 'transparent' && !/^rgba?\(0,\s*0,\s*0,\s*0\)$/.test(bg)) {
      return true;
    }

    return false;
  }

  /** 健壮点击：元宝是 React 派发的事件，单纯 el.click() 经常不触发状态变更 */
  function robustClick(el) {
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
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', makeOpts()));
      el.dispatchEvent(new PointerEvent('pointerup', makeOpts()));
    } catch (e) { /* PointerEvent 不支持就跳过 */ }
    el.dispatchEvent(new MouseEvent('mousedown', makeOpts()));
    el.dispatchEvent(new MouseEvent('mouseup', makeOpts()));
    el.dispatchEvent(new MouseEvent('click', makeOpts()));
    el.click();
  }

  A.runPlatform({
    key: 'yuanbao',
    answerSelectors: ANSWER_SELECTORS,
    getInputEl() {
      return A.dom.first(INPUT_SELECTORS);
    },
    getSendBtn() {
      return A.dom.findSendButton(SEND_SELECTORS, SEND_TEXTS);
    },
    // 元宝深度思考：点击输入区工具栏的"深度思考"按钮（与具体模型绑定）。
    // 支持双向切换：common.js 现在会按目标态调用，false 路径不再被短路。
    async applyDeepThinking(enabled) {
      A.log('yuanbao: applyDeepThinking start, enabled=', enabled);

      // ========== 1. 精准定位深度思考按钮 ==========
      const toggle = findDeepThinkButton();
      if (!toggle) {
        A.warn('yuanbao: deep thinking button not found');
        return false;
      }
      A.log('yuanbao: found toggle, dt-button-id=', toggle.getAttribute('dt-button-id'),
            'dt-model-id=', toggle.getAttribute('dt-model-id'),
            'class=', (typeof toggle.className === 'string' ? toggle.className : '').slice(0, 80));

      // ========== 2. 检查当前是否已经在目标状态 ==========
      const isActive = isDeepThinkActive(toggle);
      A.log('yuanbao: current state=', isActive, 'target=', !!enabled);
      if (isActive === !!enabled) {
        A.log('yuanbao: already in target state');
        return true;
      }

      // ========== 3. 点击切换 ==========
      robustClick(toggle);

      // ========== 4. 等待并验证 ==========
      await new Promise((r) => setTimeout(r, 500));
      const afterActive = isDeepThinkActive(toggle);
      A.log('yuanbao: after click, state=', afterActive, 'success=', afterActive === !!enabled);

      // 5. 兜底：若验证失败，额外等一会儿再校验一次（模型切换可能更慢）
      if (afterActive !== !!enabled) {
        await new Promise((r) => setTimeout(r, 800));
        const recheck = isDeepThinkActive(toggle);
        A.log('yuanbao: recheck state=', recheck);
        return recheck === !!enabled;
      }
      return true;
    },
    findDeepThinkingToggle() {
      return findDeepThinkButton();
    },
    getAnswerText() {
      return A.dom.lastAnswerText(ANSWER_SELECTORS);
    }
  });
})();
