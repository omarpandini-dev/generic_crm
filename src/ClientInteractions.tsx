import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, Plus, X } from 'lucide-react'

type Interaction = {
  id: number
  type: 'ligacao' | 'email' | 'reuniao' | 'mensagem' | 'outro'
  description: string
  occurredAt: string
  scheduledAt: string
  completed: number
  funnelStage: Stage | ''
}
type Stage = 'novo' | 'contato' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
type Opportunity = { stage: Stage }

const labels: Record<Interaction['type'], string> = {
  ligacao: 'Ligação', email: 'E-mail', reuniao: 'Reunião', mensagem: 'Mensagem', outro: 'Outro',
}
const stageLabels: Record<Stage, string> = {
  novo: 'Novo lead', contato: 'Em contato', proposta: 'Proposta',
  negociacao: 'Negociação', ganho: 'Ganho', perdido: 'Perdido',
}
const textPresets: Record<Interaction['type'], { label: string; text: string }[]> = {
  ligacao: [
    { label: 'Primeiro contato', text: 'Liguei para apresentar nossos produtos e entender as necessidades do cliente.' },
    { label: 'Acompanhamento', text: 'Conversei com o cliente para acompanhar o andamento e alinhar os próximos passos.' },
    { label: 'Confirmação de reunião', text: 'Liguei para confirmar a reunião e o horário combinado.' },
  ],
  email: [
    { label: 'Apresentação', text: 'Enviei um e-mail de apresentação com informações sobre nossos produtos e serviços.' },
    { label: 'Envio de proposta', text: 'Enviei a proposta comercial por e-mail e aguardo o retorno do cliente.' },
    { label: 'Acompanhamento', text: 'Enviei um e-mail de acompanhamento para esclarecer dúvidas e combinar os próximos passos.' },
  ],
  reuniao: [
    { label: 'Levantamento de necessidades', text: 'Realizei uma reunião para entender as necessidades e os objetivos do cliente.' },
    { label: 'Apresentação de proposta', text: 'Apresentei a proposta em reunião e alinhei os próximos passos com o cliente.' },
    { label: 'Reunião de acompanhamento', text: 'Realizei uma reunião de acompanhamento e combinamos um retorno.' },
  ],
  mensagem: [
    { label: 'Primeiro contato', text: 'Enviei uma mensagem para iniciar o contato e entender o interesse do cliente.' },
    { label: 'Confirmação de agendamento', text: 'Confirmei a data e o horário do compromisso com o cliente por mensagem.' },
    { label: 'Acompanhamento', text: 'Enviei uma mensagem de acompanhamento e aguardo o retorno do cliente.' },
  ],
  outro: [
    { label: 'Atualização do cliente', text: 'Registrei uma atualização relevante sobre o atendimento deste cliente.' },
    { label: 'Material compartilhado', text: 'Compartilhei com o cliente os materiais e as informações solicitadas.' },
    { label: 'Próximos passos', text: 'Alinhei com o cliente os próximos passos do atendimento.' },
  ],
}

function nowLocal() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function ClientInteractions({ clientId, opportunities, hasFunnelRecord, disabledReason, onChange, children }: { clientId: number; opportunities: Opportunity[]; hasFunnelRecord: boolean; disabledReason?: string; onChange?: () => void; children: ReactNode }) {
  const [items, setItems] = useState<Interaction[]>([])
  const [type, setType] = useState<Interaction['type']>('ligacao')
  const [description, setDescription] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [hiddenPresets, setHiddenPresets] = useState<Set<string>>(() => new Set())
  const [occurredAt, setOccurredAt] = useState(nowLocal)
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)

  async function load() {
    try {
      const response = await fetch(`/api/clients/${clientId}/interactions`)
      if (!response.ok) throw new Error(`Não foi possível carregar as interações (HTTP ${response.status}).`)
      setItems(await response.json())
      setError('')
    } catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [clientId])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function changeType(nextType: Interaction['type']) {
    if (selectedPreset !== '') setDescription('')
    setSelectedPreset('')
    setType(nextType)
  }

  function choosePreset(index: number) {
    setSelectedPreset(String(index))
    setDescription(textPresets[type][index].text)
  }

  function dismissPreset(index: number) {
    setHiddenPresets(current => new Set(current).add(`${type}:${index}`))
    if (selectedPreset === String(index)) {
      setDescription('')
      setSelectedPreset('')
    }
  }

  async function add() {
    if (!description.trim() || !occurredAt || disabledReason) return
    setSaving(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/interactions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, description: description.trim(), occurredAt, scheduledAt }),
      })
      if (!response.ok) {
        const text = await response.text()
        let message = `Não foi possível registrar a interação (HTTP ${response.status}).`
        try { message = JSON.parse(text).error || message } catch { /* Empty error response. */ }
        throw new Error(message)
      }
      setDescription('')
      setSelectedPreset('')
      setOccurredAt(nowLocal())
      setScheduledAt('')
      await load()
      onChange?.()
    } catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }

  return <section className="client-interactions" aria-label="Cadastro e histórico de interações">
    <div className="client-editor-main">{children}<div className="client-interaction-compose">
      <div className="client-pane-heading"><strong>Nova interação</strong><small>Registre o contato</small></div>
      <div className="client-interaction-fields"><label className="field"><span>Tipo</span><select value={type} onChange={event => changeType(event.target.value as Interaction['type'])}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Data e hora</span><input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} /></label></div>
      <label className="field"><span>Data programada (opcional)</span><input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label>
      {opportunities.length === 1 && <p className="client-funnel-hint">Etapa atual do funil deste cliente: <strong>{stageLabels[opportunities[0].stage]}</strong>.</p>}
      {!hasFunnelRecord && opportunities.length === 0 && type !== 'outro' && <p className="client-funnel-hint">Ao registrar, o cliente entrará automaticamente no funil em <strong>Em contato</strong>.</p>}
      <div className="interaction-description-field">
        <label htmlFor="client-interaction-description">Descrição da interação</label>
        <div className="interaction-description-control">
          {textPresets[type].some((_, index) => !hiddenPresets.has(`${type}:${index}`)) && <div className="interaction-suggestions" aria-label={`Sugestões para ${labels[type]}`}>
            {textPresets[type].map((preset, index) => hiddenPresets.has(`${type}:${index}`) ? null : <div className={`interaction-suggestion ${selectedPreset === String(index) ? 'selected' : ''}`} key={preset.label}>
              <button type="button" className="interaction-suggestion-text" onClick={() => choosePreset(index)} title="Usar este texto">{preset.text}</button>
              <button type="button" className="interaction-suggestion-remove" onClick={() => dismissPreset(index)} aria-label={`Remover sugestão: ${preset.label}`} title="Remover sugestão"><X size={14} /></button>
            </div>)}
          </div>}
          <textarea id="client-interaction-description" rows={3} maxLength={200} value={description} onChange={event => { setDescription(event.target.value); setSelectedPreset('') }} placeholder="Digite sua descrição ou clique em um texto acima." />
        </div>
        {textPresets[type].some((_, index) => hiddenPresets.has(`${type}:${index}`)) && <button type="button" className="interaction-suggestions-restore" onClick={() => setHiddenPresets(current => { const next = new Set(current); textPresets[type].forEach((_, index) => next.delete(`${type}:${index}`)); return next })}>Restaurar sugestões</button>}
      </div>
      {disabledReason && <p className="client-funnel-hint">{disabledReason}</p>}
      <button type="button" className="secondary-button client-interaction-add" disabled={saving || !description.trim() || !occurredAt || !!disabledReason} onClick={() => void add()}><Plus size={15} />{saving ? 'Registrando...' : 'Registrar interação'}</button>
      {error && <p className="client-interaction-error" role="alert">{error}</p>}
    </div></div>
    <div className="client-interaction-history"><div className="client-interactions-heading"><strong>Histórico de interações</strong><span>{items.length} {items.length === 1 ? 'registro' : 'registros'}</span></div>
      {loading ? <p className="client-interaction-empty">Carregando histórico...</p> : items.length ? <div className="client-interaction-list">{items.map(item => {
        const upcoming = !!item.scheduledAt && !item.completed && new Date(item.scheduledAt).getTime() > now
        return <div className={`client-interaction-item ${upcoming ? 'upcoming' : ''}`} key={item.id}><div><strong>{labels[item.type]}</strong>{upcoming && <span className="interaction-upcoming-badge"><CalendarClock size={12} /> Agendada</span>}<time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time></div><p>{item.description}</p>{item.scheduledAt && <small className={`client-interaction-scheduled ${upcoming ? 'upcoming' : ''}`}>Data programada: {new Date(item.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>}{item.funnelStage && <small className="client-interaction-funnel">Funil · {stageLabels[item.funnelStage]}</small>}</div>
      })}</div> : <p className="client-interaction-empty">Nenhuma interação registrada para este cliente.</p>}
    </div>
  </section>
}
