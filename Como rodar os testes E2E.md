Como rodar os testes E2E
1. Setup (apenas uma vez — ou quando a sessão expirar)

npm run e2e:setup
Abre dois browsers sequencialmente:

Primeiro: faça login com Google como usuário comum → aguarde redirecionar para /agendar → o Playwright salva a sessão automaticamente
Segundo: faça login com Google como admin → aguarde redirecionar para /admin → sessão salva
As sessões ficam em e2e/.auth/ (ignorado pelo git, nunca vai para o repositório).

2. Rodar os testes

# Todos os 41 testes (recomendado)npm run e2e# Por perfil:npm run e2e:publico   # 13 testes — sem loginnpm run e2e:usuario   # 14 testes — usuário Googlenpm run e2e:admin     # 14 testes — admin# Ver relatório HTML após rodar:npm run e2e:report
O que cada perfil testa
Perfil	Destaques
Público	favicon, og:image WhatsApp, site.webmanifest, proteção de rotas, páginas estáticas
Usuário	fluxo completo de agendamento → cancelamento, loja → reserva → cancelamento
Admin	CRUD de serviços e produtos, upload de imagem (valida bucket Storage), agenda especial, pausa
