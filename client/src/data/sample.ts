// Sample files for running the client in a plain browser (`pnpm dev`), where
// there is no data folder to read. Nothing here is anyone's real setup.

import { DEFAULTS, FILES, type FileName } from './files'

type Sample = { name: string; tokens: number; description: string; source: string; plugin?: string }

const builtIn = (name: string, tokens: number, description: string): Sample => ({ name, tokens, description, source: 'built-in' })
const fromPlugin = (plugin: string, name: string, tokens: number, description: string): Sample => ({
  name: `${plugin}:${name}`,
  tokens,
  description,
  source: 'plugin',
  plugin,
})
const loose = (name: string, tokens: number, description: string, source = 'userSettings'): Sample => ({ name, tokens, description, source })

const SKILLS: Sample[] = [
  builtIn('code-review', 85, 'Review the current diff for correctness bugs, at the effort level you choose.'),
  builtIn('simplify', 60, 'Review changed code for reuse, simplification and efficiency, then apply the fixes.'),
  builtIn('init', 25, 'Write a CLAUDE.md file that documents the codebase.'),
  builtIn('run', 70, "Launch and drive the project's app to see a change working."),
  builtIn('claude-api', 240, 'Reference for the Claude API and Anthropic SDK: models, tools, caching, streaming.'),
  builtIn('fewer-permission-prompts', 45, 'Add an allowlist for the read-only commands you run most.'),
  builtIn('security-review', 20, 'Complete a security review of the pending changes.'),
  builtIn('update-config', 150, 'Configure Claude Code through settings.json: hooks, permissions, environment.'),
  builtIn('keybindings-help', 40, 'Customize keyboard shortcuts and chord bindings.'),
  builtIn('loop', 75, 'Run a prompt or slash command on a recurring interval.'),
  builtIn('schedule', 80, 'Create, list and run scheduled cloud agents.'),
  builtIn('artifact-design', 30, 'Design guidance and fundamentals for Artifacts.'),
  builtIn('artifact-capabilities', 90, 'Runtime capabilities a published Artifact page can be granted.'),
  builtIn('artifact-diagramming', 35, 'Diagramming know-how for Artifacts.'),
  builtIn('dataviz', 260, 'Charts and dashboards that read as one system, in light and dark.'),
  builtIn('plugin-authoring', 120, 'Make a mod: a theme, a pane, a band, a slash command or a hook on tool calls.'),
  fromPlugin('anthropic-skills', 'docx', 160, 'Create, read and edit Word documents and templates.'),
  fromPlugin('anthropic-skills', 'pdf', 110, 'Read, merge, split, fill and OCR PDF files.'),
  fromPlugin('anthropic-skills', 'xlsx', 170, 'Open, clean, chart and create spreadsheets.'),
  fromPlugin('anthropic-skills', 'pptx', 160, 'Create and edit PowerPoint decks.'),
  fromPlugin('anthropic-skills', 'docs', 200, 'Editable docs people share and comment on.'),
  fromPlugin('anthropic-skills', 'built-in-browser', 130, 'Use the browser pane inside the Claude desktop app.'),
  fromPlugin('anthropic-skills', 'chrome-browser', 120, "Use Claude in Chrome, in the person's own browser."),
  fromPlugin('anthropic-skills', 'computer-use', 140, 'Use apps on the computer with screenshots, clicks and typing.'),
  fromPlugin('anthropic-skills', 'skill-creator', 70, 'Create, edit and evaluate skills.'),
  fromPlugin('anthropic-skills', 'deep-research', 90, 'Research a topic across many sources into one report.'),
  fromPlugin('figma', 'figma-use', 180, 'Run Figma Plugin API operations in a file.'),
  fromPlugin('figma', 'figma-generate-design', 150, 'Build or update a screen in Figma from code or a description.'),
  fromPlugin('figma', 'figma-create-design-system-rules', 60, "Write design system rules for a codebase's components."),
  loose('image-prompt', 140, '把画面想法转成包含机位、构图、光线和色彩的摄影提示词。'),
  loose('remotion-render', 40, 'Export a Remotion video, still image or timeline.'),
  loose('remotion-captions', 30, 'Transcribe, display and animate captions in Remotion.'),
  loose('hyperframes', 160, 'Make, animate and render videos written in HTML.'),
  loose('media-use', 120, 'Get or make music, sound effects, images and voice-over for a video.'),
  loose('meeting-notes', 60, '把会议录音或记录整理成纪要和待办事项。'),
  loose('release-notes', 55, 'Write release notes from merged pull requests.'),
  loose('brand-voice', 50, "Rewrite copy in the team's brand voice."),
  loose('sql-helper', 65, 'Explain, write and tune SQL queries.'),
  loose('regex-coach', 35, 'Build and explain regular expressions, with test cases.'),
  loose('travel-planner', 70, 'Plan a trip: routes, bookings and a packing list.'),
  loose('api-conventions', 45, "This repository's API naming and error conventions.", 'projectSettings'),
]

const LIBRARY = {
  version: 1,
  askOnNewSession: true,
  subagentPicker: 'agent',
  language: 'auto',
  groups: {
    视频剪辑: ['remotion-*', 'hyperframes', 'media-use'],
    写作: ['meeting-notes', 'release-notes', 'brand-voice'],
  },
  agents: {
    Coding: {
      groups: [],
      skills: ['code-review', 'simplify', 'init', 'run', 'claude-api', 'fewer-permission-prompts', 'security-review'],
    },
    Docs: {
      groups: [],
      skills: ['anthropic-skills:docx', 'anthropic-skills:pdf', 'anthropic-skills:xlsx', 'anthropic-skills:pptx', 'anthropic-skills:docs'],
    },
    视频制作: { groups: ['g:视频剪辑', 'p:figma'], skills: ['image-prompt'] },
    写作助手: { groups: ['g:写作'], skills: ['anthropic-skills:docs', 'anthropic-skills:docx'] },
  },
}

/**
 * The data folder's files as a person who uses the plugin might have them, `now` being the time they
 * are read; with `isPrepared`, a set prepared for the next session a few minutes ago (`?prepared`).
 */
export function sampleFiles(now: number, isPrepared = false): Partial<Record<FileName, string>> {
  const catalog = {
    platform: 'claude-code',
    updatedAt: new Date(now - 3 * 60_000).toISOString(),
    alwaysOn: DEFAULTS.alwaysOn,
    skills: SKILLS.map(skill => ({ ...skill, lastSeen: now - 3 * 60_000 })),
  }

  const prepared = {
    version: 1,
    basedOn: 'Coding',
    groups: [],
    skills: [...LIBRARY.agents.Coding.skills.filter(name => name !== 'init'), 'sql-helper', 'regex-coach'],
    createdAt: new Date(now - 8 * 60_000).toISOString(),
    usedBy: null,
  }

  return {
    [FILES.library]: `${JSON.stringify(LIBRARY, null, 2)}\n`,
    [FILES.catalog]: `${JSON.stringify(catalog, null, 2)}\n`,
    ...(isPrepared ? { [FILES.next]: `${JSON.stringify(prepared, null, 2)}\n` } : {}),
  }
}
