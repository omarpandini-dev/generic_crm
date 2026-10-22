import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProposalPdf } from './proposal-pdf.mjs'
import { initialize, query, one, run, transaction } from './db.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const stages = new Set(['novo', 'contato', 'proposta', 'negociacao', 'ganho', 'perdido'])
const statuses = new Set(['rascunho', 'enviada', 'aceita', 'recusada'])
const interactionTypes = new Set(['ligacao', 'email', 'reuniao', 'mensagem', 'outro'])
const contactInteractionTypes = new Set(['ligacao', 'email', 'reuniao', 'mensagem'])
const str = (value, max = 500) => String(value ?? '').trim().slice(0, max)
const required = (value, label) => {
  const result = str(value, 200)
  if (!result) throw new ApiError(400, `${label} Ã© obrigatÃ³rio.`)
  return result
}
const id = (value, label = 'ID') => {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 1) throw new ApiError(400, `${label} invÃ¡lido.`)
  return result
}
const cents = (value, label = 'Valor') => {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw new ApiError(400, `${label} invÃ¡lido.`)
  return result
}
const date = (value) => {
  const result = str(value, 10)
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new ApiError(400, 'Data invÃ¡lida.')
  return result
}
const legacyDeliveryPattern = /^Prazo de entrega:[ \t]*(\d{2})\/(\d{2})\/(\d{4})(?:\r?\n|$)/
const optionalId = (value) => value === null || value === undefined || value === '' ? null : id(value)
const exists = async (table, value) => {
  if (!await one(`SELECT id FROM ${table} WHERE id = ?`, value)) throw new ApiError(400, `Registro relacionado nÃ£o encontrado: ${table}.`)
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
    if (text.length > 1_000_000) throw new ApiError(413, 'RequisiÃ§Ã£o muito grande.')
  }
  try { return JSON.parse(text || '{}') } catch { throw new ApiError(400, 'JSON invÃ¡lido.') }
}

async function clients() {
  return await query('SELECT id, name, company, email, phone, notes, created_at AS createdAt FROM clients ORDER BY updated_at DESC, id DESC')
}
async function clientInteractions(clientId) {
  await exists('clients', clientId)
  return await query(`SELECT i.id, i.client_id AS clientId, i.opportunity_id AS opportunityId, i.type, i.description,
    i.occurred_at AS occurredAt, i.scheduled_at AS scheduledAt, i.completed,
    i.funnel_stage AS funnelStage, i.created_at AS createdAt FROM client_interactions i
    WHERE i.client_id = ? ORDER BY i.occurred_at DESC, i.id DESC`, clientId)
}
async function allClientInteractions() {
  return await query(`SELECT i.id, i.client_id AS clientId, i.opportunity_id AS opportunityId, c.name AS clientName, i.type,
    i.description, i.occurred_at AS occurredAt, i.scheduled_at AS scheduledAt,
    i.completed, i.funnel_stage AS funnelStage, i.created_at AS createdAt
    FROM client_interactions i JOIN clients c ON c.id = i.client_id
    ORDER BY i.occurred_at DESC, i.id DESC`)
}
function dateTime(value, label, optional = false) {
  const result = str(value, 16)
  if (optional && !result) return ''
  const parsed = new Date(result)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(result) || Number.isNaN(parsed.getTime()) ||
      `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}` !== result) {
    throw new ApiError(400, `${label} invÃ¡lida.`)
  }
  return result
}
async function saveClientInteraction(clientId, payload) {
  const client = await one('SELECT name FROM clients WHERE id = ?', clientId)
  if (!client) throw new ApiError(400, 'Cliente nÃ£o encontrado.')
  const type = str(payload.type, 20)
  if (!interactionTypes.has(type)) throw new ApiError(400, 'Tipo de interaÃ§Ã£o invÃ¡lido.')
  const description = required(payload.description, 'DescriÃ§Ã£o')
  const occurredAt = dateTime(payload.occurredAt, 'Data e hora da interaÃ§Ã£o')
  const scheduledAt = dateTime(payload.scheduledAt, 'Data programada', true)
  const requestedOpportunityId = optionalId(payload.opportunityId)
  return transaction(async () => {
    let opportunity = null
    if (requestedOpportunityId) {
      opportunity = await one('SELECT id, stage FROM opportunities WHERE id = ? AND client_id = ?', requestedOpportunityId, clientId)
      if (!opportunity) throw new ApiError(400, 'Oportunidade nÃ£o pertence ao cliente.')
    }
    const active = opportunity ? [] : await query("SELECT id, stage FROM opportunities WHERE client_id = ? AND stage NOT IN ('ganho','perdido')", clientId)
    if (!opportunity && active.length === 1) opportunity = active[0]
    else if (!opportunity && active.length === 0 && contactInteractionTypes.has(type) &&
      !await one('SELECT id FROM opportunities WHERE client_id = ? LIMIT 1', clientId)) {
      const title = str(`Contato com ${client.name}`, 200)
      const opportunityId = Number((await run('INSERT INTO opportunities (title, client_id, value_cents, stage) VALUES (?,?,0,?)', title, clientId, 'contato')).lastInsertRowid)
      opportunity = { id: opportunityId, stage: 'contato' }
    }
    const interactionId = Number((await run(`INSERT INTO client_interactions
      (client_id, opportunity_id, type, description, occurred_at, scheduled_at, funnel_stage)
      VALUES (?,?,?,?,?,?,?)`, clientId, opportunity?.id ?? null, type, description, occurredAt, scheduledAt,
      opportunity?.stage ?? '')).lastInsertRowid)
    return interactionId
  })
}
async function products() {
  return await query('SELECT id, name, sku, description, price_cents AS priceCents, active, created_at AS createdAt FROM products ORDER BY updated_at DESC, id DESC')
}
async function activities() {
  return await query(`SELECT a.id, a.title, a.client_id AS clientId, c.name AS clientName,
    a.due_date AS dueDate, a.notes, a.completed, a.created_at AS createdAt
    FROM activities a LEFT JOIN clients c ON c.id = a.client_id
    ORDER BY a.completed ASC, a.due_date ASC, a.id DESC`)
}
async function opportunities() {
  return await query(`SELECT o.id, o.title, o.client_id AS clientId, c.name AS clientName,
    o.value_cents AS valueCents, o.stage, o.notes,
    o.created_at AS createdAt FROM opportunities o JOIN clients c ON c.id = o.client_id
    ORDER BY o.updated_at DESC, o.id DESC`)
}
async function proposals() {
  const rows = await query(`SELECT p.id, p.title, p.client_id AS clientId, c.name AS clientName,
    p.opportunity_id AS opportunityId, p.status, p.valid_until AS validUntil,
    p.delivery_date AS deliveryDate, p.notes,
    p.discount_percent AS discountPercent, p.subtotal_cents AS subtotalCents,
    p.total_cents AS totalCents, p.created_at AS createdAt
    FROM proposals p JOIN clients c ON c.id = p.client_id ORDER BY p.updated_at DESC, p.id DESC`)
  const items = await query(`SELECT id, proposal_id AS proposalId, product_id AS productId,
    description, quantity, unit_price_cents AS unitPriceCents FROM proposal_items ORDER BY id`)
  const byProposal = new Map()
  for (const item of items) {
    if (!byProposal.has(item.proposalId)) byProposal.set(item.proposalId, [])
    byProposal.get(item.proposalId).push(item)
  }
  return rows.map(row => ({ ...row, items: byProposal.get(row.id) || [] }))
}

async function saveClient(payload, currentId) {
  const name = required(payload.name, 'Nome')
  const values = [name, str(payload.company, 200), str(payload.email, 200), str(payload.phone, 50), str(payload.notes, 2000)]
  if (currentId) {
    if (!await one('SELECT id FROM clients WHERE id = ?', currentId)) throw new ApiError(404, 'Cliente nÃ£o encontrado.')
    await run(`UPDATE clients SET name=?, company=?, email=?, phone=?, notes=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?`, ...values, currentId)
    return currentId
  }
  return Number((await run('INSERT INTO clients (name, company, email, phone, notes) VALUES (?,?,?,?,?)', ...values)).lastInsertRowid)
}

async function saveProduct(payload, currentId) {
  const values = [required(payload.name, 'Nome'), str(payload.sku, 80), str(payload.description, 2000), cents(payload.priceCents, 'PreÃ§o'), payload.active ? 1 : 0]
  if (currentId) {
    if (!await one('SELECT id FROM products WHERE id = ?', currentId)) throw new ApiError(404, 'Produto nÃ£o encontrado.')
    await run('UPDATE products SET name=?, sku=?, description=?, price_cents=?, active=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?', ...values, currentId)
    return currentId
  }
  return Number((await run('INSERT INTO products (name, sku, description, price_cents, active) VALUES (?,?,?,?,?)', ...values)).lastInsertRowid)
}

async function saveActivity(payload, currentId) {
  const dueDate = date(payload.dueDate)
  const parsedDueDate = new Date(`${dueDate}T12:00:00Z`)
  if (!dueDate || Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== dueDate) {
    throw new ApiError(400, 'Informe uma data de vencimento vÃ¡lida.')
  }
  const clientId = optionalId(payload.clientId)
  if (clientId) await exists('clients', clientId)
  const values = [required(payload.title, 'TÃ­tulo'), clientId, dueDate, str(payload.notes, 2000), payload.completed ? 1 : 0]
  if (currentId) {
    if (!await one('SELECT id FROM activities WHERE id = ?', currentId)) throw new ApiError(404, 'Atividade nÃ£o encontrada.')
    await run(`UPDATE activities SET title=?, client_id=?, due_date=?, notes=?, completed=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?`, ...values, currentId)
    return currentId
  }
  return Number((await run('INSERT INTO activities (title, client_id, due_date, notes, completed) VALUES (?,?,?,?,?)', ...values)).lastInsertRowid)
}

async function saveOpportunity(payload, currentId) {
  const clientId = id(payload.clientId, 'Cliente')
  await exists('clients', clientId)
  const stage = str(payload.stage || 'novo', 30)
  if (!stages.has(stage)) throw new ApiError(400, 'Etapa invÃ¡lida.')
  const values = [required(payload.title, 'TÃ­tulo'), clientId, cents(payload.valueCents), stage, str(payload.notes, 2000)]
  if (currentId) {
    if (!await one('SELECT id FROM opportunities WHERE id = ?', currentId)) throw new ApiError(404, 'Oportunidade nÃ£o encontrada.')
    await run(`UPDATE opportunities SET title=?, client_id=?, value_cents=?, stage=?, notes=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?`, ...values, currentId)
    return currentId
  }
  return Number((await run('INSERT INTO opportunities (title, client_id, value_cents, stage, notes) VALUES (?,?,?,?,?)', ...values)).lastInsertRowid)
}

async function saveProposal(payload, currentId) {
  const clientId = id(payload.clientId, 'Cliente')
  await exists('clients', clientId)
  let opportunityId = optionalId(payload.opportunityId)
  if (opportunityId) {
    const opportunity = await one('SELECT client_id AS clientId FROM opportunities WHERE id = ?', opportunityId)
    if (!opportunity || opportunity.clientId !== clientId) throw new ApiError(400, 'Oportunidade nÃ£o pertence ao cliente.')
  }
  const status = str(payload.status || 'rascunho', 30)
  if (!statuses.has(status)) throw new ApiError(400, 'Status invÃ¡lido.')
  const discountPercent = Number(payload.discountPercent ?? 0)
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw new ApiError(400, 'Desconto invÃ¡lido.')
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 100) throw new ApiError(400, 'Adicione ao menos um item.')
  const items = []
  for (const item of payload.items) {
    const productId = optionalId(item.productId)
    if (productId) await exists('products', productId)
    const quantity = id(item.quantity, 'Quantidade')
    if (quantity > 1_000_000) throw new ApiError(400, 'Quantidade muito alta.')
    items.push({ productId, description: required(item.description, 'DescriÃ§Ã£o do item'), quantity, unitPriceCents: cents(item.unitPriceCents, 'PreÃ§o do item') })
  }
  const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  if (!Number.isSafeInteger(subtotalCents)) throw new ApiError(400, 'Total muito alto.')
  const totalCents = Math.round(subtotalCents * (1 - discountPercent / 100))
  const title = required(payload.title, 'TÃ­tulo')
  const existingProposal = currentId ? await one('SELECT delivery_date AS deliveryDate, valid_until AS validUntil FROM proposals WHERE id = ?', currentId) : null
  if (currentId && !existingProposal) throw new ApiError(404, 'Proposta nÃ£o encontrada.')
  const validityDate = new Date()
  validityDate.setDate(validityDate.getDate() + 10)
  const validUntil = existingProposal?.validUntil || `${validityDate.getFullYear()}-${String(validityDate.getMonth() + 1).padStart(2, '0')}-${String(validityDate.getDate()).padStart(2, '0')}`
  const deliveryDate = date(payload.deliveryDate === undefined ? existingProposal?.deliveryDate : payload.deliveryDate)
  if (!deliveryDate) throw new ApiError(400, 'Informe a previsÃ£o de entrega.')
  const notes = (payload.deliveryDate === undefined ? str(payload.notes, 2000) : str(payload.notes, 2000).replace(legacyDeliveryPattern, '').trim())
  return transaction(async () => {
    if (!opportunityId) {
      opportunityId = Number((await run(`INSERT INTO opportunities
        (title, client_id, value_cents, stage)
        VALUES (?,?,?,?)`, title, clientId, totalCents, 'proposta')).lastInsertRowid)
    }
    const values = [title, clientId, opportunityId, status, validUntil, deliveryDate, notes, discountPercent, subtotalCents, totalCents]
    let proposalId = currentId
    if (currentId) {
      await run(`UPDATE proposals SET title=?, client_id=?, opportunity_id=?, status=?, valid_until=?, delivery_date=?, notes=?, discount_percent=?, subtotal_cents=?, total_cents=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?`, ...values, currentId)
      await run('DELETE FROM proposal_items WHERE proposal_id = ?', currentId)
    } else {
      proposalId = Number((await run(`INSERT INTO proposals (title, client_id, opportunity_id, status, valid_until, delivery_date, notes, discount_percent, subtotal_cents, total_cents) VALUES (?,?,?,?,?,?,?,?,?,?)`, ...values)).lastInsertRowid)
    }
    for (const item of items) await run('INSERT INTO proposal_items (proposal_id, product_id, description, quantity, unit_price_cents) VALUES (?,?,?,?,?)', proposalId, item.productId, item.description, item.quantity, item.unitPriceCents)
    const opportunity = await one('SELECT stage FROM opportunities WHERE id = ?', opportunityId)
    if (payload.moveToProposalStage === true || !['ganho', 'perdido'].includes(opportunity.stage)) {
      const stage = payload.moveToProposalStage === true || ['novo', 'contato'].includes(opportunity.stage) ? 'proposta' : opportunity.stage
      await run(`UPDATE opportunities SET stage=?, value_cents=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?`, stage, totalCents, opportunityId)
    }
    return proposalId
  })
}

async function reconcileExistingProposals() {
  const migrationKey = 'proposal_pipeline_sync_v1'
  if (await one('SELECT key FROM schema_migrations WHERE key = ?', migrationKey)) return
  return transaction(async () => {
    const unlinked = await query(`SELECT id, title, client_id AS clientId, total_cents AS totalCents
      FROM proposals WHERE opportunity_id IS NULL ORDER BY id`)
    for (const proposal of unlinked) {
      const opportunityId = Number((await run(`INSERT INTO opportunities
        (title, client_id, value_cents, stage) VALUES (?,?,?,?)`,
        proposal.title, proposal.clientId, proposal.totalCents, 'proposta')).lastInsertRowid)
      await run('UPDATE proposals SET opportunity_id=? WHERE id=?', opportunityId, proposal.id)
    }
    const linked = await query(`SELECT opportunity_id AS opportunityId, total_cents AS totalCents
      FROM proposals WHERE opportunity_id IS NOT NULL ORDER BY updated_at DESC, id DESC`)
    const visited = new Set()
    for (const proposal of linked) {
      if (visited.has(proposal.opportunityId)) continue
      visited.add(proposal.opportunityId)
      const opportunity = await one('SELECT stage, value_cents AS valueCents FROM opportunities WHERE id = ?', proposal.opportunityId)
      if (!opportunity || ['ganho', 'perdido'].includes(opportunity.stage)) continue
      const stage = ['novo', 'contato'].includes(opportunity.stage) ? 'proposta' : opportunity.stage
      if (stage !== opportunity.stage || opportunity.valueCents !== proposal.totalCents) {
        await run(`UPDATE opportunities SET stage=?, value_cents=?, updated_at=CURRENT_TIMESTAMP::timestamp(0)::text WHERE id=?`,
          stage, proposal.totalCents, proposal.opportunityId)
      }
    }
    await run('INSERT INTO schema_migrations (key) VALUES (?)', migrationKey)
  })
}

async function api(req, res, pathname) {
  const method = req.method
  if (method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true })
  if (method === 'GET' && pathname === '/api/clients') return json(res, 200, await clients())
  if (method === 'GET' && pathname === '/api/products') return json(res, 200, await products())
  if (method === 'GET' && pathname === '/api/activities') return json(res, 200, await activities())
  if (method === 'GET' && pathname === '/api/client-interactions') return json(res, 200, await allClientInteractions())
  if (method === 'GET' && pathname === '/api/opportunities') return json(res, 200, await opportunities())
  if (method === 'GET' && pathname === '/api/proposals') return json(res, 200, await proposals())
  const interactionsMatch = pathname.match(/^\/api\/clients\/(\d+)\/interactions$/)
  if (interactionsMatch) {
    const clientId = id(interactionsMatch[1], 'Cliente')
    if (method === 'GET') return json(res, 200, await clientInteractions(clientId))
    if (method === 'POST') return json(res, 201, { id: await saveClientInteraction(clientId, await body(req)) })
    throw new ApiError(405, 'MÃ©todo nÃ£o permitido.')
  }
  const interactionMatch = pathname.match(/^\/api\/client-interactions\/(\d+)$/)
  if (method === 'PATCH' && interactionMatch) {
    const interactionId = id(interactionMatch[1])
    const payload = await body(req)
    if (typeof payload.completed !== 'boolean') throw new ApiError(400, 'Informe se a interaÃ§Ã£o foi concluÃ­da.')
    const result = await run('UPDATE client_interactions SET completed = ? WHERE id = ? AND scheduled_at <> ?', payload.completed ? 1 : 0, interactionId, '')
    if (!result.changes) throw new ApiError(404, 'InteraÃ§Ã£o programada nÃ£o encontrada.')
    return json(res, 200, { ok: true })
  }
  const pdfMatch = pathname.match(/^\/api\/proposals\/(\d+)\/pdf$/)
  if (method === 'GET' && pdfMatch) {
    const proposalId = id(pdfMatch[1])
    const proposal = await one(`SELECT id, title, client_id AS clientId, status, valid_until AS validUntil,
      delivery_date AS deliveryDate, notes, discount_percent AS discountPercent, subtotal_cents AS subtotalCents,
      total_cents AS totalCents FROM proposals WHERE id = ?`, proposalId)
    if (!proposal) throw new ApiError(404, 'Proposta nÃ£o encontrada.')
    proposal.items = await query(`SELECT description, quantity, unit_price_cents AS unitPriceCents
      FROM proposal_items WHERE proposal_id = ? ORDER BY id`, proposalId)
    const client = await one('SELECT name, company, email, phone FROM clients WHERE id = ?', proposal.clientId)
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
  if (!match) throw new ApiError(404, 'Rota nÃ£o encontrada.')
  const [, resource, rawId] = match
  const currentId = rawId ? id(rawId) : null
  if (method === 'DELETE' && currentId) {
    const table = resource
    const result = await run(`DELETE FROM ${table} WHERE id = ?`, currentId)
    if (!result.changes) throw new ApiError(404, 'Registro nÃ£o encontrado.')
    return json(res, 200, { ok: true })
  }
  if ((method === 'POST' && !currentId) || (method === 'PUT' && currentId)) {
    const payload = await body(req)
    const save = { clients: saveClient, products: saveProduct, opportunities: saveOpportunity, proposals: saveProposal, activities: saveActivity }[resource]
    const savedId = await save(payload, currentId)
    return json(res, currentId ? 200 : 201, { id: savedId })
  }
  throw new ApiError(405, 'MÃ©todo nÃ£o permitido.')
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
async function serveApp(res, pathname) {
  const dist = path.join(root, 'dist')
  if (!existsSync(dist)) throw new ApiError(404, 'Front nÃ£o compilado. Execute npm run dev ou npm run build.')
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
    else throw new ApiError(405, 'MÃ©todo nÃ£o permitido.')
  } catch (error) {
    const constraint = error?.code === '23503'
    if (!(error instanceof ApiError) && !constraint) console.error(error)
    json(res, error.status || (constraint ? 409 : 500), { error: constraint ? 'Este registro estÃ¡ em uso e nÃ£o pode ser excluÃ­do.' : (error.status ? error.message : 'Erro interno do servidor.') })
  }
})

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
await initialize()
await reconcileExistingProposals()
server.listen(port, host, () => console.log(`API: http://${host}:${port}`))
