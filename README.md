# AndroidClaw

在已 root 的 Android 手机上、于 Termux 内**独立运行**的手机操作 AI agent。
"截图 → 推理 → 操作" 闭环,能跨应用自动执行真实任务(如发消息、点外卖)。

- **形态**:主循环 on-device(Termux + root),不依赖常驻 PC;LLM 大脑走云端 API。
- **架构**:借鉴 OpenAI Codex 的 `Session → Turn → Tool → Approval → Rollout` 运行时。
- **初衷**:一个具备**分层记忆**、可**后台常驻**、能控制手机一切的自主 agent。

> 详细目标见 [docs/requirements.md](docs/requirements.md),开发计划见 [docs/todo.md](docs/todo.md),
> 数据结构见 [docs/data-model.md](docs/data-model.md),随手笔记/踩坑见 [docs/notes.md](docs/notes.md)。

## 技术栈

- **语言**:TypeScript / Node.js(手机侧 Node 26,PC 侧 Node 24)
- **大脑**:Claude / Qwen-VL / Gemini(可切,`@anthropic-ai/sdk` + `@google/genai` + fetch)
- **感知**:uiautomator UI 树 + 视觉坐标定位 + Tesseract OCR 兜底
- **设备**:`su`(root)+ evdev 触摸注入 + ADBKeyBoard(中文输入)
- **无构建**:直接用 Node 原生 TypeScript 剥离运行(`node --experimental-strip-types` / `tsx`)

## 安装

手机侧(Termux):
```bash
pkg install nodejs
cd ~/aclaw && npm install          # 装 @anthropic-ai/sdk 等依赖
cp .env.example ~/.aclawrc         # 然后填入 API key(见下)
```
配置见 [.env.example](.env.example);复制到 `~/.aclawrc` 后填 key,运行时 `source` 它。

## 启动

```bash
# 跑一个任务(目标用自然语言描述)
. ~/.aclawrc && npx tsx src/cli.ts "打开微信，给文件传输助手发一条：测试"

# 从 PC 远程驱动(USB 隧道 + Termux sshd,见 scripts/)
pwsh scripts/usb-setup.ps1         # 插 USB 后建立 forward
pwsh scripts/sync.ps1              # 推代码到手机 ~/aclaw
pwsh scripts/remote.ps1 '<cmd>'    # 在手机上执行命令
```

## 常用命令

```bash
npm test              # 跑单元测试(node --test,零依赖)
npm run typecheck     # tsc --noEmit(需先 npm install)
npx tsx src/cli.ts "<目标>"                    # 跑 agent
npx tsx src/smoke-brain.ts                     # 单次大脑决策 smoke
node --experimental-strip-types src/smoke-grounding.ts <png>   # 视觉定位探针
```

## 关键环境变量(全部见 .env.example)

| 变量 | 说明 |
|---|---|
| `ACLAW_BRAIN` | `qwen` / `claude` / `gemini`(空=按 key 自动选) |
| `DASHSCOPE_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | 对应大脑的 key |
| `ACLAW_USE_EVDEV=1` | 用 evdev 底层触摸注入(比 `input tap` 更真) |
| `ACLAW_STAY_AWAKE` | 运行时保持亮屏(默认开,`0` 关) |
| `ACLAW_APPROVAL` / `ACLAW_AUTO_APPROVE` | 审批模式 / 自动批准(后台用) |
