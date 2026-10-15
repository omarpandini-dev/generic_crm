import assert from 'node:assert/strict'

const base = process.env.API_URL || 'http://127.0.0.1:3001'
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, data: await response.json() }
}

const tag = `Teste ${Date.now()}`
const client = await request('clients', 'POST', { name: tag, email: 'teste@example.com' })
assert.equal(client.status, 201)
const clientId = client.data.id
const activity = await request('activities', 'POST', { title: 'Retornar contato', clientId, dueDate: '2026-10-20', notes: 'Confirmar reunião' })
assert.equal(activity.status, 201)
const activityId = activity.data.id
const savedActivity = (await request('activities')).data.find(item => item.id === activityId)
assert.equal(savedActivity.clientName, tag)
assert.equal(savedActivity.completed, 0)
assert.equal((await request('activities', 'POST', { title: 'Data inválida', dueDate: '2026-02-30' })).status, 400)
assert.equal((await request(`activities/${activityId}`, 'PUT', { title: 'Retornar contato', clientId, dueDate: '2026-10-20', notes: 'Confirmar reunião', completed: true })).status, 200)
assert.equal((await request('activities')).data.find(item => item.id === activityId).completed, 1)
assert.equal((await request(`activities/${activityId}`, 'DELETE')).status, 200)
const product = await request('products', 'POST', { name: 'Serviço de teste', priceCents: 12550, active: true })
assert.equal(product.status, 201)
const productId = product.data.id
const opportunity = await request('opportunities', 'POST', { title: 'Projeto de teste', clientId, valueCents: 25100, stage: 'novo' })
assert.equal(opportunity.status, 201)
const opportunityId = opportunity.data.id
const proposal = await request('proposals', 'POST', {
  title: 'Proposta de teste', clientId, opportunityId, status: 'rascunho', discountPercent: 10,
  items: [{ productId, description: 'Serviço de teste', quantity: 2, unitPriceCents: 12550 }],
})
assert.equal(proposal.status, 201)
const proposalId = proposal.data.id
const first = (await request('proposals')).data.find(item => item.id === proposalId)
assert.equal(first.subtotalCents, 25100)
assert.equal(first.totalCents, 22590)
assert.equal(first.items[0].unitPriceCents, 12550)
const linkedOpportunity = (await request('opportunities')).data.find(item => item.id === opportunityId)
assert.equal(linkedOpportunity.stage, 'proposta')
assert.equal(linkedOpportunity.valueCents, 22590)
const pdfResponse = await fetch(`${base}/api/proposals/${proposalId}/pdf`)
assert.equal(pdfResponse.status, 200)
assert.match(pdfResponse.headers.get('content-type'), /application\/pdf/)
assert.match(pdfResponse.headers.get('content-disposition'), /proposta-\d+\.pdf/)
const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer())
assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
assert.ok(pdfBytes.length > 10_000)

const longProposal = await request('proposals', 'POST', {
  title: 'Proposta longa de teste', clientId, status: 'rascunho', discountPercent: 0,
  notes: 'Observações de teste com acentuação. '.repeat(40),
  items: Array.from({ length: 30 }, (_, index) => ({ productId: null, description: `Serviço detalhado número ${index + 1} com instalação, configuração e acompanhamento técnico.`, quantity: 1, unitPriceCents: 1000 })),
})
assert.equal(longProposal.status, 201)
const createdProposal = (await request('proposals')).data.find(item => item.id === longProposal.data.id)
assert.ok(createdProposal.opportunityId)
const automaticOpportunity = (await request('opportunities')).data.find(item => item.id === createdProposal.opportunityId)
assert.equal(automaticOpportunity.stage, 'proposta')
assert.equal(automaticOpportunity.valueCents, 30000)
const longPdfResponse = await fetch(`${base}/api/proposals/${longProposal.data.id}/pdf`)
assert.equal(longPdfResponse.status, 200)
const longPdf = Buffer.from(await longPdfResponse.arrayBuffer())
const pageCount = (longPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length
assert.ok(pageCount >= 2, `PDF longo deveria ter várias páginas; gerou ${pageCount}.`)

const secondProduct = await request('products', 'POST', { name: 'Treinamento de teste', priceCents: 5000, active: true })
assert.equal(secondProduct.status, 201)
const catalogProposal = await request('proposals', 'POST', {
  title: 'Proposta com vários produtos', clientId, opportunityId: null, status: 'enviada',
  validUntil: '2026-11-15', discountPercent: 5,
  notes: 'Prazo de entrega: 30/11/2026\nCondições de pagamento: 50% na aprovação',
  items: [
    { productId, description: 'Serviço de teste', quantity: 2, unitPriceCents: 12550 },
    { productId: secondProduct.data.id, description: 'Treinamento de teste', quantity: 3, unitPriceCents: 5000 },
  ],
})
assert.equal(catalogProposal.status, 201)
const savedCatalogProposal = (await request('proposals')).data.find(item => item.id === catalogProposal.data.id)
assert.equal(savedCatalogProposal.items.length, 2)
assert.equal(savedCatalogProposal.subtotalCents, 40100)
assert.equal(savedCatalogProposal.totalCents, 38095)
assert.ok(savedCatalogProposal.opportunityId)
assert.equal((await request('opportunities')).data.find(item => item.id === savedCatalogProposal.opportunityId).valueCents, 38095)
assert.equal((await fetch(`${base}/api/proposals/${catalogProposal.data.id}/pdf`)).status, 200)
assert.equal((await request(`proposals/${catalogProposal.data.id}`, 'DELETE')).status, 200)
assert.equal((await request(`opportunities/${savedCatalogProposal.opportunityId}`, 'DELETE')).status, 200)
assert.equal((await request(`products/${secondProduct.data.id}`, 'DELETE')).status, 200)

assert.equal((await request(`clients/${clientId}`, 'DELETE')).status, 409)
assert.equal((await request(`products/${productId}`, 'PUT', { name: 'Serviço alterado', priceCents: 50000, active: true })).status, 200)
assert.equal((await request('proposals')).data.find(item => item.id === proposalId).items[0].unitPriceCents, 12550)
assert.equal((await request(`opportunities/${opportunityId}`, 'PUT', { title: 'Projeto de teste', clientId, valueCents: 25100, stage: 'ganho' })).status, 200)
assert.equal((await request('opportunities')).data.find(item => item.id === opportunityId).stage, 'ganho')
assert.equal((await request(`products/${productId}`, 'DELETE')).status, 200)
assert.equal((await request('proposals')).data.find(item => item.id === proposalId).items[0].productId, null)
assert.equal((await request(`proposals/${longProposal.data.id}`, 'DELETE')).status, 200)
assert.equal((await request(`opportunities/${automaticOpportunity.id}`, 'DELETE')).status, 200)
assert.equal((await request(`proposals/${proposalId}`, 'DELETE')).status, 200)
assert.equal((await fetch(`${base}/api/proposals/${proposalId}/pdf`)).status, 404)
assert.equal((await request(`opportunities/${opportunityId}`, 'DELETE')).status, 200)
assert.equal((await request(`clients/${clientId}`, 'DELETE')).status, 200)
console.log('API: atividades, propostas com vários produtos, funil, PDF e exclusão validados.')
