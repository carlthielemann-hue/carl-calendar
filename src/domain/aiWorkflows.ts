import type { AiWorkflow } from './entities'

const W = (w: Omit<AiWorkflow, 'builtIn'>): AiWorkflow => ({ ...w, builtIn: true })

/**
 * Built-in AI Studio workflows. Templates are plain text with placeholders:
 * {{client}} — client name, {{context}} — the context pack you selected, {{input.key}} — workflow inputs.
 * All are editable in the app; "Reset" restores these defaults.
 */
export const BUILTIN_WORKFLOWS: AiWorkflow[] = [
  W({
    id: 'wf-angles',
    name: 'Generate creative angles',
    description: 'Fresh angles grounded in the client’s customers, offer and past learnings.',
    template: `You are a senior direct-response creative strategist working for {{client}}.

{{context}}

Task: generate {{input.count}} distinct creative angles for {{input.product}}.
For each angle give: the angle in one line, the core desire or pain it targets, the awareness level it fits, a sample hook, and why it could beat what the brand runs now.
Respect every creative restriction above. Mark any claim that needs substantiation.`,
    inputs: [
      { key: 'product', label: 'Product / offer', placeholder: 'e.g. Barrier repair serum' },
      { key: 'count', label: 'How many angles', placeholder: '8' },
    ],
    defaultContext: ['brand', 'research', 'insights', 'performance'],
    saveAs: 'research',
  }),
  W({
    id: 'wf-hooks',
    name: 'Write advertising hooks',
    description: 'Scroll-stopping first lines for a given angle and format.',
    template: `Write {{input.count}} hooks for {{client}} — angle: {{input.angle}}; format: {{input.format}}.

{{context}}

Mix hook types (confession, contrarian, specific number, question, pattern interrupt, social proof). Keep each under 15 words. Use the customer's own language from the research where possible. After the list, star your top 3 and say why.`,
    inputs: [
      { key: 'angle', label: 'Angle', multiline: true },
      { key: 'format', label: 'Format', placeholder: 'UGC video, static, …' },
      { key: 'count', label: 'How many', placeholder: '20' },
    ],
    defaultContext: ['brand', 'research', 'insights'],
    saveAs: 'concept',
  }),
  W({
    id: 'wf-ugc',
    name: 'Draft UGC scripts',
    description: 'Creator-style scripts with hook, problem, product moment, proof and CTA.',
    template: `Draft {{input.count}} UGC ad scripts for {{client}}.
Angle / brief: {{input.angle}}
Length: {{input.length}}

{{context}}

Format each script as a table: timestamp, on-screen action, spoken line, text overlay. Open with a hook in the first 2 seconds, keep the language natural and spoken, include one proof moment and a clear CTA. Stay inside the creative restrictions.`,
    inputs: [
      { key: 'angle', label: 'Angle / brief', multiline: true },
      { key: 'length', label: 'Length', placeholder: '30–45 seconds' },
      { key: 'count', label: 'How many scripts', placeholder: '3' },
    ],
    defaultContext: ['brand', 'research', 'feedback', 'insights'],
    saveAs: 'concept',
  }),
  W({
    id: 'wf-research',
    name: 'Analyze customer research',
    description: 'Turn raw reviews, comments or survey answers into structured insight.',
    template: `Analyze this customer research for {{client}}.

{{context}}

Raw research:
{{input.raw}}

Output: (1) top pains, (2) desires, (3) objections, (4) exact phrases worth stealing (verbatim, with counts if repeated), (5) segments you notice, (6) three angles the research supports. Quote, don't paraphrase, where it matters.`,
    inputs: [{ key: 'raw', label: 'Paste reviews / comments / survey answers', multiline: true }],
    defaultContext: ['brand'],
    saveAs: 'research',
  }),
  W({
    id: 'wf-competitors',
    name: 'Research competitors',
    description: 'Map competitor positioning, offers and creative patterns.',
    template: `Do competitor research for {{client}}.
Competitors to look at: {{input.competitors}}

{{context}}

For each competitor: positioning, hero offer and price, main claims, creative formats and angles they run most, what they do better than {{client}}, and a gap {{client}} can exploit. Finish with a one-paragraph summary of the whitespace. Say clearly which points are verified from sources vs. your assumptions.`,
    inputs: [{ key: 'competitors', label: 'Competitors (names or URLs)', multiline: true }],
    defaultContext: ['brand'],
    saveAs: 'research',
  }),
  W({
    id: 'wf-review',
    name: 'Review a creative concept',
    description: 'A blunt strategist review against the brief and what has worked before.',
    template: `Review this creative concept for {{client}} like a demanding creative director.

Concept:
{{input.concept}}

{{context}}

Score 1–10 on: hook strength, clarity of the angle, fit with the customer research, believability/proof, compliance risk. Then list the 3 changes that would most improve it, and rewrite the hook 3 ways.`,
    inputs: [{ key: 'concept', label: 'Concept / script', multiline: true }],
    defaultContext: ['brand', 'feedback', 'performance'],
    saveAs: 'note',
  }),
  W({
    id: 'wf-feedback',
    name: 'Improve a script using client feedback',
    description: 'Apply the client’s feedback without losing what works.',
    template: `Revise this script for {{client}} using their feedback.

Current script:
{{input.script}}

{{context}}

Apply every open feedback point, keep what already works, and list each change you made next to the feedback it addresses. Flag any feedback that conflicts with performance learnings.`,
    inputs: [{ key: 'script', label: 'Current script', multiline: true }],
    defaultContext: ['brand', 'feedback', 'performance'],
    saveAs: 'concept',
  }),
  W({
    id: 'wf-brief',
    name: 'Summarize a client brief',
    description: 'One page: objective, audience, offer, mandatories, deliverables, open questions.',
    template: `Summarize this brief for {{client}} into one page.

Brief:
{{input.brief}}

{{context}}

Sections: objective, audience, offer, key message, mandatories & restrictions, deliverables with quantities and deadlines, open questions to ask the client.`,
    inputs: [{ key: 'brief', label: 'Paste the brief', multiline: true }],
    defaultContext: ['brand'],
    saveAs: 'research',
  }),
  W({
    id: 'wf-testing',
    name: 'Generate a creative testing plan',
    description: 'What to test next, in what order, and how to read the results.',
    template: `Create a creative testing plan for {{client}} for the next {{input.weeks}} weeks. Budget context: {{input.budget}}.

{{context}}

Include: hypotheses ranked by expected impact, test structure (what varies, what stays fixed), number of creatives per test, success metrics and decision rules, and what to do with winners. Base priorities on the performance learnings above; don't invent numbers.`,
    inputs: [
      { key: 'weeks', label: 'Weeks', placeholder: '4' },
      { key: 'budget', label: 'Budget / constraints', multiline: true },
    ],
    defaultContext: ['brand', 'performance', 'concepts', 'insights'],
    saveAs: 'research',
  }),
  W({
    id: 'wf-insights',
    name: 'Turn Lab insights into client concepts',
    description: 'Apply what you learned from ad analyses to this client.',
    template: `Turn these creative insights into concepts for {{client}}.

{{context}}

For each insight above, write one concept: title, angle, hook, 3-line script outline, and why the insight transfers to this brand (or why it doesn't). Stay inside the restrictions.`,
    inputs: [],
    defaultContext: ['brand', 'insights', 'research'],
    saveAs: 'concept',
  }),
]

/** Fill a workflow template. Unknown placeholders become empty strings. */
export function renderTemplate(template: string, vars: { client: string; context: string; input: Record<string, string> }) {
  return template
    .replace(/\{\{client\}\}/g, vars.client)
    .replace(/\{\{context\}\}/g, vars.context.trim() || '(No client context selected.)')
    .replace(/\{\{input\.([\w-]+)\}\}/g, (_, k) => vars.input[k]?.trim() || '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
