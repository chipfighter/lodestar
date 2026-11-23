<div align="center">

<img src="docs/logo.svg" width="104" alt="Lodestar 标志">

# Lodestar

**让每个 Claude Code 会话只装需要的技能。**

[![Release](https://img.shields.io/github/v/release/chipfighter/lodestar?label=release&color=4542E8)](https://github.com/chipfighter/lodestar/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-4542E8)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-F6B22E)](#安装)
[![Windows client](https://img.shields.io/badge/client-Windows-F6B22E)](#安装)

[English](README.md) · 简体中文

</div>

Claude Code 会把你装的所有 skill 都列给模型，每个会话都是。Lodestar 让你给每个会话选一套（叫作 **Agent**），模型只看到这次工作需要的那些。Codex 也能用。

<p align="center"><img src="docs/client-zh.png" width="860" alt="Lodestar 托盘客户端"></p>

## 功能

- **第一条消息时选**：Claude 读消息之前，卡片先问你用哪个 Agent，不会浪费对话缓存。
- **一个会话一套**：会话开始后就锁定；临时要多用一个 skill，在消息里写出它的名字就行。
- **说一声就能整理**：跟 Claude 说「帮我把 skill 分好类」或者「建一个做视频的 Agent」，它会看过你所有的 skill、说出打算怎么改，你在卡片上确认后才保存。
- **子代理也管**：每个子代理可以有自己的一套；fork 出来的沿用上级的。
- **Codex 也能用**：在客户端里给 Codex 选一个 Agent，之后新开的 Codex 会话就只看到这一套。Agent 和分类都和 Claude Code 共用。
- **Windows 托盘客户端**：随时编辑 Agent、查看手上所有的 skill，给下一个 Claude Code 会话临时调一套，还能切换 Codex 用哪套。
- **中文和英文**：插件和客户端都支持。

## 安装

### 插件

在 Claude Code 会话里输入：

```
/plugin install skill-loadout --marketplace chipfighter/lodestar
```

### 托盘客户端（可选，Windows）

从[最新发布页](https://github.com/chipfighter/lodestar/releases/latest)下载 `Lodestar_<版本>_x64-setup.exe` 运行即可。安装包暂时没有代码签名，SmartScreen 提示时点「更多信息 → 仍要运行」。客户端常驻托盘：关掉窗口不会退出，退出在托盘图标的右键菜单里。

> [!NOTE]
> v0.2.1 之前这个项目叫 skill-loadout。插件 ID 和数据文件夹沿用了这个名字，已经装好的照常可用。

## 怎么用

### Claude Code

1. **新会话照常发第一条消息。**
2. **在卡片上选一个 Agent**，或者选「不限制」装全部 skill。你常用的排在前面；Agent 多的话点「更多 Agent…」看下一批，也可以在 Other 里直接输入名字。
3. **就这样**：到会话结束，Claude 只看到这一套。

| 想要 | 这样做 |
| --- | --- |
| 发第一条消息前就选好 | 发 `/loadout <Agent 名>`，或者在面板里选 |
| 临时用一个没装配的 skill | 在消息里写出它的名字 |
| 换一套 | 新开一个会话，或者 `/clear` |
| 给子代理单独一套 | 在消息里点名，比如"用 Coding 那套技能" |
| 整理 skill、建 Agent | 直接跟 Claude 说，比如"帮我把 skill 分好类"；改动要你在卡片上确认才保存，反悔了让它撤销 |
| 只给下一个会话临时调一套 | 在客户端里点「只给下一个会话用」 |
| 打开面板 | 发 `/loadout`，或者点输入框上方状态条里的「打开面板」 |

### Codex

Codex 没法在第一条消息时弹卡片问你，所以要在开会话之前选好。这要用到托盘客户端。

1. **在客户端左上角的下拉框里选 Codex**。装了 Codex（桌面版或命令行版）才会出现。
2. **打开一个 Agent，点「Codex 用这个」。**
3. **新开 Codex 会话**：它只看到这一套，直到你换别的 Agent；已经开着的会话不受影响。点「改成不限制」就回到全部 skill。

<p align="center"><img src="docs/codex-zh.png" width="860" alt="在客户端里让 Codex 用一个 Agent"></p>

## 概念

- **Agent**：起了名字的一套 skill，比如「Coding」「视频制作」。每个会话用一个。可以整组勾（以后组里新增的 skill 也会带上），也可以只勾其中几个，来自哪里都行。
- **组**：一起装进来的 skill。每个插件是一组，Claude 自带的是一组。
- **分类**：你给单独安装的 skill 建的组。一个 skill 可以放进几个分类，Agent 可以整个分类勾选。
- **平台**：Claude Code 或 Codex。Agent 和分类两边共用，按 skill 的名字对应：一个 Agent 里的 skill，哪个平台有就在哪个平台装上。

## 设置

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| 新会话先问我用哪套 | 开 | 关掉后，发第一条消息前在面板里选 |
| 子代理由谁来选 | 主代理 | 也可以选「我来选」：每次弹卡片问你 |
| 语言 | 自动 | 插件看 Claude Code 的语言设置，没有就看你的第一条消息；客户端跟随 Windows |
| 开机启动 | 关 | 只有客户端有 |
| 新开的 Codex 会话用哪套 | 不限制 | 只有客户端有：在 Agent 上点「Codex 用这个」 |

在客户端的「设置」、面板的「管理」页，或者直接在 `library.json` 里改。

## 数据

所有数据都是普通的 JSON 文件，在 `~/.skill-loadout/`（或者环境变量 `SKILL_LOADOUT_HOME` 指定的文件夹），别的工具也能用。

| 文件 | 存的是 | 谁写 |
| --- | --- | --- |
| `library.json` | Agent、分类和设置 | 面板、客户端、你让 Claude 整理时的 Claude、你自己 |
| `claude-code-skills.json` | Claude Code 实际有的 skill 及其说明 | 插件 |
| `next-session.json` | 给下一个会话调好的一套 | 客户端 |
| `client.json` | 客户端装在哪里 | 客户端 |
| `codex-skills.json` | Codex 实际有的 skill，照 Codex 自己列的 | 客户端 |
| `codex.json` | 新开的 Codex 会话用哪个 Agent，以及 Lodestar 为它关掉了哪些 skill | 客户端 |

为了 Codex，客户端还会往 Codex 自己的 `~/.codex/config.toml` 里写几条，每条都标着 `# lodestar`，别的行一概不动；第一次改之前会把原文件备份成 `config.toml.lodestar-backup`。

第一次运行时会生成 `library.json`，带两个示例 Agent：「Coding」和「Docs」；「恢复默认设置」可以把它们找回来。

<details>
<summary><b>library.json 的格式</b></summary>

```json
{
  "version": 1,
  "askOnNewSession": true,
  "subagentPicker": "agent",
  "language": "auto",
  "groups": {
    "剪辑视频": ["hyperframes", "remotion-*", "!remotion-license"]
  },
  "agents": {
    "视频制作": { "groups": ["g:剪辑视频", "p:figma"], "skills": ["media-use"] }
  }
}
```

- `groups`：你的分类，分类名和它的 skill。`*` 是通配符，`!名字` 表示排除；一个 skill 可以在几个分类里。
- `agents`：Agent 包含的整组（写组的编号：`g:分类名`、`p:插件名`、`s:built-in`），加上单个的 `skills`。
- `subagentPicker`：`agent` 或 `person`。`language`：`auto`、`zh` 或 `en`。
- Lodestar 保存时会保留它不认识的字段。

</details>

<details>
<summary><b>原理</b></summary>

- **选择**：卡片（`$.ui.ask`）打开时，第一条消息在 `prompt.submit` 里等着；卡片每弹一轮都重新读一遍数据文件。
- **过滤**：改写发给模型的 `skill_listing`（`prompt.attachment`），不改任何设置文件，所以几个会话可以同时用不同的装配。
- **锁定**：第一轮开始时（`turn.start`）冻结装配，恢复会话时取回。
- **fork**：Claude 的回复存进对话时记下指纹（`session.append`）；fork 出来的会话找共同回复最多的那个会话，沿用它的装配。
- **子代理**：子代理开出来时（`agent.spawn`）定下装配，它的 skill 清单照这套过滤。
- **兜底**：模型调用装配之外的 skill 会被拒绝（`tool.call`），消息里点了名的除外。
- **说一声整理**：插件的 `loadout` 工具把所有 skill 列给 Claude（`list`）；分类和 Agent 的改动要你在卡片上确认后才保存（`save`）；最近十次保存可以一次一次撤销（`undo`）。
- **常驻**：桌面端离不开的几个系统 skill 在任何装配里都保留（`plugin/loadout.json` 的 `alwaysOn`）。
- **客户端**：用 Tauri 做的（Rust，加上 WebView2 里的 React 和 Fluent UI 页面）。分组和 Agent 的规则用的是插件自己的那份代码；整份写入文件；数据文件夹一变就知道。
- **Codex**：客户端直接问 Codex 有哪些 skill（`codex app-server` 的 `skills/list`），再在 Codex 的 `config.toml` 里用 `[[skills.config]]` 按名字关掉 Agent 以外的 skill。Codex 每开一个新会话都会读这些设置，已经开着的会话保持开始时的清单。

</details>

<details>
<summary><b>已知限制</b></summary>

- Lodestar 管的是会话里能看到哪些 skill，不管 hook。只靠 hook 工作的插件（比如 security-guidance）照 Claude Code 的方式，在每个会话里都会运行。
- 客户端暂时只有 Windows 版，安装包没有代码签名。
- Codex 没法在第一条消息时问你：选好的 Agent 对之后每个新开的 Codex 会话都有效，直到你再换；Codex 重启后再接着聊的旧会话，会换成当前选的这一套。
- 被 Lodestar 关掉的 skill，在 Codex 自己的技能页里打不开；要用就在客户端里换个 Agent，或者点「改成不限制」。
- 项目自带的 Codex skill（仓库里的 `.agents/skills`）不受影响。两个平台按名字对应 skill，同一个 skill 在 Codex 里名字不一样的话，在那边就不算在你的分类里。
- 卡片一页最多四个选项（Claude Code 的限制），Agent 超过三个就要翻页。
- 语言设成「自动」时，插件跟着你的消息，客户端跟着 Windows，两边可能不一样。
- fork 靠 Claude 的回复认原会话：不到 20 个字的回复不算；复制过来的回复全被压缩掉了，就按「不限制」处理。
- 别的会话或定时任务开出来的新会话，也会停在卡片上等人选；碍事的话把卡片关掉。
- 主代理会不会给子代理点名，看模型本身（Haiku 就不会）；你在消息里点名一定有效。
- 子代理的装配只记在内存里：重启后再唤醒以前的子代理，它沿用主会话的装配。
- 两个地方同时保存 Agent 或分类，以后保存的为准。

</details>

<details>
<summary><b>开发</b></summary>

- `plugin/` 是 Claude Code 插件，`client/` 是托盘客户端；仓库根目录放的是插件市场的清单。
- **插件**：`claude plugin marketplace add <这个文件夹>`，再 `claude plugin install skill-loadout@skill-loadout`。检查用 `claude plugin validate plugin` 和 `claude plugin test plugin`。
- **客户端**（需要装了 pnpm 的 Node.js，以及 Rust 和 Visual Studio 的 C++ 生成工具）：在 `client/` 里运行 `pnpm install`，然后 `pnpm dev` 在浏览器里用示例数据预览（加上 `?platform=codex` 看 Codex 那边），或者 `pnpm tauri dev` 运行程序。`pnpm test` 跑测试，`pnpm tauri build` 打安装包。

</details>

## 许可证

[MIT](LICENSE)。客户端里的 Claude 和 Codex 标志分别是 Anthropic 和 OpenAI 的商标，只用来标明是哪个平台。
