# skill-loadout（技能装配）

[English](README.md) | 简体中文

给 Claude Code（桌面端和命令行）用的插件。每个新会话发第一条消息时，先选一个 Agent，决定这个会话装配哪些 skill；主代理开的子代理也各有自己的一套。模型只会在 skill 清单里看到装配的那些；没装配的 skill 不占清单预算，模型也不会自己去调用。

## 安装
在会话的输入框里：

```
/plugin install skill-loadout --marketplace chipfighter/skill-loadout
```

或者在终端里：

```
claude plugin install skill-loadout --marketplace chipfighter/skill-loadout
```

接着按 `y` 添加这个插件市场，再选安装范围。装好后新开一个会话就生效；第一次运行时，会在用户目录下生成 `.skill-loadout/library.json`，里面是两个示例 Agent（见下面「默认值」）。

在 Windows 的 Claude 桌面端、Claude Code 2.1.330 上开发和测试。

## 两个概念
- **技能组**：skill 的分类。
  - 跟着插件或 Claude 一起装的 skill，装的时候就是一组（一个插件一组、Claude 自带一组），不能调整。
  - 零碎装的 skill（`~/.claude/skills` 里一个个的文件夹）可以自己归组，比如「AIGC制作」「剪辑视频」。一个零碎 skill 只能在一个组里；没归组的放在「未归组」。
- **Agent**：由几个技能组加上单个 skill 拼成，比如「视频制作」= AIGC制作 + 自媒体口播 + 剪辑视频。每个会话选一个。

## 怎么用
- **新会话照常打字、发送第一条消息。** Claude 读到消息之前，会弹出一张卡片（Claude 平时问你问题用的那种）：「这个会话用哪套技能？」
  - 选项是你的 Agent 和「不限制」（= 装全部 skill）。这个文件夹上次用的 Agent 排在第一个；每个选项下面写着它包含哪些技能组、一共多少个 skill。
  - Agent 超过 3 个时，两个一批，点「更多 Agent…」换下一批；也可以在卡片的「Other」里直接输入 Agent 名字（不分大小写）。
  - 选好之后消息才交给 Claude。这时模型还没读过任何东西，所以不影响缓存；消息原样保留，附件也不会丢。
  - 关掉卡片不选：这个会话按当前的装配开始（没动过就是「不限制」）。
- 发第一条消息前也可以先在面板里选，或者发 `/loadout Coding`；选过就不再弹卡片。`/loadout` 本身不会弹卡片，也不会让 Claude 开始干活。
- **发出第一条消息后，装配就锁定**，直到会话结束都不再变：中途改 skill 清单会让前面的对话缓存失效，模型要从头重新读一遍整段对话。
  - 锁定后面板只显示装了哪些 skill（点组名可以看每一个）。
  - 临时要用没装配的 skill：在消息里写出它的名字就能用，不影响缓存。
  - 想换一组 skill：新开一个会话。`/clear` 之后也会重新问。
  - 恢复以前的会话时，沿用它当初锁定的装配，不弹卡片；装这个插件之前的会话，按「不限制」处理。
  - 从现有会话 fork 出来的新会话，沿用原会话的装配，不弹卡片。中途停下后桌面端自动分出来的会话也算 fork。
- **子代理**：主代理开子代理时，子代理用哪套技能，由管理页「子代理 · 由谁来选」决定：
  - 「主代理」（默认）：主代理在子代理的任务里写一行 `技能装配：Coding`，这个子代理就只装这一套；不写就和主会话一样。会话的第一份 skill 清单里会告诉 Claude 这个写法，以及有哪些 Agent 可选。
  - 你在消息里直接点名也行，比如"开一个子代理，用 Coding 那套技能……"：主代理没写那一行的话，插件按你消息里点名的那一套给子代理装配（消息里只点名一套时才算）。
  - 子代理开出来后，主代理会收到一句说明，知道这个子代理装的是哪一套。
  - 「我来选」：每开一个子代理都弹卡片问你，主代理建议的排第一，最后一项是「和主会话一样」。
  - fork 出来的子代理总是沿用上级的装配，不问。
  - 子代理的装配在它开出来时定下，之后不变；它只能用装配给它的 skill（任务里点了名的照常放行）。会话锁定后，面板里能看到每个子代理用的哪一套、是谁选的。
- 「管理」页：新建、编辑、删除 Agent；新建、编辑、删除技能组（只能放零碎 skill）；恢复默认设置。锁定后也能用，修改从下一个新会话起生效。
  - 「新会话 · 先问我用哪套」开关：关掉后不弹卡片，新会话会自动打开面板，发第一条消息前在面板里选；不选就是「不限制」。
  - 「子代理 · 由谁来选」：主代理 / 我来选，见上面。
- 面板关掉之后有三种方法打开：点输入框上方「技能装配」状态条里的「打开面板」；输入 `/loadout`；或者直接跟 Claude 说"打开技能装配面板"。状态条只在面板关着的时候出现。

## 数据文件：给别的工具用
Agent、技能组和设置存在一个普通的 JSON 文件里，以后的托盘客户端、别的 agent 平台的适配都读写它。

- 位置：用户目录下的 `.skill-loadout` 文件夹（Windows 上是 `C:\Users\<用户名>\.skill-loadout`）；设了环境变量 `SKILL_LOADOUT_HOME`，就用那个文件夹。管理页最下面显示实际路径。
- `library.json`：Agent、技能组和设置。
  - 面板里的修改都写进这个文件；也可以直接编辑它，下次打开面板、进管理页或者开新会话时读取。
  - 第一次运行时，用插件以前存的设置生成；没有的话用 `loadout.json` 的默认值。
  - 文件格式写错了：插件不会动它，先用上次读到的设置，管理页会提示；这时在面板里改动，会用面板的设置覆盖这个文件。
- `claude-code-skills.json`：插件把 Claude Code 实际看到的 skill 写在这里（最近两周任何会话见过的），给别的工具显示用。插件自己不读它，改它没有效果。

`library.json` 的格式：

```json
{
  "version": 1,
  "askOnNewSession": true,
  "subagentPicker": "agent",
  "groups": {
    "剪辑视频": ["hyperframes", "remotion-*", "!remotion-license"]
  },
  "agents": {
    "视频制作": { "groups": ["g:剪辑视频", "p:figma"], "skills": ["media-use"] }
  }
}
```

- `askOnNewSession`：新会话发第一条消息时是否弹卡片。
- `subagentPicker`：子代理的技能由谁选，`"agent"`（主代理）或 `"person"`（弹卡片问你）。
- `groups`：零碎 skill 的技能组，组名 → skill 名列表，支持 `*` 通配（如 `remotion-*`），`!名字` 表示排除。
- `agents`：Agent 名 → `{ "groups": [...], "skills": [...] }`。`groups` 里写组的编号：`g:组名`（自己的技能组）、`p:插件名`（整个插件）、`s:built-in`（Claude 自带）；只写组名也算 `g:组名`。`skills` 写单个 skill，也可以用通配。

## 默认值：loadout.json
插件自带的默认值，只在两种时候用到：第一次生成 `library.json`，和「恢复默认设置」。
- 两个示例 Agent，只用 Claude Code 和 Claude 桌面端自带的 skill：
  - `Coding`：code-review、simplify、init、run、claude-api、fewer-permission-prompts、security-review；
  - `文档办公`：Word、PDF、Excel、PPT 和文档几个 skill（`anthropic-skills:docx` 等，Claude 桌面端自带）。
  - 没有技能组：零碎装的 skill 在面板的「管理」里自己归组。
- `groups`、`presets`：默认的技能组和 Agent，格式同上（`presets` 就是 `agents`）。
- `alwaysOn`：任何装配下都保留的 skill（会话依赖的系统类 skill，比如桌面端画 Artifact、用浏览器的那几个）。这一项只在这里设置。

## 原理
- 选择：第一条消息进入会话之前（`prompt.submit` 钩子），用 Claude 自己提问的卡片问你（`$.ui.ask`），消息等你选完再放行。等待的时间不算插件超时。
- 过滤：改写发给模型的 `skill_listing` 消息（`prompt.attachment` 钩子）。不改任何设置文件，所以几个会话可以同时用不同的装配，插件里的单个 skill 也能单独取舍。
- 锁定：会话第一轮开始时（`turn.start` 钩子）冻结装配，并按会话编号存起来，恢复会话时取回。
- fork：Claude 的每条回复存进对话时（`session.append` 钩子），插件把它的指纹（去掉空白后的哈希，不存原文）记在会话的锁定记录下。fork 出来的会话没有自己的记录，就算出复制过来的各条回复的指纹，找到共同回复最多的那个会话，沿用它的装配。用回复而不用提问，是因为很多会话的第一句都是「你好」，回复却几乎不会一字不差。
- 子代理：子代理开出来时（`agent.spawn` 钩子）定下它的装配，按子代理编号记住；它的 skill 清单（带子代理编号的 `skill_listing`）照这套过滤，任务里也附上一行它能用哪些 skill。
- 兜底：模型如果自己调用了没装配的 skill，会被拒绝（`tool.call` 钩子，主会话和每个子代理各按各的装配）；用户在消息里点名的、或者子代理任务里点名的 skill 照常放行。

## 已知限制
- 卡片上只能选现成的 Agent，不能临时增减 skill；这个留给下一版的独立客户端。
- fork 靠 Claude 回复的指纹认原会话；太短的回复（不到 20 个字）和报错信息不算，因为别的会话可能一字不差。原会话的回复都被压缩掉以后就认不出来，按「不限制」处理。
- 别的会话用工具开出来的新会话，第一条消息就算写的是 `/loadout 名字`，也会当成普通消息发给 Claude，不会执行这个命令。你自己在输入框里发 `/loadout` 有没有这个问题，还没试过。
- 主代理能不能照说明写那一行，看模型本身；Haiku 就没照做过。所以你在消息里点名的那一套也算数，主代理开子代理之后也会收到一句它装的是哪一套。
- 别的会话或定时任务开出来的新会话，第一条消息也会弹卡片，要有人选了才继续。不需要的话在管理页关掉卡片。
- 子代理的装配只记在当前进程里：重启后再唤醒以前的子代理，它沿用主会话的装配。
- 两个会话同时在面板里改 Agent 或技能组，以后保存的为准。

## 开发
- 从本地文件夹装：`claude plugin marketplace add <这个文件夹>`，再 `claude plugin install skill-loadout@skill-loadout`。改了代码以后，在会话里输入 `/reload-plugins`，或者新开一个会话。
- 检查：`claude plugin validate .`、`claude plugin test .`。类型检查（`tsc -p .`）用 `.claude-plugin/types/` 里的定义：Claude Code 加载插件时自动生成，不进 git。

## 许可证
MIT，见 [LICENSE](LICENSE)。
