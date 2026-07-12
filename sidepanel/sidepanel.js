/*
 * AI 多模型同步提问助手 - 侧边栏聚合看板
 * 职责：
 *  1. 渲染平台选择（目标 + 深度思考），持久化到 storage
 *  2. 手动广播提问（带 sessionId 返回）
 *  3. 订阅 storage.sessions 变化，实时展示各平台回答卡片
 */
(function () {
  'use strict';

  const PLATFORM_ORDER = ['yuanbao', 'doubao', 'qwen', 'kimi', 'zhipu'];
  const PLATFORM_NAMES = {
    yuanbao: '元宝', doubao: '豆包', qwen: '千问', kimi: 'Kimi', zhipu: '智谱'
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    toggleTargets: $('toggleTargets'),
    openOptions: $('openOptions'),
    targetsSection: $('targetsSection'),
    platformList: $('platformList'),
    question: $('question'),
    openNewTab: $('openNewTab'),
    broadcast: $('broadcast'),
    clearHistory: $('clearHistory'),
    emptyHint: $('emptyHint'),
    sessionList: $('sessionList')
  };

  let settings = null;
  let sessions = [];
  let broadcasting = false;

  // ---------- settings ----------
  async function loadSettings() {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    settings = (resp && resp.ok && resp.settings) ? resp.settings : null;
    return settings;
  }

  async function savePartial(partial) {
    // 直接写 storage，background 也会读 storage
    const cur = await chrome.storage.local.get(['targets', 'deepThinking', 'autoSync', 'openNewTab']);
    const next = {
      targets: { ...cur.targets, ...(partial.targets || {}) },
      deepThinking: { ...cur.deepThinking, ...(partial.deepThinking || {}) },
      autoSync: partial.autoSync !== undefined ? partial.autoSync : (cur.autoSync !== undefined ? cur.autoSync : true),
      openNewTab: partial.openNewTab !== undefined ? partial.openNewTab : (cur.openNewTab !== undefined ? cur.openNewTab : true)
    };
    await chrome.storage.local.set(next);
    settings = { ...settings, ...next };
  }

  // ---------- 平台列表渲染 ----------
  function renderPlatforms() {
    if (!settings) return;
    els.platformList.innerHTML = '';
    for (const key of PLATFORM_ORDER) {
      const li = document.createElement('li');
      li.className = 'platform-row';

      const left = document.createElement('div');
      left.className = 'pl-left';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'check';
      cb.checked = !!settings.targets[key];
      cb.addEventListener('change', () => savePartial({ targets: { [key]: cb.checked } }));
      const name = document.createElement('span');
      name.className = 'pl-name';
      name.textContent = PLATFORM_NAMES[key];
      li.appendChild(cb);
      li.appendChild(left);
      left.appendChild(name);

      // 深度思考小开关
      const dt = document.createElement('label');
      dt.className = 'dt-toggle' + (settings.deepThinking[key] ? ' active' : '');
      const dtIn = document.createElement('input');
      dtIn.type = 'checkbox';
      dtIn.checked = !!settings.deepThinking[key];
      dtIn.addEventListener('change', () => {
        savePartial({ deepThinking: { [key]: dtIn.checked } });
        dt.classList.toggle('active', dtIn.checked);
      });
      const pill = document.createElement('span');
      pill.className = 'dt-pill';
      const dtTxt = document.createElement('span');
      dtTxt.textContent = '深思';
      dt.appendChild(dtIn);
      dt.appendChild(pill);
      dt.appendChild(dtTxt);
      li.appendChild(dt);

      els.platformList.appendChild(li);
    }
  }

  // ---------- 广播 ----------
  function updateBroadcastBtn() {
    els.broadcast.disabled = broadcasting || !els.question.value.trim();
  }

  async function doBroadcast() {
    const question = els.question.value.trim();
    if (!question || broadcasting) return;
    broadcasting = true;
    els.broadcast.disabled = true;
    els.broadcast.textContent = '发送中…';
    try {
      await chrome.runtime.sendMessage({ type: 'BROADCAST', question });
      // 会话通过 storage 变化自动渲染，这里不清空输入框，便于复用/追问
    } catch (e) {
      console.warn('[AISync] broadcast failed', e);
    } finally {
      broadcasting = false;
      els.broadcast.textContent = '广播提问';
      updateBroadcastBtn();
    }
  }

  // ---------- 会话渲染 ----------
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function statusLabel(s) {
    switch (s) {
      case 'done': return '已回答';
      case 'sending': return '生成中';
      case 'error': return '失败';
      default: return '等待中';
    }
  }

  function renderSessions() {
    const list = sessions || [];
    if (!list.length) {
      els.emptyHint.classList.remove('hidden');
      els.sessionList.innerHTML = '';
      return;
    }
    els.emptyHint.classList.add('hidden');

    els.sessionList.innerHTML = '';
    for (const sess of list) {
      const card = document.createElement('div');
      card.className = 'session-card';

      // 问题行
      const q = document.createElement('div');
      q.className = 'session-q';
      const qText = document.createElement('span');
      qText.className = 'q-text';
      qText.textContent = sess.question;
      const qMeta = document.createElement('span');
      qMeta.className = 'q-meta';
      qMeta.textContent = fmtTime(sess.createdAt) + (sess.source ? ` · 来自${PLATFORM_NAMES[sess.source] || sess.source}` : '');
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-q';
      copyBtn.textContent = '复制';
      copyBtn.title = '复制问题到提问框';
      copyBtn.addEventListener('click', () => {
        els.question.value = sess.question;
        updateBroadcastBtn();
        els.question.focus();
      });
      q.appendChild(qText);
      q.appendChild(qMeta);
      q.appendChild(copyBtn);
      card.appendChild(q);

      // 各平台回答
      const grid = document.createElement('div');
      grid.className = 'answer-grid';
      const order = sess.platforms && sess.platforms.__order && sess.platforms.__order.length
        ? sess.platforms.__order : PLATFORM_ORDER;
      for (const key of order) {
        const p = sess.platforms[key];
        if (!p) continue;
        const row = document.createElement('div');
        row.className = 'answer-row';

        const head = document.createElement('div');
        head.className = 'ans-head';
        const nm = document.createElement('span');
        nm.className = 'ans-name';
        nm.textContent = PLATFORM_NAMES[key] || key;
        const st = document.createElement('span');
        st.className = 'ans-status ' + (p.status || 'pending');
        st.textContent = statusLabel(p.status);
        head.appendChild(nm);
        head.appendChild(st);

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'ans-body-wrap';
        const body = document.createElement('div');
        const text = (p.answer || '').trim();
        body.className = 'ans-body' + (text ? '' : ' empty') + (text && text.length > 280 ? ' collapsed' : '');
        body.textContent = text || (p.status === 'error' ? (p.error || '失败') : (p.status === 'sending' ? '正在生成…' : '等待回答'));

        if (text && text.length > 280) {
          const tog = document.createElement('button');
          tog.className = 'ans-toggle';
          tog.textContent = '展开';
          tog.addEventListener('click', () => {
            const collapsed = body.classList.toggle('collapsed');
            tog.textContent = collapsed ? '展开' : '收起';
          });
          bodyWrap.appendChild(body);
          bodyWrap.appendChild(tog);
        } else {
          bodyWrap.appendChild(body);
        }

        row.appendChild(head);
        row.appendChild(bodyWrap);
        grid.appendChild(row);
      }
      card.appendChild(grid);
      els.sessionList.appendChild(card);
    }
  }

  // ---------- storage 订阅 ----------
  function loadSessions() {
    chrome.storage.local.get('sessions', (res) => {
      sessions = res.sessions || [];
      renderSessions();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sessions) {
      sessions = changes.sessions.newValue || [];
      renderSessions();
    }
    if (changes.targets || changes.deepThinking) {
      loadSettings().then(renderPlatforms);
    }
  });

  // ---------- 事件绑定 ----------
  els.question.addEventListener('input', updateBroadcastBtn);
  els.question.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      doBroadcast();
    }
  });
  els.broadcast.addEventListener('click', doBroadcast);

  els.openNewTab.addEventListener('change', () => {
    savePartial({ openNewTab: els.openNewTab.checked });
  });

  els.toggleTargets.addEventListener('click', () => {
    els.targetsSection.classList.toggle('collapsed');
  });

  els.openOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  els.clearHistory.addEventListener('click', async () => {
    if (!confirm('清空所有历史会话？')) return;
    await chrome.storage.local.set({ sessions: [] });
  });

  // ---------- 初始化 ----------
  (async function init() {
    await loadSettings();
    renderPlatforms();
    if (settings) els.openNewTab.checked = !!settings.openNewTab;
    loadSessions();
    updateBroadcastBtn();
  })();
})();
