# AI 多模型同步提问助手

> 一个 Chrome 扩展，让你在多个 AI 平台之间同步同一个问题，侧边栏汇总所有答案。

## 功能

- ✅ **一键同步** — 在元宝/豆包/通义千问/Kimi/智谱 任一平台提问，自动同步到其他已启用的平台
- ✅ **多选平台** — 可在设置中自由开关需要同步的平台
- ✅ **深度思考** — 按平台独立控制是否开启深度思考 / 专家模式
- ✅ **侧边栏汇聚** — 所有平台的回答实时汇总到侧边栏，对比查看
- ✅ **自动开标签** — 未打开的平台自动新建标签页

## 快速开始

### 安装

1. 下载本项目代码
2. 打开 Chrome → `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」→ 选择项目目录

### 使用

1. 在任意支持的 AI 平台输入问题并发送
2. 其他已启用的平台将自动同步该问题
3. 点击扩展图标打开侧边栏，查看所有平台的回答

## 支持的平台

| 平台 | 网址 |
|------|------|
| 腾讯元宝 | https://yuanbao.tencent.com |
| 豆包 | https://www.doubao.com |
| 通义千问 | https://www.qianwen.com |
| Kimi | https://www.kimi.com |
| 智谱清言 | https://chatglm.cn |

## 项目结构

```
multi-ai-chat-sync/
├── manifest.json                    # 扩展清单
├── background/
│   └── service-worker.js            # 后台服务：消息路由、会话管理
├── content/
│   ├── common.js                    # 公共模块：DOM 操作、平台运行器
│   ├── yuanbao.js                   # 元宝适配
│   ├── doubao.js                    # 豆包适配
│   ├── qwen.js                      # 通义千问适配
│   ├── kimi.js                      # Kimi 适配
│   └── zhipu.js                     # 智谱适配
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── sidepanel/
    ├── sidepanel.html
    ├── sidepanel.js
    └── sidepanel.css
```

## 技术要点

- **Manifest V3** — 使用 Service Worker 作为后台
- **循环防护** — 转发产生的问题不会二次广播
- **编程式注入** — 支持标签页在扩展安装前已打开的场景
- **版本检测** — 自动检测并重注入过期的 content script
- **答案轮询** — 快照旧答案 → 轮询新文本 → 稳定后标记完成

## License

Apache-2.0
