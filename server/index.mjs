import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProposalPdf } from './proposal-pdf.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.resolve(process.env.CRM_DB_PATH || path.join(root, 'data', 'crm.sqlite'))
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;')
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    value_cents INTEGER NOT NULL DEFAULT 0 CHECK(value_cents >= 0),
    stage TEXT NOT NULL DEFAULT 'novo' CHECK(stage IN ('novo','contato','proposta','negociacao','ganho','perdido')),
    expected_close TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','enviada','aceita','recusada')),
    valid_until TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    discount_percent REAL NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 100),
    subtotal_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS proposal_items (
    id INTEGER PRIMARY KEY, proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0)
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    due_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS client_interactions (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('ligacao','email','reuniao','mensagem','outro')),
    description TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_opportunities_client ON opportunities(client_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client_id);
  CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal ON proposal_items(proposal_id);
  CREATE INDEX IF NOT EXISTS idx_activities_due ON activities(completed, due_date);
  CREATE INDEX IF NOT EXISTS idx_client_interactions_client_date ON client_interactions(client_id, occurred_at DESC);
  CREATE TABLE IF NOT EXISTS schema_migrations (
    key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const stages = new Set(['novo', 'contato', 'proposta', 'negociacao', 'ganho', 'perdido'])
const statuses = new Set(['rascunho', 'enviada', 'aceita', 'recusada'])
const query = (sql, ...args) => db.prepare(sql).all(...args)
const one = (sql, ...args) => db.prepare(sql).get(...args)
const run = (sql, ...args) => db.prepare(sql).run(...args)
const str = (value, max = 500) => String(value ?? '').trim().slice(0, max)
const required = (value, label) => {
  const result = str(value, 200)
  if (!result) throw new ApiError(400, `${label} é obrigatório.`)
  return result
}
const id = (value, label = 'ID') => {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 1) throw new ApiError(400, `${label} inválido.`)
  return result
}
const cents = (value, label = 'Valor') => {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw new ApiError(400, `${label} inválido.`)
  return result
}
const date = (value) => {
  const result = str(value, 10)
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new ApiError(400, 'Data inválida.')
  return result
}
const optionalId = (value) => value === null || value === undefined || value === '' ? null : id(value)
const exists = (table, value) => {
  if (!one(`SELECT id FROM ${table} WHERE id = ?`, value)) throw new ApiError(400, `Registro relacionado não encontrado: ${table}.`)
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function body(req) {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 1_000_000) throw new ApiError(413, 'Requisição muito grande.')
  }
  try { return JSON.parse(text || '{}') } catch { throw new ApiError(400, 'JSON inválido.') }
}

function clients() {
  return query('SELECT id, name, company, email, phone, notes, created_at AS createdAt FROM clients ORDER BY updated_at DESC, id DESC')
}
function clientInteractions(clientId) {
  exists('clients', clientId)
  return query(`SELECT id, client_id AS clientId, type, description,
    occurred_at AS occurredAt, created_at AS createdAt FROM client_interactions
    WHERE client_id = ? ORDER BY occurred_at DESC, id DESC`, clientId)
}
function saveClientInteraction(clientId, payload) {
  exists('clients', clientId)
  const type = str(payload.type, 20)
  if (!new Set(['ligacao', 'email', 'reuniao', 'mensagem', 'outro']).has(type)) throw new ApiError(400, 'Tipo de interação inválido.')
  const description = required(payload.description, 'Descrição')
  const occurredAt = str(payload.occurredAt, 16)
  const parsed = new Date(occurredAt)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(occurredAt) || Number.isNaN(parsed.getTime()) ||
      `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}` !== occurredAt) {
    throw new ApiError(400, 'Data e hora da interação inválidas.')
  }
  return Number(run('INSERT INTO client_interactions (client_id, type, description, occurred_at) VALUES (?,?,?,?)', clientId, type, description, occurredAt).lastInsertRowid)
}
function products() {
  return query('SELECT id, name, sku, description, price_cents AS priceCents, active, created_at AS createdAt FROM products ORDER BY updated_at DESC, id DESC')
}
function activities() {
  return query(`SELECT a.id, a.title, a.client_id AS clientId, c.name AS clientName,
    a.due_date AS dueDate, a.notes, a.completed, a.created_at AS createdAt
    FROM activities a LEFT JOIN clients c ON c.id = a.client_id
    ORDER BY a.completed ASC, a.due_date ASC, a.id DESC`)
}
function opportunities() {
  return query(`SELECT o.id, o.title, o.client_id AS clientId, c.name AS clientName,
    o.value_cents AS valueCents, o.stage, o.expected_close AS expectedClose, o.notes,
    o.created_at AS createdAt FROM opportunities o JOIN clients c ON c.id = o.client_id
    ORDER BY o.updated_at DESC, o.id DESC`)
}
function proposals() {
  const rows = query(`SELECT p.id, p.title, p.client_id AS clientId, c.name AS clientName,
    p.opportunity_id AS opportunityId, p.status, p.valid_until AS validUntil, p.notes,
    p.discount_percent AS discountPercent, p.subtotal_cents AS subtotalCents,
    p.total_cents AS totalCents, p.created_at AS createdAt
    FROM proposals p JOIN clients c ON c.id = p.client_id ORDER BY p.updated_at DESC, p.id DESC`)
  const items = query(`SELECT id, proposal_id AS proposalId, product_id AS productId,
    description, quantity, unit_price_cents AS unitPriceCents FROM proposal_items ORDER BY id`)
  const byProposal = new Map()
  for (const item of items) {
    if (!byProposal.has(item.proposalId)) byProposal.set(item.proposalId, [])
    byProposal.get(item.proposalId).push(item)
  }
  return rows.map(row => ({ ...row, items: byProposal.get(row.id) || [] }))
}

function saveClient(payload, currentId) {
  const name = required(payload.name, 'Nome')
  const values = [name, str(payload.company, 200), str(payload.email, 200), str(payload.phone, 50), str(payload.notes, 2000)]
  if (currentId) {
    if (!one('SELECT id FROM clients WHERE id = ?', currentId)) throw new ApiError(404, 'Cliente não encontrado.')
    run(`UPDATE clients SET name=?, company=?, email=?, phone=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...values, currentId)
    return currentId
  }
  return Number(run('INSERT INTO clients (name, company, email, phone, notes) VALUES (?,?,?,?,?)', ...values).lastInsertRowid)
}

function saveProduct(payload, currentId) {
  const values = [required(payload.name, 'Nome'), str(payload.sku, 80), str(payload.description, 2000), cents(payload.priceCents, 'Preço'), payload.active ? 1 : 0]
  if (currentId) {
    if (!one('SELECT id FROM products WHERE id = ?', currentId)) throw new ApiError(404, 'Produto não encontrado.')
    run('UPDATE products SET name=?, sku=?, description=?, price_cents=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', ...values, currentId)
    return currentId
  }
  return Number(run('INSERT INTO products (name, sku, description, price_cents, active) VALUES (?,?,?,?,?)', ...values).lastInsertRowid)
}

function saveActivity(payload, currentId) {
  const dueDate = date(payload.dueDate)
  const parsedDueDate = new Date(`${dueDate}T12:00:00Z`)
  if (!dueDate || Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== dueDate) {
    throw new ApiError(400, 'Informe uma data de vencimento válida.')
  }
  const clientId = optionalId(payload.clientId)
  if (clientId) exists('clients', clientId)
  const values = [required(payload.title, 'Título'), clientId, dueDate, str(payload.notes, 2000), payload.completed ? 1 : 0]
  if (currentId) {
    if (!one('SELECT id FROM activities WHERE id = ?', currentId)) throw new ApiError(404, 'Atividade não encontrada.')
    run(`UPDATE activities SET title=?, client_id=?, due_date=?, notes=?, completed=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...values, currentId)
    return currentId
  }
  return Number(run('INSERT INTO activities (title, client_id, due_date, notes, completed) VALUES (?,?,?,?,?)', ...values).lastInsertRowid)
}

function saveOpportunity(payload, currentId) {
  const clientId = id(payload.clientId, 'Cliente')
  exists('clients', clientId)
  const stage = str(payload.stage || 'novo', 30)
  if (!stages.has(stage)) throw new ApiError(400, 'Etapa inválida.')
  const values = [required(payload.title, 'Título'), clientId, cents(payload.valueCents), stage, date(payload.expectedClose), str(payload.notes, 2000)]
  if (currentId) {
    if (!one('SELECT id FROM opportunities WHERE id = ?', currentId)) throw new ApiError(404, 'Oportunidade não encontrada.')
    run(`UPDATE opportunities SET title=?, client_id=?, value_cents=?, stage=?, expected_close=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...values, currentId)
    return currentId
  }
  return Number(run('INSERT INTO opportunities (title, client_id, value_cents, stage, expected_close, notes) VALUES (?,?,?,?,?,?)', ...values).lastInsertRowid)
}

function saveProposal(payload, currentId) {
  const clientId = id(payload.clientId, 'Cliente')
  exists('clients', clientId)
  let opportunityId = optionalId(payload.opportunityId)
  if (opportunityId) {
    const opportunity = one('SELECT client_id AS clientId FROM opportunities WHERE id = ?', opportunityId)
    if (!opportunity || opportunity.clientId !== clientId) throw new ApiError(400, 'Oportunidade não pertence ao cliente.')
  }
  const status = str(payload.status || 'rascunho', 30)
  if (!statuses.has(status)) throw new ApiError(400, 'Status inválido.')
  const discountPercent = Number(payload.discountPercent ?? 0)
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw new ApiError(400, 'Desconto inválido.')
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 100) throw new ApiError(400, 'Adicione ao menos um item.')
  const items = payload.items.map(item => {
    const productId = optionalId(item.productId)
    if (productId) exists('products', productId)
    const quantity = id(item.quantity, 'Quantidade')
    if (quantity > 1_000_000) throw new ApiError(400, 'Quantidade muito alta.')
    return { productId, description: required(item.description, 'Descrição do item'), quantity, unitPriceCents: cents(item.unitPriceCents, 'Preço do item') }
  })
  const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  if (!Number.isSafeInteger(subtotalCents)) throw new ApiError(400, 'Total muito alto.')
  const totalCents = Math.round(subtotalCents * (1 - discountPercent / 100))
  const title = required(payload.title, 'Título')
  const validUntil = date(payload.validUntil)
  const notes = str(payload.notes, 2000)
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!opportunityId) {
      opportunityId = Number(run(`INSERT INTO opportunities
        (title, client_id, value_cents, stage, expected_close)
        VALUES (?,?,?,?,?)`, title, clientId, totalCents, 'proposta', validUntil).lastInsertRowid)
    }
    const values = [title, clientId, opportunityId, status, validUntil, notes, discountPercent, subtotalCents, totalCents]
    let proposalId = currentId
    if (currentId) {
      if (!one('SELECT id FROM proposals WHERE id = ?', currentId)) throw new ApiError(404, 'Proposta não encontrada.')
      run(`UPDATE proposals SET title=?, client_id=?, opportunity_id=?, status=?, valid_until=?, notes=?, discount_percent=?, subtotal_cents=?, total_cents=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...values, currentId)
      run('DELETE FROM proposal_items WHERE proposal_id = ?', currentId)
    } else {
      proposalId = Number(run(`INSERT INTO proposals (title, client_id, opportunity_id, status, valid_until, notes, discount_percent, subtotal_cents, total_cents) VALUES (?,?,?,?,?,?,?,?,?)`, ...values).lastInsertRowid)
    }
    for (const item of items) run('INSERT INTO proposal_items (proposal_id, product_id, description, quantity, unit_price_cents) VALUES (?,?,?,?,?)', proposalId, item.productId, item.description, item.quantity, item.unitPriceCents)
    const opportunity = one('SELECT stage FROM opportunities WHERE id = ?', opportunityId)
    if (!['ganho', 'perdido'].includes(opportunity.stage)) {
      const stage = ['novo', 'contato'].includes(opportunity.stage) ? 'proposta' : opportunity.stage
      run(`UPDATE opportunities SET stage=?, value_cents=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, stage, totalCents, opportunityId)
    }
    db.exec('COMMIT')
    return proposalId
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

function reconcileExistingProposals() {
  const migrationKey = 'proposal_pipeline_sync_v1'
  if (one('SELECT key FROM schema_migrations WHERE key = ?', migrationKey)) return
  db.exec('BEGIN IMMEDIATE')
  try {
    const unlinked = query(`SELECT id, title, client_id AS clientId, total_cents AS totalCents,
      valid_until AS validUntil FROM proposals WHERE opportunity_id IS NULL ORDER BY id`)
    for (const proposal of unlinked) {
      const opportunityId = Number(run(`INSERT INTO opportunities
        (title, client_id, value_cents, stage, expected_close) VALUES (?,?,?,?,?)`,
        proposal.title, proposal.clientId, proposal.totalCents, 'proposta', proposal.validUntil).lastInsertRowid)
      run('UPDATE proposals SET opportunity_id=? WHERE id=?', opportunityId, proposal.id)
    }
    const linked = query(`SELECT opportunity_id AS opportunityId, total_cents AS totalCents
      FROM proposals WHERE opportunity_id IS NOT NULL ORDER BY updated_at DESC, id DESC`)
    const visited = new Set()
    for (const proposal of linked) {
      if (visited.has(proposal.opportunityId)) continue
      visited.add(proposal.opportunityId)
      const opportunity = one('SELECT stage, value_cents AS valueCents FROM opportunities WHERE id = ?', proposal.opportunityId)
      if (!opportunity || ['ganho', 'perdido'].includes(opportunity.stage)) continue
      const stage = ['novo', 'contato'].includes(opportunity.stage) ? 'proposta' : opportunity.stage
      if (stage !== opportunity.stage || opportunity.valueCents !== proposal.totalCents) {
        run(`UPDATE opportunities SET stage=?, value_cents=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          stage, proposal.totalCents, proposal.opportunityId)
      }
    }
    run('INSERT INTO schema_migrations (key) VALUES (?)', migrationKey)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

reconcileExistingProposals()

async function api(req, res, pathname) {
  const method = req.method
  if (method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true })
  if (method === 'GET' && pathname === '/api/clients') return json(res, 200, clients())
  if (method === 'GET' && pathname === '/api/products') return json(res, 200, products())
  if (method === 'GET' && pathname === '/api/activities') return json(res, 200, activities())
  if (method === 'GET' && pathname === '/api/opportunities') return json(res, 200, opportunities())
  if (method === 'GET' && pathname === '/api/proposals') return json(res, 200, proposals())
  const interactionsMatch = pathname.match(/^\/api\/clients\/(\d+)\/interactions$/)
  if (interactionsMatch) {
    const clientId = id(interactionsMatch[1], 'Cliente')
    if (method === 'GET') return json(res, 200, clientInteractions(clientId))
    if (method === 'POST') return json(res, 201, { id: saveClientInteraction(clientId, await body(req)) })
    throw new ApiError(405, 'Método não permitido.')
  }
  const pdfMatch = pathname.match(/^\/api\/proposals\/(\d+)\/pdf$/)
  if (method === 'GET' && pdfMatch) {
    const proposalId = id(pdfMatch[1])
    const proposal = one(`SELECT id, title, client_id AS clientId, status, valid_until AS validUntil,
      notes, discount_percent AS discountPercent, subtotal_cents AS subtotalCents,
      total_cents AS totalCents FROM proposals WHERE id = ?`, proposalId)
    if (!proposal) throw new ApiError(404, 'Proposta não encontrada.')
    proposal.items = query(`SELECT description, quantity, unit_price_cents AS unitPriceCents
      FROM proposal_items WHERE proposal_id = ? ORDER BY id`, proposalId)
    const client = one('SELECT name, company, email, phone FROM clients WHERE id = ?', proposal.clientId)
    const pdf = await renderProposalPdf(proposal, client)
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="proposta-${String(proposalId).padStart(4, '0')}.pdf"`,
      'content-length': pdf.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    return res.end(pdf)
  }
  const match = pathname.match(/^\/api\/(clients|products|opportunities|proposals|activities)(?:\/(\d+))?$/)
  if (!match) throw new ApiError(404, 'Rota não encontrada.')
  const [, resource, rawId] = match
  const currentId = rawId ? id(rawId) : null
  if (method === 'DELETE' && currentId) {
    const table = resource
    const result = run(`DELETE FROM ${table} WHERE id = ?`, currentId)
    if (!result.changes) throw new ApiError(404, 'Registro não encontrado.')
    return json(res, 200, { ok: true })
  }
  if ((method === 'POST' && !currentId) || (method === 'PUT' && currentId)) {
    const payload = await body(req)
    const save = { clients: saveClient, products: saveProduct, opportunities: saveOpportunity, proposals: saveProposal, activities: saveActivity }[resource]
    const savedId = save(payload, currentId)
    return json(res, currentId ? 200 : 201, { id: savedId })
  }
  throw new ApiError(405, 'Método não permitido.')
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
async function serveApp(res, pathname) {
  const dist = path.join(root, 'dist')
  if (!existsSync(dist)) throw new ApiError(404, 'Front não compilado. Execute npm run dev ou npm run build.')
  const asset = path.resolve(dist, '.' + pathname)
  const target = asset.startsWith(dist + path.sep) && existsSync(asset) ? asset : path.join(dist, 'index.html')
  const bytes = await readFile(target)
  res.writeHead(200, { 'content-type': `${mime[path.extname(target)] || 'application/octet-stream'}; charset=utf-8` })
  res.end(bytes)
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname.startsWith('/api/')) await api(req, res, pathname)
    else if (req.method === 'GET') await serveApp(res, pathname)
    else throw new ApiError(405, 'Método não permitido.')
  } catch (error) {
    const constraint = String(error?.message || '').includes('FOREIGN KEY constraint failed')
    if (!(error instanceof ApiError) && !constraint) console.error(error)
    json(res, error.status || (constraint ? 409 : 500), { error: constraint ? 'Este registro está em uso e não pode ser excluído.' : (error.status ? error.message : 'Erro interno do servidor.') })
  }
})

const port = Number(process.env.PORT || 3001)
server.listen(port, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${port}`))
