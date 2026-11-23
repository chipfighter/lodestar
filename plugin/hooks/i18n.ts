// What the plugin says to the person, in Chinese and in English. What only the
// model reads (a refused skill, a subagent's note) stays in English.

export type Lang = 'zh' | 'en'

/** How a subagent's skills were settled. */
type SettledBy = 'agent' | 'person' | 'inherit' | 'fork'

export type Words = {
  /** The panel's title and the bar's name. */
  title: string
  /** The card's header, 12 characters at most. */
  cardHeader: string
  /** The card's options that are not Agents. */
  unlimited: string
  more: string
  ask: string
  sameAsMain: string
  sameAsParent: string
  clientPick: string

  /** Groups and sets, as listing.ts names them. */
  ungrouped: string
  sources: Record<string, string>
  otherSource: string
  pluginTag: string
  modified: (name: string) => string
  custom: string
  summary: { sep: string; singles: (count: number) => string; empty: string }

  card: {
    clientHint: string
    noClientSet: string
    notAnAgent: (name: string) => string
    allSkills: (count: number) => string
    allSkillsUnknown: string
    nextPage: (agents: number) => string
    lastHere: string
    skills: (count: number) => string
    basedOn: (name: string, added: number, removed: number) => string
    preparedAgo: (minutes: number) => string
    chose: (label: string, count: number | null) => string
    noneChosen: (label: string) => string
    subQuestion: (task: string) => string
    newTask: string
    keeps: (label: string) => string
    suggested: string
  }
  settledBy: Record<SettledBy, string>
  locked: (label: string) => string

  toast: {
    askOn: string
    askOff: string
    pickerPerson: string
    pickerAgent: string
    nameEmpty: string
    nameReserved: (name: string) => string
    nameTaken: (name: string) => string
    savedAsNew: (name: string) => string
    updated: (name: string) => string
    created: (name: string) => string
    saved: (name: string) => string
    groupTaken: (name: string) => string
    renamed: (name: string) => string
    groupDeleted: (name: string) => string
    reset: string
  }

  command: {
    description: string
    hint: string
    opened: string
    noClientSet: string
    usingClient: (label: string) => string
    using: (name: string) => string
    noAgent: (name: string, choices: readonly string[]) => string
  }

  band: { locked: string; asking: string; willAsk: string; canChange: string; open: string }

  pane: {
    alwaysOn: string
    back: string
    cancel: string
    done: string
    agentHeading: string
    noDraft: string
    newAgent: string
    editAgent: string
    name: string
    namePlaceholder: string
    whichGroups: string
    whichGroupsHint: string
    picked: (count: number, always: number) => string
    save: string
    groupsHeading: string
    groupGone: string
    editGroup: string
    nameHint: string
    members: (count: number) => string
    membersHint: string
    noLoose: string
    inGroup: (names: string) => string
    alsoIn: (names: string) => string
    deleteGroup: string
    deleteGroupConfirm: string
    manage: string
    lockedNote: string
    agents: string
    agentsHint: string
    noAgents: string
    edit: string
    remove: string
    removeConfirm: string
    createAgent: string
    groups: string
    groupsHint: string
    emptyGroup: string
    newGroupPlaceholder: string
    allGrouped: string
    looseLeft: (count: number) => string
    fixedGroups: string
    fixedGroupsHint: string
    none: string
    newSessions: string
    newSessionsHint: string
    askFirst: string
    on: string
    off: string
    askOffNote: string
    subagents: string
    subagentsHint: string
    whoPicks: string
    pickerPerson: string
    pickerAgent: string
    pickerPersonNote: string
    pickerAgentNote: string
    dataFile: string
    dataFileHint: string
    noHome: string
    fileInvalid: (error: string) => string
    fileUnreadable: (error: string) => string
    fileUnwritable: (error: string) => string
    unknownError: string
    reset: string
    resetConfirm: string
    listTokens: (loaded: string, total: string) => string
    loaded: (count: number, total: number, tokens: string) => string
    lockedState: string
    loadedHeading: string
    loadedHint: string
    alwaysCount: (count: number) => string
    subagentsHeading: string
    subagentsHeadingHint: string
    subagent: string
    useLeftOut: string
    useLeftOutHint: (example: string) => string
    otherSet: string
    otherSetAsk: string
    otherSetPanel: string
    askingState: string
    askingHint: string
    noSkillsYet: string
    canChange: string
    cardWillAsk: string
    whichAgent: string
    everySkill: (count: number) => string
    noAgentsYet: string
    editedFrom: (name: string) => string
    matchesNone: string
    keepEditedHint: string
    keepHint: string
    saveInto: (name: string) => string
    saveAsPlaceholder: string
    groupsLoaded: string
    groupsLoadedHint: string
  }
}

const zh: Words = {
  title: 'Lodestar',
  cardHeader: 'Lodestar',
  unlimited: '不限制',
  more: '更多 Agent…',
  ask: '这个会话用哪套技能？',
  sameAsMain: '和主会话一样',
  sameAsParent: '和上级代理一样',
  clientPick: '客户端里调好的',

  ungrouped: '未分类',
  sources: { 'built-in': 'Claude 自带', policySettings: '组织', mcp: 'MCP' },
  otherSource: '其他',
  pluginTag: '插件',
  modified: name => `${name}（改过）`,
  custom: '自定义',
  summary: { sep: '、', singles: count => `${count} 个单独的 skill`, empty: '空' },

  card: {
    clientHint: '要临时增减 skill：在客户端里调好后，在 Other 里输入「客户端」。',
    noClientSet: '客户端里现在没有调好的一套（没调过、超过两小时，或者已经被别的会话用了）。',
    notAnAgent: name => `「${name}」不是现成的 Agent，卡片上只能选一个。`,
    allSkills: count => `装全部 ${count} 个 skill`,
    allSkillsUnknown: '装全部 skill',
    nextPage: agents => `换下一批，一共 ${agents} 个 Agent`,
    lastHere: '上次在这个文件夹用的',
    skills: count => `${count} 个 skill`,
    basedOn: (name, added, removed) =>
      [`基于「${name}」`, added > 0 ? `+${added}` : '', removed > 0 ? `−${removed}` : ''].filter(Boolean).join(' '),
    preparedAgo: minutes => (minutes < 1 ? '刚调好' : `${minutes} 分钟前调好`),
    chose: (label, count) => `这个会话用「${label}」${count === null ? '' : `，共 ${count} 个 skill`}`,
    noneChosen: label => `没有选技能装配，这个会话按「${label}」开始`,
    subQuestion: task => `子代理「${task}」用哪套技能？`,
    newTask: '新任务',
    keeps: label => `沿用「${label}」`,
    suggested: '主代理建议',
  },
  settledBy: { agent: '主代理选的', person: '你选的', inherit: '沿用上级', fork: 'fork，沿用上级' },
  locked: label =>
    `这个会话的装配已经锁定（${label}），不能再换。想换一组 skill，请新开一个会话；临时要用某个 skill，在消息里写出它的名字。`,

  toast: {
    askOn: '新会话发第一条消息时，会先问你用哪套技能',
    askOff: '新会话不再先问；要选的话，发第一条消息前打开面板选',
    pickerPerson: '以后每开一个子代理，都弹卡片问你用哪套技能',
    pickerAgent: '以后子代理的技能由主代理决定',
    nameEmpty: '先给 Agent 起个名字',
    nameReserved: name => `「${name}」是保留的名字，换一个`,
    nameTaken: name => `已经有叫「${name}」的 Agent 了`,
    savedAsNew: name => `已存为新 Agent「${name}」`,
    updated: name => `已更新 Agent「${name}」`,
    created: name => `已新建 Agent「${name}」`,
    saved: name => `已保存 Agent「${name}」`,
    groupTaken: name => `已经有叫「${name}」的分类了`,
    renamed: name => `已改名为「${name}」`,
    groupDeleted: name => `已删除分类「${name}」，只在这个分类里的 skill 回到「未分类」`,
    reset: 'Agent 和分类已恢复成默认设置',
  },

  command: {
    description: '打开 Lodestar 面板；发第一条消息前可用 /loadout <Agent 名> 直接切换（/loadout 不限制 装全部 skill）',
    hint: '[Agent 名]',
    opened: 'Lodestar 面板已打开。',
    noClientSet: '客户端里现在没有调好的一套（没调过、超过两小时，或者已经被别的会话用了）。',
    usingClient: label => `这个会话改用客户端里调好的一套（${label}），发出第一条消息后锁定。`,
    using: name => `这个会话改用「${name}」，发出第一条消息后锁定。`,
    noAgent: (name, choices) => `没有叫「${name}」的 Agent。可用的有：${choices.join('、')}`,
  },

  band: { locked: '已锁定', asking: '正在问你用哪套', willAsk: '发第一条消息时会问你', canChange: '发第一条消息前可改', open: '打开面板' },

  pane: {
    alwaysOn: '常驻',
    back: '← 返回',
    cancel: '← 取消',
    done: '← 完成',
    agentHeading: 'Agent',
    noDraft: '没有正在编辑的 Agent',
    newAgent: '新建 Agent',
    editAgent: '编辑 Agent',
    name: '名字',
    namePlaceholder: '视频制作',
    whichGroups: '装哪些 skill',
    whichGroupsHint: '勾整组（以后组里新增的也会带上），或者点组名展开、只勾几个',
    picked: (count, always) => `已选 ${count} 个（含 ${always} 个常驻）`,
    save: '保存',
    groupsHeading: '分类',
    groupGone: '这个分类已经不在了',
    editGroup: '编辑分类',
    nameHint: '改完按回车',
    members: count => `成员 ${count} 个`,
    membersHint: '勾选单独安装的 skill 放进这个分类。一个 skill 可以同时放进几个分类',
    noLoose: '没有单独安装的 skill',
    inGroup: names => `  在 ${names}`,
    alsoIn: names => `  也在 ${names}`,
    deleteGroup: '删除这个分类',
    deleteGroupConfirm: '确认删除这个分类？再点一次',
    manage: '管理',
    lockedNote: '这个会话已经锁定，这里的修改从下一个新会话起生效',
    agents: 'Agent',
    agentsHint: '一套 skill：整组勾或者只勾几个，来自哪里都行；新会话发第一条消息时选一个',
    noAgents: '还没有 Agent',
    edit: '编辑',
    remove: '删除',
    removeConfirm: '确认删除？',
    createAgent: '＋ 新建 Agent',
    groups: '分类',
    groupsHint: '把单独安装的 skill 归在一起，一个 skill 可以放进几个分类',
    emptyGroup: '空',
    newGroupPlaceholder: '新分类名，回车创建',
    allGrouped: '单独安装的 skill 都已分类',
    looseLeft: count => `还有 ${count} 个单独安装的 skill 没分类`,
    fixedGroups: '插件和 Claude 自带的 skill',
    fixedGroupsHint: '装的时候就分好组了，不能调整；建 Agent 时可以整组勾选',
    none: '没有',
    newSessions: '新会话',
    newSessionsHint: '发第一条消息时，先弹卡片问这个会话用哪套技能，选好 Claude 才开始读消息',
    askFirst: '先问我用哪套',
    on: '开',
    off: '关',
    askOffNote: '关着的时候，新会话会自动打开这个面板，发第一条消息前在这里选；不选就是「不限制」',
    subagents: '子代理',
    subagentsHint: '主代理开子代理时，子代理用哪套技能；fork 出来的总是沿用上级',
    whoPicks: '由谁来选',
    pickerPerson: '我来选',
    pickerAgent: '主代理',
    pickerPersonNote: '每开一个子代理都弹卡片问你，主代理建议的排第一',
    pickerAgentNote: '主代理在子代理的任务里写一行「技能装配：名字」来指定；不写就沿用主会话',
    dataFile: '数据文件',
    dataFileHint: 'Agent、分类和上面的设置都存在这里，可以直接编辑，别的工具也能读',
    noHome: '没找到用户目录，只存在插件自己的存储里',
    fileInvalid: error => `文件格式有误（${error}）。现在用的是上次读到的设置；在这里改动会用这些设置覆盖这个文件`,
    fileUnreadable: error => `读不了这个文件（${error}），现在用的是上次读到的设置`,
    fileUnwritable: error => `写不进这个文件（${error}），改动只存在插件自己的存储里`,
    unknownError: '原因不明',
    reset: '恢复默认设置',
    resetConfirm: 'Agent 和分类都会恢复成默认，再点一次确认',
    listTokens: (loaded, total) => ` · 清单约 ${loaded} / ${total} tokens`,
    loaded: (count, total, tokens) => `已装配 ${count} / ${total} 个 skill${tokens}`,
    lockedState: '● 已锁定：这个会话不再改装配',
    loadedHeading: '装配情况',
    loadedHint: '点组名可以看里面每个 skill',
    alwaysCount: count => `另有 ${count} 个常驻 skill 始终装配`,
    subagentsHeading: '子代理',
    subagentsHeadingHint: '每个子代理开出来时定下的技能，之后不变',
    subagent: '子代理',
    useLeftOut: '临时要用没装配的 skill',
    useLeftOutHint: example => `在消息里写出它的名字就能用，比如 ${example}`,
    otherSet: '想换一组 skill',
    otherSetAsk: '新开一个会话，发第一条消息时会问你用哪套',
    otherSetPanel: '新开一个会话，发第一条消息前在这里选',
    askingState: '● 对话里正在问你这个会话用哪套技能',
    askingHint: '在那张卡片上选就行，选好之后 Claude 才开始读你的消息',
    noSkillsYet: '还没读到已安装的 skill，可以先选 Agent',
    canChange: '发第一条消息前可以改，发出后就锁定',
    cardWillAsk: '不在这里选也行：发第一条消息时会弹卡片问你',
    whichAgent: '① 这个会话用哪个 Agent',
    everySkill: count => `全部 ${count}`,
    noAgentsYet: '还没有 Agent：点右上角「管理」新建',
    editedFrom: name => `在「${name}」基础上改过`,
    matchesNone: '现在的装配和哪个 Agent 都不一样',
    keepEditedHint: '点上面的 Agent 可以重新套用；想留下这次的改动：',
    keepHint: '想留下这次的装配：',
    saveInto: name => `存进「${name}」`,
    saveAsPlaceholder: '新 Agent 名，回车保存',
    groupsLoaded: '② 装了哪些技能组',
    groupsLoadedHint: '发第一条消息前可以增减',
  },
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const en: Words = {
  title: 'Lodestar',
  cardHeader: 'Lodestar',
  unlimited: 'No limit',
  more: 'More Agents…',
  ask: 'Which skill set for this session?',
  sameAsMain: 'Same as the main session',
  sameAsParent: 'Same as its parent agent',
  clientPick: 'Prepared in the client',

  ungrouped: 'Uncategorized',
  sources: { 'built-in': 'Built into Claude', policySettings: 'Organization', mcp: 'MCP' },
  otherSource: 'Other',
  pluginTag: 'plugin',
  modified: name => `${name} (edited)`,
  custom: 'Custom',
  summary: { sep: ', ', singles: count => plural(count, 'single skill', 'single skills'), empty: 'Empty' },

  card: {
    clientHint: 'To add or drop skills for this session, prepare a set in the client, then type "client" under Other. ',
    noClientSet: 'Nothing is prepared in the client right now (never prepared, over two hours old, or taken by another session). ',
    notAnAgent: name => `"${name}" isn't one of your Agents; the card can only pick one. `,
    allSkills: count => `Every skill (${count})`,
    allSkillsUnknown: 'Every skill',
    nextPage: agents => `Next page, ${plural(agents, 'Agent', 'Agents')} in all`,
    lastHere: 'Used last in this folder',
    skills: count => plural(count, 'skill', 'skills'),
    basedOn: (name, added, removed) =>
      [`Based on "${name}"`, added > 0 ? `+${added}` : '', removed > 0 ? `−${removed}` : ''].filter(Boolean).join(' '),
    preparedAgo: minutes => (minutes < 1 ? 'prepared just now' : `prepared ${minutes} min ago`),
    chose: (label, count) => `This session uses "${label}"${count === null ? '' : `, ${plural(count, 'skill', 'skills')}`}`,
    noneChosen: label => `No skill set picked; this session starts with "${label}"`,
    subQuestion: task => `Which skill set for the subagent "${task}"?`,
    newTask: 'new task',
    keeps: label => `Keeps "${label}"`,
    suggested: 'Suggested by the main agent',
  },
  settledBy: { agent: 'main agent picked', person: 'you picked', inherit: "parent's set", fork: "fork, parent's set" },
  locked: label =>
    `This session's skill set is locked ("${label}") and can't change. For another set, start a new session; to use a skill once, write its name in your message.`,

  toast: {
    askOn: "New sessions ask which skill set to use at the first message",
    askOff: "New sessions won't ask; to choose, open the panel before the first message",
    pickerPerson: 'From now on, a card asks you for each subagent',
    pickerAgent: "From now on, the main agent picks subagents' skills",
    nameEmpty: 'Give the Agent a name first',
    nameReserved: name => `"${name}" is a reserved name; choose another`,
    nameTaken: name => `There's already an Agent called "${name}"`,
    savedAsNew: name => `Saved as the new Agent "${name}"`,
    updated: name => `Updated the Agent "${name}"`,
    created: name => `Created the Agent "${name}"`,
    saved: name => `Saved the Agent "${name}"`,
    groupTaken: name => `There's already a category called "${name}"`,
    renamed: name => `Renamed to "${name}"`,
    groupDeleted: name => `Deleted the category "${name}"; skills that were only in it are uncategorized again`,
    reset: 'Agents and categories are back to the defaults',
  },

  command: {
    description: 'Open the Lodestar panel; before the first message, /loadout <Agent> switches directly (/loadout No limit loads every skill)',
    hint: '[Agent]',
    opened: 'The Lodestar panel is open.',
    noClientSet: 'Nothing is prepared in the client right now (never prepared, over two hours old, or taken by another session).',
    usingClient: label => `This session now uses the set prepared in the client (${label}); it locks when the first message is sent.`,
    using: name => `This session now uses "${name}"; it locks when the first message is sent.`,
    noAgent: (name, choices) => `There's no Agent called "${name}". You have: ${choices.join(', ')}`,
  },

  band: { locked: 'locked', asking: 'asking you now', willAsk: 'asks at the first message', canChange: 'can change before the first message', open: 'Open panel' },

  pane: {
    alwaysOn: 'always on',
    back: '← Back',
    cancel: '← Cancel',
    done: '← Done',
    agentHeading: 'Agent',
    noDraft: 'No Agent is being edited',
    newAgent: 'New Agent',
    editAgent: 'Edit Agent',
    name: 'Name',
    namePlaceholder: 'Video production',
    whichGroups: 'Which skills',
    whichGroupsHint: 'Tick a whole group (skills it gains later come along), or open one and tick a few',
    picked: (count, always) => `${count} picked (${always} always on)`,
    save: 'Save',
    groupsHeading: 'Categories',
    groupGone: 'This category no longer exists',
    editGroup: 'Edit category',
    nameHint: 'Press Enter when done',
    members: count => plural(count, 'member', 'members'),
    membersHint: 'Tick skills installed on their own to put them in this category. A skill can be in several categories',
    noLoose: 'No skills installed on their own',
    inGroup: names => `  in ${names}`,
    alsoIn: names => `  also in ${names}`,
    deleteGroup: 'Delete this category',
    deleteGroupConfirm: 'Delete this category? Press again',
    manage: 'Manage',
    lockedNote: 'This session is locked; changes here apply from the next new session',
    agents: 'Agents',
    agentsHint: "A set of skills: whole groups or just a few, from anywhere; picked at a new session's first message",
    noAgents: 'No Agents yet',
    edit: 'Edit',
    remove: 'Delete',
    removeConfirm: 'Delete?',
    createAgent: '＋ New Agent',
    groups: 'Categories',
    groupsHint: 'Put skills you installed on their own together; a skill can be in several',
    emptyGroup: 'empty',
    newGroupPlaceholder: 'New category name, then Enter',
    allGrouped: 'Every skill installed on its own is in a category',
    looseLeft: count => `${plural(count, 'skill installed on its own is', 'skills installed on their own are')} in no category`,
    fixedGroups: 'Skills from plugins and Claude',
    fixedGroupsHint: 'Grouped when installed and fixed; you can tick a whole group in an Agent',
    none: 'None',
    newSessions: 'New sessions',
    newSessionsHint: "At the first message, a card asks which skill set the session uses; Claude reads the message after you choose",
    askFirst: 'Ask me first',
    on: 'On',
    off: 'Off',
    askOffNote: 'While off, new sessions open this panel, and you choose here before the first message; with no choice, every skill loads',
    subagents: 'Subagents',
    subagentsHint: "Which skill set a subagent gets when the main agent starts one; forks always keep their parent's",
    whoPicks: 'Who picks',
    pickerPerson: 'Me',
    pickerAgent: 'Main agent',
    pickerPersonNote: "A card asks you for each subagent, the main agent's suggestion first",
    pickerAgentNote: 'The main agent names a set with a line "skill loadout: <name>" in the task; without it the subagent keeps the session\'s set',
    dataFile: 'Data file',
    dataFileHint: 'Agents, categories and the settings above are kept here; you can edit it, and other tools read it',
    noHome: "No home folder found; kept in the plugin's own storage only",
    fileInvalid: error => `The file has a format error (${error}). The settings read last are in use; a change here overwrites the file with them`,
    fileUnreadable: error => `The file can't be read (${error}); the settings read last are in use`,
    fileUnwritable: error => `The file can't be written (${error}); changes are kept in the plugin's own storage only`,
    unknownError: 'unknown reason',
    reset: 'Restore defaults',
    resetConfirm: 'Agents and categories go back to the defaults; press again to confirm',
    listTokens: (loaded, total) => ` · listing ~${loaded} / ${total} tokens`,
    loaded: (count, total, tokens) => `${count} / ${total} skills loaded${tokens}`,
    lockedState: "● Locked: this session's skills won't change",
    loadedHeading: 'Loaded skills',
    loadedHint: 'Open a group to see each skill',
    alwaysCount: count => `Plus ${plural(count, 'always-on skill', 'always-on skills')}, in every set`,
    subagentsHeading: 'Subagents',
    subagentsHeadingHint: "Each subagent's skills, fixed when it started",
    subagent: 'Subagent',
    useLeftOut: 'To use a skill left out',
    useLeftOutHint: example => `Write its name in your message, for example ${example}`,
    otherSet: 'For another set of skills',
    otherSetAsk: 'Start a new session; the first message asks which set to use',
    otherSetPanel: 'Start a new session and choose here before the first message',
    askingState: '● The conversation is asking you which skill set to use',
    askingHint: 'Choose on that card; Claude reads your message after you do',
    noSkillsYet: 'No installed skills read yet; you can pick an Agent anyway',
    canChange: 'You can change this until the first message; then it locks',
    cardWillAsk: "You don't have to choose here: a card asks at the first message",
    whichAgent: '① Agent for this session',
    everySkill: count => `all ${count}`,
    noAgentsYet: 'No Agents yet: make one under Manage, top right',
    editedFrom: name => `Edited from "${name}"`,
    matchesNone: 'The current set matches no Agent',
    keepEditedHint: 'Pick an Agent above to start over; to keep these changes:',
    keepHint: 'To keep this set:',
    saveInto: name => `Save into "${name}"`,
    saveAsPlaceholder: 'New Agent name, then Enter',
    groupsLoaded: '② Skill groups loaded',
    groupsLoadedHint: 'You can change these until the first message',
  },
}

export const WORDS: Readonly<Record<Lang, Words>> = { zh, en }

/** The language a message is written in, as far as its script tells: Chinese characters, or Latin letters. */
export function languageOf(text: string): Lang | undefined {
  if (/[㐀-鿿]/.test(text)) return 'zh'
  return /[A-Za-z]{2,}/.test(text) ? 'en' : undefined
}

/** The language Claude Code's `language` setting names, when it is one of these two. */
export function languageFromSetting(value: unknown): Lang | undefined {
  if (typeof value !== 'string') return undefined
  const named = value.trim().toLowerCase()
  if (/^zh|chinese|mandarin|中文|汉语|漢語|简体|繁體/.test(named)) return 'zh'
  return /^en|english/.test(named) ? 'en' : undefined
}

export function asLang(value: unknown): Lang | undefined {
  return value === 'zh' || value === 'en' ? value : undefined
}
