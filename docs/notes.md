# 开发笔记

> 随手记:决定、踩坑、教训。以免过几天忘了为什么这么做。

## 关键决定

- **架构北极星 = OpenAI Codex**(Session/Turn/ToolRegistry/Approval/Rollout/ModelProvider)。豆包手机/UI-TARS 只作 Android 原语的战术参考,**不抄它们的 Brain 层概念**(本地小模型、hybrid routing)。
- **root = 增强后端,不是唯一后端**;长期可做 Accessibility companion,但当前主动放弃(微信反无障碍风险),走 root + OCR。
- **大脑 = qwen3.7-plus**(实证探针选的:中文 UI 定位准、吐原始像素、免代理免配额)。claude 要代理、grounding 弱;gemini 免费额度会断。
- **感知**:UI 树优先,空树(微信/支付宝)退 tap_xy(视觉)+ OCR。
- **中文输入**:走 ADBKeyBoard `ADB_INPUT_B64`;发送走 `submit`(`ADB_EDITOR_CODE 4` = IME_ACTION_SEND),不点发送按钮。
- **后台运行是明确需求**(用户 2026-06-21 确认),用 Codex 方式自己设计,不是抄豆包的 headless。

## 踩坑 / 教训

- **提交后紧跟那一帧不可信**:气泡渲染有延迟 + 可能息屏 → 截图看着"没发出",其实发了。核实要抓稍后的实时截图。**曾据此误判 + 误加 submit 验证,后撤回**(息屏误报 → 会重复发)。
- **降采样截图 = 死路**:实测 quarter 比 full 更慢更飘(Qwen-VL 内部归一化到固定 token 预算)。别再试。
- **Node type-stripping 坑**:内置 `node --test` 是 strip-only,不支持构造器参数属性/enum;Node 26 还砍了 `--experimental-transform-types`。对策:被测文件别用参数属性(已给 `approval.ts` 去糖);app 本身走 `tsx` 跑。
- **息屏冻 sshd**:开发通道(Termux sshd)会被息屏/Doze 冻,断了要手动重开 `sshd`。stay-awake 只保 agent 运行时,保不了 dev sshd。
- **`su` 走 adb 不可用**:Magisk 没授 shell 用户,adb 里拉不起 Termux 服务。
- **模型偶发发明工具**:qwen 有时吐 `click`(我们只有 `tap`),被当 unknown tool 空跑。

## 待决

- 触发方式(定时/远程/语音)?
- 长期记忆存储介质(JSON / SQLite)+ 检索(关键词 / 向量)?
- 后台异步审批的推送通道(什么方式通知用户确认支付)?

## 传输/开发通道

- USB → `adb forward tcp:8022` → Termux sshd;PC 用 plink/pscp(密码钉 hostkey,见 `scripts/env.ps1`,已 gitignore)。
- 每次插 USB 跑 `scripts/usb-setup.ps1`;`sync.ps1` 推代码(不含 smoke/rollout);`remote.ps1` 执行远端命令。
