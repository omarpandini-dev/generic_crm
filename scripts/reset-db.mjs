import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.argv.length !== 3 || process.argv[2] !== '--yes') {
  console.error('Este comando apaga todos os dados do CRM. Para confirmar, execute: npm run db:reset -- --yes')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.resolve(process.env.CRM_DB_PATH || path.join(root, 'data', 'crm.sqlite'))
if (!existsSync(dbPath)) {
  console.error(`Banco não encontrado: ${dbPath}`)
  process.exit(1)
}

const tables = [
  'proposal_items',
  'client_interactions',
  'activities',
  'proposals',
  'opportunities',
  'products',
  'clients',
]

const db = new DatabaseSync(dbPath)
try {
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON')
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name))
  const missing = tables.filter(table => !existing.has(table))
  if (missing.length) throw new Error(`Tabelas do CRM não encontradas: ${missing.join(', ')}`)

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const table of tables) db.exec(`DELETE FROM ${table}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  console.log(`Dados do CRM apagados de ${dbPath}. Estrutura e migrações preservadas.`)
} finally {
  db.close()
}
