# DRAGON APEX TALENT

Plataforma de recrutamento, seleção, banco de talentos e capacitação.
React + TypeScript + Vite + Tailwind no frontend; Supabase (PostgreSQL, Auth, Storage, RLS) no backend.
Pagamentos **somente via PIX** (PagBank).

---

## 1. Rodar localmente

```bash
npm install
cp .env.example .env.local     # preencha com a URL e a anon key do Supabase
npm run dev                    # http://localhost:5180
```

Sem o `.env.local`, o site institucional funciona normalmente. Login, cadastros e painéis aparecem marcados como
**“pendente de integração externa”**: nada é simulado.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | checagem de tipos + build de produção em `dist/` |
| `npm test` | testes unitários (gerador PIX e índice de compatibilidade) |
| `npm run test:db` | roda as 10 migrações num PostgreSQL embutido e valida 64 regras de negócio e segurança |

## 2. Configurar o Supabase

1. Crie um projeto em https://supabase.com e copie **Project URL** e **anon public key** para o `.env.local`.
2. No **SQL Editor**, execute em ordem os arquivos de `supabase/migrations/`:
   `0001_schema.sql` → `0002_functions.sql` → `0003_rls_storage.sql` → `0004_cron.sql` → `0005_webhook.sql` → `0006_hardening.sql` → `0007_password_audit.sql` → `0008_admin_set_password.sql` → `0009_admin_create_user.sql` → `0010_signup_attempts.sql`
   (ou `supabase link` + `supabase db push`).
3. **Authentication → URL Configuration**: defina o *Site URL* (domínio de produção) e adicione
   `http://localhost:5180/**` em *Redirect URLs*. Mantenha **Confirm email** ativado.
4. **Primeiro administrador**: cadastre-se pelo site como profissional e depois rode no SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'seu-email@dominio.com';
   ```
   O site nunca aceita o papel `admin` vindo do cadastro.
5. **Pausa automática de vagas**: a migração 0004 agenda `pause_expired_jobs()` de hora em hora com `pg_cron`.
   Se a extensão não estiver disponível, ative-a em *Database → Extensions* e rode a 0004 de novo.

## 3. PIX (PagBank)

- O payload base (“Pix Copia e Cola” da conta PagBank) já está em `settings.pix_base_payload` e pode ser trocado em
  **Admin → Configurações**. O sistema valida o CRC antes de salvar.
- Em cada cobrança, `src/lib/pix.ts` injeta o **valor exato** (campo 54) e a **referência da transação** (campo 62.05,
  `txid` de 25 caracteres) e recalcula o CRC16. O QR Code e o código Copia e Cola são gerados no navegador.
- Os valores **nunca** vêm do navegador: `create_charge()` lê a tabela `settings` (ativação R$ 0,15; diária R$ 1,00)
  ou o preço do curso.
- **Confirmação manual (já funciona):** Admin → Pagamentos PIX. Confira valor e referência no extrato PagBank e clique em
  *Confirmar*. A liberação (perfil ativo, créditos na carteira ou curso) acontece na mesma transação do banco.
- **Confirmação automática (pendente de credenciais):** `supabase/functions/pagbank-webhook` está pronta para receber a
  notificação, mas o formato exato depende do produto PagBank contratado (API de Pedidos/Cobranças com webhook).
  Para ativar:
  ```bash
  supabase functions deploy pagbank-webhook --no-verify-jwt
  supabase secrets set PAGBANK_WEBHOOK_TOKEN=um-token-longo-e-aleatorio
  ```
  Configure no PagBank a URL `https://SEU-PROJETO.supabase.co/functions/v1/pagbank-webhook?token=...` e ajuste
  `extract()` no arquivo conforme a documentação da sua conta. Um QR estático comum não gera webhook com a referência;
  para confirmação automática é preciso emitir as cobranças pela API do PagBank.

## 4. Publicação

- **Netlify:** build `npm run build`, pasta `dist`. O arquivo `public/_redirects` já trata as rotas do React.
- **Vercel:** `vercel.json` incluído.
- Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do provedor.
  **Nunca** coloque a `service_role` key no frontend.

## 5. Arquitetura

```
src/
  auth/            sessão, papel do usuário e proteção de rotas
  components/      cabeçalho, rodapé, PIX, Kanban, UI
  lib/             cliente Supabase, gerador PIX, matching, formatação, tipos
  pages/public/    início, sobre, profissionais, empresas, vagas, cursos, contato, FAQ, privacidade, termos
  pages/auth/      login (profissional/empresa), cadastros, recuperação de senha
  pages/pro/       painel do profissional (perfil em 6 etapas, currículo, ativação, candidaturas)
  pages/company/   painel da empresa (vagas, questionário de 13 pontos, Kanban, carteira)
  pages/student/   área do aluno e player de aulas
  pages/admin/     KPIs, PIX, vagas, banco de talentos, empresas, cursos, LGPD, configurações
supabase/
  migrations/      esquema, funções de negócio, RLS + storage, cron, webhook
  functions/       Edge Function do webhook PagBank
  tests/           teste das regras de negócio (PGlite)
```

### Segurança (aplicada no banco, não só na tela)

- RLS em todas as tabelas. Empresas veem apenas as próprias vagas e os candidatos **que se candidataram a elas**.
- Gatilhos impedem que usuários alterem o próprio papel, a ativação, o saldo, a verificação, o status de vagas ou a etapa
  das candidaturas. Essas mudanças só passam por funções (`publish_job`, `move_application`, `admin_confirm_transaction`…).
- Transações e o livro-razão da carteira não aceitam escrita direta.
- Currículos e comprovantes ficam em buckets privados, com pasta por usuário; o download é por *signed URL* de 60 s.
- Candidatura só com perfil **ativo** (taxa confirmada) e vaga **publicada**. Aulas pagas só com pagamento confirmado.
- Registro de auditoria para confirmações de pagamento, publicações, revisões e ajustes de carteira.
- Limite anti-abuso no formulário de contato (3 mensagens por e-mail a cada 10 min).

### Índice de compatibilidade

Estimativa por regras (não é avaliação científica nem decisão automática).
`índice = Σ(critério × peso) ÷ Σ(pesos dos critérios com dados)`. Pesos padrão: área 20, cargo 15, requisitos
obrigatórios 30, desejáveis 10, modalidade 10, localização 10, salário 5 (editáveis em Admin → Configurações).
Requisitos obrigatórios não identificados no perfil aparecem em vermelho. Não usa idade, gênero, raça, religião,
estado civil ou foto.

### Cobrança de vagas (R$ 1,00/dia)

A empresa compra créditos via PIX. Ao publicar, escolhe a duração (1–90 dias) e vê o custo antes de confirmar; o valor
é debitado da carteira e uma fatura é registrada. Ao fim do período a vaga é **pausada** (nunca excluída) e pode ser
renovada. Pausar ou encerrar antes devolve os dias inteiros não usados. A administração pode isentar vagas e mudar a diária.

## 6. Situação das funcionalidades

**Concluído e testado**
- Site institucional completo, responsivo, com vídeo de abertura, logo, fotos e animações discretas.
- Cadastro e login reais (Supabase Auth), verificação de e-mail, recuperação de senha.
- Perfil do profissional em etapas com salvamento, % de preenchimento, 3 perguntas de apresentação, currículo
  (PDF/DOC/DOCX até 5 MB, versões, substituir/excluir).
- Taxa de ativação R$ 0,15 via PIX, com bloqueio de candidaturas e visibilidade até a confirmação.
- Cadastro de empresa, questionário de vaga de 13 pontos, revisão pela administração, publicação paga por dia,
  carteira, faturas, pausa automática e devolução proporcional.
- Candidaturas, convites, Kanban do processo seletivo com histórico, favoritos, entrevistas e observações internas;
  confirmação de contratação explícita.
- Banco de talentos com filtros combinados, busca por palavra-chave, status, etiquetas, contatos e retenção (LGPD).
- Cursos: catálogo, módulos, aulas, compra via PIX, progresso, certificado com código.
- Painel administrativo com KPIs reais, conferência de PIX, vagas, empresas, cursos, mensagens, exclusão de conta e auditoria.
- 9 testes unitários + 64 testes de regras de negócio e RLS.
- Identidade visual preto + prata metálica, seguindo a logo (substitui o dourado sugerido no documento original).

**Depende de credenciais externas**
- Projeto Supabase (URL e anon key) para qualquer funcionalidade com dados.
- Confirmação automática de PIX via webhook PagBank (a manual já funciona).
- Envio de e-mails transacionais além dos e-mails de autenticação do Supabase (configure SMTP próprio em
  *Authentication → SMTP* para usar o seu domínio).

**Pendente / próximos passos sugeridos**
- Revisão jurídica dos textos de Política de Privacidade e Termos de Uso (são modelos).
- Canais oficiais de contato (e-mail, WhatsApp, redes sociais) no rodapé, quando existirem.
- Exclusão definitiva de conta é concluída pelo admin no painel do Supabase (fluxo registrado no sistema).
- Certificado em PDF com layout próprio (hoje é emitido com código e impresso pelo navegador).
- Testes de interface ponta a ponta (Playwright) quando houver um projeto Supabase de homologação.

## 7. Roteiro de testes manuais (aceitação)

1. Cadastrar profissional → confirmar e-mail → preencher as 6 etapas → enviar currículo.
2. Login, logout e “Esqueci minha senha”.
3. Gerar PIX de ativação → admin confirma → perfil ativo.
4. Cadastrar empresa → criar vaga → enviar para revisão → admin aprova.
5. Empresa compra créditos → admin confirma → publicar por N dias (ver débito e fatura).
6. Profissional se candidata → empresa vê o candidato, abre o currículo, move no Kanban, confirma contratação.
7. Segunda empresa não vê nada da primeira.
8. Admin pesquisa no banco de talentos e convida para uma vaga.
9. Admin cria curso pago com módulos e aulas → publica → aluno compra → conteúdo bloqueado até confirmar → conclui → certificado.
10. Acessar `/admin` com conta não-admin → redirecionado.
11. Repetir no celular (menu, formulários, Kanban com seletor de etapa).

## 8. Senhas (administração)

- **Minha conta** (Admin → Configurações): o administrador troca a própria senha (reautentica com a atual) ou gera uma senha forte.
- **Definir nova senha para profissional ou empresa** (Admin → Empresas, e a ficha do profissional em Admin → Profissionais): gera uma senha provisória,
  mostra uma mensagem pronta para copiar/enviar e **derruba as sessões abertas** da pessoa. No primeiro acesso ela é obrigada a criar uma senha própria.
  Funciona sem depender de e-mail (RPC `admin_set_user_password`, apenas para admin; não vale para outro admin). Cada uso é registrado na auditoria, sem gravar a senha.
- **Criar conta** (Admin → Empresas e Admin → Profissionais): o administrador cria a conta de um profissional ou empresa com senha provisória,
  sem depender de e-mail (RPC `admin_create_user`). O e-mail nasce confirmado pela administração; no **primeiro acesso** a pessoa troca a senha e
  **aceita os Termos e a Política de Privacidade** (RPC `complete_first_access`) — o consentimento nunca é registrado em nome dela.
  Útil enquanto o SMTP próprio não estiver configurado: o e-mail padrão do Supabase tem limite de envios por hora para o projeto todo.

## 9. Cadastro público sem depender de e-mail

O e-mail padrão do Supabase limita os envios por hora para o **projeto inteiro** (erro `429: email rate limit exceeded`) e só entrega a membros da equipe.
Para o cliente cadastrar-se sempre com tranquilidade, os formulários de profissional e de empresa chamam a Edge Function **`signup`**
(`supabase/functions/signup`), que cria a conta já confirmada e o site faz o login em seguida.

- Proteções: validação no servidor, aceite obrigatório dos Termos, campo escondido anti-robô (*honeypot*), limite de 30 cadastros por hora por IP
  (tabela `signup_attempts`) e CORS restrito ao site publicado e ao `localhost`.
- **Contrapartida:** o e-mail digitado **não é verificado** (a conta recebe `app_metadata.email_unverified = true`). Erro de digitação no e-mail
  significa que o link de "esqueci a senha" não chega; nesses casos o administrador define uma nova senha pelo painel.
- Para voltar à verificação por e-mail: configure um SMTP próprio (Resend, Brevo, SendGrid…) em *Authentication → SMTP* e troque o cadastro
  de volta para `supabase.auth.signUp` em `src/pages/auth/Auth.tsx`.
- Deploy: `supabase functions deploy signup --no-verify-jwt` (a função usa a `service_role` do próprio ambiente do Supabase; nunca vai para o navegador).
