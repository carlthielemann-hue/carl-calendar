import type { EntityType, Ref } from './entities'

export const ref = (type: EntityType, id: string): Ref => `${type}:${id}` as Ref

export function parseRef(r: string | undefined): { type: EntityType; id: string } | null {
  if (!r) return null
  const i = r.indexOf(':')
  if (i < 1) return null
  return { type: r.slice(0, i) as EntityType, id: r.slice(i + 1) }
}

export const refType = (r: string | undefined) => parseRef(r)?.type
