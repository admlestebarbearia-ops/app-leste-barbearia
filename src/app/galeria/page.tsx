import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GalleryView } from '@/components/gallery/GalleryView'
import type { GalleryPhoto } from '@/lib/supabase/types'

export const metadata = {
  title: 'Galeria — Leste Barbearia',
  description: 'Fotos dos clientes da Leste Barbearia',
}

export default async function GaleriaPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const [{ data: config }, { data: photosData }, { data: { user } }] = await Promise.all([
    admin.from('business_config').select('enable_gallery, allow_client_uploads, logo_url').single(),
    admin
      .from('gallery_photos')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.auth.getUser(),
  ])

  // CA: se galeria desabilitada → redireciona
  if (!config?.enable_gallery) {
    redirect('/agendar')
  }

  const photos = (photosData ?? []) as GalleryPhoto[]
  const userName = (user?.user_metadata?.full_name as string | undefined) ?? null

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <GalleryView
        photos={photos}
        allowClientUploads={config?.allow_client_uploads ?? false}
        userId={user?.id ?? null}
        userName={userName}
      />
    </main>
  )
}
