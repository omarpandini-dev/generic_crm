import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Download, FileText, X } from 'lucide-react'
import ClientCombobox, { type ClientOption } from './ClientCombobox'

type Product = { id: number; name: string; priceCents: number }
type Opportunity = { id: number; title: string; clientId: number; stage: string }
type Item = { productId: number; description: string; quantity: string; unitPrice: string }

export type WizardProposal = {
  title: string
  clientId: number
  opportunityId: number | null
  status: 'rascunho' | 'enviada'
  validUntil: string
  notes: string
  discountPercent: number
  items: { productId: number; description: string; quantity: number; unitPriceCents: number }[]
}

type Props = {
  products: Product[]
  clients: ClientOption[]
  opportunities: Opportunity[]
  onClose: () => void
  onCreate: (proposal: WizardProposal, downloadPdf: boolean) => Promise<void>
}

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const dateISO = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const steps = ['Itens', 'Cliente', 'Condições', 'Revisão']

export default function ProposalWizard({ products, clients, opportunities, onClose, onCreate }: Props) {
  const [step, setStep] = useState(0)
  const [items, setItems] = useState<Item[]>(() => products.map(product => ({ productId: product.id, description: product.name, quantity: '1', unitPrice: (product.priceCents / 100).toFixed(2) })))
  const [clientId, setClientId] = useState('')
  const [opportunityId, setOpportunityId] = useState('')
  const [title, setTitle] = useState('Proposta comercial')
  const [validUntil, setValidUntil] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return dateISO(date)
  })
  const [status, setStatus] = useState<'rascunho' | 'enviada'>('rascunho')
  const [discount, setDiscount] = useState('0')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const client = clients.find(item => item.id === Number(clientId))
  const relatedOpportunities = opportunities.filter(item => item.clientId === Number(clientId) && !['ganho', 'perdido'].includes(item.stage))
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * Math.round((Number(item.unitPrice) || 0) * 100), 0)
  const discountNumber = Number(discount)
  const total = Math.round(subtotal * (1 - (Number.isFinite(discountNumber) ? discountNumber : 0) / 100))

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems(current => current.map((item, position) => position === index ? { ...item, [field]: value } : item))
    setError('')
  }

  function validate(currentStep: number) {
    if (currentStep === 0) {
      if (!items.length) return 'Selecione pelo menos um produto.'
      if (items.some(item => !item.description.trim() || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1 || item.unitPrice.trim() === '' || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) return 'Revise a descrição, quantidade e preço de cada item.'
    }
    if (currentStep === 1 && !clientId) return 'Selecione um cliente para a proposta.'
    if (currentStep === 2) {
      if (!title.trim()) return 'Informe o título da proposta.'
      if (!validUntil) return 'Informe a validade da proposta.'
      if (!Number.isFinite(discountNumber) || discountNumber < 0 || discountNumber > 100) return 'O desconto deve estar entre 0% e 100%.'
    }
    return ''
  }

  function next() {
    const message = validate(step)
    if (message) { setError(message); return }
    setError('')
    setStep(current => Math.min(current + 1, 3))
  }

  async function create(downloadPdf: boolean) {
    const message = [0, 1, 2].map(validate).find(Boolean)
    if (message) { setError(message); return }
    setSaving(true)
    setError('')
    try {
      await onCreate({
        title: title.trim(), clientId: Number(clientId), opportunityId: opportunityId ? Number(opportunityId) : null,
        status, validUntil, notes: [deliveryDate ? `Prazo de entrega: ${new Date(`${deliveryDate}T12:00:00`).toLocaleDateString('pt-BR')}` : '', paymentTerms.trim() ? `Condições de pagamento: ${paymentTerms.trim()}` : '', notes.trim()].filter(Boolean).join('\n'), discountPercent: discountNumber,
        items: items.map(item => ({ productId: item.productId, description: item.description.trim(), quantity: Number(item.quantity), unitPriceCents: Math.round(Number(item.unitPrice) * 100) })),
      }, downloadPdf)
    } catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }

  return <div className="modal-backdrop wizard-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <div className="modal proposal-wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line" /> NOVA PROPOSTA</div><h2 id="wizard-title">Criar proposta</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Fechar"><X size={20} /></button></div>
      <div className="wizard-steps" aria-label="Etapas da proposta">{steps.map((label, index) => <div key={label} className={`wizard-step ${index === step ? 'current' : ''} ${index < step ? 'finished' : ''}`} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></div>)}</div>
      {error && <div className="modal-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Fechar aviso"><X size={15} /></button></div>}
      <div className="wizard-body">
        {step === 0 && <><div className="wizard-intro"><h3>Itens selecionados</h3><p>Ajuste quantidades e valores antes de avançar.</p></div><div className="wizard-items">{items.map((item, index) => <div className="wizard-item" key={item.productId}><div className="wizard-item-heading"><span>{String(index + 1).padStart(2, '0')}</span><strong>{products.find(product => product.id === item.productId)?.name || item.description}</strong><button type="button" onClick={() => setItems(current => current.filter((_, position) => position !== index))} aria-label={`Remover ${item.description}`}><X size={17} /></button></div><label className="field"><span>Descrição</span><input value={item.description} onChange={event => updateItem(index, 'description', event.target.value)} /></label><div className="field-row"><label className="field"><span>Quantidade</span><input type="number" min="1" step="1" value={item.quantity} onChange={event => updateItem(index, 'quantity', event.target.value)} /></label><label className="field"><span>Preço unitário (R$)</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={event => updateItem(index, 'unitPrice', event.target.value)} /></label></div></div>)}</div><div className="wizard-total"><span>Subtotal</span><strong>{money(subtotal)}</strong></div></>}
        {step === 1 && <>
          <div className="wizard-intro"><h3>Para quem é a proposta?</h3><p>Digite o nome, empresa ou e-mail para encontrar o cliente.</p></div>
          <ClientCombobox clients={clients} value={clientId} onChange={id => { setClientId(id); setOpportunityId(''); setError('') }} required />
          <label className="field"><span>Oportunidade</span><select value={opportunityId} onChange={event => setOpportunityId(event.target.value)} disabled={!clientId}><option value="">Criar uma nova oportunidade no funil</option>{relatedOpportunities.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          {!clients.length && <p className="field-hint">Cadastre um cliente antes de criar a proposta.</p>}
        </>}
        {step === 2 && <><div className="wizard-intro"><h3>Condições comerciais</h3><p>Defina validade, entrega, pagamento e desconto.</p></div><label className="field"><span>Título *</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Título da proposta" /></label><div className="field-row"><label className="field"><span>Validade da proposta *</span><input type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} /></label><label className="field"><span>Prazo de entrega</span><input type="date" value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} /></label></div><div className="field-row"><label className="field"><span>Desconto (%)</span><input type="number" min="0" max="100" step="0.01" value={discount} onChange={event => setDiscount(event.target.value)} /></label><label className="field"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value as 'rascunho' | 'enviada')}><option value="rascunho">Rascunho</option><option value="enviada">Enviada</option></select></label></div><label className="field"><span>Condições de pagamento</span><input value={paymentTerms} onChange={event => setPaymentTerms(event.target.value)} placeholder="Ex.: 50% na aprovação e 50% na entrega" /></label><label className="field"><span>Observações</span><textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Outras condições comerciais" /></label><div className="wizard-total"><span>Total da proposta</span><strong>{money(total)}</strong></div></>}
        {step === 3 && <><div className="wizard-intro"><h3>Revise a proposta</h3><p>Confira os dados antes de salvar.</p></div><div className="wizard-review"><div><span>Cliente</span><strong>{client?.name}</strong></div><div><span>Oportunidade</span><strong>{relatedOpportunities.find(item => item.id === Number(opportunityId))?.title || 'Nova oportunidade no funil'}</strong></div><div><span>Proposta</span><strong>{title}</strong></div><div><span>Validade</span><strong>{new Date(`${validUntil}T12:00:00`).toLocaleDateString('pt-BR')}</strong></div><div><span>Entrega</span><strong>{deliveryDate ? new Date(`${deliveryDate}T12:00:00`).toLocaleDateString('pt-BR') : 'A combinar'}</strong></div><div><span>Status</span><strong>{status === 'enviada' ? 'Enviada' : 'Rascunho'}</strong></div></div><div className="wizard-review-items">{items.map(item => <div key={item.productId}><span>{item.quantity} × {item.description}</span><strong>{money(Number(item.quantity) * Math.round(Number(item.unitPrice) * 100))}</strong></div>)}</div><div className="wizard-review-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Desconto</span><strong>{discountNumber}%</strong></div><div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div></div>{paymentTerms && <p className="wizard-review-notes">Pagamento: {paymentTerms}</p>}{notes && <p className="wizard-review-notes">{notes}</p>}</>}
      </div>
      <div className="wizard-footer"><button type="button" className="secondary-button" onClick={() => step ? (setStep(current => current - 1), setError('')) : onClose()} disabled={saving}><ArrowLeft size={16} /> {step ? 'Voltar' : 'Cancelar'}</button><span>Etapa {step + 1} de 4</span>{step < 3 ? <button type="button" className="primary-button" onClick={next} disabled={step === 1 && !clients.length}>Próximo <ArrowRight size={16} /></button> : <div className="wizard-final-actions"><button type="button" className="secondary-button wizard-save-button" onClick={() => void create(false)} disabled={saving}><FileText size={16} /> Salvar proposta</button><button type="button" className="primary-button" onClick={() => void create(true)} disabled={saving}><Download size={16} /> {saving ? 'Salvando...' : 'Salvar e baixar PDF'}</button></div>}</div>
    </div>
  </div>
}
