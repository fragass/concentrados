# TeamLite

Projeto privado de chat estilo Teams, feito para rodar com:
- Vercel
- GitHub
- Supabase

## O que tem
- Login por usuário e senha definidos por você
- Convite de contato (enviar / aceitar / recusar)
- Conversa privada usuário x usuário
- Criação de grupos usando contatos já aceitos
- Envio de texto e imagens
- Presença online simples por heartbeat
- Tema escuro inspirado em ferramentas corporativas

## Variáveis na Vercel
Cadastre estas variáveis:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Passo a passo
1. Crie um projeto no Supabase.
2. Rode o SQL do arquivo `sql/setup.sql` no SQL Editor.
3. Crie os buckets públicos:
   - `chat-images`
   - `profile-avatars` (já fica preparado, mesmo que você não use agora)
4. Configure as variáveis na Vercel.
5. Suba os arquivos no GitHub/Vercel.
6. Edite os usuários iniciais na parte final do SQL, se quiser.

## Observação importante
Esse projeto segue a lógica simples do seu projeto anterior: login próprio e projeto privado.
Ele funciona bem para uso privado, mas não é uma estrutura de autenticação enterprise.
