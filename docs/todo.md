# TODO / 开发计划

> 更新于 2026-06-21。四阶段按依赖顺序;上面是当前,下面是之后。

## 已完成(地基)

- [x] Codex 式运行时:单 active turn、schema 工具、审批、JSONL rollout
- [x] 多模型大脑抽象(claude / gemini / qwen,factory 自动选)
- [x] 感知:uiautomator 树 + OCR 兜底;设备:su + evdev + ADBKeyBoard
- [x] 大脑选型走实证探针 → 定 `qwen3.7-plus`
- [x] `submit` 发送审批(TDD)
- [x] 验证原语 verify(tap/swipe/launch;submit/paste 因息屏误报已撤)
- [x] 少步 prompt(旗舰任务 8→4 步、token ~50%↓)
- [x] 运行时保持亮屏 stay-awake
- [x] task A:微信自发文本端到端跑通 + 亲验

## 当前阶段

### A. 指令组装层(InstructionBuilder)—— 枢纽,先做
- [ ] 把 `systemPrompt()` 的薄拼接升级成分层组装:operator 策略 + persona/身份 + 记忆片段 + 当前任务
- [ ] persona 变成一等输入(可按任务切:卖萌 / 正经助理…)
- [ ] 按 `current_package` 动态选"每 app 提示"(微信的 paste+submit 只在微信给)

### B. 长期记忆(核心,你的初衷)
- [ ] 跨会话事实存储(地址 / 口味 / 常用店 / 联系人 / app 操作知识)
- [ ] 检索:任务开始时把相关事实注入指令组装层
- [ ] 写入:任务结束抽取值得记住的事实(或用户显式教)

## 之后再做

### C. 后台服务 + 异步审批
- [ ] headless 常驻守护进程(Termux:Boot 自启 / 保活)
- [ ] 触发方式:定时 / 远程消息 / 语音(待定,见 requirements ⑥)
- [ ] **异步审批**:危险动作(尤其支付)推送给用户确认,绝不自动花钱

### D. 程序记忆 / flow 回放
- [ ] 成功任务录制成确定性 flow
- [ ] 回放 + 用 verify 做偏离探测 → 偏了才交 LLM

### 穿插小项
- [ ] 多轮对话模式(等真人回复 + 持续回应;单轮循环做不到,需 poll 模式)
- [ ] 摘要/压缩(turn 变长后压旧步省 token)
- [ ] `screenWidth` 一词两义 bug(uiautomator 路缩放会偏)
- [ ] `perceive()` 的 `Promise.all` 截图/UI 树过渡帧不同步
- [ ] 给 tap/ENTER 补测试后,把 approval 的 `gate()` 抽出来(rule-of-three)
