import pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFile } from 'node:fs/promises'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://crm:crm@127.0.0.1:5433/crm' })
const context = new AsyncLocalStorage()

function sqlParams(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`).replace(/\bAS\s+([a-z]+[A-Z][A-Za-z]*)\b/g, 'AS "$1"')
}

export async function execute(sql, ...values) {
  const client = context.getStore() || pool
  return client.query(sqlParams(sql), values)
}
export async function query(sql, ...values) { return (await execute(sql, ...values)).rows }
export async function one(sql, ...values) { return (await execute(sql, ...values)).rows[0] }
export async function run(sql, ...values) {
  const isInsert = /^\s*INSERT\s+INTO\s+(?!schema_migrations\b)/i.test(sql)
  const result = await execute(isInsert && !/\bRETURNING\b/i.test(sql) ? `${sql} RETURNING id` : sql, ...values)
  return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id }
}
export async function transaction(work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await context.run(client, work)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
export async function initialize() {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
}
export async function close() { await pool.end() }
