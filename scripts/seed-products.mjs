import { initialize, one, run, transaction, close } from '../server/db.mjs'

const products = [
  ['DEMO-001', 'Notebook corporativo', 'Notebook para trabalho, com 16 GB de memória e SSD de 512 GB.', 389900],
  ['DEMO-002', 'Monitor 24 polegadas', 'Monitor Full HD com conexões HDMI e DisplayPort.', 89900],
  ['DEMO-003', 'Teclado sem fio', 'Teclado compacto com conexão Bluetooth.', 18900],
  ['DEMO-004', 'Mouse ergonômico', 'Mouse sem fio com ajuste de sensibilidade.', 14900],
  ['DEMO-005', 'Headset profissional', 'Fone com microfone e redução de ruído para reuniões.', 32900],
  ['DEMO-006', 'Webcam Full HD', 'Câmera USB com resolução de 1080p.', 27900],
  ['DEMO-007', 'Cadeira de escritório', 'Cadeira ergonômica com ajuste de altura e apoio lombar.', 119900],
  ['DEMO-008', 'Mesa de trabalho', 'Mesa para escritório com tampo de 120 cm.', 74900],
  ['DEMO-009', 'Instalação e configuração', 'Serviço de instalação e configuração inicial de equipamentos.', 35000],
  ['DEMO-010', 'Suporte técnico mensal', 'Pacote mensal de suporte remoto para até cinco usuários.', 49000],
]

try {
  await initialize()
  let added = 0
  await transaction(async () => {
    for (const product of products) {
      if (await one('SELECT id FROM products WHERE sku = ? LIMIT 1', product[0])) continue
      await run('INSERT INTO products (sku, name, description, price_cents, active) VALUES (?, ?, ?, ?, 1)', ...product)
      added++
    }
  })
  console.log(`${added} produto(s) fictício(s) adicionado(s); ${products.length - added} já existia(m).`)
} finally {
  await close()
}
