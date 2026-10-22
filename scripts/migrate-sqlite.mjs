import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initialize, one, execute, transaction, close } from '../server/db.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.resolve(process.env.CRM_DB_PATH || path.join(root, 'data', 'crm.sqlite'))
if (!existsSync(sourcePath)) throw new Error(`Arquivo SQLite não encontrado: ${sourcePath}`)

const tables = ['clients', 'products', 'opportunities', 'proposals', 'proposal_items', 'activities', 'client_interactions']
const source = new DatabaseSync(sourcePath, { readOnly: true })
try {
  await initialize()
  await transaction(async () => {
    for (const table of tables) {
      if (await one(`SELECT id FROM ${table} LIMIT 1`)) throw new Error(`PostgreSQL já contém dados em ${table}. A importação exige um banco vazio.`)
    }
    for (const table of tables) {
      const sourceTable = source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
      if (!sourceTable) throw new Error(`Tabela ${table} ausente no SQLite.`)
      const targetColumns = (await execute(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, table)).rows.map(row => row.column_name)
      const columns = source.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name).filter(name => targetColumns.includes(name))
      const rows = source.prepare(`SELECT * FROM ${table} ORDER BY id`).all()
      for (const row of rows) {
        await execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`, ...columns.map(name => row[name]))
      }
      await execute(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), EXISTS (SELECT 1 FROM ${table}))`)
      console.log(`${table}: ${rows.length} registro(s)`)
    }
  })
  console.log('Importação concluída. O arquivo SQLite original foi preservado.')
} finally {
  source.close()
  await close()
}
