# GenCrm

CRM local para clientes, produtos, oportunidades, atividades e propostas. O front usa React + Vite; a API usa Node.js 24 e PostgreSQL.

## Iniciar

Requisitos: Node.js 24 ou superior, npm e Docker Desktop.

```bash
docker compose up -d db
npm.cmd install
npm.cmd run dev
```

Abra o endereço informado pelo Vite (normalmente `http://127.0.0.1:5173`). O comando inicia o front e a API juntos.
O Docker publica o PostgreSQL em `127.0.0.1:5433`. Para usar outro banco, defina `DATABASE_URL` antes de iniciar a API, por exemplo `postgres://usuario:senha@servidor:5432/crm`. O esquema é criado automaticamente na inicialização.

## Conectar pelo DBeaver

1. Inicie o banco com `docker compose up -d db` na pasta do projeto.
2. No DBeaver, clique em **Nova conexão** e selecione **PostgreSQL**.
3. Na aba **Principal**, preencha:

   | Campo | Valor |
   | --- | --- |
   | Host | `127.0.0.1` |
   | Porta | `5433` |
   | Banco de dados | `crm` |
   | Usuário | `crm` |
   | Senha | `crm` |

4. Clique em **Testar conexão** (autorize o download do driver PostgreSQL se o DBeaver solicitar) e depois em **Concluir**. As tabelas ficam em **crm → Schemas → public → Tables**.

Esses dados de acesso são os definidos em `compose.yaml` para o banco local. Se você alterar o mapeamento de porta ou as credenciais nesse arquivo, atualize a conexão no DBeaver também.

## Instalar no Easypanel da Hostinger

Este procedimento usa dois serviços no mesmo projeto do Easypanel: um **Postgres** para os dados e um **App** para a API e o front compilado. O `compose.yaml` acima é apenas para desenvolvimento local.

1. Na Hostinger, crie uma VPS com o template **Ubuntu com Easypanel**. Acesse `http://IP_DA_VPS:3000` e conclua a configuração inicial do painel. Se o Easypanel já estiver instalado, entre no painel existente.
2. Envie esta versão do projeto para uma branch no GitHub acessível pela VPS. Alterações que existam somente no computador local não entram no deploy.
3. No Easypanel, crie um projeto. Dentro dele, use **New Service → Postgres** e crie o banco. Em **Credentials**, copie a **Internal Connection URL** gerada pelo Easypanel. Mantenha o Postgres sem exposição pública.
4. No mesmo projeto, use **New Service → App**. Em **Source → GitHub**, informe `omarpandini-dev/generic_crm`, selecione a branch que contém esta migração e deixe **Build Path** como `/`. Em **Build**, selecione **Dockerfile** e use o caminho `Dockerfile`.
5. Em **Environment** do App, configure a URL copiada do serviço Postgres:

   ```env
   DATABASE_URL=postgres://USUARIO:SENHA@HOST_INTERNO:5432/BANCO
   ```

   Use o valor exato mostrado em **Credentials**, inclusive eventuais parâmetros da URL. A porta `5433` do Docker local e as credenciais `crm/crm` não se aplicam ao Easypanel.
6. Em **Domains** do App, configure o domínio ou subdomínio, habilite HTTPS e defina o protocolo interno como HTTP e a **Target Port** como `3001`. O Dockerfile já configura `HOST=0.0.0.0` e `PORT=3001` dentro do contêiner.
7. Em **Security**, configure **HTTP Basic Auth** antes de abrir o domínio para usuários: esta versão do CRM não possui contas nem autenticação própria. Depois clique em **Deploy** e confira os logs. A API cria as tabelas no primeiro início; `https://SEU_DOMINIO/api/health` deve responder `{"ok":true}` após a autenticação.

O banco local em `data/crm.sqlite` e o volume do Docker Desktop não são enviados pelo GitHub. A instalação acima começa com um PostgreSQL vazio. Configure backups do serviço Postgres no Easypanel depois de validar o deploy.

Referências: [template Easypanel na Hostinger](https://www.hostinger.com/support/8703798-how-to-use-the-easypanel-vps-template-at-hostinger/), [serviço App](https://easypanel.io/docs/services/app), [serviço Postgres](https://easypanel.io/docs/services/postgres).

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

- Os dados ficam no volume Docker `crm-postgres`. Para importar uma instalação SQLite existente para um PostgreSQL vazio, defina `CRM_DB_PATH` se o arquivo estiver fora de `data/crm.sqlite` e execute `npm.cmd run migrate:sqlite`. O arquivo original é preservado. A importação exige que as tabelas de negócio no PostgreSQL estejam vazias.
- Clientes com oportunidades ou propostas vinculadas não podem ser excluídos. Produtos excluídos permanecem como descrição e preço nos itens históricos das propostas.
- O sistema é local e não possui autenticação, multiusuário ou sincronização nesta versão.

Para testar as operações da API em uma instância separada, defina `DATABASE_URL` e `PORT` ao iniciar o servidor, depois execute `node scripts/smoke.mjs` com `API_URL` apontando para essa porta.
