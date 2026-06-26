# Guia de Instalação — Organizador de Provas
## EREM Monsenhor João Rodrigues de Carvalho

Siga cada passo com calma. Demora cerca de 20 minutos no total.

---

## PASSO 1 — Instalar o Node.js

1. Abra o Chrome e acesse: **https://nodejs.org**
2. Clique no botão verde **"LTS"** (é a versão recomendada)
3. Baixe o instalador `.msi`
4. Abra o arquivo baixado e clique em **Next** em tudo até instalar
5. Quando terminar, clique em **Finish**

**Para confirmar que funcionou:**
- Aperte `Windows + R`, digite `cmd` e pressione Enter
- Na tela preta que abrir, digite: `node --version`
- Deve aparecer algo como `v20.x.x` — se aparecer, está certo ✅

---

## PASSO 2 — Criar conta no Supabase (banco de dados gratuito)

1. Acesse: **https://supabase.com**
2. Clique em **"Start your project"**
3. Clique em **"Continue with GitHub"** ou crie uma conta com e-mail
4. Após entrar, clique em **"New project"**
5. Preencha:
   - **Name:** `organizador-provas`
   - **Database Password:** anote essa senha em algum lugar seguro
   - **Region:** escolha **South America (São Paulo)**
6. Clique em **"Create new project"** e aguarde (cerca de 1 minuto)

### Criar a tabela de envios:
7. No menu da esquerda, clique em **"SQL Editor"**
8. Cole o seguinte código e clique em **"Run"**:

```sql
-- Tabela de envios
CREATE TABLE envios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  professor text NOT NULL,
  materia text NOT NULL,
  simulado text NOT NULL,
  ano text NOT NULL DEFAULT '2025',
  arquivo text,
  enviado_em timestamptz DEFAULT now(),
  UNIQUE(professor, simulado, ano)
);

-- Permitir acesso público de leitura e escrita
ALTER TABLE envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_publico" ON envios FOR ALL USING (true) WITH CHECK (true);
```

### Criar o Storage (para guardar os arquivos Word):
9. No menu da esquerda, clique em **"Storage"**
10. Clique em **"New bucket"**
11. Nome: `questoes` — marque **"Public bucket"** — clique em **"Save"**

### Pegar as credenciais:
12. No menu da esquerda, clique em **"Settings"** (ícone de engrenagem)
13. Clique em **"API"**
14. Anote dois valores:
    - **Project URL** (começa com `https://`)
    - **anon public** (chave longa que começa com `eyJ`)

---

## PASSO 3 — Configurar o projeto

1. Extraia a pasta **`organizador-provas`** que você baixou para qualquer lugar
   (sugestão: coloque em `C:\organizador-provas`)

2. Abra o arquivo **`.env`** que está dentro da pasta
   (se não aparecer, vá em: Exibir → marcar "Itens ocultos" no Windows Explorer)

3. Substitua os valores com o que você copiou do Supabase:
```
SUPABASE_URL=https://SEU-ID.supabase.co
SUPABASE_KEY=eyJhbGci...SUA-CHAVE-AQUI
COORD_SENHA=Sport2026
PORT=3000
```
4. Salve o arquivo

---

## PASSO 4 — Instalar e testar localmente

1. Abra o **Prompt de Comando** (`Windows + R` → `cmd`)
2. Navegue até a pasta do projeto:
```
cd C:\organizador-provas
```
3. Instale as dependências:
```
npm install
```
   (vai baixar alguns pacotes, aguarde terminar)

4. Inicie o servidor:
```
npm start
```
   Deve aparecer: `✅ Servidor rodando em http://localhost:3000`

5. Abra o Chrome e acesse: **http://localhost:3000**
   A aplicação deve aparecer funcionando!

---

## PASSO 5 — Publicar online (para todos os professores acessarem)

### Criar conta no Vercel:
1. Acesse: **https://vercel.com**
2. Clique em **"Sign Up"** → **"Continue with GitHub"**
   (se não tiver GitHub, crie em https://github.com — é gratuito)

### Instalar o Vercel CLI:
3. No Prompt de Comando, digite:
```
npm install -g vercel
```

### Fazer o deploy:
4. Ainda no Prompt, dentro da pasta do projeto, digite:
```
vercel
```
5. Responda as perguntas:
   - `Set up and deploy?` → pressione **Enter** (Yes)
   - `Which scope?` → pressione **Enter**
   - `Link to existing project?` → digite **N** + Enter
   - `Project name?` → digite `organizador-provas` + Enter
   - `Directory?` → pressione **Enter**

6. Quando terminar, vai aparecer uma URL como:
   **`https://organizador-provas-xxxx.vercel.app`**

### Configurar as variáveis de ambiente no Vercel:
7. Acesse: **https://vercel.com/dashboard**
8. Clique no seu projeto
9. Vá em **Settings → Environment Variables**
10. Adicione cada uma:
    - `SUPABASE_URL` → sua URL do Supabase
    - `SUPABASE_KEY` → sua chave do Supabase
    - `COORD_SENHA` → `Sport2026`
11. Clique em **"Save"**

12. Vá em **Deployments** e clique em **"Redeploy"**

### Pronto! 🎉
Sua URL final será algo como:
**`https://organizador-provas.vercel.app`**

Compartilhe esse link com os professores — eles acessam direto pelo Chrome,
sem instalar nada!

---

## Dicas importantes

- **A senha do coordenador é:** `Sport2026`
- Para **atualizar o painel** do coordenador, clique no botão "🔄 Atualizar"
- O **ano é editável** no canto superior direito — mude para o ano atual
- Se um professor enviar errado, você pode deletar o registro no Supabase
  (em Table Editor → envios) e pedir para ele reenviar
- O plano **gratuito do Supabase** suporta até 500MB de arquivos
- O plano **gratuito do Vercel** suporta uso ilimitado para projetos pequenos

---

## Se tiver algum problema

Se aparecer algum erro em qualquer etapa, tire um print da tela e
mostre para o assistente — ele vai ajudar a resolver!
