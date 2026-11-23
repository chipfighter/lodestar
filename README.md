<div align="center">

<img src="docs/logo.svg" width="104" alt="Lodestar logo">

# Lodestar

**Choose which skills each Claude Code session loads — and only those.**

[![Release](https://img.shields.io/github/v/release/chipfighter/lodestar?label=release&color=4542E8)](https://github.com/chipfighter/lodestar/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-4542E8)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-F6B22E)](#install)
[![Windows client](https://img.shields.io/badge/client-Windows-F6B22E)](#install)

English · [简体中文](README.zh-CN.md)

</div>

Claude Code shows the model every skill you have installed, in every session. Lodestar lets you pick a set for each session, called an **Agent**, so the model sees only the skills the work needs.

<p align="center"><img src="docs/client-en.png" width="860" alt="The Lodestar tray client"></p>

## Features

- **Pick at the first message.** A card asks which Agent to use before Claude reads anything, so nothing in the prompt cache is lost.
- **One set per session.** It locks once the session starts. Need one more skill? Name it in your message.
- **Subagents included.** Each subagent can get its own set; forks keep their parent's.
- **A tray client for Windows.** Build Agents, browse every skill you have, and prepare a one-off set for your next session.
- **Chinese and English**, in the plugin and the client alike.

## Install

### Plugin

In a Claude Code session:

```
/plugin install skill-loadout --marketplace chipfighter/lodestar
```

### Tray client (optional, Windows)

Download `Lodestar_<version>_x64-setup.exe` from the [latest release](https://github.com/chipfighter/lodestar/releases/latest) and run it. The installer isn't code-signed yet, so if SmartScreen warns, choose **More info → Run anyway**. The client lives in the tray: closing its window keeps it running, and **Quit** is in the tray icon's menu.

> [!NOTE]
> Lodestar was called skill-loadout before v0.2.1. The plugin's ID and its data folder keep that name, so existing installs carry on.

## How to use

1. **Send your first message** in a new session, as usual.
2. **Pick an Agent** on the card, or **No limit** for every skill.
3. **That's it.** Claude sees only that set until the session ends.

| To | Do this |
| --- | --- |
| Choose before the first message | Send `/loadout <Agent>`, or use the panel |
| Use one skill outside the set | Write its name in your message |
| Switch to another set | Start a new session, or `/clear` |
| Give a subagent its own set | Name the set in your request, e.g. "use the Coding skills" |
| Adjust a set for the next session only | In the client, press **Use for next session only** |
| Open the panel | `/loadout`, or **Open panel** on the bar above the prompt |

## Concepts

- **Agent**: a named set of skills, such as *Coding* or *Video production*. Each session uses one. An Agent takes whole groups, including skills they gain later, or just a few of their skills, from anywhere.
- **Group**: skills that came together. Each plugin is a group, and so are Claude's built-in skills.
- **Category**: your own group for skills you installed on their own. A skill can be in several categories, and an Agent can take a whole category.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Ask at each new session | On | When off, choose in the panel before the first message |
| Who picks a subagent's skills | Main agent | Or **Me**: a card asks each time |
| Language | Automatic | Plugin: Claude Code's language setting, else your first message. Client: Windows' language |
| Start with Windows | Off | Client only |

Change them in the client's **Settings**, on the panel's **Manage** page, or in `library.json`.

## Data

Everything is plain JSON in `~/.skill-loadout/` (or the folder `SKILL_LOADOUT_HOME` names), so other tools can use it too.

| File | Holds | Written by |
| --- | --- | --- |
| `library.json` | Agents, categories and settings | the panel, the client, you |
| `claude-code-skills.json` | The skills Claude Code has, with their descriptions | the plugin |
| `next-session.json` | A set prepared for the next session | the client |
| `client.json` | Where the client is installed | the client |

The first run creates `library.json` with two example Agents, *Coding* and *Docs*; **Restore defaults** brings them back.

<details>
<summary><b>The format of library.json</b></summary>

```json
{
  "version": 1,
  "askOnNewSession": true,
  "subagentPicker": "agent",
  "language": "auto",
  "groups": {
    "Video editing": ["hyperframes", "remotion-*", "!remotion-license"]
  },
  "agents": {
    "Video production": { "groups": ["g:Video editing", "p:figma"], "skills": ["media-use"] }
  }
}
```

- `groups`: your categories, each a name and its skills. `*` is a wildcard; `!name` leaves a skill out. A skill may be in several.
- `agents`: an Agent's whole `groups`, by ID (`g:<category>`, `p:<plugin>`, `s:built-in`), plus single `skills`.
- `subagentPicker`: `agent` or `person`. `language`: `auto`, `zh` or `en`.
- Fields that Lodestar doesn't know are kept when it saves.

</details>

<details>
<summary><b>How it works</b></summary>

- **Choosing**: the first message waits in `prompt.submit` while the card (`$.ui.ask`) is open; each round of the card reads the data files again.
- **Filtering**: the `skill_listing` sent to the model is rewritten (`prompt.attachment`); no settings files change, so sessions can run different sets side by side.
- **Locking**: the set freezes when the first turn starts (`turn.start`), and comes back when the session is resumed.
- **Forks**: Claude's replies are fingerprinted as they're saved (`session.append`); a fork takes the set of the session it shares the most replies with.
- **Subagents**: a subagent's set is fixed when it starts (`agent.spawn`); its skill listing is filtered to that set.
- **Backstop**: a skill call outside the set is refused (`tool.call`), unless the request named that skill.
- **Always on**: a few system skills that the desktop app relies on stay in every set (`alwaysOn` in `plugin/loadout.json`).
- **The client**: a Tauri app (Rust, with a React and Fluent UI page in WebView2). It uses the plugin's own code for groups and Agents, writes each file whole, and watches the data folder for changes.

</details>

<details>
<summary><b>Known limits</b></summary>

- Lodestar sets which skills a session sees, not which hooks run. A plugin that works only through hooks, such as security-guidance, runs in every session as Claude Code loads it.
- The client is Windows-only for now, and its installer isn't code-signed.
- With the language on Automatic, the plugin follows your messages and the client follows Windows, so the two can differ.
- Forks are matched by Claude's replies. Replies under 20 characters don't count, and a fork whose copied replies were all compacted away gets **No limit**.
- Sessions started by another session or by a scheduled task also wait on the card; turn the card off if that gets in the way.
- Whether the main agent names a subagent's set depends on the model (Haiku doesn't); naming the set in your request always works.
- A subagent's set is kept in memory: after a restart, a resumed subagent gets the main session's set.
- If two places save Agents or categories at the same moment, the later save wins.

</details>

<details>
<summary><b>Development</b></summary>

- `plugin/` is the Claude Code plugin and `client/` the tray client; the repository root holds the marketplace manifest.
- **Plugin**: `claude plugin marketplace add <this folder>`, then `claude plugin install skill-loadout@skill-loadout`. Check it with `claude plugin validate plugin` and `claude plugin test plugin`.
- **Client** (needs Node.js with pnpm, and Rust with the Visual Studio C++ build tools): in `client/`, run `pnpm install`, then `pnpm dev` for a browser preview with sample data, or `pnpm tauri dev` for the app. `pnpm test` runs the tests; `pnpm tauri build` makes the installer.

</details>

## License

[MIT](LICENSE)
