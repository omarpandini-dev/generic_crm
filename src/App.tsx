import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarClock, CalendarDays, Check,
  ChevronDown, CircleHelp, ClipboardList, Download, Eye, FileText, LayoutDashboard,
  Menu, MoreHorizontal, Package, Plus, Search, ShoppingBag, Sparkles,
  Trash2, Users, X,
} from 'lucide-react'
import ProposalWizard, { type WizardProposal } from './ProposalWizard'
import ClientCombobox from './ClientCombobox'
import ClientInteractions from './ClientInteractions'
import Agenda from './Agenda'

type View = 'overview' | 'clients' | 'pipeline' | 'activities' | 'agenda' | 'products' | 'proposals'
type Kind = 'client' | 'opportunity' | 'activity' | 'product' | 'proposal'
type ActivityFilter = 'pending' | 'soon' | 'overdue' | 'completed'
type ClientFilter = 'all' | 'with_interactions' | 'in_pipeline' | 'with_appointment' | 'untouched'
type Stage = 'novo' | 'contato' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
type ProposalStatus = 'rascunho' | 'enviada' | 'aceita' | 'recusada'
type Client = { id: number; name: string; company: string; email: string; phone: string; notes: string; createdAt: string }
type Product = { id: number; name: string; sku: string; description: string; priceCents: number; active: number; createdAt: string }
type Opportunity = { id: number; title: string; clientId: number; clientName: string; valueCents: number; stage: Stage; notes: string; createdAt: string }
type Activity = { id: number; title: string; clientId: number | null; clientName: string | null; dueDate: string; notes: string; completed: number; createdAt: string }
type ClientInteraction = { id: number; clientId: number; opportunityId: number | null; clientName: string; type: 'ligacao' | 'email' | 'reuniao' | 'mensagem' | 'outro'; description: string; occurredAt: string; scheduledAt: string; completed: number; createdAt: string }
type DueEntry =
  | { kind: 'activity'; key: string; title: string; clientName: string; dueDate: string; notes: string; completed: boolean; record: Activity }
  | { kind: 'proposal'; key: string; title: string; clientName: string; dueDate: string; notes: string; completed: boolean; record: Proposal }
  | { kind: 'interaction'; key: string; title: string; clientName: string; dueDate: string; notes: string; completed: boolean; record: ClientInteraction }
type ProposalItem = { id?: number; productId: number | null; description: string; quantity: number; unitPriceCents: number }
type Proposal = { id: number; title: string; clientId: number; clientName: string; opportunityId: number | null; status: ProposalStatus; validUntil: string; deliveryDate: string; notes: string; discountPercent: number; subtotalCents: number; totalCents: number; createdAt: string; items: ProposalItem[] }
type DraftItem = { productId: string; description: string; quantity: string; unitPrice: string }
type Draft = { name: string; company: string; email: string; phone: string; notes: string; sku: string; description: string; price: string; active: boolean; title: string; clientId: string; value: string; stage: Stage; opportunityId: string; status: ProposalStatus; validUntil: string; deliveryDate: string; dueDate: string; completed: boolean; discountPercent: string; items: DraftItem[] }

const stageLabels: Record<Stage, string> = { novo: 'Novo lead', contato: 'Em contato', proposta: 'Proposta', negociacao: 'Negociação', ganho: 'Ganho', perdido: 'Perdido' }
const pipelineStages: Stage[] = ['novo', 'contato', 'proposta', 'negociacao', 'ganho', 'perdido']
const statusLabels: Record<ProposalStatus, string> = { rascunho: 'Rascunho', enviada: 'Enviada', aceita: 'Aceita', recusada: 'Recusada' }
const interactionLabels: Record<ClientInteraction['type'], string> = { ligacao: 'Ligação', email: 'E-mail', reuniao: 'Reunião', mensagem: 'Mensagem', outro: 'Interação' }
const titles: Record<View, { title: string; eyebrow: string; description: string }> = {
  overview: { title: 'Visão geral', eyebrow: 'PAINEL DE CONTROLE', description: 'Acompanhe o que acontece no seu negócio.' },
  clients: { title: 'Clientes', eyebrow: 'RELACIONAMENTO', description: 'Todas as conexões importantes em um só lugar.' },
  pipeline: { title: 'Funil de vendas', eyebrow: 'OPORTUNIDADES', description: 'Visualize e avance cada negociação.' },
  activities: { title: 'Atividades', eyebrow: 'AGENDA COMERCIAL', description: 'Acompanhe tarefas e previsões de entrega.' },
  agenda: { title: 'Agenda', eyebrow: 'COMPROMISSOS', description: 'Consulte interações programadas e previsões de entrega.' },
  products: { title: 'Produtos', eyebrow: 'CATÁLOGO', description: 'Organize o que sua empresa oferece.' },
  proposals: { title: 'Propostas', eyebrow: 'COMERCIAL', description: 'Crie e acompanhe propostas comerciais.' },
}
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const money = (cents: number) => currency.format(cents / 100)
const dateLabel = (iso: string) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—'
const localDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const daysUntil = (dueDate: string, today: string) => {
  const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000
  return dayNumber(dueDate) - dayNumber(today)
}
const daysUntilLabel = (days: number) => days === 0 ? 'Hoje' : days > 0 ? `${days} ${days === 1 ? 'dia' : 'dias'}` : `${Math.abs(days)} ${days === -1 ? 'dia' : 'dias'} em atraso`
const toCents = (value: string) => Math.round(Number(value || 0) * 100)
const fromCents = (value: number) => (value / 100).toFixed(2)
const initials = (value: string) => value.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
const avatarColors = ['violet', 'mint', 'peach', 'blue', 'rose']
const colorFor = (id: number) => avatarColors[id % avatarColors.length]
const proposalValidity = () => { const day = new Date(); day.setDate(day.getDate() + 10); return localDate(day) }
const emptyDraft = (): Draft => ({ name: '', company: '', email: '', phone: '', notes: '', sku: '', description: '', price: '', active: true, title: '', clientId: '', value: '', stage: 'novo', opportunityId: '', status: 'rascunho', validUntil: proposalValidity(), deliveryDate: '', dueDate: localDate(new Date()), completed: false, discountPercent: '0', items: [{ productId: '', description: '', quantity: '1', unitPrice: '' }] })

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, headers: { 'content-type': 'application/json', ...options?.headers } })
  const body = await response.text()
  let data: { error?: string } & T
  try { data = JSON.parse(body) } catch { throw new Error(`Resposta inválida da API (HTTP ${response.status}). Tente novamente.`) }
  if (!response.ok) throw new Error(data.error || `Não foi possível concluir a operação (HTTP ${response.status}).`)
  return data as T
}

async function fetchProposalPdf(id: number): Promise<Blob> {
  const response = await fetch(`/api/proposals/${id}/pdf`)
  if (!response.ok) {
    const body = await response.text()
    let message = ''
    try { message = JSON.parse(body).error || '' } catch { /* Some proxy errors have no JSON body. */ }
    throw new Error(message || `Não foi possível carregar o PDF (HTTP ${response.status}). Tente novamente.`)
  }
  const blob = await response.blob()
  if (!blob.size || !blob.type.includes('application/pdf')) {
    throw new Error('O servidor não retornou um PDF válido. Tente novamente.')
  }
  return blob
}

function App() {
  const [view, setView] = useState<View>('overview')
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [clientInteractions, setClientInteractions] = useState<ClientInteraction[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ kind: Kind; id?: number } | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [pdfId, setPdfId] = useState<number | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null)
  const [previewPdf, setPreviewPdf] = useState<{ id: number; title: string; url: string } | null>(null)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('pending')
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  const [proposalStatusFilter, setProposalStatusFilter] = useState<ProposalStatus | 'all'>('all')
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardOpportunity, setWizardOpportunity] = useState<Opportunity | null>(null)

  async function load() {
    try {
      const [c, p, o, q, a, i] = await Promise.all([
        request<Client[]>('clients'), request<Product[]>('products'),
        request<Opportunity[]>('opportunities'), request<Proposal[]>('proposals'), request<Activity[]>('activities'), request<ClientInteraction[]>('client-interactions'),
      ])
      setClients(c); setProducts(p); setOpportunities(o); setProposals(q); setActivities(a); setClientInteractions(i); setError('')
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    const url = previewPdf?.url
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [previewPdf?.url])

  function navigate(next: View) { setView(next); setSearch(''); setMobileNav(false); void load() }
  function startOpportunityForClient(clientId: number) {
    setView('pipeline')
    setSearch('')
    setMobileNav(false)
    setDraft({ ...emptyDraft(), clientId: String(clientId) })
    setEditing({ kind: 'opportunity' })
    setError('')
  }
  function open(kind: Kind, item?: Client | Product | Opportunity | Proposal | Activity) {
    let next = emptyDraft()
    if (item && kind === 'client') {
      const c = item as Client
      next = { ...next, name: c.name, company: c.company, email: c.email, phone: c.phone, notes: c.notes }
    }
    if (item && kind === 'product') {
      const p = item as Product
      next = { ...next, name: p.name, sku: p.sku, description: p.description, price: fromCents(p.priceCents), active: !!p.active }
    }
    if (item && kind === 'opportunity') {
      const o = item as Opportunity
      next = { ...next, title: o.title, clientId: String(o.clientId), value: fromCents(o.valueCents), stage: o.stage, notes: o.notes }
    }
    if (item && kind === 'activity') {
      const a = item as Activity
      next = { ...next, title: a.title, clientId: String(a.clientId || ''), dueDate: a.dueDate, notes: a.notes, completed: !!a.completed }
    }
    if (item && kind === 'proposal') {
      const p = item as Proposal
      next = { ...next, title: p.title, clientId: String(p.clientId), opportunityId: String(p.opportunityId || ''), status: p.status, validUntil: p.validUntil, deliveryDate: p.deliveryDate, notes: p.notes, discountPercent: String(p.discountPercent), items: p.items.map(i => ({ productId: String(i.productId || ''), description: i.description, quantity: String(i.quantity), unitPrice: fromCents(i.unitPriceCents) })) }
    }
    setDraft(next); setEditing({ kind, id: item?.id }); setError('')
  }
  function openDueEntry(item: DueEntry) {
    if (item.kind === 'activity') open('activity', item.record)
    else if (item.kind === 'proposal') { setView('proposals'); setSearch(''); open('proposal', item.record) }
    else { const client = clients.find(c => c.id === item.record.clientId); if (client) open('client', client) }
  }
  function update(field: keyof Draft, value: Draft[keyof Draft]) { setDraft(current => ({ ...current, [field]: value })) }
  function updateItem(index: number, field: keyof DraftItem, value: string) {
    setDraft(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [field]: value } : item) }))
  }
  function selectProduct(index: number, id: string) {
    const product = products.find(p => p.id === Number(id))
    setDraft(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, productId: id, description: product?.name || item.description, unitPrice: product ? fromCents(product.priceCents) : item.unitPrice } : item) }))
  }
  function clientChanged(value: string) {
    const available = opportunities.filter(o => o.clientId === Number(value) && !['ganho', 'perdido'].includes(o.stage))
    setDraft(current => ({ ...current, clientId: value, opportunityId: available.length === 1 ? String(available[0].id) : '' }))
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const { kind, id } = editing
    if ((kind === 'opportunity' || kind === 'proposal') && !draft.clientId) { setError('Selecione um cliente da lista.'); return }
    const addToPipeline = kind === 'client' && (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'pipeline'
    const path = ({ client: 'clients', product: 'products', opportunity: 'opportunities', activity: 'activities', proposal: 'proposals' } as const)[kind]
    const payload = kind === 'client' ? { name: draft.name, company: draft.company, email: draft.email, phone: draft.phone, notes: draft.notes }
      : kind === 'product' ? { name: draft.name, sku: draft.sku, description: draft.description, priceCents: toCents(draft.price), active: draft.active }
      : kind === 'opportunity' ? { title: draft.title, clientId: Number(draft.clientId), valueCents: toCents(draft.value), stage: draft.stage, notes: draft.notes }
      : kind === 'activity' ? { title: draft.title, clientId: draft.clientId ? Number(draft.clientId) : null, dueDate: draft.dueDate, notes: draft.notes, completed: draft.completed }
      : { title: draft.title, clientId: Number(draft.clientId), opportunityId: draft.opportunityId ? Number(draft.opportunityId) : null, status: draft.status, validUntil: draft.validUntil, deliveryDate: draft.deliveryDate, notes: draft.notes, discountPercent: Number(draft.discountPercent), items: draft.items.map(item => ({ productId: item.productId ? Number(item.productId) : null, description: item.description, quantity: Number(item.quantity), unitPriceCents: toCents(item.unitPrice) })) }
    setSaving(true)
    try {
      const saved = await request<{ id: number }>(`${path}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      await load()
      if (addToPipeline) startOpportunityForClient(saved.id)
      else setEditing(null)
      setError('')
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function remove(kind: Kind, id: number) {
    if (!window.confirm('Excluir este registro? Essa ação não pode ser desfeita.')) return
    const path = ({ client: 'clients', product: 'products', opportunity: 'opportunities', activity: 'activities', proposal: 'proposals' } as const)[kind]
    try { await request(`${path}/${id}`, { method: 'DELETE' }); await load(); setEditing(null); setError('') }
    catch (e) { setError((e as Error).message) }
  }
  async function moveOpportunity(item: Opportunity, stage: Stage) {
    if (item.stage === stage) return
    try {
      await request(`opportunities/${item.id}`, { method: 'PUT', body: JSON.stringify({ ...item, stage }) })
      await load()
    } catch (e) { setError((e as Error).message) }
  }
  async function toggleActivity(item: Activity) {
    try {
      await request(`activities/${item.id}`, { method: 'PUT', body: JSON.stringify({ title: item.title, clientId: item.clientId, dueDate: item.dueDate, notes: item.notes, completed: !item.completed }) })
      await load()
    } catch (e) { setError((e as Error).message) }
  }
  async function toggleInteraction(item: ClientInteraction) {
    try {
      await request(`client-interactions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !item.completed }) })
      await load()
    } catch (e) { setError((e as Error).message) }
  }
  async function downloadProposal(proposal: { id: number }) {
    setPdfId(proposal.id)
    try {
      const url = URL.createObjectURL(await fetchProposalPdf(proposal.id))
      const link = document.createElement('a')
      link.href = url
      link.download = `proposta-${String(proposal.id).padStart(4, '0')}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setError('')
    } catch (e) { setError((e as Error).message) }
    finally { setPdfId(null) }
  }
  async function previewProposal(proposal: Proposal) {
    setPreviewLoadingId(proposal.id)
    try {
      setPreviewPdf({ id: proposal.id, title: proposal.title, url: URL.createObjectURL(await fetchProposalPdf(proposal.id)) })
      setError('')
    } catch (e) { setError((e as Error).message) }
    finally { setPreviewLoadingId(null) }
  }
  function closeWizard() {
    setWizardOpen(false)
    setWizardOpportunity(null)
  }
  async function createProposalWithWizard(payload: WizardProposal, downloadPdf: boolean) {
    const saved = await request<{ id: number }>('proposals', { method: 'POST', body: JSON.stringify(payload) })
    await load()
    const fromPipeline = !!wizardOpportunity
    closeWizard()
    if (!fromPipeline) setSelectedProductIds([])
    setView(fromPipeline ? 'pipeline' : 'proposals')
    setSearch('')
    if (downloadPdf) await downloadProposal(saved)
  }
  const clientsWithInteractions = new Set(clientInteractions.map(i => i.clientId))
  const clientsInPipeline = new Set(opportunities.map(o => o.clientId))
  const clientsWithAppointments = new Set(clientInteractions.filter(i => i.scheduledAt && !i.completed).map(i => i.clientId))
  const untouchedClients = clients.filter(c => !clientsWithInteractions.has(c.id) && !clientsInPipeline.has(c.id))
  const filteredClients = clients.filter(c =>
    (clientFilter === 'all' ||
      (clientFilter === 'with_interactions' && clientsWithInteractions.has(c.id)) ||
      (clientFilter === 'in_pipeline' && clientsInPipeline.has(c.id)) ||
      (clientFilter === 'with_appointment' && clientsWithAppointments.has(c.id)) ||
      (clientFilter === 'untouched' && !clientsWithInteractions.has(c.id) && !clientsInPipeline.has(c.id))) &&
    `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase()),
  )
  const filteredProducts = products.filter(p => `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()))
  const selectedProducts = products.filter(p => p.active && selectedProductIds.includes(p.id))
  const filteredProposals = proposals.filter(p => (proposalStatusFilter === 'all' || p.status === proposalStatusFilter) && `${p.title} ${p.clientName}`.toLowerCase().includes(search.toLowerCase()))
  const filteredOpportunities = opportunities.filter(o => `${o.title} ${o.clientName}`.toLowerCase().includes(search.toLowerCase()))
  const todayDate = new Date()
  const today = localDate(todayDate)
  const currentMonth = today.slice(0, 7)
  const currentMonthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(todayDate)
  const proposalByOpportunity = useMemo(() => {
    const map = new Map<number, Proposal>()
    for (const proposal of proposals) {
      if (proposal.opportunityId && !map.has(proposal.opportunityId)) map.set(proposal.opportunityId, proposal)
    }
    return map
  }, [proposals])
  const nextInteractionByOpportunity = useMemo(() => {
    const map = new Map<number, ClientInteraction>()
    for (const interaction of clientInteractions) {
      if (!interaction.opportunityId || !interaction.scheduledAt || interaction.completed) continue
      const current = map.get(interaction.opportunityId)
      if (!current || interaction.scheduledAt < current.scheduledAt) map.set(interaction.opportunityId, interaction)
    }
    return map
  }, [clientInteractions])
  const priorityDate = (opportunity: Opportunity) => {
    const delivery = proposalByOpportunity.get(opportunity.id)?.deliveryDate
    const deliveryAt = delivery ? `${delivery}T23:59` : ''
    const contactAt = nextInteractionByOpportunity.get(opportunity.id)?.scheduledAt || ''
    return deliveryAt && contactAt ? (deliveryAt < contactAt ? deliveryAt : contactAt) : deliveryAt || contactAt
  }
  const summaryDate = (opportunity: Opportunity) => proposalByOpportunity.get(opportunity.id)?.deliveryDate || ''
  const monthlyStages: Stage[] = ['proposta', 'negociacao', 'ganho', 'perdido']
  const monthlyPipeline = opportunities.filter(o => monthlyStages.includes(o.stage) && summaryDate(o).slice(0, 7) === currentMonth)
  const undatedPipeline = opportunities.filter(o => monthlyStages.includes(o.stage) && !summaryDate(o))
  const weekEnd = localDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 7))
  const dueEntries: DueEntry[] = [
    ...activities.map(a => ({ kind: 'activity' as const, key: `a${a.id}`, title: a.title, clientName: a.clientName || '', dueDate: a.dueDate, notes: a.notes, completed: !!a.completed, record: a })),
    ...proposals.filter(p => p.deliveryDate).map(p => ({ kind: 'proposal' as const, key: `p${p.id}`, title: p.title, clientName: p.clientName, dueDate: p.deliveryDate, notes: p.notes, completed: p.status === 'recusada', record: p })),
    ...clientInteractions.filter(i => i.scheduledAt).map(i => ({ kind: 'interaction' as const, key: `i${i.id}`, title: interactionLabels[i.type], clientName: i.clientName, dueDate: i.scheduledAt.slice(0, 10), notes: i.description, completed: !!i.completed, record: i })),
  ].sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
  const pendingActivities = dueEntries.filter(a => !a.completed)
  const nearDueActivities = pendingActivities.filter(a => a.dueDate >= today && a.dueDate <= weekEnd)
  const overdueActivities = pendingActivities.filter(a => a.dueDate < today)
  const upcomingActivities = [...overdueActivities, ...nearDueActivities].slice(0, 5)
  const filteredActivities = dueEntries.filter(a => {
    if (activityFilter === 'soon' && (a.completed || a.dueDate < today || a.dueDate > weekEnd)) return false
    if (activityFilter === 'overdue' && (a.completed || a.dueDate >= today)) return false
    if (activityFilter === 'completed' && !a.completed) return false
    if (activityFilter === 'pending' && a.completed) return false
    return `${a.title} ${a.clientName} ${a.notes} ${a.kind === 'proposal' ? 'previsão de entrega proposta' : a.kind === 'interaction' ? 'interação programada' : 'atividade'}`.toLowerCase().includes(search.toLowerCase())
  })
  const openOpportunities = opportunities.filter(o => !['ganho', 'perdido'].includes(o.stage))
  const openValue = openOpportunities.reduce((sum, o) => sum + o.valueCents, 0)
  const wonValue = opportunities.filter(o => o.stage === 'ganho').reduce((sum, o) => sum + o.valueCents, 0)
  const proposalTotal = proposals.filter(p => p.status === 'aceita').reduce((sum, p) => sum + p.totalCents, 0)
  const proposedSubtotal = useMemo(() => draft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * toCents(item.unitPrice), 0), [draft.items])
  const proposedTotal = Math.round(proposedSubtotal * (1 - (Number(draft.discountPercent) || 0) / 100))
  const relatedOpportunities = opportunities.filter(o => o.clientId === Number(draft.clientId) && (!['ganho', 'perdido'].includes(o.stage) || String(o.id) === draft.opportunityId))
  const latest = [...opportunities.map(o => ({ id: `o${o.id}`, label: o.title, detail: o.clientName, date: o.createdAt, kind: 'Oportunidade' })), ...proposals.map(p => ({ id: `p${p.id}`, label: p.title, detail: p.clientName, date: p.createdAt, kind: 'Proposta' }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
  const editingProposal = editing?.kind === 'proposal' ? proposals.find(p => p.id === editing.id) : undefined
  const editingOpportunity = editing?.kind === 'opportunity' ? opportunities.find(o => o.id === editing.id) : undefined
  const opportunityFields = <div className="client-details-fields">
    <Field label="Título da oportunidade *"><input required value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Ex.: Projeto de implantação" /></Field>
    <ClientCombobox key={editing?.id ?? 0} clients={clients} value={draft.clientId} onChange={id => update('clientId', id)} required />
    {clients.length === 0 && <p className="field-hint">Cadastre um cliente antes de criar uma oportunidade.</p>}
    <Field label="Valor estimado (R$)"><input type="number" min="0" step="0.01" value={draft.value} onChange={e => update('value', e.target.value)} placeholder="0,00" /></Field>
    <Field label="Etapa"><select value={draft.stage} onChange={e => update('stage', e.target.value as Stage)}>{pipelineStages.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></Field>
    <Field label="Observações"><textarea value={draft.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="Próximos passos, contexto da negociação..." /></Field>
  </div>
  const clientFields = <div className="client-details-fields"><div className="client-pane-heading"><strong>Dados do cliente</strong><small>Informações de contato</small></div><Field label="Nome *"><input required value={draft.name} onChange={e => update('name', e.target.value)} placeholder="Nome do cliente" /></Field><div className="field-row"><Field label="Empresa"><input value={draft.company} onChange={e => update('company', e.target.value)} placeholder="Nome da empresa" /></Field><Field label="Telefone"><input type="tel" value={draft.phone} onChange={e => update('phone', e.target.value)} placeholder="(00) 00000-0000" /></Field></div><Field label="E-mail"><input type="email" value={draft.email} onChange={e => update('email', e.target.value)} placeholder="nome@empresa.com" /></Field><Field label="Observações"><textarea value={draft.notes} onChange={e => update('notes', e.target.value)} placeholder="Informações úteis sobre este cliente" rows={3} /></Field></div>

  const nav = [
    { view: 'overview' as View, label: 'Visão geral', Icon: LayoutDashboard },
    { view: 'clients' as View, label: 'Clientes', Icon: Users },
    { view: 'pipeline' as View, label: 'Funil de vendas', Icon: BriefcaseBusiness },
    { view: 'activities' as View, label: 'Atividades', Icon: CalendarClock },
    { view: 'agenda' as View, label: 'Agenda', Icon: CalendarDays },
    { view: 'products' as View, label: 'Produtos', Icon: Package },
    { view: 'proposals' as View, label: 'Propostas', Icon: FileText },
  ]

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span /><span /><span /><span /></div><span>GenCrm</span><button className="mobile-close icon-button" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={19} /></button></div>
      <div className="workspace-switch"><div className="workspace-icon">G</div><div><strong>Meu workspace</strong><small>Plano local</small></div><ChevronDown size={16} /></div>
      <div className="nav-caption">MENU PRINCIPAL</div>
      <nav className="nav-list" aria-label="Menu principal">{nav.map(({ view: tab, label, Icon }) => <button key={tab} className={`nav-item ${view === tab ? 'active' : ''}`} onClick={() => navigate(tab)}><Icon size={19} strokeWidth={1.9} /><span>{label}</span>{tab === 'proposals' && proposals.length > 0 && <small>{proposals.length}</small>}{tab === 'activities' && upcomingActivities.length > 0 && <small>{overdueActivities.length + nearDueActivities.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-box"><div className="help-icon"><CircleHelp size={18} /></div><strong>Seu negócio, organizado.</strong><p>Comece cadastrando um cliente e acompanhe cada oportunidade.</p><button onClick={() => { navigate('clients'); open('client') }}>Adicionar cliente <ArrowRight size={15} /></button></div><div className="sidebar-user"><div className="user-avatar">GC</div><div><strong>Meu CRM</strong><small>Ambiente local</small></div><MoreHorizontal size={19} /></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={22} /></button><div className="breadcrumbs">Workspace <span>/</span> <strong>{titles[view].title}</strong></div><div className="topbar-actions"><span className="local-badge"><span /> Dados locais</span><div className="top-avatar">GC</div></div></header>
      <div className={`page-content ${view === 'products' && selectedProducts.length ? 'has-product-selection' : ''}`}>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{titles[view].eyebrow}</div><h1>{titles[view].title}<span className="title-dot">.</span></h1><p>{titles[view].description}</p></div>{view !== 'overview' && view !== 'agenda' && <button className="primary-button heading-button" onClick={() => open(view === 'clients' ? 'client' : view === 'pipeline' ? 'opportunity' : view === 'activities' ? 'activity' : view === 'products' ? 'product' : 'proposal')}><Plus size={18} />{view === 'clients' ? 'Novo cliente' : view === 'pipeline' ? 'Nova oportunidade' : view === 'activities' ? 'Nova atividade' : view === 'products' ? 'Novo produto' : 'Nova proposta'}</button>}</div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar aviso"><X size={16} /></button></div>}
        {loading ? <div className="loading-state">Carregando seu CRM...</div> : <>
          {view === 'overview' && <>
            <div className="welcome-banner"><div className="welcome-copy"><div className="welcome-kicker"><Sparkles size={15} /> SEU ESPAÇO DE VENDAS</div><h2>Bem-vindo ao seu<br /><em>novo jeito de vender.</em></h2><p>Uma visão clara de clientes, negociações e propostas para você focar no que importa.</p><button onClick={() => { navigate('pipeline'); open('opportunity') }}>Criar oportunidade <ArrowUpRight size={17} /></button></div><div className="welcome-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-ring ring-three" /><div className="art-core"><div className="art-core-inner" /></div><div className="art-star star-one">✦</div><div className="art-star star-two">✦</div><div className="art-star star-three">✧</div></div></div>
            <div className="section-label-row"><h3>Resumo do negócio</h3><span>Atualizado agora</span></div>
            <div className="stats-grid"><Stat icon={<Users size={20} />} tone="purple" label="Clientes" value={String(clients.length).padStart(2, '0')} hint="na sua base" /><Stat icon={<BriefcaseBusiness size={20} />} tone="blue" label="Negociações abertas" value={String(openOpportunities.length).padStart(2, '0')} hint={money(openValue) + ' em andamento'} /><Stat icon={<FileText size={20} />} tone="orange" label="Propostas" value={String(proposals.length).padStart(2, '0')} hint={`${proposals.filter(p => p.status === 'enviada').length} aguardando retorno`} /><Stat icon={<ArrowUpRight size={20} />} tone="green" label="Vendas ganhas" value={money(wonValue)} hint={proposalTotal ? `${money(proposalTotal)} em propostas aceitas` : 'oportunidades concluídas'} /></div>
            <div className="dashboard-grid"><div className="panel"><div className="panel-header"><div><h3>Seu funil de vendas</h3><p>Oportunidades em cada etapa</p></div><button className="text-link" onClick={() => navigate('pipeline')}>Ver funil <ArrowRight size={16} /></button></div><div className="funnel-list">{pipelineStages.slice(0, 5).map((stage, index) => { const count = opportunities.filter(o => o.stage === stage).length; return <div className="funnel-row" key={stage}><span className={`funnel-dot tone-${stage}`} /><span className="funnel-name">{stageLabels[stage]}</span><div className="funnel-track"><div style={{ width: `${opportunities.length ? Math.max(7, (count / opportunities.length) * 100) : 0}%` }} className={`funnel-fill tone-${stage}`} /></div><strong>{count}</strong><span className="funnel-index">0{index + 1}</span></div> })}</div></div><div className="panel activity-panel"><div className="panel-header"><div><h3>Atividade recente</h3><p>Últimos registros adicionados</p></div><div className="activity-icon"><ClipboardList size={18} /></div></div>{latest.length ? <div className="activity-list">{latest.map(item => <div className="activity-row" key={item.id}><div className="activity-symbol">{item.kind === 'Proposta' ? <FileText size={17} /> : <BriefcaseBusiness size={17} />}</div><div><strong>{item.label}</strong><p>{item.kind} · {item.detail}</p></div><span>{dateLabel(item.date)}</span></div>)}</div> : <div className="activity-empty"><div><Sparkles size={24} /></div><strong>Um novo começo</strong><p>Seus próximos registros aparecerão aqui.</p></div>}</div></div>
            <div className="panel due-panel"><div className="panel-header"><div><h3>Atividades e entregas próximas</h3><p>{overdueActivities.length} atrasados · {nearDueActivities.length} vencem nos próximos 7 dias</p></div><button className="text-link" onClick={() => { setActivityFilter('pending'); navigate('activities') }}>Ver prazos <ArrowRight size={16} /></button></div>
              {upcomingActivities.length ? <div className="due-list">{upcomingActivities.map(a => <button type="button" className="due-row" key={a.key} onClick={() => openDueEntry(a)}><span className="due-row-icon">{a.kind === 'proposal' ? <BriefcaseBusiness size={18} /> : <CalendarClock size={18} />}</span><span className="due-row-main"><strong>{a.title}</strong><small>{a.kind === 'proposal' ? 'Previsão de entrega' : a.kind === 'interaction' ? 'Interação programada' : 'Atividade'} · {a.clientName || 'Sem cliente vinculado'}</small></span><span className={`due-badge ${a.dueDate < today ? 'overdue' : 'soon'}`}>{a.dueDate < today ? 'Atrasada' : a.dueDate === today ? 'Hoje' : dateLabel(a.dueDate)}</span></button>)}</div> : <div className="due-empty"><CalendarClock size={23} /><span>Nenhuma atividade ou entrega vence nos próximos 7 dias.</span><button onClick={() => { navigate('activities'); open('activity') }}>Criar atividade <ArrowRight size={15} /></button></div>}
            </div>
            <div className="quick-start"><div className="quick-icon"><Plus size={21} /></div><div><strong>Comece por aqui</strong><p>Cadastre um cliente para criar sua primeira oportunidade e proposta.</p></div><button onClick={() => { navigate('clients'); open('client') }}>Cadastrar cliente <ArrowRight size={16} /></button></div>
          </>}
          {view === 'clients' && <>
            <Toolbar search={search} setSearch={setSearch} placeholder="Buscar por nome, empresa ou e-mail" count={filteredClients.length} unit="clientes" />
            <div className="activity-filters client-filters" aria-label="Filtrar clientes">
              {([['all', 'Todos', clients.length], ['with_interactions', 'Com interação', clientsWithInteractions.size], ['in_pipeline', 'No funil', clientsInPipeline.size], ['with_appointment', 'Com compromisso agendado', clientsWithAppointments.size], ['untouched', 'Sem interação e fora do funil', untouchedClients.length]] as const).map(([filter, label, count]) => <button key={filter} type="button" className={clientFilter === filter ? 'selected' : ''} aria-pressed={clientFilter === filter} onClick={() => setClientFilter(filter)}>{label} <span>{count}</span></button>)}
            </div>
            {filteredClients.length ? <div className="table-card"><div className="table-scroll"><table>
              <thead><tr><th>CLIENTE</th><th>CONTATO</th><th>OPORTUNIDADES</th><th>CADASTRADO EM</th><th>FUNIL</th><th /></tr></thead>
              <tbody>{filteredClients.map(c => <tr key={c.id} onClick={() => open('client', c)}>
                <td><div className="person-cell"><div className={`avatar ${colorFor(c.id)}`}>{initials(c.name)}</div><div><strong>{c.name}</strong><small>{c.company || 'Pessoa física'}</small></div></div></td>
                <td><div className="stacked-cell"><span>{c.email || 'Sem e-mail'}</span><small>{c.phone || 'Sem telefone'}</small></div></td>
                <td><span className="count-pill">{opportunities.filter(o => o.clientId === c.id).length}</span></td>
                <td className="muted-cell">{dateLabel(c.createdAt)}</td>
                <td><button type="button" className="client-funnel-button" onClick={e => { e.stopPropagation(); startOpportunityForClient(c.id) }} aria-label={`Adicionar ${c.name} ao funil`}><Plus size={15} /> Funil</button></td>
                <td><button type="button" className="row-action" onClick={e => { e.stopPropagation(); open('client', c) }} aria-label={`Editar ${c.name}`}><MoreHorizontal size={20} /></button></td>
              </tr>)}</tbody>
            </table></div></div> : <Empty icon={<Users size={27} />} title={search || clientFilter !== 'all' ? 'Nenhum cliente encontrado' : 'Sua base de clientes começa aqui'} description={search || clientFilter !== 'all' ? 'Ajuste a busca ou selecione outro filtro.' : 'Cadastre pessoas ou empresas para acompanhar suas vendas.'} action={search || clientFilter !== 'all' ? undefined : 'Adicionar cliente'} onAction={() => open('client')} />}
          </>}
          {view === 'activities' && <>
            <Toolbar search={search} setSearch={setSearch} placeholder="Buscar por atividade, interação, oportunidade ou cliente" count={filteredActivities.length} unit="prazos" />
            <div className="activity-filters" aria-label="Filtrar atividades">
              {([['pending', 'Pendentes', pendingActivities.length], ['soon', 'Próximos 7 dias', nearDueActivities.length], ['overdue', 'Atrasados', overdueActivities.length], ['completed', 'Concluídas', dueEntries.filter(a => a.completed).length]] as const).map(([filter, label, count]) => <button key={filter} type="button" className={activityFilter === filter ? 'selected' : ''} aria-pressed={activityFilter === filter} onClick={() => setActivityFilter(filter)}>{label} <span>{count}</span></button>)}
            </div>
            {filteredActivities.length ? <div className="table-card"><div className="table-scroll"><table className="activities-table"><thead><tr><th>ATIVIDADE / PRAZO</th><th>CLIENTE</th><th>VENCIMENTO</th><th>DIAS ATÉ VENCER</th><th>STATUS</th><th /></tr></thead><tbody>{filteredActivities.map(a => <tr key={a.key} onClick={() => openDueEntry(a)}>
              <td><div className="activity-title-cell"><span className="activity-table-icon">{a.kind === 'proposal' ? <BriefcaseBusiness size={18} /> : <CalendarClock size={18} />}</span><div><strong>{a.title}</strong><small>{a.kind === 'proposal' ? 'Previsão de entrega' : a.kind === 'interaction' ? `Interação programada · ${a.notes}` : a.notes || 'Atividade'}</small></div></div></td>
              <td>{a.clientName || <span className="muted-cell">Sem cliente</span>}</td>
              <td className="muted-cell">{a.kind === 'interaction' ? new Date(a.record.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : dateLabel(a.dueDate)}</td>
              <td><span className={`days-until ${a.completed ? 'done' : a.dueDate < today ? 'overdue' : a.dueDate === today ? 'today' : ''}`}>{a.completed ? '—' : daysUntilLabel(daysUntil(a.dueDate, today))}</span></td>
              <td><span className={`due-badge ${a.completed ? 'done' : a.dueDate < today ? 'overdue' : a.dueDate <= weekEnd ? 'soon' : 'later'}`}>{a.completed ? 'Concluída' : a.dueDate < today ? 'Atrasada' : a.dueDate === today ? 'Vence hoje' : a.dueDate <= weekEnd ? 'Próxima' : 'Pendente'}</span></td>
              <td>{a.kind === 'activity' ? <button type="button" className="activity-done-button" onClick={e => { e.stopPropagation(); void toggleActivity(a.record) }} aria-label={a.completed ? `Reabrir ${a.title}` : `Concluir ${a.title}`}>{a.completed ? 'Reabrir' : <><Check size={15} /> Concluir</>}</button> : a.kind === 'interaction' ? <button type="button" className="activity-done-button" onClick={e => { e.stopPropagation(); void toggleInteraction(a.record) }} aria-label={a.completed ? `Reabrir interação de ${a.clientName}` : `Concluir interação de ${a.clientName}`}>{a.completed ? 'Reabrir' : <><Check size={15} /> Concluir</>}</button> : <button type="button" className="activity-done-button" onClick={e => { e.stopPropagation(); openDueEntry(a) }} aria-label={`Abrir proposta ${a.title}`}>Ver proposta <ArrowRight size={14} /></button>}</td>
            </tr>)}</tbody></table></div></div> : <Empty icon={<CalendarClock size={27} />} title={search ? 'Nenhum prazo encontrado' : activityFilter === 'soon' ? 'Tudo em dia nos próximos 7 dias' : activityFilter === 'overdue' ? 'Nenhum prazo atrasado' : activityFilter === 'completed' ? 'Nenhuma atividade concluída' : 'Nenhuma atividade ou entrega pendente'} description={search ? 'Tente buscar por outro termo.' : 'Cadastre uma atividade ou defina a previsão de entrega de uma proposta.'} action={!search && activityFilter === 'pending' ? 'Criar atividade' : undefined} onAction={() => open('activity')} />}
          </>}
          {view === 'agenda' && <Agenda appointments={clientInteractions.filter(i => i.scheduledAt)} proposals={proposals.filter(p => p.deliveryDate)} onOpenClient={clientId => { const client = clients.find(c => c.id === clientId); if (client) open('client', client) }} onOpenProposal={proposalId => { const proposal = proposals.find(p => p.id === proposalId); if (proposal) { navigate('proposals'); open('proposal', proposal) } }} onGoClients={() => navigate('clients')} />}
          {view === 'products' && <>
            <Toolbar search={search} setSearch={setSearch} placeholder="Buscar por produto ou código" count={filteredProducts.length} unit="produtos" />
            {!clients.length && <p className="field-hint">Cadastre um cliente para gerar propostas a partir do catálogo.</p>}
            {filteredProducts.length ? <div className="product-grid">{filteredProducts.map(p => <div className={`product-card ${selectedProductIds.includes(p.id) && p.active ? 'selected' : ''}`} key={p.id}><div className="product-top"><div className="product-icon"><ShoppingBag size={22} /></div><span className={`status-badge ${p.active ? 'active' : 'inactive'}`}>{p.active ? 'Ativo' : 'Inativo'}</span></div><div className="product-sku">{p.sku || 'SEM CÓDIGO'}</div><h3>{p.name}</h3><p>{p.description || 'Sem descrição cadastrada.'}</p><div className="product-footer"><strong>{money(p.priceCents)}</strong><button onClick={() => open('product', p)}>Editar <ArrowRight size={15} /></button></div><label className={`product-select ${!p.active ? 'disabled' : ''}`}><input type="checkbox" checked={!!p.active && selectedProductIds.includes(p.id)} disabled={!p.active} onChange={event => setSelectedProductIds(current => event.target.checked ? [...current, p.id] : current.filter(id => id !== p.id))} /><span>{p.active ? 'Selecionar para proposta' : 'Produto inativo'}</span></label></div>)}</div> : <Empty icon={<Package size={27} />} title={search ? 'Nenhum produto encontrado' : 'Monte seu catálogo'} description={search ? 'Tente buscar por outro termo.' : 'Adicione produtos ou serviços para criar propostas em poucos passos.'} action={search ? undefined : 'Adicionar produto'} onAction={() => open('product')} />}
          </>}
          {view === 'pipeline' && <>
            <div className="pipeline-summary-heading"><div><h2>Resumo do mês</h2><p>Previsão de entrega em {currentMonthLabel}</p></div><span>{monthlyPipeline.length} {monthlyPipeline.length === 1 ? 'oportunidade prevista' : 'oportunidades previstas'}</span></div>
            <div className="pipeline-summary-grid">{monthlyStages.map(stage => {
              const items = monthlyPipeline.filter(o => o.stage === stage)
              return <div className={`pipeline-summary-card tone-${stage}`} key={stage}>
                <div className="pipeline-summary-top"><span className={`column-dot tone-${stage}`} /><span>{stageLabels[stage]}</span><strong>{items.length}</strong></div>
                <div className="pipeline-summary-value">{money(items.reduce((sum, o) => sum + o.valueCents, 0))}</div>
                <small>{items.length === 1 ? '1 oportunidade' : `${items.length} oportunidades`}</small>
              </div>
            })}</div>
            {undatedPipeline.length > 0 && <div className="pipeline-undated"><CalendarClock size={18} /><span><strong>{undatedPipeline.length} {undatedPipeline.length === 1 ? 'oportunidade sem previsão de entrega' : 'oportunidades sem previsão de entrega'}</strong><small>{money(undatedPipeline.reduce((sum, item) => sum + item.valueCents, 0))} fora do resumo mensal. Defina a entrega na proposta para incluir no mês correspondente.</small></span><button type="button" onClick={() => { const proposal = proposalByOpportunity.get(undatedPipeline[0].id); if (proposal) { navigate('proposals'); open('proposal', proposal) } else { setWizardOpportunity(undatedPipeline[0]); setWizardOpen(true) } }}>Definir entrega <ArrowRight size={14} /></button></div>}
            <Toolbar search={search} setSearch={setSearch} placeholder="Buscar oportunidades" count={filteredOpportunities.length} unit="oportunidades" />
            {opportunities.length ? <div className="pipeline-board">{pipelineStages.map(stage => {
              const cards = filteredOpportunities.filter(o => o.stage === stage).sort((a, b) => {
                const aDate = priorityDate(a)
                const bDate = priorityDate(b)
                if (!aDate && !bDate) return 0
                if (!aDate) return 1
                if (!bDate) return -1
                return aDate.localeCompare(bDate)
              })
              return <section className={`pipeline-column ${stage === 'proposta' && dragId ? 'proposal-drop-target' : ''}`} key={stage} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragId) { const item = opportunities.find(o => o.id === dragId); if (item && item.stage !== stage) { if (stage === 'proposta') { setWizardOpportunity(item); setWizardOpen(true) } else void moveOpportunity(item, stage) } } setDragId(null) }}>
                <div className="column-heading"><div><span className={`column-dot tone-${stage}`} /><strong>{stageLabels[stage]}</strong><span className="column-count">{cards.length}</span></div><button aria-label={`Adicionar em ${stageLabels[stage]}`} onClick={() => { open('opportunity'); setDraft(current => ({ ...current, stage })) }}><Plus size={18} /></button></div>
                <div className="column-value">{money(cards.reduce((sum, o) => sum + o.valueCents, 0))}</div>
                {stage === 'proposta' && dragId && <div className="proposal-drop-hint"><FileText size={14} /> Solte aqui para montar a proposta</div>}
                <div className="column-cards">{cards.map(o => {
                  const linkedProposal = proposalByOpportunity.get(o.id)
                  const nextInteraction = nextInteractionByOpportunity.get(o.id)
                  return <div className="opportunity-card" key={o.id} draggable onDragStart={() => setDragId(o.id)} onDragEnd={() => setDragId(null)} onClick={() => open('opportunity', o)}>
                    <div className="card-top"><span className="card-id">#{String(o.id).padStart(3, '0')}</span><MoreHorizontal size={18} /></div>
                    <h4>{o.title}</h4>
                    <div className="card-client"><span className={`mini-avatar ${colorFor(o.clientId)}`}>{initials(o.clientName)}</span>{o.clientName}</div>
                    {linkedProposal && <button type="button" className="card-proposal" onClick={e => { e.stopPropagation(); open('proposal', linkedProposal) }} aria-label={`Abrir proposta ${linkedProposal.title}`}><FileText size={13} /><span>{linkedProposal.title}</span></button>}
                    <div className="card-bottom"><strong>{money(o.valueCents)}</strong><div className="card-deadlines">{linkedProposal?.deliveryDate && <span>Entrega {dateLabel(linkedProposal.deliveryDate)}</span>}{nextInteraction && <span title={`Interação programada: ${new Date(nextInteraction.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}>Contato {new Date(nextInteraction.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}{!linkedProposal?.deliveryDate && !nextInteraction && <span>Sem prazo</span>}</div></div>
                  </div>
                })}{cards.length === 0 && <div className="column-empty">{stage === 'proposta' ? 'Arraste uma oportunidade para criar a proposta' : 'Arraste uma oportunidade para cá'}</div>}</div>
              </section>
            })}</div> : <Empty icon={<BriefcaseBusiness size={27} />} title="Seu funil está pronto" description="Crie uma oportunidade para acompanhar o caminho até a venda. Cadastre um cliente primeiro." action={clients.length ? 'Nova oportunidade' : 'Cadastrar cliente'} onAction={() => clients.length ? open('opportunity') : (navigate('clients'), open('client'))} />}
          </>}
          {view === 'proposals' && <>
            <Toolbar search={search} setSearch={setSearch} placeholder="Buscar por proposta ou cliente" count={filteredProposals.length} unit="propostas" />
            <div className="activity-filters proposal-filters" aria-label="Filtrar propostas por status">
              {(['all', 'rascunho', 'enviada', 'aceita', 'recusada'] as const).map(status => <button key={status} type="button" className={proposalStatusFilter === status ? 'selected' : ''} aria-pressed={proposalStatusFilter === status} onClick={() => setProposalStatusFilter(status)}>{status === 'all' ? 'Todas' : statusLabels[status]} <span>{status === 'all' ? proposals.length : proposals.filter(p => p.status === status).length}</span></button>)}
            </div>
            {filteredProposals.length ? <div className="table-card"><div className="table-scroll"><table>
              <thead><tr><th>PROPOSTA</th><th>CLIENTE</th><th>VALOR</th><th>VALIDADE</th><th>STATUS</th><th>ARQUIVO</th><th /></tr></thead>
              <tbody>{filteredProposals.map(p => <tr key={p.id} onClick={() => open('proposal', p)}>
                <td><div className="proposal-name"><div className="proposal-file"><FileText size={18} /></div><div><strong>{p.title}</strong><small>#{String(p.id).padStart(4, '0')} · {p.items.length} {p.items.length === 1 ? 'item' : 'itens'}</small></div></div></td>
                <td>{p.clientName}</td><td className="value-cell">{money(p.totalCents)}</td><td className="muted-cell">{dateLabel(p.validUntil)}{p.deliveryDate && <small className="proposal-delivery-date">Entrega: {dateLabel(p.deliveryDate)}</small>}</td>
                <td><span className={`proposal-status status-${p.status}`}>{statusLabels[p.status]}</span></td>
                <td><div className="proposal-file-actions"><button type="button" className="pdf-table-button" disabled={previewLoadingId === p.id} onClick={e => { e.stopPropagation(); void previewProposal(p) }}><Eye size={15} />{previewLoadingId === p.id ? 'Abrindo...' : 'Visualizar'}</button><button type="button" className="pdf-table-button" disabled={pdfId === p.id} onClick={e => { e.stopPropagation(); void downloadProposal(p) }}><Download size={15} />{pdfId === p.id ? 'Gerando...' : 'Baixar PDF'}</button></div></td>
                <td><button className="row-action" onClick={e => { e.stopPropagation(); open('proposal', p) }} aria-label={`Editar ${p.title}`}><MoreHorizontal size={20} /></button></td>
              </tr>)}</tbody>
            </table></div></div> : <Empty icon={<FileText size={27} />} title={search || proposalStatusFilter !== 'all' ? 'Nenhuma proposta encontrada' : 'Propostas em poucos passos'} description={search || proposalStatusFilter !== 'all' ? 'Ajuste a busca ou selecione outro status.' : 'Monte uma proposta com itens do catálogo ou personalizados.'} action={search || proposalStatusFilter !== 'all' ? undefined : 'Criar proposta'} onAction={() => clients.length ? open('proposal') : (navigate('clients'), open('client'))} />}
          </>}
        </>}
      </div>
    </main>

    {view === 'products' && selectedProducts.length > 0 && !wizardOpen && <div className="product-selection-bar product-selection-floating" role="region" aria-label="Produtos selecionados para proposta"><div><strong>{selectedProducts.length} {selectedProducts.length === 1 ? 'produto selecionado' : 'produtos selecionados'}</strong><small>Pronto para montar sua proposta</small></div><div className="product-selection-actions"><button type="button" className="secondary-button" onClick={() => setSelectedProductIds([])}>Limpar seleção</button><button type="button" className="primary-button" disabled={!clients.length} onClick={() => { setWizardOpportunity(null); setWizardOpen(true) }}><FileText size={16} /> Criar proposta <ArrowRight size={16} /></button></div></div>}
    {wizardOpen && <ProposalWizard products={wizardOpportunity ? products.filter(product => product.active) : selectedProducts} clients={clients} opportunities={opportunities} sourceOpportunity={wizardOpportunity || undefined} onClose={closeWizard} onCreate={createProposalWithWizard} />}
    {editing && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null) }}><div className={`modal ${editing.kind === 'client' && editing.id ? 'client-modal' : editingOpportunity ? 'opportunity-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line" />{editing.id ? 'EDITAR REGISTRO' : 'NOVO REGISTRO'}</div><h2 id="modal-title">{editing.kind === 'client' ? 'Cliente' : editing.kind === 'product' ? 'Produto' : editing.kind === 'opportunity' ? 'Oportunidade' : editing.kind === 'activity' ? 'Atividade' : 'Proposta'}</h2></div><button className="icon-button" onClick={() => setEditing(null)} aria-label="Fechar"><X size={20} /></button></div>{error && <div className="modal-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Fechar aviso"><X size={15} /></button></div>}<form onSubmit={save}><div className="modal-body">
      {editing.kind === 'client' && (editing.id ? <ClientInteractions key={editing.id} clientId={editing.id} opportunities={opportunities.filter(o => o.clientId === editing.id && !['ganho', 'perdido'].includes(o.stage))} hasFunnelRecord={opportunities.some(o => o.clientId === editing.id)} onChange={() => void load()}>{clientFields}</ClientInteractions> : clientFields)}
      {editing.kind === 'product' && <><Field label="Nome do produto ou serviço *"><input required value={draft.name} onChange={e => update('name', e.target.value)} placeholder="Ex.: Consultoria mensal" /></Field><div className="field-row"><Field label="Código / SKU"><input value={draft.sku} onChange={e => update('sku', e.target.value)} placeholder="EX-001" /></Field><Field label="Preço (R$) *"><input required type="number" min="0" step="0.01" value={draft.price} onChange={e => update('price', e.target.value)} placeholder="0,00" /></Field></div><Field label="Descrição"><textarea value={draft.description} onChange={e => update('description', e.target.value)} placeholder="Descreva o que está incluso" rows={3} /></Field><label className="switch-row"><input type="checkbox" checked={draft.active} onChange={e => update('active', e.target.checked)} /><span>Produto ativo</span></label></>}
      {editing.kind === 'opportunity' && (editingOpportunity
        ? <ClientInteractions key={editingOpportunity.id} clientId={editingOpportunity.clientId} opportunityId={editingOpportunity.id} opportunities={opportunities.filter(o => o.clientId === editingOpportunity.clientId && !['ganho', 'perdido'].includes(o.stage))} hasFunnelRecord disabledReason={Number(draft.clientId) !== editingOpportunity.clientId ? 'Salve a oportunidade com o novo cliente antes de registrar interações.' : undefined} onChange={() => void load()}>{opportunityFields}</ClientInteractions>
        : opportunityFields)}
      {editing.kind === 'activity' && <><Field label="Atividade *"><input required value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Ex.: Ligar para confirmar a proposta" /></Field><div className="field-row"><Field label="Vencimento *"><input type="date" required value={draft.dueDate} onChange={e => update('dueDate', e.target.value)} /></Field><ClientCombobox key={editing.id ?? 0} clients={clients} value={draft.clientId} onChange={id => update('clientId', id)} /></div><Field label="Observações"><textarea value={draft.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="Detalhes ou próximos passos" /></Field>{editing.id && <label className="switch-row"><input type="checkbox" checked={draft.completed} onChange={e => update('completed', e.target.checked)} /><span>Atividade concluída</span></label>}</>}
      {editing.kind === 'proposal' && <><Field label="Título da proposta *"><input required value={draft.title} onChange={e => update('title', e.target.value)} placeholder="Ex.: Proposta comercial — Projeto X" /></Field><div className="field-row"><ClientCombobox key={editing.id ?? 0} clients={clients} value={draft.clientId} onChange={clientChanged} required /><Field label="Oportunidade"><select value={draft.opportunityId} onChange={e => update('opportunityId', e.target.value)}><option value="">Criar nova oportunidade no funil</option>{relatedOpportunities.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></Field></div>{clients.length === 0 && <p className="field-hint">Cadastre um cliente antes de criar uma proposta.</p>}<div className="field-row"><Field label="Validade (10 dias)"><input type="date" value={draft.validUntil} readOnly /></Field><Field label="Status"><select value={draft.status} onChange={e => update('status', e.target.value as ProposalStatus)}>{(Object.keys(statusLabels) as ProposalStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field></div><div className="items-heading"><strong>Itens da proposta</strong><button type="button" onClick={() => update('items', [...draft.items, { productId: '', description: '', quantity: '1', unitPrice: '' }])}><Plus size={15} /> Adicionar item</button></div>{draft.items.map((item, index) => <div className="proposal-item-editor" key={index}><div className="item-editor-top"><span>ITEM {String(index + 1).padStart(2, '0')}</span>{draft.items.length > 1 && <button type="button" onClick={() => update('items', draft.items.filter((_, i) => i !== index))} aria-label="Remover item"><Trash2 size={16} /></button>}</div><Field label="Produto do catálogo"><select value={item.productId} onChange={e => selectProduct(index, e.target.value)}><option value="">Item personalizado</option>{products.filter(p => p.active || String(p.id) === item.productId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Descrição *"><input required value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="Descrição do item" /></Field><div className="field-row"><Field label="Quantidade *"><input required type="number" min="1" step="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} /></Field><Field label="Preço unitário (R$) *"><input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(index, 'unitPrice', e.target.value)} /></Field></div></div>)}<div className="field-row"><Field label="Desconto (%)"><input type="number" min="0" max="100" step="0.01" value={draft.discountPercent} onChange={e => update('discountPercent', e.target.value)} /></Field><div className="proposal-totals"><span>Subtotal <strong>{money(proposedSubtotal)}</strong></span><span>Total <strong>{money(proposedTotal)}</strong></span></div></div><Field label="Observações"><textarea value={draft.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="Condições comerciais e outras informações" /></Field></>}
      {editing.kind === 'proposal' && <Field label="Previsão de entrega *"><input type="date" required value={draft.deliveryDate} onChange={e => update('deliveryDate', e.target.value)} /></Field>}
    </div><div className={`modal-footer ${editingProposal ? 'proposal-modal-footer' : ''}`}>
      {editing.id && <button type="button" className="delete-button" onClick={() => void remove(editing.kind, editing.id!)}><Trash2 size={16} /> Excluir</button>}
      <div className="footer-actions">
        {editingProposal && <button type="button" className="secondary-button download-modal-button" disabled={previewLoadingId === editingProposal.id} onClick={() => void previewProposal(editingProposal)}><Eye size={16} />{previewLoadingId === editingProposal.id ? 'Abrindo...' : 'Visualizar PDF salvo'}</button>}
        {editingProposal && <button type="button" className="secondary-button download-modal-button" disabled={pdfId === editingProposal.id} onClick={() => void downloadProposal(editingProposal)}><Download size={16} />{pdfId === editingProposal.id ? 'Gerando...' : 'Baixar PDF salvo'}</button>}
        <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancelar</button>
        <button type="submit" className="primary-button" disabled={saving || ((editing.kind === 'proposal' || editing.kind === 'opportunity') && !clients.length)}>{saving ? 'Salvando...' : <><Check size={17} /> Salvar {editing.kind === 'client' ? 'cliente' : editing.kind === 'product' ? 'produto' : editing.kind === 'opportunity' ? 'oportunidade' : editing.kind === 'activity' ? 'atividade' : 'proposta'}</>}</button>
        {editing.kind === 'client' && <button type="submit" name="nextStep" value="pipeline" className="client-pipeline-button" disabled={saving}><BriefcaseBusiness size={16} /> Salvar e criar oportunidade</button>}
      </div>
    </div></form></div></div>}
    {previewPdf && <div className="modal-backdrop pdf-preview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPreviewPdf(null) }}><div className="pdf-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title"><div className="pdf-preview-header"><div><span>PRÉVIA DA PROPOSTA</span><h2 id="pdf-preview-title">{previewPdf.title}</h2></div><button type="button" className="icon-button" onClick={() => setPreviewPdf(null)} aria-label="Fechar visualização"><X size={20} /></button></div><iframe src={previewPdf.url} title={`PDF da proposta ${previewPdf.title}`} /><div className="pdf-preview-footer"><span>Proposta #{String(previewPdf.id).padStart(4, '0')}</span><div><a className="secondary-button pdf-preview-link" href={previewPdf.url} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a><a className="primary-button pdf-preview-link" href={previewPdf.url} download={`proposta-${String(previewPdf.id).padStart(4, '0')}.pdf`}><Download size={16} /> Baixar PDF</a></div></div></div></div>}
  </div>
}

function Stat({ icon, tone, label, value, hint }: { icon: React.ReactNode; tone: string; label: string; value: string; hint: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}<ArrowDownRight size={15} /></div><strong>{value}</strong><p>{hint}</p></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function Toolbar({ search, setSearch, placeholder, count, unit }: { search: string; setSearch: (value: string) => void; placeholder: string; count: number; unit: string }) { return <div className="list-toolbar"><div className="search-box"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div><div className="toolbar-count">{count} {unit}</div></div> }
function Empty({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction: () => void }) { return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{description}</p>{action && <button className="primary-button" onClick={onAction}><Plus size={17} />{action}</button>}</div> }

export default App
