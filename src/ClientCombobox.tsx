import { useId, useState } from 'react'

export type ClientOption = { id: number; name: string; company: string; email: string }

type Props = {
  clients: ClientOption[]
  value: string
  onChange: (clientId: string) => void
  label?: string
  required?: boolean
  placeholder?: string
}

const displayName = (client?: ClientOption) => client ? `${client.name}${client.company ? ` · ${client.company}` : ''}` : ''
const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[·\s]+/g, ' ').trim()

export default function ClientCombobox({ clients, value, onChange, label = 'Cliente', required = false, placeholder = 'Buscar cliente...' }: Props) {
  const inputId = useId()
  const optionsId = `${inputId}-options`
  const [query, setQuery] = useState(() => displayName(clients.find(client => String(client.id) === value)))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = clients.filter(client => normalizeSearch(`${client.name} ${client.company} ${client.email}`).includes(normalizeSearch(query))).slice(0, 8)

  function choose(client: ClientOption) {
    setQuery(displayName(client))
    onChange(String(client.id))
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length) setActiveIndex(index => !open ? 0 : event.key === 'ArrowDown' ? Math.min(index + 1, matches.length - 1) : Math.max(index - 1, 0))
      setOpen(true)
    }
    if (event.key === 'Enter' && open && matches.length) {
      event.preventDefault()
      choose(matches[Math.min(activeIndex, matches.length - 1)])
    }
  }

  return <div className="field client-combobox"><label htmlFor={inputId}>{label}{required ? ' *' : ''}</label><input id={inputId} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={optionsId} aria-activedescendant={open && matches.length ? `${inputId}-client-${matches[Math.min(activeIndex, matches.length - 1)].id}` : undefined} autoComplete="off" required={required} value={query} placeholder={placeholder} onFocus={() => { setOpen(true); setActiveIndex(0) }} onBlur={() => { setOpen(false); if (!value) setQuery('') }} onChange={event => { setQuery(event.target.value); onChange(''); setActiveIndex(0); setOpen(true) }} onKeyDown={handleKeyDown} />
    {open && <div id={optionsId} className="client-combobox-options" role="listbox">{matches.length ? matches.map((client, index) => <button id={`${inputId}-client-${client.id}`} key={client.id} type="button" role="option" aria-selected={String(client.id) === value} className={index === activeIndex ? 'active' : ''} onPointerDown={event => { event.preventDefault(); choose(client) }} onClick={() => choose(client)}><strong>{client.name}</strong><small>{[client.company, client.email].filter(Boolean).join(' · ') || 'Sem empresa'}</small></button>) : <div className="client-combobox-no-results">{clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}</div>}</div>}
  </div>
}
