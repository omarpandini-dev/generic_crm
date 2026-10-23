# GenCrm

CRM local para clientes, produtos, oportunidades, atividades e propostas. O front usa React + Vite; a API usa o servidor HTTP e o SQLite nativos do Node.js 24. Os dados ficam em `data/crm.sqlite`.

## Iniciar

Requisitos: Node.js 24 ou superior e npm.

```bash
npm.cmd install
npm.cmd run dev
```

Abra o endereço informado pelo Vite (normalmente `http://127.0.0.1:5173`). O comando inicia o front e a API juntos.

Para adicionar 10 produtos fictícios ao catálogo, execute `npm.cmd run seed:products`. A carga pode ser repetida sem duplicar os produtos de demonstração.

Em **Produtos**, marque vários produtos ativos e clique em **Criar proposta**. O assistente permite ajustar itens, quantidades e preços, escolher cliente e oportunidade, definir a previsão de entrega, pagamento e desconto, revisar o total e salvar ou salvar com download do PDF. A validade é calculada automaticamente para 10 dias após a criação. Se nenhuma oportunidade for escolhida, uma nova é criada no funil.

Para adicionar 50 clientes fictícios, execute `npm.cmd run seed:clients`. A carga usa e-mails `@exemplo.test` e também pode ser repetida sem duplicar os clientes de demonstração.

Depois de salvar uma proposta, use **Visualizar** para abrir o PDF na própria tela ou **Baixar PDF** para salvá-lo. A edição também oferece a visualização e o download do PDF salvo. O documento A4 inclui cliente, validade, itens, desconto, total e observações, com paginação automática.
Veja um [PDF de exemplo](examples/proposta-exemplo.pdf) com dados fictícios.

Ao salvar uma proposta, a oportunidade vinculada avança para **Proposta** e assume o valor total da proposta. Se nenhuma oportunidade for escolhida, o CRM cria uma no funil. O cartão do funil mostra o título da proposta vinculada. Oportunidades já marcadas como **Ganho** ou **Perdido** não mudam de etapa automaticamente.

Em **Atividades**, crie tarefas com data de vencimento e, se quiser, vincule um cliente. A previsão de entrega das propostas aparece entre os prazos pendentes; ao clicar nela, o CRM abre a proposta. Essa data também alimenta o resumo do mês no funil e a agenda. Os filtros mostram pendentes, próximos 7 dias, atrasados e tarefas concluídas. A **Visão geral** destaca tarefas e entregas atrasadas ou próximas do vencimento.

## Versão compilada

```bash
npm run build
npm start
```

Abra `http://127.0.0.1:3001`. O servidor escuta apenas na máquina local.

## Dados

- O arquivo `data/crm.sqlite` é criado automaticamente. Com o servidor parado, basta copiá-lo para fazer um backup ou mover os dados para outra instalação.
- Para zerar todos os registros do CRM (clientes, produtos, oportunidades, propostas, atividades e interações), pare o servidor, faça uma cópia de segurança do arquivo SQLite e execute `npm.cmd run db:reset -- --yes` no Windows ou `npm run db:reset -- --yes` no Linux/macOS. A opção `--yes` confirma a exclusão permanente dos dados. O comando mantém as tabelas e o histórico de migrações. Se usar outro arquivo, defina `CRM_DB_PATH` antes de executá-lo.
- Clientes com oportunidades ou propostas vinculadas não podem ser excluídos. Produtos excluídos permanecem como descrição e preço nos itens históricos das propostas.
- O sistema é local e não possui autenticação, multiusuário ou sincronização nesta versão.

Para testar as operações da API em uma instância separada, defina `CRM_DB_PATH` e `PORT` ao iniciar o servidor, depois execute `node scripts/smoke.mjs` com `API_URL` apontando para essa porta.
