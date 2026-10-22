import { initialize, one, run, transaction, close } from '../server/db.mjs'

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

try {
  await initialize()
  let added = 0
  await transaction(async () => {
    for (let index = 0; index < names.length; index++) {
      const number = String(index + 1).padStart(3, '0')
      const email = `cliente-demo-${number}@exemplo.test`
      if (await one('SELECT id FROM clients WHERE email = ? LIMIT 1', email)) continue
      const company = `${companyNames[Math.floor(index / sectors.length)]} ${sectors[index % sectors.length]}`
      const phone = `(00) 90000-${String(index + 1).padStart(4, '0')}`
      await run('INSERT INTO clients (name, company, email, phone, notes) VALUES (?, ?, ?, ?, ?)', names[index], company, email, phone, 'Cadastro fictício para demonstração.')
      added++
    }
  })
  console.log(`${added} cliente(s) fictício(s) adicionado(s); ${names.length - added} já existia(m).`)
} finally {
  await close()
}
