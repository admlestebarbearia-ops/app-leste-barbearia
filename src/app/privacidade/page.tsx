import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidade — Leste Barbearia',
}

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-14 flex flex-col gap-8">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-2">
          <Link href="/" className="text-xs text-zinc-500 hover:text-white mb-2 flex items-center gap-1">
            ← Voltar
          </Link>
          <h1 className="text-2xl font-extrabold uppercase tracking-widest text-white">Política de Privacidade</h1>
          <p className="text-xs text-zinc-500">Última atualização: abril de 2026</p>
        </div>

        <Section title="1. Quais dados coletamos">
          <ul className="list-disc list-inside flex flex-col gap-1">
            <li>Nome e e-mail da conta Google usada para login.</li>
            <li>Histórico de agendamentos (serviço, data, horário, status).</li>
            <li>Número de telefone, se informado voluntariamente.</li>
          </ul>
        </Section>

        <Section title="2. Como usamos os dados">
          Os dados são usados exclusivamente para:
          <ul className="list-disc list-inside flex flex-col gap-1 mt-1">
            <li>Realizar e gerenciar agendamentos.</li>
            <li>Entrar em contato sobre confirmações ou cancelamentos.</li>
            <li>Garantir segurança e evitar abusos no sistema.</li>
          </ul>
        </Section>

        <Section title="3. Compartilhamento">
          Seus dados <strong>não são vendidos</strong> nem compartilhados com terceiros para fins comerciais. Eles ficam armazenados em infraestrutura segura (Supabase / PostgreSQL) com acesso restrito.
        </Section>

        <Section title="4. Login com Google">
          Ao entrar com o Google, recebemos apenas as informações básicas de perfil (nome e e-mail) autorizadas por você. Não acessamos contatos, arquivos ou outras contas.
        </Section>

        <Section title="5. Seus direitos">
          Você pode solicitar a exclusão de seus dados a qualquer momento entrando em contato pelo WhatsApp da barbearia. Após a exclusão, todos os seus registros serão removidos do sistema.
        </Section>

        <Section title="6. Cookies">
          Usamos cookies de sessão exclusivamente para manter você autenticado durante a navegação. Não utilizamos cookies de rastreamento ou publicidade.
        </Section>

        <Section title="7. Contato">
          Para exercer seus direitos ou tirar dúvidas sobre privacidade, fale com a gente pelo WhatsApp da Leste Barbearia.
        </Section>

        <div className="pt-4 border-t border-white/10 text-xs text-zinc-600">
          Veja também nossos{' '}
          <Link href="/termos" className="text-zinc-400 hover:text-white underline underline-offset-2">
            Termos de Uso
          </Link>
          .
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
