import type { AnalysisTemplate, Metric, PracticeTemplate } from './entities'

export const BUILTIN_TEMPLATES: AnalysisTemplate[] = [
  {
    id: 'quick',
    name: 'Quick note',
    builtIn: true,
    fields: [
      { key: 'hook', label: 'Hook', hint: 'What stops the scroll in the first 2 seconds?' },
      { key: 'takeaway', label: 'Takeaway', hint: 'One thing you’d steal.' },
    ],
  },
  {
    id: 'deep',
    name: 'Deep breakdown',
    builtIn: true,
    fields: [
      { key: 'hook', label: 'Hook', hint: 'Exact words/visual and why it stops the scroll' },
      { key: 'angle', label: 'Creative angle' },
      { key: 'audience', label: 'Target audience' },
      { key: 'awareness', label: 'Awareness & sophistication', hint: 'Schwartz stage, market sophistication' },
      { key: 'offer', label: 'Messaging & offer' },
      { key: 'structure', label: 'Script / narrative structure' },
      { key: 'execution', label: 'Pacing & visual execution' },
      { key: 'mechanisms', label: 'Persuasion mechanisms', hint: 'Proof, authority, specificity, objection handling…' },
      { key: 'why', label: 'Why it may work' },
      { key: 'weaknesses', label: 'Weaknesses / uncertainties' },
      { key: 'takeaways', label: 'Key takeaways' },
      { key: 'ideas', label: 'Ideas to test or apply' },
    ],
  },
]

export const DEFAULT_PRACTICE_TEMPLATES: PracticeTemplate[] = [
  { id: 'pt-default', name: 'Standard week', target: 7, focus: 'Hooks & angles', analysisTemplateId: 'deep', days: [1, 2, 3, 4, 5, 6, 0] },
  { id: 'pt-light', name: 'Busy week (school)', target: 3, focus: 'Quick hook studies', analysisTemplateId: 'quick', days: [2, 4, 6] },
]

const m = (p: Omit<Metric, 'archived' | 'createdAt'>): Metric => ({ archived: false, createdAt: '2026-01-01T00:00:00.000Z', ...p })

/** Starter metrics — real configuration (not demo data); every target is editable. */
export const STARTER_METRICS: Metric[] = [
  m({ id: 'm-concepts', name: 'Concepts delivered', workspace: 'tps', kind: 'output', unit: 'count', source: { type: 'auto', key: 'deliverables_delivered', deliverableType: 'Concepts' }, defaultTarget: 6, carryOver: false, pinned: true, order: 0 }),
  m({ id: 'm-deliverables', name: 'Client deliverables completed', workspace: 'tps', kind: 'output', unit: 'count', source: { type: 'auto', key: 'deliverables_completed' }, defaultTarget: 8, carryOver: false, pinned: false, order: 1 }),
  m({ id: 'm-outreach', name: 'Qualified outreach attempts', workspace: 'tps', kind: 'effort', unit: 'count', source: { type: 'auto', key: 'outreach' }, defaultTarget: 15, carryOver: true, pinned: true, order: 2 }),
  m({ id: 'm-proposals', name: 'Proposals submitted', workspace: 'tps', kind: 'output', unit: 'count', source: { type: 'auto', key: 'proposals_sent' }, defaultTarget: 3, carryOver: false, pinned: false, order: 3 }),
  m({ id: 'm-deepwork', name: 'TPS deep-work hours', workspace: 'tps', kind: 'effort', unit: 'hours', source: { type: 'auto', key: 'focus_hours_tps' }, defaultTarget: 12, carryOver: false, pinned: true, order: 4 }),
  m({ id: 'm-ads', name: 'Ads analyzed', workspace: 'lab', kind: 'output', unit: 'count', source: { type: 'auto', key: 'analyses_completed' }, defaultTarget: 7, carryOver: true, pinned: true, order: 5 }),
  m({ id: 'm-hooks', name: 'Hooks rewritten', workspace: 'lab', kind: 'output', unit: 'count', source: { type: 'manual' }, defaultTarget: 20, carryOver: false, pinned: false, order: 6 }),
  m({ id: 'm-insights', name: 'Insights saved', workspace: 'lab', kind: 'output', unit: 'count', source: { type: 'auto', key: 'insights_created' }, defaultTarget: 3, carryOver: false, pinned: false, order: 7 }),
]
