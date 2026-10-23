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

Para cadastrar os dados de demonstração na VPS, abra **Shell** no serviço **App** do Easypanel e execute, em `/app`:

```sh
npm run seed:clients
npm run seed:products
```

Esses comandos usam a `DATABASE_URL` configurada no App e podem ser repetidos sem duplicar os registros de demonstração. Após alterar o código no GitHub, faça um novo **Deploy** do App antes de executar os comandos no contêiner.

O banco local em `data/crm.sqlite` e o volume do Docker Desktop não são enviados pelo GitHub. A instalação acima começa com um PostgreSQL vazio. Configure backups do serviço Postgres no Easypanel depois de validar o deploy.

Referências: [template Easypanel na Hostinger](https://www.hostinger.com/support/8703798-how-to-use-the-easypanel-vps-template-at-hostinger/), [serviço App](https://easypanel.io/docs/services/app), [serviço Postgres](https://easypanel.io/docs/services/postgres).

## Instalar no Coolify da Hostinger

Este procedimento usa dois recursos no mesmo ambiente e destino do Coolify: um **PostgreSQL** persistente e uma **Application** criada a partir do `Dockerfile` do repositório. O `compose.yaml` é apenas para desenvolvimento local.

1. Na Hostinger, crie uma VPS com o template **Ubuntu 24.04 with Coolify**. Acesse `http://IP_DA_VPS:3000`, crie a conta de administrador e, se a implantação será nessa mesma VPS, selecione **localhost** na configuração inicial. Se já houver Coolify instalado, use a instância existente.
2. Envie o código para uma branch do GitHub acessível pelo Coolify. Alterações que estejam só no computador local não entram no deploy. No painel, crie um projeto e abra o ambiente **Production**.
3. Adicione um recurso **PostgreSQL** no servidor e destino em que a aplicação será executada. Escolha PostgreSQL 17 para manter a mesma versão do banco local, confira as credenciais geradas e clique em **Start**. Em **General**, copie a **Postgres URL (internal)**. Deixe o acesso público ao banco desativado.
4. No mesmo ambiente, adicione uma **Application** a partir do repositório GitHub (URL HTTPS para repositório público; GitHub App ou deploy key para privado). Selecione a branch enviada, **Dockerfile** como método de build, **Base Directory** `/` e **Dockerfile Location** `Dockerfile`.
5. Em **General**, defina **Ports Exposes** como `3001`. Em **Environment Variables**, crie a variável de execução `DATABASE_URL` com a URL interna copiada do PostgreSQL:

   ```env
   DATABASE_URL=postgres://USUARIO:SENHA@HOST_INTERNO:5432/BANCO
   ```

   Cole o valor completo gerado pelo Coolify, incluindo eventuais parâmetros. Não use `127.0.0.1:5433` nem as credenciais `crm/crm` do banco local. O `Dockerfile` já configura `HOST=0.0.0.0` e `PORT=3001`.
6. Crie um registro DNS **A** para o domínio ou subdomínio apontando para o IP da VPS. Em **Domains** da aplicação, adicione esse endereço com protocolo **https** e porta interna `3001`. Verifique também se as portas `80` e `443` estão liberadas para o proxy do Coolify emitir o certificado.
7. Antes de disponibilizar o CRM, habilite **HTTP Basic Authentication** nas configurações da aplicação (**General → Security → Authentication**, no proxy Traefik) e defina usuário e senha. Esta versão não possui contas nem autenticação própria. Salve, clique em **Deploy** e confira os logs. Ao acessar `https://SEU_DOMINIO/api/health` com a autenticação, a resposta deve ser `{"ok":true}`. A API cria as tabelas na primeira inicialização.

Para cadastrar dados de demonstração, abra o **Terminal** do contêiner da aplicação no Coolify e execute:

```sh
cd /app
npm run seed:clients
npm run seed:products
```

Os comandos usam a `DATABASE_URL` da aplicação e podem ser repetidos sem duplicar os registros de demonstração. Após enviar alterações ao GitHub, faça um novo deploy da aplicação. O banco começa vazio: o volume local do Docker Desktop e um eventual arquivo `data/crm.sqlite` não são enviados pelo GitHub. Configure backups agendados do PostgreSQL no Coolify e teste uma restauração.

Referências: [template Coolify na Hostinger](https://support.hostinger.com/en/articles/9615197-how-to-use-the-coolify-vps-template), [deploy com Dockerfile](https://coolify.io/docs/applications/builds/dockerfile), [bancos no Coolify](https://coolify.io/docs/databases/), [domínios e HTTPS](https://coolify.io/docs/core/networking/domains), [autenticação básica](https://coolify.io/docs/core/networking/proxy/traefik/basic-auth).

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
