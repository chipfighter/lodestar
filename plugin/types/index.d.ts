// What the plugin shares with other tools through its data folder (library.json,
// next-session.json, claude-code-skills.json) comes first; the tray client reads
// these types too. The plugin's own state follows.

/** One skill the session has, as the panel lists it. */
export type SkillEntry = {
  name: string
  /** Where it comes from, in the engine's words (`userSettings`, `plugin`, ...). */
  source?: string
  /** The providing plugin's name, when it comes from one. */
  plugin?: string
  /** The listing's estimated tokens for this skill. */
  tokens?: number
  /** What the skill is for, as the skill listing describes it. */
  description?: string
}

/**
 * An Agent: whole groups (by id: `g:<label>` for a group of loose skills,
 * `p:<plugin>` for a plugin, `s:<source>` for Claude's own) plus single skills,
 * where a skill may be a pattern with `*`.
 */
export type Preset = { groups: string[]; skills: string[] }

/**
 * The groups of loose skills and the Agents. A group's patterns may use `*`,
 * and `!pattern` leaves out what it matches.
 */
export type Library = { groups: Record<string, string[]>; presets: Record<string, Preset> }

/** What loadout.json holds: the defaults the library starts from. */
export type LoadoutConfig = {
  /** Skills kept in every loadout (the harness relies on some of them). */
  alwaysOn: string[]
  /** Group name to skill name patterns. */
  groups: Record<string, string[]>
  /** Agent name to its groups and extra skills. */
  presets: Record<string, Preset>
}

/** The interface's language: `auto` goes by Claude Code's language setting, then the person's first message. */
export type Language = 'auto' | 'zh' | 'en'

/** The settings library.json keeps beside the groups and Agents. */
export type Prefs = {
  /** Ask which Agent a new conversation uses when its first message is sent. */
  askOnNewSession: boolean
  /**
   * Who picks a subagent's skills: `agent`, the main agent, with a line
   * `技能装配：<name>` in the subagent's prompt (none: its parent's skills);
   * `person`, the user on a card as the subagent starts. A fork keeps its parent's.
   */
  subagentPicker: 'agent' | 'person'
  /** The language the card, the panel and the tray client speak. */
  language: Language
}

/**
 * The set the tray client prepared for the next session (next-session.json),
 * as a card offers it: an Agent's shape, the Agent it started from, and when
 * it was prepared (milliseconds since the epoch).
 */
export type NextSession = { basedOn: string | null; preset: Preset; createdAt: number }

/** A subagent's skills, settled as it was spawned. */
export type SubLoadout = {
  /** The skills it may use; null for every skill. */
  allow: string[] | null
  /** The set's name: an Agent, 不限制, or its parent's when it kept that. */
  label: string
  /** The Agent call's description of its task. */
  description: string
  /** Its task as given, for skills the task names outright. */
  prompt: string
  /** Who settled it: the main agent's line, the person's card, its parent's kept, or a fork's. */
  by: 'agent' | 'person' | 'inherit' | 'fork'
}

/** A spawn waiting for its subagent's id, found by its parent, type and description. */
export type PendingSpawn = { key: string; loadout: SubLoadout }

/**
 * library.json, the file the library is shared through: where it is, and
 * whether it was read and written as it should be (`unavailable`: no home
 * folder, so the library lives in this plugin's store alone).
 */
export type DataFile = {
  path: string
  status: 'ok' | 'invalid' | 'unreadable' | 'unwritable' | 'unavailable'
  error?: string
}

/** Whether the panel was ever placed this session, and whether the person closed it. */
export type PaneState = 'never' | 'open' | 'closed'

/** Which screen the panel shows. */
export type View = 'main' | 'manage' | 'agent' | 'group'

/** An Agent being made or edited, before it is saved. */
export type AgentDraft = { original: string | null; name: string; selected: string[] }

/** A session's loadout, frozen at its first turn: whose it is, and how it reads. */
export type SessionLock = { sessionId: string; label: string }

/**
 * A lock as the store keeps it, so that a resumed session gets its loadout
 * back, and a fork of it, which copies its replies word for word, finds it by
 * `anchors`: the marks of the model's first replies and its newest ones.
 */
export type StoredLock = { allow: string[] | null; agent: string | null; label: string; at: number; anchors?: string[] }

declare module 'claude-code' {
  interface PluginState {
    'skill-loadout': {
      /** Skills this session lists to the model; null lists every skill. */
      allow: Shaped<string[] | null>
      /** The Agent last applied, kept through hand changes; null for none. */
      active: Shaped<string | null>
      /** Every skill the session has, as last read. */
      catalog: Shaped<SkillEntry[]>
      /** The groups the panel shows open, by screen. */
      expanded: Shaped<string[]>
      /** loadout.json as last read. */
      config: Shaped<LoadoutConfig>
      /** The groups and Agents in use, as library.json holds them. */
      library: Shaped<Library>
      /** The settings in use, as library.json holds them. */
      prefs: Shaped<Prefs>
      /** library.json's fields this plugin does not know (another tool's), written back as they were. */
      extra: Shaped<Record<string, JsonValue>>
      /** The client-prepared set this session took, to work out again once the session's skills are known. */
      prepared: Shaped<Preset | null>
      /** The language `auto` stands for here: from Claude Code's setting, the first message, or the last session's. */
      detected: Shaped<'zh' | 'en' | null>
      /** Where library.json is, and how reading or writing it last went. */
      dataFile: Shaped<DataFile>
      /** The screen the panel shows. */
      view: Shaped<View>
      /** The Agent being edited, or null. */
      draft: Shaped<AgentDraft | null>
      /** The group being edited, or null. */
      editGroup: Shaped<string | null>
      /** The destructive action waiting for a second press, or null. */
      confirming: Shaped<string | null>
      /** The panel's state, which decides whether the bar above the prompt shows. */
      pane: Shaped<PaneState>
      /** The session's lock once its first turn started; null while it can still be changed. */
      lock: Shaped<SessionLock | null>
      /** The session's working folder. */
      cwd: Shaped<string>
      /** Whether the person settled this conversation's loadout (in the panel, with /loadout, or on the card). */
      chosen: Shaped<boolean>
      /** Whether the card asking for the loadout is open, the first message waiting on it. */
      asking: Shaped<boolean>
      /** Each subagent's skills, by its id. */
      subagents: Shaped<Record<string, SubLoadout>>
      /** Spawns whose subagent's id is not known yet. */
      pending: Shaped<PendingSpawn[]>
      /** Whether the main conversation's listing already told the model how subagents get their skills. */
      briefed: Shaped<boolean>
      /** The marks of the model's replies as stored: its first ones and its newest ones. */
      anchors: Shaped<string[]>
      /** The latest prompt the person typed, for explicit skill mentions. */
      lastPrompt: Shaped<string>
    }
  }
}
