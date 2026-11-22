# skill-loadout

English | [简体中文](README.zh-CN.md)

A Claude Code plugin, for the desktop app and the CLI, that lets you choose which skills each session loads. When you send the first message of a new session, you pick an **Agent**: a named set of skills. The model then sees only that set in its skill listing, and the subagents it starts get a set of their own. Skills outside the set take up no room in the listing, and the model won't call them on its own.

> The plugin's interface is in Chinese for now. This README quotes its labels as they appear, followed by a translation.

## Install

In the prompt box of a Claude Code session:

```
/plugin install skill-loadout --marketplace chipfighter/skill-loadout
```

Or in a terminal:

```
claude plugin install skill-loadout --marketplace chipfighter/skill-loadout
```

Press `y` to add the marketplace, then choose where to install. The plugin applies from the next new session. On its first run it creates `.skill-loadout/library.json` in your home folder, holding two example Agents (see [Defaults](#defaults-loadoutjson)).

Developed and tested in the Claude desktop app on Windows, with Claude Code 2.1.330.

## Two concepts

- **Skill group**: a category of skills.
  - Skills that come with a plugin or with Claude are grouped when they're installed: one group per plugin, and one for Claude's own skills. These groups can't be changed.
  - Skills you install one at a time (each a folder in `~/.claude/skills`) can go into groups you make, such as "AIGC" or "Video editing". A skill can be in only one group; the ones in no group are listed under 未归组 ("ungrouped").
- **Agent**: a set built from skill groups and single skills, for example "Video production" = AIGC + Voice-over + Video editing. Each session uses one Agent.

## How to use

- **Type and send the first message of a new session as usual.** Before Claude reads it, a card appears, the same kind Claude uses to ask you questions: 这个会话用哪套技能？ ("Which skill set for this session?")
  - The options are your Agents and 不限制 ("no limit", which loads every skill). The Agent you last used in this folder comes first, and each option lists the skill groups it contains and its total number of skills.
  - With more than three Agents, the card shows two at a time; choose 更多 Agent… ("more Agents…") for the next two. You can also type an Agent's name in the card's Other box (case doesn't matter).
  - Your message reaches Claude only after you choose. The model hasn't read anything yet, so the prompt cache is unaffected, and your message arrives as you wrote it, attachments included.
  - If you close the card without choosing, the session starts with the current set (不限制 unless you changed it).
- You can also choose before sending the first message, in the panel or by sending `/loadout Coding`; once you've chosen, the card doesn't appear. Sending `/loadout` shows no card and doesn't set Claude to work.
- **The set locks once the first message is sent** and stays until the session ends, because changing the skill listing midway would invalidate the cached conversation and the model would have to read all of it again.
  - Once the set is locked, the panel only shows which skills are loaded (click a group's name to see each skill).
  - To use a skill outside the set, write its name in your message. This doesn't affect the cache.
  - For a different set, start a new session. `/clear` also brings the card back.
  - A resumed session keeps the set it locked originally, without a card; sessions from before the plugin was installed count as 不限制.
  - A session forked from another keeps the original's set, without a card. This includes the session the desktop app splits off on its own after you stop Claude partway.
- **Subagents.** When the main agent starts a subagent, the setting 子代理 · 由谁来选 ("Subagents · who picks") on the manage page decides who chooses the subagent's set:
  - 主代理 ("main agent", the default): the main agent adds a line such as `技能装配：Coding` (or `skill loadout: Coding`) to the subagent's task, and the subagent loads only that set; without the line it gets the main session's set. The session's first skill listing tells Claude about this line and which Agents exist.
  - You can also name the set in your message, for example "start a subagent with the Coding skills…". If the main agent didn't add the line, the plugin gives the subagent the set your message names, as long as it names exactly one.
  - When the subagent starts, the main agent is told which set it got.
  - 我来选 ("I pick"): a card asks you each time a subagent starts. The main agent's suggestion comes first, and the last option is 和主会话一样 ("same as the main session").
  - A forked subagent always keeps its parent's set, without asking.
  - A subagent's set is fixed when it starts and never changes. It can use only the skills in its set, plus any its task names. Once the session is locked, the panel shows each subagent's set and who chose it.
- **The manage page** (管理): create, edit and delete Agents; create, edit and delete skill groups (for individually installed skills only); restore the defaults (恢复默认设置). It also works after the lock, and changes apply from the next new session.
  - 新会话 · 先问我用哪套 ("New sessions · ask me first"): when off, no card appears. A new session opens the panel instead, and you choose there before the first message; without a choice, the session gets 不限制.
  - 子代理 · 由谁来选 ("Subagents · who picks"): 主代理 ("main agent") or 我来选 ("I pick"), as described above.
- After you close the panel, there are three ways to open it again: click 打开面板 ("open panel") on the 技能装配 ("skill loadout") bar above the prompt box, type `/loadout`, or ask Claude to open the skill loadout panel. The bar shows only while the panel is closed.

## The data file, for other tools

Agents, skill groups and settings are kept in a plain JSON file, which the planned tray client and the adapters for other agent platforms will read and write too.

- Location: a `.skill-loadout` folder in your home folder (`C:\Users\<you>\.skill-loadout` on Windows), or the folder named by the `SKILL_LOADOUT_HOME` environment variable when it's set. The bottom of the manage page shows the path in use.
- `library.json`: Agents, skill groups and settings.
  - Changes you make in the panel are written to this file. You can also edit it by hand; the plugin reads it the next time you open the panel, go to the manage page or start a new session.
  - On first run, it's created from settings the plugin stored earlier, if any; otherwise from the defaults in `loadout.json`.
  - If the file has a format error, the plugin leaves it alone, keeps using the settings it read last and says so on the manage page. A change made in the panel then overwrites the file with the panel's settings.
- `claude-code-skills.json`: the skills Claude Code actually sees, from any session in the last two weeks, written here for other tools to display. The plugin itself never reads it, so editing it has no effect.

The format of `library.json`:

```json
{
  "version": 1,
  "askOnNewSession": true,
  "subagentPicker": "agent",
  "groups": {
    "Video editing": ["hyperframes", "remotion-*", "!remotion-license"]
  },
  "agents": {
    "Video production": { "groups": ["g:Video editing", "p:figma"], "skills": ["media-use"] }
  }
}
```

- `askOnNewSession`: whether a card appears at a new session's first message.
- `subagentPicker`: who picks a subagent's skills, `"agent"` (the main agent) or `"person"` (you, on a card).
- `groups`: groups of individually installed skills, mapping a group name to a list of skill names. `*` is a wildcard (as in `remotion-*`), and `!name` leaves a skill out.
- `agents`: maps an Agent name to `{ "groups": [...], "skills": [...] }`. Each entry in `groups` is a group ID: `g:<group>` for one of your groups, `p:<plugin>` for a whole plugin, or `s:built-in` for Claude's own skills; a bare group name means `g:<group>`. `skills` lists single skills, and wildcards work there too.

## Defaults: loadout.json

The defaults that ship with the plugin. They're used only when `library.json` is first created and when you restore the defaults (恢复默认设置).

- Two example Agents, using only skills that come with Claude Code and the Claude desktop app:
  - `Coding`: code-review, simplify, init, run, claude-api, fewer-permission-prompts and security-review.
  - `文档办公` ("office documents"): the Word, PDF, Excel, PowerPoint and docs skills (`anthropic-skills:docx` and the rest, which come with the Claude desktop app).
  - No skill groups: put your individually installed skills into groups yourself, on the panel's manage page.
- `groups` and `presets`: the default skill groups and Agents, in the same format as above (`presets` is `agents`).
- `alwaysOn`: skills kept in every set, which sessions rely on, such as the desktop app's skills for drawing Artifacts and using browsers. This list is set only here.

## How it works

- **Choosing**: before the first message enters the session (`prompt.submit` hook), the plugin asks you on the card Claude itself uses for questions (`$.ui.ask`), and holds the message until you choose. Time spent waiting doesn't count against the plugin's time limit.
- **Filtering**: the plugin rewrites the `skill_listing` message sent to the model (`prompt.attachment` hook). It changes no settings files, so sessions running at the same time can use different sets, and single skills inside a plugin can be kept or left out one by one.
- **Locking**: when the session's first turn starts (`turn.start` hook), the set is frozen and stored under the session's ID, to be picked up again when the session is resumed.
- **Forks**: as each of Claude's replies is saved to the conversation (`session.append` hook), the plugin records the reply's fingerprint (a hash of its text with the whitespace removed; the text itself isn't stored) with the session's lock. A forked session has no lock of its own, so the plugin fingerprints the replies copied into it, finds the session that shares the most of them, and keeps that session's set. Replies work better than prompts here: many sessions open with the same "hi", but two replies are almost never word for word the same.
- **Subagents**: a subagent's set is fixed when it starts (`agent.spawn` hook) and remembered by the subagent's ID. Its skill listing (a `skill_listing` carrying that ID) is filtered to the set, and its task gets a line saying which skills it can use.
- **Backstop**: if the model calls a skill outside the set anyway, the call is refused (`tool.call` hook), for the main session and each subagent by its own set. Skills that you name in a message, or that a subagent's task names, are still allowed.

## Known limits

- The interface is in Chinese only.
- The card can only pick an existing Agent, not add or remove skills on the spot; that's left to the standalone client planned for the next version.
- Forks are matched by the fingerprints of Claude's replies. Very short replies (under 20 characters) and error messages don't count, because another session may contain the same ones word for word. Once the original's replies have all been compacted away, a fork can't be matched and gets 不限制.
- In a new session started by another session's tool, a first message reading `/loadout <name>` reaches Claude as an ordinary message instead of running the command. Whether sending `/loadout` yourself in the prompt box has the same problem hasn't been tested.
- Whether the main agent adds that line as instructed depends on the model; Haiku never has. That's why a set you name in your message counts too, and why the main agent is told which set a subagent got once it starts.
- New sessions started by another session or by a scheduled task also show the card at their first message, and wait until someone chooses. If you don't want that, turn the card off on the manage page.
- Subagents' sets are remembered only by the running process: after a restart, an earlier subagent that is woken up again gets the main session's set.
- If two sessions change Agents or skill groups in the panel at the same time, the later save wins.

## Development

- To install from a local folder: `claude plugin marketplace add <this folder>`, then `claude plugin install skill-loadout@skill-loadout`. After changing the code, type `/reload-plugins` in a session or start a new one.
- Checks: `claude plugin validate .` and `claude plugin test .`. Type checking (`tsc -p .`) uses the definitions in `.claude-plugin/types/`, which Claude Code writes when it loads the plugin; they aren't kept in git.

## License

MIT; see [LICENSE](LICENSE).
