import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.resolve(process.env.CRM_DB_PATH || path.join(root, 'data', 'crm.sqlite'))

if (!existsSync(dbPath)) {
  console.error('Banco não encontrado. Inicie o CRM uma vez com npm run dev e repita a carga.')
  process.exit(1)
}

const names = [
  'Ana Martins', 'Bruno Almeida', 'Carla Ribeiro', 'Diego Costa', 'Elisa Ferreira',
  'Felipe Souza', 'Gabriela Rocha', 'Henrique Lima', 'Isabela Mendes', 'João Barbosa',
  'Karina Nogueira', 'Lucas Teixeira', 'Mariana Oliveira', 'Nicolas Pereira', 'Olívia Castro',
  'Paulo Azevedo', 'Rafael Fernandes', 'Sofia Cardoso', 'Thiago Moreira', 'Vanessa Moura',
  'William Duarte', 'Yasmin Freitas', 'José Cunha', 'Alice Gomes', 'Beatriz Araújo',
  'Caio Farias', 'Daniela Silva', 'Eduardo Reis', 'Fernanda Correia', 'Gustavo Lopes',
  'Helena Batista', 'Igor Carvalho', 'Juliana Neves', 'Leonardo Monteiro', 'Marta Dias',
  'Natália Vieira', 'Otávio Campos', 'Patrícia Melo', 'Renato Tavares', 'Samira Andrade',
  'Tatiana Leal', 'Valéria Rios', 'Wesley Antunes', 'Yara Macedo', 'André Bastos',
  'Bárbara Coelho', 'César Queiroz', 'Débora Fonseca', 'Enzo Motta', 'Lívia Pacheco',
]
const companyNames = [
  'Aurora', 'Horizonte', 'Prisma', 'Nexo', 'Vereda',
  'Solaris', 'Atlântico', 'Ponto Norte', 'Vila Nova', 'Porto Azul',
]
const sectors = ['Tecnologia', 'Comércio', 'Serviços', 'Logística', 'Consultoria']

if (names.length !== 50 || companyNames.length * sectors.length !== 50) {
  throw new Error('A carga deve conter exatamente 50 clientes.')
}

const db = new DatabaseSync(dbPath)
try {
  db.exec('PRAGMA busy_timeout = 5000')
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'clients'").get()
  if (!table) throw new Error('Tabela de clientes não encontrada. Inicie o CRM uma vez com npm run dev.')

  const existing = db.prepare('SELECT id FROM clients WHERE email = ? LIMIT 1')
  const insert = db.prepare('INSERT INTO clients (name, company, email, phone, notes) VALUES (?, ?, ?, ?, ?)')
  let added = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (let index = 0; index < names.length; index++) {
      const number = String(index + 1).padStart(3, '0')
      const email = `cliente-demo-${number}@exemplo.test`
      if (existing.get(email)) continue
      const company = `${companyNames[Math.floor(index / sectors.length)]} ${sectors[index % sectors.length]}`
      const phone = `(00) 90000-${String(index + 1).padStart(4, '0')}`
      insert.run(names[index], company, email, phone, 'Cadastro fictício para demonstração.')
      added++
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  console.log(`${added} cliente(s) fictício(s) adicionado(s); ${names.length - added} já existia(m).`)
} finally {
  db.close()
}
