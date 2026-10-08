import type { Concept, Insight, Ref } from './entities'

/**
 * Ad → Analysis → Insight → Concept → Deliverable for one insight. Deliverables are the union of
 * direct links and concept links, so work reached both ways is counted once.
 */
export function insightChain(s: { concepts: Concept[] }, insight: Insight) {
  const sources = insight.links.filter((l) => l.startsWith('ad:') || l.startsWith('analysis:'))
  const concepts = s.concepts.filter((c) => c.insightIds.includes(insight.id))
  const deliverables = [...new Set<Ref>([...insight.links.filter((l) => l.startsWith('deliverable:')), ...concepts.filter((c) => c.deliverableId).map((c) => `deliverable:${c.deliverableId}` as Ref)])]
  return { sources, concepts: concepts.map((c) => `concept:${c.id}` as Ref), deliverables }
}

