# Projeto VTT

Aplicação de mesa virtual com cliente React/Pixi, servidor Fastify/WebSocket e persistência SQLite.

## Requisitos

- Node.js compatível com as versões atuais de Vite e TypeScript
- npm

## Desenvolvimento

Na raiz do repositório:

```powershell
npm install
npm start
```

O cliente Vite e o servidor são iniciados em paralelo. O primeiro cadastro cria uma conta com e-mail, apelido e senha; o login aceita e-mail ou apelido. Senhas devem ter pelo menos 12 caracteres.

## Primeiro administrador

Antes de iniciar o servidor pela primeira vez, configure um segredo aleatório de pelo menos 32 caracteres no ambiente:

```powershell
$env:ADMIN_BOOTSTRAP_TOKEN = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
npm start
```

O formulário de cadastro oferece o campo de bootstrap enquanto não existir um administrador. Informe o segredo somente na conta que deve ser a primeira administradora. O servidor não permite usá-lo novamente depois que um administrador for criado. Remova a variável do ambiente após concluir o bootstrap.

Administradores podem associar uma conta antiga ou redefinir credenciais pelo painel da sala de espera. Antes de alterar a conta, confirme a identidade da pessoa por um canal confiável; a aplicação não envia e-mail de verificação ou recuperação. O administrador deve entregar a nova senha por um canal seguro.

Contas existentes antes da migração ficam preservadas, mas sem credenciais e sem possibilidade de login até serem associadas pelo painel. A associação mantém as memberships e sessões dessas contas.

## Segurança operacional

- Para uso público, sirva o cliente por HTTPS e o WebSocket por WSS; não exponha a porta HTTP local diretamente à internet.
- O e-mail é usado como identificador, mas não é verificado automaticamente. Não o trate como prova de identidade; a recuperação é administrativa.
- Tentativas de login são limitadas por combinação de endereço do cliente e identificador; o bloqueio temporário dura 15 minutos.
- Se o servidor só puder ser acessado por um proxy Cloudflare confiável que sobrescreve `CF-Connecting-IP`, configure `TRUST_PROXY_HEADERS=true` para que o limite de login use o IP original. Não habilite isso se clientes puderem acessar o servidor diretamente ou forjar esse cabeçalho.
- Tokens de sessão são guardados no `sessionStorage` do navegador, expiram após 30 dias e são invalidados no logout e quando um administrador redefine as credenciais.
- `ADMIN_BOOTSTRAP_TOKEN` é segredo operacional: não o adicione ao repositório, a arquivos públicos ou a logs.

## Persistência

O SQLite e os uploads são gravados no diretório de dados do servidor. Para escolher outro diretório, defina `VTT_DATA_DIR` no ambiente antes de iniciar a aplicação. As migrações preservam contas antigas; faça uma cópia de segurança do banco antes de atualizar uma instalação existente.

## Mapas de cena

O mestre pode abrir a aba **Mapa** durante uma cena e enviar um arquivo PNG, JPEG ou WebP de até 25 MB. O mapa é salvo por cena, aparece atrás da grade e dos tokens e é sincronizado com os participantes que estão nela. Use **Mover / redimensionar** para arrastá-lo no canvas ou ajustar seu tamanho pelo controle no canto inferior direito; **Concluir ajuste** encerra a edição. Trocar ou remover o mapa afeta somente a cena atual.

## Build e testes

```powershell
npm --workspace apps/client run build
npm --workspace apps/server run build
npm test
```

`npm run host` compila a aplicação e inicia o servidor com um túnel Cloudflare.
