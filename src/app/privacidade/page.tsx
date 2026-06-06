import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidade — Leste Barbearia',
}

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-14 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="text-xs text-zinc-500 hover:text-white mb-2 flex items-center gap-1">
            ← Voltar
          </Link>
          <h1 className="text-2xl font-extrabold uppercase tracking-widest text-white">Política de Privacidade</h1>
          <p className="text-xs text-zinc-500">Última atualização: 06 de junho de 2026</p>
        </div>

        <Section title="1. Quem somos">
          A Leste Barbearia é a controladora dos dados pessoais tratados no aplicativo de agendamentos.
        </Section>

        <Section title="2. Dados pessoais coletados">
          Quando você escolhe a opção <strong>Entrar com o Google</strong>, coletamos e armazenamos somente:
          <ul className="list-disc list-inside flex flex-col gap-1">
            <li>Nome</li>
            <li>E-mail</li>
            <li>Foto do perfil</li>
          </ul>
          Não coletamos dados sensíveis, contatos, mensagens, arquivos pessoais nem qualquer outro dado além do necessário para o agendamento.
        </Section>

        <Section title="3. Finalidade do tratamento">
          Os dados são usados exclusivamente para:
          <ul className="list-disc list-inside flex flex-col gap-1 mt-1">
            <li>Identificar você no sistema de agendamentos.</li>
            <li>Vincular histórico e informações da sua conta.</li>
            <li>Personalizar sua experiência no aplicativo.</li>
            <li>Viabilizar atendimento e gestão da agenda.</li>
          </ul>
          Não enviamos spam, não vendemos dados e não compartilhamos com empresas de publicidade ou marketing para fins comerciais.
        </Section>

        <Section title="4. Uso de dados do Google (OAuth)">
          Os dados obtidos por meio do login com Google são utilizados apenas para autenticação e operação do serviço de agendamentos.
          Não usamos esses dados para publicidade, perfilamento comercial, revenda, enriquecimento de base de dados ou qualquer finalidade incompatível com a experiência principal do usuário.
        </Section>

        <Section title="5. Base legal">
          O tratamento ocorre com fundamento nas bases legais aplicáveis da LGPD, incluindo execução do serviço de agendamento, legítimo interesse para operação e segurança, e consentimento quando exigido.
        </Section>

        <Section title="6. Compartilhamento de dados">
          Os dados podem ser compartilhados apenas quando necessário para viabilizar o serviço, com provedores de tecnologia e infraestrutura, observados critérios de segurança e confidencialidade.
        </Section>

        <Section title="7. Armazenamento e segurança">
          Adotamos medidas técnicas e organizacionais para proteger seus dados contra acessos não autorizados, perda, alteração ou divulgação indevida. O acesso é restrito a pessoas autorizadas para operação da agenda e atendimento.
        </Section>

        <Section title="8. Retenção dos dados">
          Os dados são mantidos pelo período necessário para cumprir as finalidades desta Política, obrigações legais e exercício regular de direitos, com eliminação ou anonimização quando não mais necessários.
        </Section>

        <Section title="9. Seus direitos">
          Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, informação sobre compartilhamento e revogação do consentimento quando aplicável.
        </Section>

        <Section title="10. Exclusão de dados">
          Você pode solicitar a exclusão total da sua conta e dos seus dados a qualquer momento pelos canais oficiais de atendimento da Leste Barbearia.
        </Section>

        <Section title="11. Alterações desta Política">
          Esta Política poderá ser atualizada para refletir melhorias no serviço, mudanças legais ou regulatórias.
        </Section>

        <Section title="12. Contato">
          Em caso de dúvidas sobre esta Política ou sobre o tratamento dos seus dados pessoais, entre em contato com a administração da Leste Barbearia.
        </Section>

        <div className="pt-4 border-t border-white/10 text-xs text-zinc-600">
          Aplicativo desenvolvido e mantido por <strong>Agência JN</strong>.
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
