import { useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

type Appointment = {
  id: number
  clientId: number
  clientName: string
  type: 'ligacao' | 'email' | 'reuniao' | 'mensagem' | 'outro'
  description: string
  scheduledAt: string
  completed: number
}
type Proposal = {
  id: number
  clientId: number
  clientName: string
  title: string
  deliveryDate: string
  status: 'rascunho' | 'enviada' | 'aceita' | 'recusada'
}
type CalendarEvent = {
  key: string
  kind: 'interaction' | 'proposal'
  id: number
  clientId: number
  clientName: string
  title: string
  description: string
  scheduledAt: string
  status: string
  completed: boolean
}

const typeLabels: Record<Appointment['type'], string> = {
  ligacao: 'Ligação', email: 'E-mail', reuniao: 'Reunião', mensagem: 'Mensagem', outro: 'Outro',
}
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const parseDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`)
const mondayOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7)

export default function Agenda({ appointments, proposals, onOpenClient, onOpenProposal, onGoClients }: {
  appointments: Appointment[]
  proposals: Proposal[]
  onOpenClient: (clientId: number) => void
  onOpenProposal: (proposalId: number) => void
  onGoClients: () => void
}) {
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()))
  const selected = parseDate(selectedDate)
  const today = localDate(new Date())
  const events = useMemo<CalendarEvent[]>(() => [
    ...appointments.filter(item => item.scheduledAt).map(item => ({
      key: `interaction-${item.id}`, kind: 'interaction' as const, id: item.id,
      clientId: item.clientId, clientName: item.clientName,
      title: typeLabels[item.type], description: item.description,
      scheduledAt: item.scheduledAt, status: item.completed ? 'Concluído' : 'Agendado', completed: !!item.completed,
    })),
    ...proposals.filter(item => item.deliveryDate).map(item => ({
      key: `proposal-${item.id}`, kind: 'proposal' as const, id: item.id,
      clientId: item.clientId, clientName: item.clientName,
      title: 'Previsão de entrega', description: item.title,
      scheduledAt: `${item.deliveryDate}T00:00`,
      status: item.status === 'recusada' ? 'Recusada' : 'Prevista',
      completed: item.status === 'recusada',
    })),
  ], [appointments, proposals])
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const appointment of events) {
      const day = appointment.scheduledAt.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(appointment)
    }
    for (const items of map.values()) items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.key.localeCompare(b.key))
    return map
  }, [events])
  const first = mode === 'week' ? mondayOf(selected) : mondayOf(new Date(selected.getFullYear(), selected.getMonth(), 1))
  const numberOfDays = mode === 'week' ? 7 : Math.ceil(((new Date(selected.getFullYear(), selected.getMonth(), 1).getDay() + 6) % 7 + new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate()) / 7) * 7
  const days = Array.from({ length: numberOfDays }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index))
  const viewEvents = days.filter(day => mode === 'week' || day.getMonth() === selected.getMonth()).flatMap(day => byDay.get(localDate(day)) || [])
  const selectedEvents = byDay.get(selectedDate) || []
  const rangeLabel = mode === 'month'
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(selected)
    : `${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(days[0])} – ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(days[6])}`

  function move(direction: number) {
    const next = mode === 'month'
      ? new Date(selected.getFullYear(), selected.getMonth() + direction, 1)
      : new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + direction * 7)
    setSelectedDate(localDate(next))
  }
  function openEvent(event: CalendarEvent) {
    if (event.kind === 'interaction') onOpenClient(event.clientId)
    else onOpenProposal(event.id)
  }

  return <div className="agenda-layout">
    <div className="agenda-toolbar">
      <div className="agenda-period"><CalendarDays size={19} /><strong>{rangeLabel}</strong><span>{viewEvents.length} {viewEvents.length === 1 ? 'compromisso' : 'compromissos'}</span></div>
      <div className="agenda-controls"><button type="button" className="agenda-today" onClick={() => setSelectedDate(today)}>Hoje</button><button type="button" className="agenda-nav" onClick={() => move(-1)} aria-label={mode === 'month' ? 'Mês anterior' : 'Semana anterior'}><ChevronLeft size={18} /></button><button type="button" className="agenda-nav" onClick={() => move(1)} aria-label={mode === 'month' ? 'Próximo mês' : 'Próxima semana'}><ChevronRight size={18} /></button><input type="date" className="agenda-date-input" aria-label="Ir para data" value={selectedDate} onChange={event => event.target.value && setSelectedDate(event.target.value)} /><div className="agenda-mode" role="group" aria-label="Visualização da agenda"><button type="button" className={mode === 'month' ? 'active' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Mês</button><button type="button" className={mode === 'week' ? 'active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Semana</button></div></div>
    </div>
    <div className="agenda-calendar-scroll"><div className={`agenda-calendar ${mode === 'week' ? 'week-view' : ''}`}>
      {weekdays.map(day => <div className="agenda-weekday" key={day}>{day}</div>)}
      {days.map(day => {
        const iso = localDate(day)
        const events = byDay.get(iso) || []
        const outside = mode === 'month' && day.getMonth() !== selected.getMonth()
        return <div className={`agenda-day ${outside ? 'outside' : ''} ${iso === selectedDate ? 'selected' : ''} ${iso === today ? 'today' : ''}`} key={iso}>
          <button type="button" className="agenda-day-number" aria-label={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(day)} aria-pressed={iso === selectedDate} onClick={() => setSelectedDate(iso)}>{day.getDate()}</button>
          <div className="agenda-day-events">{events.slice(0, mode === 'week' ? 6 : 3).map(event => <button type="button" className={`agenda-event ${event.kind === 'proposal' ? 'opportunity' : ''} ${event.completed ? 'completed' : ''}`} key={event.key} onClick={() => { setSelectedDate(iso); openEvent(event) }} title={`${event.kind === 'proposal' ? 'Previsão de entrega' : event.scheduledAt.slice(11, 16)} · ${event.clientName} · ${event.description}`}><time>{event.kind === 'proposal' ? 'Entrega' : event.scheduledAt.slice(11, 16)}</time><span>{event.clientName}</span></button>)}{events.length > (mode === 'week' ? 6 : 3) && <button type="button" className="agenda-more" onClick={() => setSelectedDate(iso)}>+{events.length - (mode === 'week' ? 6 : 3)} mais</button>}</div>
        </div>
      })}
    </div></div>
    <section className="agenda-day-panel" aria-label="Compromissos do dia selecionado"><div className="agenda-day-panel-heading"><div><span>AGENDA DO DIA</span><h2>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(selected)}</h2></div><strong>{selectedEvents.length}</strong></div>
      {selectedEvents.length ? <div className="agenda-day-list">{selectedEvents.map(event => <button type="button" className="agenda-detail" key={event.key} onClick={() => openEvent(event)}><time>{event.kind === 'proposal' ? 'Dia inteiro' : event.scheduledAt.slice(11, 16)}</time><span className="agenda-detail-main"><strong>{event.title} · {event.clientName}</strong><small>{event.description}</small></span><span className={`agenda-status ${event.kind === 'proposal' ? 'opportunity' : ''} ${event.completed ? 'completed' : ''} ${event.status === 'Recusada' ? 'lost' : ''}`}>{event.status}</span><ArrowRight size={16} /></button>)}</div> : <div className="agenda-day-empty"><CalendarDays size={23} /><span>Nenhum compromisso neste dia.</span></div>}
    </section>
    {!events.length && <div className="agenda-empty-note">Os compromissos aparecem ao programar uma interação ou informar a previsão de entrega de uma proposta. <button type="button" onClick={onGoClients}>Ver clientes <ArrowRight size={14} /></button></div>}
  </div>
}
