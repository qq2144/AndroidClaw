# 数据结构

> 核心数据长什么样。以代码为准(`src/perception/types.ts`、`src/agent/tools.ts`、`src/memory/rollout.ts`)。

## Observation(每轮感知产出)

`src/perception/types.ts`

```ts
Element {
  id: number            // 顺序编号,tap(id) 用它
  text, desc: string
  klass, pkg: string
  bounds: [l, t, r, b]  // 像素;tap 时取中心点
  clickable, scrollable, editable, focused, password: boolean
}

Observation {
  step: number
  currentPackage: string   // 跨应用命脉,每轮必带
  elements: Element[]      // 空 = app 屏蔽了 uiautomator(微信),走 tap_xy/OCR
  screenshotPath, uiXmlPath: string
  screenWidth, screenHeight: number
  source?: 'uiautomator' | 'ocr' | 'empty'
}
```

## ActionInput(模型只能发这些)

`src/agent/tools.ts` —— 13 个 schema 约束动作:
`tap{id}` · `tap_xy{x,y}` · `long_press{id|x,y}` · `swipe{dir}` · `type_text{text}` ·
`paste_text{text}` · `submit{}` · `key{name}` · `launch_app{pkg}` · `wait{ms}` ·
`remember{key,value}` · `finish{summary}` · `ask_user{question}`

## 记忆(现状 + 目标)

### 现有
- **工作记忆**:`BrainContext { goal, history: HistoryEntry[], memory: {k:v} }`(单 turn,易失)
- **会话记忆(rollout)**:`src/memory/rollout.ts`,JSONL 每行一条 `RolloutItem`:
  `session_meta | turn_start | observation | model_io | action | result | approval | turn_end`
  落盘路径 `rollout/YYYY-MM-DD/<threadId>/`,每步 `step-NNN/{screen.png, ui.xml}`。

### 待建(长期记忆 —— 需要设计存储结构,草稿)
```
Fact {                    # 跨会话事实
  id: string
  kind: 'preference' | 'contact' | 'address' | 'app_knowledge' | 'account'
  key: string             # 如 "外卖.默认地址"
  value: string
  source: 'user' | 'learned'
  updatedAt: string
}
Flow {                    # 程序记忆:固化的任务流程
  id: string
  taskPattern: string     # 触发这个 flow 的任务描述
  steps: ActionInput[]    # 录下来的动作序列(语义锚,非死坐标)
  successCount, failCount: number
}
```
> 存储介质待定(JSON 文件 / SQLite)。检索方式待定(关键词 / 向量)。

## 审批状态

`src/safety/approval.ts` —— `ApprovalPolicy { mode, allowlist, approvedForSession }`,
敏感包集合 + 危险文本正则 + `submit`/ENTER 在敏感包内需批;`approveKey()` 写会话缓存。
