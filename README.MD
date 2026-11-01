# Projeto VTT

Aplicação de mesa virtual com cliente React/Pixi, servidor Fastify/WebSocket e persistência SQLite.

## Requisitos

- Node.js compatível com as versões atuais de Vite e TypeScript
- npm

## Desenvolvimento

Na raiz do repositório:

```bash
npm install
npm start
```

`npm start` inicia o servidor e o cliente Vite em paralelo. `npm run dev:server` inicia somente o servidor. O primeiro cadastro cria uma conta com e-mail, apelido e senha; o login aceita e-mail ou apelido. Senhas devem ter pelo menos 12 caracteres.

## Primeiro administrador

Antes de iniciar o servidor pela primeira vez, configure um segredo aleatório de pelo menos 32 caracteres no ambiente dependendo do seu sistema operacional:

**No Windows (PowerShell):**
```powershell
$env:ADMIN_BOOTSTRAP_TOKEN = (node -p "require('node:crypto').randomBytes(32).toString('base64url')")
npm start
```

**No Linux / macOS (Bash/Zsh):**
```bash
export ADMIN_BOOTSTRAP_TOKEN=$(node -p "require('node:crypto').randomBytes(32).toString('base64url')")
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

## Persistência e recuperação

O servidor grava o banco SQLite em `VTT_DATA_DIR/vtt.db` e os arquivos enviados em `VTT_DATA_DIR/uploads/`. Em uma hospedagem, configure `VTT_DATA_DIR` para um volume persistente e gravável, fora do diretório temporário ou descartável da aplicação. Sem isso, uma recriação do container ou da instância pode apagar os dados.

Para fazer uma cópia completa, pare o servidor de forma limpa e arquive o conteúdo inteiro de `VTT_DATA_DIR`, mantendo `vtt.db` e a pasta `uploads/` juntos. O banco usa WAL; não copie somente `vtt.db` enquanto o servidor estiver ativo. Guarde o arquivo de backup em outro local e com acesso restrito, pois ele contém dados de contas e sessões.

Para restaurar, pare o servidor, preserve a pasta de dados atual como precaução, extraia o backup completo no caminho configurado em `VTT_DATA_DIR` e confirme que o processo tem permissão de leitura e escrita. Inicie o servidor e verifique `/health`, o login e os arquivos de mídia das sessões.

A exportação JSON de uma sessão pelo aplicativo serve para transferir parte do conteúdo da sessão, mas não é um backup completo da hospedagem: o formato atual não inclui os arquivos enviados nem os vínculos com imagens de tokens e mapas. Para recuperação integral, use a cópia de `VTT_DATA_DIR`. As migrações preservam contas antigas; faça essa cópia antes de atualizar uma instalação existente.

## Mapas de cena

O mestre pode abrir a aba **Mapa** durante uma cena e enviar um arquivo PNG, JPEG ou WebP de até 25 MB. O mapa é salvo por cena, aparece atrás da grade e dos tokens e é sincronizado com os participantes que estão nela. Use **Mover / redimensionar** para arrastá-lo no canvas ou ajustar seu tamanho pelo controle no canto inferior direito; **Concluir ajuste** encerra a edição. Trocar ou remover o mapa afeta somente a cena atual.

## Build e testes

Para rodar os comandos de compilação de forma compatível com múltiplos terminais:

**No Windows (PowerShell):**
```powershell
npm --workspace apps/client run build
npm --workspace apps/server run build
npm test
```

**No Linux / macOS (Bash/Zsh):**
```bash
npm --workspace=apps/client run build
npm --workspace=apps/server run build
npm test
```

`npm run host` compila a aplicação e inicia o servidor com um túnel Cloudflare. No túnel temporário, o servidor usa `PORT` ou, por padrão, a porta 3000. No túnel nomeado, o servidor usa a porta definida no primeiro serviço de `scripts/tunnel-config.yml`; se `PORT` também estiver definido, os valores precisam coincidir.
