import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

type Interaction = {
  id: number
  type: 'ligacao' | 'email' | 'reuniao' | 'mensagem' | 'outro'
  description: string
  occurredAt: string
}

const labels: Record<Interaction['type'], string> = {
  ligacao: 'Ligação', email: 'E-mail', reuniao: 'Reunião', mensagem: 'Mensagem', outro: 'Outro',
}

function nowLocal() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function ClientInteractions({ clientId }: { clientId: number }) {
  const [items, setItems] = useState<Interaction[]>([])
  const [type, setType] = useState<Interaction['type']>('ligacao')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState(nowLocal)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  async function add() {
    if (!description.trim() || !occurredAt) return
    setSaving(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/interactions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, description: description.trim(), occurredAt }),
      })
      if (!response.ok) {
        const text = await response.text()
        let message = `Não foi possível registrar a interação (HTTP ${response.status}).`
        try { message = JSON.parse(text).error || message } catch { /* Empty error response. */ }
        throw new Error(message)
      }
      setDescription('')
      setOccurredAt(nowLocal())
      await load()
    } catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }

  return <section className="client-interactions" aria-label="Histórico de interações">
    <div className="client-interactions-heading"><strong>Histórico de interações</strong><span>{items.length} {items.length === 1 ? 'registro' : 'registros'}</span></div>
    <div className="client-interaction-fields"><label className="field"><span>Tipo</span><select value={type} onChange={event => setType(event.target.value as Interaction['type'])}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Data e hora</span><input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} /></label></div>
    <label className="field"><span>Descrição da interação</span><textarea rows={2} maxLength={200} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Conversamos sobre a proposta e combinamos retorno." /></label>
    <button type="button" className="secondary-button client-interaction-add" disabled={saving || !description.trim() || !occurredAt} onClick={() => void add()}><Plus size={15} />{saving ? 'Registrando...' : 'Registrar interação'}</button>
    {error && <p className="client-interaction-error" role="alert">{error}</p>}
    {loading ? <p className="client-interaction-empty">Carregando histórico...</p> : items.length ? <div className="client-interaction-list">{items.map(item => <div className="client-interaction-item" key={item.id}><div><strong>{labels[item.type]}</strong><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time></div><p>{item.description}</p></div>)}</div> : <p className="client-interaction-empty">Nenhuma interação registrada para este cliente.</p>}
  </section>
}
