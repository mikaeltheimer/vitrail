// Base factice en mémoire, juste assez de PostgREST pour les tests : select/insert/update/delete, eq/in/gt/gte/lte/like,
// order, range, limit, maybeSingle/single. Les clés étrangères et les vues ne sont PAS simulées (elles sont testées en SQL).
type Row = Record<string, unknown>
export const tables: Record<string, Row[]> = {}
export const calls: { table: string; op: string; filters: [string, unknown][] }[] = []
let seq = 0

class Query {
  private filters: ((r: Row) => boolean)[] = []
  private described: [string, unknown][] = []
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private orderBy: string | null = null
  private from = 0
  private to = Infinity
  private mode: 'one' | 'maybe' | null = null
  constructor(private table: string) {}
  select() { return this }
  insert(p: Row | Row[]) { this.op = 'insert'; this.payload = p; return this }
  update(p: Row) { this.op = 'update'; this.payload = p; return this }
  delete() { this.op = 'delete'; return this }
  private f(col: string, v: unknown, fn: (x: unknown) => boolean) { this.described.push([col, v]); this.filters.push(r => fn(r[col])); return this }
  eq(c: string, v: unknown) { return this.f(c, v, x => x === v) }
  in(c: string, v: unknown[]) { return this.f(c, v, x => v.includes(x)) }
  gt(c: string, v: number) { return this.f(c, v, x => Number(x) > v) }
  gte(c: string, v: string) { return this.f(c, v, x => String(x) >= v) }
  lte(c: string, v: string) { return this.f(c, v, x => String(x) <= v) }
  like(c: string, v: string) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$'); return this.f(c, v, x => re.test(String(x))) }
  order(c: string) { this.orderBy = c; return this }
  range(a: number, b: number) { this.from = a; this.to = b; return this }
  limit(n: number) { this.to = n - 1; return this }
  maybeSingle() { this.mode = 'maybe'; return this }
  // single() ne sert qu'après un insert dans le code
  singleRow() { this.mode = 'one'; return this }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(this.run()).then(res, rej) }
  private run(): { data: unknown; error: unknown } {
    calls.push({ table: this.table, op: this.op, filters: this.described })
    const rows = (tables[this.table] ??= [])
    if (this.op === 'insert') {
      const list: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(p => ({ id: `id-${++seq}`, created_at: new Date(1_000 + seq).toISOString(), ...p }))
      for (const p of list) {
        for (const key of UNIQUE[this.table] ?? []) {
          const cols = key.split('+')
          if (rows.some(r => cols.every(c => r[c] === p[c]))) return { data: null, error: { code: '23505', message: `duplicate ${key}` } }
        }
      }
      rows.push(...list)
      return { data: this.mode ? list[0] : list, error: null }
    }
    const hit = rows.filter(r => this.filters.every(f => f(r)))
    if (this.op === 'update') { for (const r of hit) Object.assign(r, this.payload); return { data: null, error: null } }
    if (this.op === 'delete') { tables[this.table] = rows.filter(r => !hit.includes(r)); return { data: null, error: null } }
    let out = [...hit]
    if (this.orderBy) out.sort((a, b) => (String(a[this.orderBy!]) < String(b[this.orderBy!]) ? -1 : 1))
    out = out.slice(this.from, this.to + 1)
    if (this.mode) return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }
}
// Contraintes d'unicité de la base réelle (colonnes séparées par « + »)
const UNIQUE: Record<string, string[]> = {
  donors: ['organization_id+email'],
  donations: ['provider_ref'],
}
export const fakeDb = {
  from(table: string) {
    const q = new Query(table)
    // le code appelle .single() après insert().select() : on l'expose
    ;(q as unknown as { single: () => Query }).single = () => q.singleRow()
    return q
  },
}
export const reset = () => { for (const k of Object.keys(tables)) delete tables[k]; calls.length = 0 }
