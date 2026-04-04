import Link from 'next/link'

export const metadata = {
  title: 'Termos de Uso — Leste Barbearia',
}

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-14 flex flex-col gap-8">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-2">
          <Link href="/" className="text-xs text-zinc-500 hover:text-white mb-2 flex items-center gap-1">
            ← Voltar
          </Link>
          <h1 className="text-2xl font-extrabold uppercase tracking-widest text-white">Termos de Uso</h1>
          <p className="text-xs text-zinc-500">Última atualização: abril de 2026</p>
        </div>

        <Section title="1. Sobre o serviço">
          Este aplicativo permite que clientes da <strong>Leste Barbearia</strong> agendem horários de forma online. O uso é gratuito e destinado exclusivamente a clientes.
        </Section>

        <Section title="2. Cadastro">
          Para agendar, é necessário autenticar-se com uma conta Google. Você deve fornecer informações verdadeiras e manter seus dados atualizados.
        </Section>

        <Section title="3. Agendamentos">
          <ul className="list-disc list-inside flex flex-col gap-1">
            <li>Cada cliente pode ter agendamentos ativos simultaneamente conforme disponibilidade.</li>
            <li>Cancelamentos devem ser feitos com antecedência, via aplicativo.</li>
            <li>Faltas recorrentes podem resultar no bloqueio temporário do acesso.</li>
          </ul>
        </Section>

        <Section title="4. Conduta">
          É proibido usar este aplicativo para fins fraudulentos, prejudicar outros clientes ou tentar acessar áreas restritas do sistema.
        </Section>

        <Section title="5. Modificações">
          A Leste Barbearia pode alterar estes termos a qualquer momento. O uso contínuo do aplicativo após alterações implica na aceitação dos novos termos.
        </Section>

        <Section title="6. Contato">
          Para dúvidas, entre em contato pelo WhatsApp da barbearia.
        </Section>

        <div className="pt-4 border-t border-white/10 text-xs text-zinc-600">
          Ao usar este aplicativo, você concorda com estes termos e com nossa{' '}
          <Link href="/privacidade" className="text-zinc-400 hover:text-white underline underline-offset-2">
            Política de Privacidade
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
