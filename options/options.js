/*
 * Options 页逻辑：与 popup 共享同一份 storage
 */
'use strict';

const PLATFORMS = [
  { key: 'yuanbao', name: '元宝',       host: 'yuanbao.tencent.com', url: 'https://yuanbao.tencent.com/' },
  { key: 'doubao',  name: '豆包',       host: 'www.doubao.com',      url: 'https://www.doubao.com/' },
  { key: 'qwen',    name: '通义千问',   host: 'tongyi.aliyun.com',   url: 'https://tongyi.aliyun.com/' },
  { key: 'kimi',    name: 'Kimi',       host: 'kimi.moonshot.cn',    url: 'https://kimi.moonshot.cn/' },
  { key: 'zhipu',   name: '智谱清言',   host: 'chatglm.cn',          url: 'https://chatglm.cn/' }
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

const body = document.getElementById('platformBody');
const autoSyncEl = document.getElementById('autoSync');
const openNewTabEl = document.getElementById('openNewTab');

function render(settings) {
  body.innerHTML = '';
  for (const p of PLATFORMS) {
    const tr = document.createElement('tr');

    // 启用
    const tdEn = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'check'; cb.checked = !!settings.targets[p.key];
    cb.addEventListener('change', () => saveSettings({ targets: { [p.key]: cb.checked } }));
    tdEn.appendChild(cb);

    // 名称
    const tdName = document.createElement('td');
    const name = document.createElement('span'); name.className = 'pname'; name.textContent = p.name;
    const host = document.createElement('span'); host.className = 'phost'; host.textContent = p.host;
    tdName.append(name, host);

    // 深度思考
    const tdDt = document.createElement('td');
    const label = document.createElement('label');
    label.className = 'dt-toggle' + (settings.deepThinking[p.key] ? ' active' : '');
    const dt = document.createElement('input'); dt.type = 'checkbox'; dt.checked = !!settings.deepThinking[p.key];
    dt.addEventListener('change', async () => {
      await saveSettings({ deepThinking: { [p.key]: dt.checked } });
      label.classList.toggle('active', dt.checked);
    });
    const pill = document.createElement('span'); pill.className = 'dt-pill';
    const txt = document.createElement('span'); txt.textContent = '深度思考';
    label.append(dt, pill, txt);
    tdDt.appendChild(label);

    // 打开
    const tdOpen = document.createElement('td');
    const a = document.createElement('a'); a.className = 'link-btn'; a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '打开';
    tdOpen.appendChild(a);

    tr.append(tdEn, tdName, tdDt, tdOpen);
    body.appendChild(tr);
  }

  autoSyncEl.checked = !!settings.autoSync;
  openNewTabEl.checked = !!settings.openNewTab;
}

autoSyncEl.addEventListener('change', () => saveSettings({ autoSync: autoSyncEl.checked }));
openNewTabEl.addEventListener('change', () => saveSettings({ openNewTab: openNewTabEl.checked }));

getSettings().then(render);
