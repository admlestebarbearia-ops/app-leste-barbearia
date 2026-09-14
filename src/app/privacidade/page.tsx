import Link from 'next/link'
import type { Metadata } from 'next'

// ────────────────────────────────────────────────────────────────────────────
// POLITICA DE PRIVACIDADE — URL canonica: /privacidade
//
// Esta e a URL declarada no Google Cloud (Branding), linkada na landing /app,
// na tela `/`, nos Termos, no menu do agendamento e no sitemap. Nao existe
// /br/privacidade (responde 404) — nunca existiu. Nao criar uma segunda.
//
// POR QUE FOI REESCRITA (14/09/2026): o Google reprovou a verificacao de marca
// com "sua pagina de politica de privacidade nao tem conteudo suficiente. A
// pagina precisa detalhar suficientemente a coleta de dados e o uso de dados do
// app". A versao anterior dizia que o app coletava "somente nome, e-mail e foto"
// — o que era falso: ele tambem grava telefone, os agendamentos, dados de
// pagamento e IP/aparelho na trilha de auditoria. As secoes de compartilhamento,
// retencao e contato eram texto generico, sem nomear ninguem.
//
// REGRA AO EDITAR: cada afirmacao aqui precisa corresponder ao que o codigo
// realmente faz. As listas abaixo foram derivadas de:
//   · dados do usuario      → appointments, profiles, product_reservations
//   · dados do Google       → signInWithOAuth sem `scopes` = openid/email/profile
//   · dados tecnicos        → src/lib/audit/log.ts (IP, user-agent, device id)
//   · push                  → push_subscriptions (endpoint, p256dh, auth_key)
//   · pagamento             → ALLOWED_FORM_FIELDS em integration-alignment.ts
//                             (so `token`; nunca numero de cartao ou CVV)
//   · cookies               → guest_booking_ids, guest_device, guest_booking_phone
// Se algum desses mudar, esta pagina muda junto.
// ────────────────────────────────────────────────────────────────────────────

const EMAIL_CONTATO = 'adm.lestebarbearia@gmail.com'

export const metadata: Metadata = {
  title: 'Política de Privacidade — Leste Barbearia',
  description:
    'Como o aplicativo da Leste Barbearia coleta, usa, armazena, compartilha e exclui os dados pessoais dos clientes, incluindo os dados recebidos do login com Google.',
  alternates: { canonical: '/privacidade' },
}

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-14 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="text-xs text-zinc-500 hover:text-white mb-2 flex items-center gap-1">
            ← Voltar
          </Link>
          <h1 className="text-2xl font-extrabold uppercase tracking-widest text-white">
            Política de Privacidade
          </h1>
          <p className="text-xs text-zinc-500">Última atualização: 14 de setembro de 2026</p>
        </div>

        <p className="text-sm leading-relaxed text-zinc-300">
          Esta Política explica, em detalhe, quais dados pessoais o aplicativo de agendamento da{' '}
          <strong className="text-white">Leste Barbearia</strong> coleta, por que coleta, como usa,
          onde armazena, com quem compartilha, por quanto tempo guarda e como você pode pedir acesso,
          correção ou exclusão. Ela vale para o site e o aplicativo publicados em{' '}
          <span className="text-zinc-100">lestebarbearia.agenciajn.com.br</span>.
        </p>

        <Section title="1. Quem é o responsável e como falar conosco">
          A <strong className="text-zinc-200">Leste Barbearia</strong> é a controladora dos dados
          pessoais tratados neste aplicativo. O desenvolvimento e a manutenção técnica são feitos pela{' '}
          <strong className="text-zinc-200">Agência JN</strong>, na condição de operadora.
          <p className="mt-2">
            Para qualquer assunto relacionado a esta Política — dúvidas, acesso, correção ou exclusão
            de dados — escreva para{' '}
            <a
              href={`mailto:${EMAIL_CONTATO}`}
              className="text-zinc-100 underline underline-offset-2 hover:text-white"
            >
              {EMAIL_CONTATO}
            </a>
            . Respondemos em até 15 dias.
          </p>
        </Section>

        <Section title="2. Dados que você nos fornece ao agendar">
          Para reservar um horário, o aplicativo coleta e armazena:
          <Lista
            itens={[
              ['Nome', 'para identificar a reserva e chamar você no atendimento.'],
              ['Telefone com DDD (WhatsApp)', 'para confirmar, lembrar e avisar sobre o seu horário, e para localizar a sua reserva caso você troque de aparelho.'],
              ['E-mail', 'apenas quando você entra com a conta Google, ou quando é necessário para o recibo do pagamento online.'],
              ['Serviço escolhido, profissional, data e horário', 'são o próprio agendamento.'],
              ['Forma de pagamento registrada no atendimento', 'para o controle financeiro da barbearia.'],
              ['Avaliação e observações do atendimento', 'quando o estabelecimento registra uma nota sobre o atendimento realizado.'],
              ['Reserva de produtos', 'quando você reserva um item da loja: produto, quantidade e o telefone de contato.'],
            ]}
          />
          <p className="mt-3">
            É possível agendar <strong className="text-zinc-200">sem criar conta</strong>, informando
            apenas nome e telefone. Nesse caso não há cadastro: a reserva fica vinculada ao aparelho
            que a criou, por meio de um cookie assinado (ver item 7).
          </p>
          <p className="mt-2">
            Não pedimos CPF, RG, endereço residencial, dados de saúde, biometria ou qualquer outro
            dado sensível.
          </p>
        </Section>

        <Section title="3. Dados recebidos do Google quando você usa “Entrar com Google”">
          O login com Google é <strong className="text-zinc-200">opcional</strong>. Quando você
          escolhe usá-lo, o aplicativo solicita apenas os três escopos básicos de identificação —{' '}
          <code className="text-zinc-200">openid</code>, <code className="text-zinc-200">email</code> e{' '}
          <code className="text-zinc-200">profile</code> — e recebe do Google somente:
          <Lista
            itens={[
              ['Nome da conta', 'exibido no aplicativo e usado para identificar você no atendimento.'],
              ['Endereço de e-mail', 'usado para identificar a sua conta de forma única e, quando aplicável, no recibo do pagamento.'],
              ['Foto de perfil, quando você tem uma', 'exibida na sua área do aplicativo.'],
              ['Identificador da conta Google (ID)', 'usado internamente para autenticar você e vincular os seus agendamentos à sua conta.'],
            ]}
          />
          <p className="mt-3">Esses dados são usados exclusivamente para:</p>
          <Lista
            itens={[
              ['Autenticar você', 'confirmar que é você quem está entrando.'],
              ['Identificar a sua conta', 'sem precisar criar e memorizar uma senha.'],
              ['Vincular as suas reservas', 'para que o histórico apareça em qualquer aparelho onde você entrar.'],
              ['Consultar e cancelar agendamentos', 'a área “Minhas reservas” depende dessa identificação.'],
            ]}
          />
          <p className="mt-3">
            <strong className="text-zinc-200">
              O aplicativo não solicita e não tem acesso a Gmail, Google Drive, Google Agenda,
              Contatos, Fotos, nem a qualquer outro serviço ou dado da sua conta Google.
            </strong>{' '}
            Os escopos concedidos permitem apenas ler as informações básicas de perfil listadas acima.
          </p>
        </Section>

        <Section title="4. Uso limitado dos dados das APIs do Google">
          O uso das informações recebidas das APIs do Google por este aplicativo obedece à{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-100 underline underline-offset-2 hover:text-white"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado. Em termos práticos, isso significa que os dados
          obtidos do Google:
          <Lista
            itens={[
              ['São usados só para funcionalidades visíveis para você', 'entrar na conta e acessar os seus agendamentos.'],
              ['Não são vendidos', 'a ninguém, em nenhuma circunstância.'],
              ['Não alimentam publicidade', 'não há anúncios, remarketing nem perfilamento comercial no aplicativo.'],
              ['Não treinam modelos de IA', 'nem nossos, nem de terceiros.'],
              ['Não são lidos por pessoas', 'salvo com o seu consentimento explícito, para suporte que você solicitou, por exigência legal, ou de forma agregada e anonimizada para operação e segurança.'],
            ]}
          />
        </Section>

        <Section title="5. Dados técnicos coletados automaticamente">
          Para segurança e para investigar problemas na agenda, o sistema mantém um registro de
          auditoria das ações relevantes (criação, cancelamento, conclusão e exclusão de
          agendamentos). Cada registro guarda:
          <Lista
            itens={[
              ['Endereço IP de onde veio a ação', 'para identificar uso abusivo e reservas fraudulentas.'],
              ['Identificação do navegador (user-agent)', 'para o mesmo fim, e para diagnosticar falhas em aparelhos específicos.'],
              ['Um identificador aleatório do aparelho', 'gerado por nós, sem relação com identificadores de publicidade.'],
              ['Descrição resumida do que foi feito e por quem', 'por exemplo: “agendamento de 19/09 às 14:30 cancelado”.'],
            ]}
          />
          <p className="mt-3">
            Esses dados não são usados para publicidade, não são cruzados com bases externas e não
            saem do nosso provedor de banco de dados. Um número de telefone ou IP pode ser incluído
            numa lista de bloqueio quando houver reservas falsas reiteradas.
          </p>
        </Section>

        <Section title="6. Notificações">
          Se — e somente se — você autorizar notificações no navegador, guardamos os dados técnicos
          da assinatura de push (o endereço de envio fornecido pelo seu navegador e as duas chaves
          criptográficas que ele gera). Eles servem apenas para enviar avisos sobre os{' '}
          <em>seus</em> agendamentos: confirmação, lembrete e alterações. Não enviamos promoções por
          esse canal. Você pode revogar a permissão a qualquer momento nas configurações do navegador
          ou do celular, e a assinatura deixa de funcionar.
        </Section>

        <Section title="7. Cookies">
          O aplicativo não usa cookies de publicidade, de rastreamento entre sites ou de análise
          comportamental. Usamos apenas cookies necessários ao funcionamento:
          <Lista
            itens={[
              ['Sessão de autenticação', 'quando você entra com o Google, para manter você conectado.'],
              ['Comprovante de posse das reservas de visitante', 'uma lista assinada criptograficamente com os identificadores dos agendamentos criados naquele aparelho. É o que permite a quem agenda sem conta consultar e cancelar a própria reserva — e o que impede uma pessoa de ver a reserva de outra.'],
              ['Identificador do aparelho', 'um código aleatório usado na trilha de auditoria descrita no item 5.'],
              ['Telefone da última reserva', 'guardado apenas para localizar os seus agendamentos anteriores.'],
            ]}
          />
        </Section>

        <Section title="8. Pagamentos e o papel do Mercado Pago">
          Quando a barbearia habilita o pagamento online, a cobrança é processada pelo{' '}
          <strong className="text-zinc-200">Mercado Pago</strong>, que atua como operador independente
          de pagamentos.
          <p className="mt-3">
            <strong className="text-zinc-200">
              O nosso sistema não recebe, não processa e não armazena número de cartão, código de
              segurança (CVV) ou data de validade.
            </strong>{' '}
            Esses dados são digitados dentro do componente do próprio Mercado Pago, no seu navegador,
            e são transformados por ele num código de uso único. O que chega ao nosso servidor é
            apenas esse código, que é imediatamente repassado ao Mercado Pago e não é gravado.
          </p>
          <p className="mt-3">O que o nosso sistema guarda de cada pagamento:</p>
          <Lista
            itens={[
              ['O identificador do pagamento no Mercado Pago', 'para conferir a situação e tratar estornos.'],
              ['A situação (pendente, aprovado, recusado, estornado)', 'para liberar ou cancelar o agendamento.'],
              ['O meio usado (Pix, débito, crédito, dinheiro)', 'para o controle financeiro.'],
              ['O valor e a data', 'para o mesmo fim.'],
            ]}
          />
          <p className="mt-3">
            Para emitir a cobrança, enviamos ao Mercado Pago o seu nome, e-mail e telefone, além do
            serviço e do valor. O tratamento desses dados pelo Mercado Pago segue a política de
            privacidade dele.
          </p>
        </Section>

        <Section title="9. Com quem os seus dados são compartilhados">
          Não vendemos, não alugamos e não cedemos dados pessoais. O compartilhamento se limita aos
          prestadores necessários para o aplicativo funcionar:
          <Lista
            itens={[
              ['Supabase', 'banco de dados, autenticação e armazenamento de arquivos. É onde os agendamentos ficam guardados.'],
              ['Vercel', 'hospedagem e entrega do site e do aplicativo.'],
              ['Google', 'somente quando você usa “Entrar com Google”, para autenticar a sua conta.'],
              ['Mercado Pago', 'somente quando há pagamento online, nos termos do item 8.'],
              ['Serviço de push do seu navegador', 'Google, Apple ou Mozilla, conforme o navegador que você usa, e apenas se você autorizar notificações.'],
            ]}
          />
          <p className="mt-3">
            Além disso, podemos compartilhar dados quando houver obrigação legal, ordem judicial ou
            necessidade de exercer direitos em processo. Fora essas hipóteses, ninguém mais recebe os
            seus dados.
          </p>
          <p className="mt-3">
            Parte desses prestadores mantém servidores fora do Brasil. Essa transferência
            internacional ocorre apenas para viabilizar o serviço que você pediu, com prestadores que
            adotam medidas de proteção compatíveis com a LGPD.
          </p>
        </Section>

        <Section title="10. Base legal do tratamento (LGPD)">
          <Lista
            itens={[
              ['Execução de contrato', 'agendamento, atendimento e pagamento — é o que você solicitou ao usar o aplicativo.'],
              ['Cumprimento de obrigação legal', 'guarda de registros fiscais e contábeis.'],
              ['Legítimo interesse', 'segurança, prevenção a reservas fraudulentas e melhoria do serviço, sempre no mínimo necessário.'],
              ['Consentimento', 'notificações push e, quando aplicável, o uso do login com Google — ambos revogáveis a qualquer momento.'],
            ]}
          />
        </Section>

        <Section title="11. Por quanto tempo guardamos">
          <Lista
            itens={[
              ['Agendamentos e histórico', 'enquanto você usa o aplicativo e, depois, pelo prazo necessário ao controle financeiro e às obrigações legais da barbearia.'],
              ['Registros de pagamento', 'pelo prazo exigido pela legislação fiscal e contábil brasileira.'],
              ['Trilha de auditoria (item 5)', 'pelo tempo necessário para investigar abusos e problemas operacionais.'],
              ['Assinatura de notificações', 'até você revogar a permissão ou o navegador invalidá-la.'],
              ['Cookies de posse de reserva', 'até 120 dias, ou até você limpar os dados do navegador.'],
              ['Dados de conta após pedido de exclusão', 'eliminados ou anonimizados em até 30 dias, ressalvado o que a lei obriga a manter.'],
            ]}
          />
        </Section>

        <Section title="12. Segurança">
          Adotamos medidas técnicas e organizacionais proporcionais ao risco:
          <Lista
            itens={[
              ['Tráfego sempre criptografado', 'todo o acesso é feito por HTTPS.'],
              ['Isolamento por linha no banco de dados', 'políticas de acesso impedem que um cliente leia os dados de outro.'],
              ['Comprovante de posse assinado criptograficamente', 'quem agenda sem conta só enxerga as próprias reservas.'],
              ['Acesso administrativo restrito', 'o painel da barbearia exige autenticação e permissão específica.'],
              ['Segredos fora do navegador', 'chaves de integração ficam apenas no servidor.'],
              ['Registro de auditoria', 'ações sensíveis ficam rastreáveis.'],
            ]}
          />
          <p className="mt-3">
            Nenhum sistema é isento de risco. Se ocorrer um incidente de segurança relevante,
            comunicaremos os titulares afetados e a autoridade competente, conforme a LGPD.
          </p>
        </Section>

        <Section title="13. Seus direitos">
          Você pode, a qualquer momento, solicitar:
          <Lista
            itens={[
              ['Confirmação e acesso', 'saber se tratamos dados seus e receber uma cópia.'],
              ['Correção', 'ajustar dados incompletos, inexatos ou desatualizados.'],
              ['Anonimização, bloqueio ou eliminação', 'de dados desnecessários, excessivos ou tratados em desconformidade.'],
              ['Portabilidade', 'nos termos da regulamentação aplicável.'],
              ['Informação sobre compartilhamento', 'com quem compartilhamos os seus dados.'],
              ['Revogação do consentimento', 'para notificações e para o login com Google.'],
              ['Oposição', 'a tratamento feito com base em legítimo interesse.'],
            ]}
          />
          <p className="mt-3">
            Basta escrever para{' '}
            <a
              href={`mailto:${EMAIL_CONTATO}`}
              className="text-zinc-100 underline underline-offset-2 hover:text-white"
            >
              {EMAIL_CONTATO}
            </a>{' '}
            a partir do e-mail cadastrado, ou informando o telefone usado nas reservas. Podemos pedir
            uma confirmação adicional de identidade antes de atender ao pedido — é uma proteção contra
            alguém se passar por você.
          </p>
        </Section>

        <Section title="14. Como excluir os seus dados">
          Para apagar a sua conta e os dados associados, envie um pedido para{' '}
          <a
            href={`mailto:${EMAIL_CONTATO}`}
            className="text-zinc-100 underline underline-offset-2 hover:text-white"
          >
            {EMAIL_CONTATO}
          </a>{' '}
          com o assunto <strong className="text-zinc-200">“Exclusão de dados”</strong>. A exclusão é
          concluída em até 30 dias e abrange perfil, agendamentos, avaliações e assinaturas de
          notificação. Registros que a legislação fiscal obriga a manter — valores e datas de
          pagamentos já realizados — são preservados pelo prazo legal e, quando possível,
          anonimizados.
        </Section>

        <Section title="15. Como revogar o acesso da conta Google">
          Desvincular a conta Google deste aplicativo não depende de nós. Acesse{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-100 underline underline-offset-2 hover:text-white"
          >
            myaccount.google.com/permissions
          </a>
          , localize <strong className="text-zinc-200">Leste Barbearia</strong> e escolha remover o
          acesso. A partir daí não recebemos mais nenhum dado do Google sobre você. Os dados já
          gravados continuam no aplicativo até que você peça a exclusão pelo item 14.
        </Section>

        <Section title="16. Crianças e adolescentes">
          O aplicativo é destinado a maiores de 18 anos. Menores devem agendar por meio de um
          responsável. Se identificarmos um cadastro criado por menor sem autorização, os dados serão
          eliminados.
        </Section>

        <Section title="17. Alterações desta Política">
          Podemos atualizar esta Política para refletir mudanças no serviço ou na legislação. A data
          de “Última atualização” no topo indica a versão vigente. Mudanças relevantes na forma como
          tratamos os seus dados serão comunicadas dentro do aplicativo.
        </Section>

        <div className="pt-4 border-t border-white/10 flex flex-col gap-2 text-xs text-zinc-600">
          <p>
            Leia também os{' '}
            <Link href="/termos" className="text-zinc-400 hover:text-white underline underline-offset-2">
              Termos de Uso
            </Link>
            .
          </p>
          <p>
            Aplicativo desenvolvido e mantido por <strong>Agência JN</strong>.
          </p>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">{title}</h2>
      <div className="text-sm text-zinc-400 leading-relaxed">{children}</div>
    </div>
  )
}

/** Lista "termo — explicação". O termo em destaque, a finalidade logo ao lado. */
function Lista({ itens }: { itens: [string, string][] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {itens.map(([termo, texto]) => (
        <li key={termo} className="flex gap-2.5">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-600" aria-hidden />
          <span>
            <strong className="text-zinc-200 font-semibold">{termo}</strong> — {texto}
          </span>
        </li>
      ))}
    </ul>
  )
}
