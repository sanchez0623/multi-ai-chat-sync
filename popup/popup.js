/*
 * Popup 逻辑：
 *  - 读取/保存设置（targets 多选、deepThinking 各平台开关、autoSync、openNewTab）
 *  - 手动广播提问
 */
'use strict';

const PLATFORMS = [
  { key: 'yuanbao', name: '元宝',       host: 'yuanbao.tencent.com' },
  { key: 'doubao',  name: '豆包',       host: 'www.doubao.com' },
  { key: 'qwen',    name: '通义千问',   host: 'www.qianwen.com' },
  { key: 'kimi',    name: 'Kimi',       host: 'kimi.moonshot.cn' },
  { key: 'zhipu',   name: '智谱清言',   host: 'chatglm.cn' }
];

const DEFAULTS = {
  targets: { yuanbao: true, doubao: true, qwen: true, kimi: true, zhipu: true },
  deepThinking: { yuanbao: false, doubao: false, qwen: false, kimi: false, zhipu: false },
  autoSync: true,
  openNewTab: true
};

async function getSettings() {
  const keys = Object.keys(DEFAULTS);
  const stored = await chrome.storage.local.get(keys);
  const out = {};
  for (const k of keys) {
    if (k === 'targets' || k === 'deepThinking') {
      out[k] = { ...DEFAULTS[k], ...(stored[k] || {}) };
    } else {
      out[k] = stored[k] === undefined ? DEFAULTS[k] : stored[k];
    }
  }
  return out;
}

async function saveSettings(partial) {
  const cur = await getSettings();
  const next = { ...cur };
  if (partial.targets) next.targets = { ...next.targets, ...partial.targets };
  if (partial.deepThinking) next.deepThinking = { ...next.deepThinking, ...partial.deepThinking };
  if (partial.autoSync !== undefined) next.autoSync = partial.autoSync;
  if (partial.openNewTab !== undefined) next.openNewTab = partial.openNewTab;
  await chrome.storage.local.set(next);
}

// ---------- 渲染平台列表 ----------
const platformListEl = document.getElementById('platformList');

function renderPlatforms(settings) {
  platformListEl.innerHTML = '';
  for (const p of PLATFORMS) {
    const enabled = settings.targets[p.key];
    const dt = settings.deepThinking[p.key];

    const li = document.createElement('li');
    li.className = 'platform-row';

    const left = document.createElement('div');
    left.className = 'pl-left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'check';
    cb.checked = !!enabled;
    cb.addEventListener('change', async () => {
      await saveSettings({ targets: { [p.key]: cb.checked } });
      updateBroadcastBtn();
    });
    const name = document.createElement('span');
    name.className = 'pl-name';
    name.textContent = p.name;
    const host = document.createElement('span');
    host.className = 'pl-host';
    host.textContent = p.host;
    left.append(cb, name, host);

    // 深度思考开关
    const dtLabel = document.createElement('label');
    dtLabel.className = 'dt-toggle' + (dt ? ' active' : '');
    const dtInput = document.createElement('input');
    dtInput.type = 'checkbox';
    dtInput.checked = !!dt;
    dtInput.addEventListener('change', async () => {
      await saveSettings({ deepThinking: { [p.key]: dtInput.checked } });
      dtLabel.classList.toggle('active', dtInput.checked);
    });
    const dtPill = document.createElement('span');
    dtPill.className = 'dt-pill';
    const dtText = document.createElement('span');
    dtText.textContent = '深度思考';
    dtLabel.append(dtInput, dtPill, dtText);

    li.append(left, dtLabel);
    platformListEl.appendChild(li);
  }
}

// ---------- 全局开关 ----------
const autoSyncEl = document.getElementById('autoSync');
const openNewTabEl = document.getElementById('openNewTab');

autoSyncEl.addEventListener('change', () => saveSettings({ autoSync: autoSyncEl.checked }));
openNewTabEl.addEventListener('change', () => saveSettings({ openNewTab: openNewTabEl.checked }));

// ---------- 手动广播 ----------
const qEl = document.getElementById('question');
const btnEl = document.getElementById('broadcast');
const resultSection = document.getElementById('resultSection');
const resultList = document.getElementById('resultList');

function updateBroadcastBtn() {
  btnEl.disabled = qEl.value.trim().length === 0;
}
qEl.addEventListener('input', updateBroadcastBtn);

btnEl.addEventListener('click', async () => {
  const question = qEl.value.trim();
  if (!question) return;
  btnEl.disabled = true;
  const oldText = btnEl.textContent;
  btnEl.textContent = '广播中…';
  resultList.innerHTML = '';
  resultSection.classList.remove('hidden');

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: 'BROADCAST', question });
  } catch (e) {
    resp = { ok: false, error: String(e && e.message) };
  }

  btnEl.disabled = false;
  btnEl.textContent = oldText;

  const results = (resp && resp.results) || [];
  if (!results.length) {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.innerHTML = '<span class="name">未选择任何目标模型</span><span class="badge err">空</span>';
    resultList.appendChild(li);
    return;
  }
  for (const r of results) {
    const p = PLATFORMS.find((x) => x.key === r.platform);
    const li = document.createElement('li');
    li.className = 'result-item';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p ? p.name : r.platform;
    const badge = document.createElement('span');
    if (r.ok) {
      badge.className = 'badge ok';
      badge.textContent = '已发送';
    } else {
      badge.className = 'badge err';
      badge.textContent = r.error || '失败';
    }
    li.append(name, badge);
    resultList.appendChild(li);
  }
});

// ---------- 设置入口 ----------
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ---------- 初始化 ----------
(async function init() {
  const settings = await getSettings();
  renderPlatforms(settings);
  autoSyncEl.checked = !!settings.autoSync;
  openNewTabEl.checked = !!settings.openNewTab;
  updateBroadcastBtn();
})();
