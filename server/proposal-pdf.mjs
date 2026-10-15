import { PDFDocument } from 'pdfkit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontFiles = {
  400: ['400Regular', 'Manrope_400Regular.ttf'],
  700: ['700Bold', 'Manrope_700Bold.ttf'],
  800: ['800ExtraBold', 'Manrope_800ExtraBold.ttf'],
}
const fontFile = (weight) => path.join(root, 'node_modules', '@expo-google-fonts', 'manrope', ...fontFiles[weight])
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const LEFT = 48
const RIGHT = PAGE_WIDTH - LEFT
const CONTENT_WIDTH = RIGHT - LEFT
const BOTTOM_LIMIT = 744
const color = {
  ink: '#222641',
  navy: '#272644',
  violet: '#7967D9',
  lilac: '#BDB0F4',
  lavender: '#F3F0FF',
  muted: '#788093',
  pale: '#F8F9FC',
  line: '#E7E9F0',
  white: '#FFFFFF',
  green: '#278760',
  red: '#B85D64',
}
const statusText = { rascunho: 'Rascunho', enviada: 'Enviada', aceita: 'Aceita', recusada: 'Recusada' }
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const displayDate = (value) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'Não informada'
const today = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function text(doc, value, x, y, options = {}) {
  const { font = 'regular', size = 10, fill = color.ink, ...rest } = options
  doc.font(font).fontSize(size).fillColor(fill).text(String(value ?? ''), x, y, rest)
}

function rounded(doc, x, y, width, height, radius, fill) {
  doc.roundedRect(x, y, width, height, radius).fill(fill)
}

function brand(doc, y, light = false) {
  const blocks = [[0, 0], [11, 2], [1, 11], [12, 12]]
  for (const [dx, dy] of blocks) rounded(doc, LEFT + dx, y + dy, 8, 8, 2.5, light ? color.lilac : color.violet)
  text(doc, 'GenCrm', LEFT + 32, y - 4, { font: 'heavy', size: 21, fill: light ? color.white : color.ink })
}

function pageOneHeader(doc, proposal) {
  doc.rect(0, 0, PAGE_WIDTH, 202).fill(color.navy)
  doc.save().fillOpacity(0.09).circle(535, -15, 170).fill(color.lilac).circle(575, 153, 80).fill(color.lilac).restore()
  doc.rect(LEFT, 58, 33, 2).fill(color.lilac)
  brand(doc, 29, true)
  text(doc, `PROPOSTA Nº ${String(proposal.id).padStart(4, '0')}`, 399, 34, { font: 'bold', size: 9, fill: '#D9D1FB', width: 148, align: 'right' })
  text(doc, 'Proposta', LEFT, 77, { font: 'heavy', size: 33, fill: color.white })
  text(doc, 'comercial.', LEFT, 117, { font: 'heavy', size: 33, fill: color.lilac })
  text(doc, proposal.title, LEFT, 173, { font: 'regular', size: 10, fill: '#E3DEF4', width: 460, height: 23, ellipsis: true })
}

function clientCard(doc, proposal, client) {
  const y = 220
  rounded(doc, LEFT, y, CONTENT_WIDTH, 117, 13, color.pale)
  doc.rect(LEFT, y + 15, 3, 87).fill(color.violet)
  text(doc, 'PREPARADA PARA', LEFT + 20, y + 17, { font: 'bold', size: 8, fill: color.violet, characterSpacing: 1.1 })
  text(doc, client.name, LEFT + 20, y + 35, { font: 'heavy', size: 16, width: 270, height: 39, ellipsis: true })
  const detail = [client.company, client.email, client.phone].filter(Boolean).join('  ·  ')
  if (detail) text(doc, detail, LEFT + 20, y + 83, { size: 8.5, fill: color.muted, width: 275, height: 18, ellipsis: true })
  doc.moveTo(355, y + 19).lineTo(355, y + 98).strokeColor(color.line).lineWidth(1).stroke()
  text(doc, 'EMISSÃO', 376, y + 21, { font: 'bold', size: 8, fill: color.muted, characterSpacing: 1 })
  text(doc, today(), 376, y + 37, { font: 'bold', size: 10 })
  text(doc, 'VÁLIDA ATÉ', 376, y + 64, { font: 'bold', size: 8, fill: color.muted, characterSpacing: 1 })
  text(doc, displayDate(proposal.validUntil), 376, y + 80, { font: 'bold', size: 10 })
  const statusColor = proposal.status === 'aceita' ? color.green : proposal.status === 'recusada' ? color.red : color.violet
  rounded(doc, 457, y - 12, 83, 23, 6, color.white)
  text(doc, statusText[proposal.status] || 'Proposta', 462, y - 5, { font: 'bold', size: 8, fill: statusColor, width: 72, align: 'center' })
}

function sectionHeading(doc, number, title, y) {
  rounded(doc, LEFT, y, 30, 25, 7, color.lavender)
  text(doc, number, LEFT + 3, y + 6, { font: 'heavy', size: 9, fill: color.violet, width: 24, align: 'center' })
  text(doc, title, LEFT + 41, y + 4, { font: 'heavy', size: 14 })
}

function tableHeader(doc, y) {
  rounded(doc, LEFT, y, CONTENT_WIDTH, 33, 6, color.lavender)
  const style = { font: 'bold', size: 8, fill: '#786CA6', characterSpacing: 0.6 }
  text(doc, 'ITEM', 61, y + 11, style)
  text(doc, 'DESCRIÇÃO', 101, y + 11, style)
  text(doc, 'QTD.', 338, y + 11, { ...style, width: 28, align: 'right' })
  text(doc, 'UNITÁRIO', 378, y + 11, { ...style, width: 77, align: 'right' })
  text(doc, 'TOTAL', 471, y + 11, { ...style, width: 67, align: 'right' })
  return y + 33
}

function newPage(doc, proposal, withTable = false) {
  doc.addPage()
  doc.rect(0, 0, PAGE_WIDTH, 79).fill(color.navy)
  brand(doc, 24, true)
  text(doc, `PROPOSTA Nº ${String(proposal.id).padStart(4, '0')}`, 397, 32, { font: 'bold', size: 9, fill: '#D9D1FB', width: 150, align: 'right' })
  if (withTable) {
    sectionHeading(doc, '01', 'Itens e investimento', 106)
    return tableHeader(doc, 145)
  }
  return 116
}

function drawItem(doc, item, index, y) {
  doc.font('regular').fontSize(9.5)
  const descriptionHeight = doc.heightOfString(item.description, { width: 219, lineGap: 2 })
  const height = Math.max(47, descriptionHeight + 18)
  if (index % 2 === 1) doc.rect(LEFT, y, CONTENT_WIDTH, height).fill('#FCFCFE')
  doc.moveTo(LEFT, y + height).lineTo(RIGHT, y + height).strokeColor(color.line).lineWidth(0.7).stroke()
  text(doc, String(index + 1).padStart(2, '0'), 61, y + 17, { font: 'bold', size: 9, fill: color.violet })
  text(doc, item.description, 101, y + 11, { size: 9.5, width: 219, lineGap: 2 })
  text(doc, item.quantity, 338, y + 16, { font: 'bold', size: 9, width: 28, align: 'right' })
  text(doc, money(item.unitPriceCents), 378, y + 16, { size: 9, fill: color.muted, width: 77, align: 'right' })
  text(doc, money(item.quantity * item.unitPriceCents), 466, y + 16, { font: 'bold', size: 9, width: 72, align: 'right' })
  return y + height
}

function totals(doc, proposal, y) {
  sectionHeading(doc, '02', 'Resumo da proposta', y)
  const top = y + 39
  let remainingNotes = []
  if (proposal.notes?.trim()) {
    text(doc, 'CONDIÇÕES E OBSERVAÇÕES', LEFT, top + 5, { font: 'bold', size: 8, fill: color.violet, characterSpacing: 0.7 })
    const lines = wrapLines(doc, proposal.notes, 253, 8.5)
    for (const [index, line] of lines.slice(0, 5).entries()) {
      text(doc, line, LEFT, top + 23 + index * 14, { size: 8.5, fill: color.muted, width: 253 })
    }
    remainingNotes = lines.slice(5)
    if (remainingNotes.length) text(doc, 'Continua na página seguinte', LEFT, top + 98, { font: 'bold', size: 8, fill: color.violet })
  } else {
    text(doc, 'Investimento total', LEFT, top + 12, { font: 'heavy', size: 14 })
    text(doc, 'Valores em reais (BRL)', LEFT, top + 34, { size: 9, fill: color.muted })
  }
  rounded(doc, 327, top, 220, 111, 12, color.navy)
  text(doc, 'SUBTOTAL', 345, top + 17, { font: 'bold', size: 8, fill: '#BBB5D5' })
  text(doc, money(proposal.subtotalCents), 418, top + 15, { font: 'bold', size: 10, fill: color.white, width: 111, align: 'right' })
  text(doc, `DESCONTO (${proposal.discountPercent}%)`, 345, top + 42, { font: 'bold', size: 8, fill: '#BBB5D5' })
  text(doc, `- ${money(proposal.subtotalCents - proposal.totalCents)}`, 435, top + 40, { font: 'bold', size: 10, fill: color.white, width: 94, align: 'right' })
  doc.moveTo(345, top + 64).lineTo(529, top + 64).strokeColor('#68637E').lineWidth(0.7).stroke()
  text(doc, 'TOTAL', 345, top + 77, { font: 'bold', size: 8, fill: color.lilac })
  text(doc, money(proposal.totalCents), 391, top + 72, { font: 'heavy', size: 18, fill: color.white, width: 138, align: 'right' })
  return { y: top + 111, remainingNotes }
}

function wrapLines(doc, content, width, size = 9.5) {
  doc.font('regular').fontSize(size)
  const lines = []
  for (const paragraph of String(content).split(/\r?\n/)) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let current = ''
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word
      if (doc.widthOfString(candidate) <= width) { current = candidate; continue }
      if (current) { lines.push(current); current = '' }
      for (const character of word) {
        if (doc.widthOfString(current + character) > width && current) { lines.push(current); current = '' }
        current += character
      }
    }
    lines.push(current)
  }
  return lines
}

function notes(doc, proposal, y, lines) {
  if (!lines.length) return
  if (y + 80 > BOTTOM_LIMIT) y = newPage(doc, proposal) + 17
  sectionHeading(doc, '03', 'Observações (continuação)', y + 23)
  y += 66
  for (const line of lines) {
    if (y + 16 > BOTTOM_LIMIT) {
      y = newPage(doc, proposal) + 22
      sectionHeading(doc, '03', 'Observações (continuação)', y)
      y += 42
    }
    text(doc, line, LEFT + 3, y, { size: 9.5, fill: color.muted, width: CONTENT_WIDTH - 6 })
    y += 15
  }
}

function addFooters(doc, proposal) {
  const pages = doc.bufferedPageRange()
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i)
    doc.moveTo(LEFT, 778).lineTo(RIGHT, 778).strokeColor(color.line).lineWidth(0.8).stroke()
    text(doc, 'GENCRM  /  PROPOSTA COMERCIAL', LEFT, 791, { font: 'bold', size: 7.5, fill: color.muted, characterSpacing: 0.65 })
    text(doc, `Nº ${String(proposal.id).padStart(4, '0')}    ·    ${i + 1} / ${pages.count}`, 430, 791, { font: 'bold', size: 7.5, fill: color.muted, width: 117, align: 'right' })
  }
}

export function renderProposalPdf(proposal, client) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Proposta ${proposal.id} - ${proposal.title}`, Author: 'GenCrm', Subject: 'Proposta comercial' } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      doc.registerFont('regular', fontFile(400))
      doc.registerFont('bold', fontFile(700))
      doc.registerFont('heavy', fontFile(800))
      pageOneHeader(doc, proposal)
      clientCard(doc, proposal, client)
      sectionHeading(doc, '01', 'Itens e investimento', 363)
      let y = tableHeader(doc, 403)
      for (let i = 0; i < proposal.items.length; i++) {
        doc.font('regular').fontSize(9.5)
        const height = Math.max(47, doc.heightOfString(proposal.items[i].description, { width: 219, lineGap: 2 }) + 18)
        if (y + height > BOTTOM_LIMIT) y = newPage(doc, proposal, true)
        y = drawItem(doc, proposal.items[i], i, y)
      }
      y += 15
      if (y + 150 > BOTTOM_LIMIT) y = newPage(doc, proposal) + 14
      const summary = totals(doc, proposal, y)
      notes(doc, proposal, summary.y, summary.remainingNotes)
      addFooters(doc, proposal)
      doc.end()
    } catch (error) {
      doc.destroy(error)
      reject(error)
    }
  })
}
