'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAuthenticatedUser } from '@/lib/auth/session-state'
import type { GalleryPhoto } from '@/lib/supabase/types'

// ─── Buscar fotos aprovadas (visão pública) ────────────────────────────────
export async function getPublicGalleryPhotos(): Promise<{
  photos: GalleryPhoto[]
  error?: string
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('gallery_photos')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { photos: [], error: error.message }
  return { photos: (data ?? []) as GalleryPhoto[] }
}

// ─── Cliente envia foto para aprovação ────────────────────────────────────
// RN: galeria e uploads devem estar ativos (enable_gallery + allow_client_uploads)
// RN: foto entra sempre como 'pending'; admin aprova antes de aparecer publicamente
// RN: upload no Storage via service role (server action confiável); insert no DB via admin
export async function submitClientGalleryPhoto(
  base64: string,
  mimeType: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  // Validação de formato
  if (!base64 || !base64.startsWith('data:')) {
    return { success: false, error: 'Arquivo inválido.' }
  }
  const allowedTypes = ['image/webp', 'image/jpeg', 'image/jpg', 'image/png']
  if (!allowedTypes.includes(mimeType)) {
    return { success: false, error: 'Formato não permitido. Use JPG, PNG ou WebP.' }
  }

  // Estima tamanho em bytes (base64 ~33% maior que binário)
  const base64Data = base64.split(',')[1] ?? ''
  const estimatedBytes = Math.ceil((base64Data.length * 3) / 4)
  if (estimatedBytes > 10 * 1024 * 1024) {
    return { success: false, error: 'Imagem muito grande. Máximo 10MB.' }
  }

  const admin = createAdminClient()

  // Verifica se galeria e uploads de clientes estão ativos
  const { data: config } = await admin
    .from('business_config')
    .select('enable_gallery, allow_client_uploads')
    .single()

  if (!config?.enable_gallery) {
    return { success: false, error: 'Galeria não disponível no momento.' }
  }
  if (!config?.allow_client_uploads) {
    return { success: false, error: 'Envio de fotos por clientes não está habilitado.' }
  }

  // Identidade do usuário logado (opcional — uploads anônimos são permitidos)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = isAuthenticatedUser(user)

  // Upload para Storage via admin client (bypass RLS de storage)
  const ext = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg' : mimeType.split('/')[1]
  const filename = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buffer = Buffer.from(base64Data, 'base64')

  const { error: uploadError } = await admin.storage
    .from('galeria')
    .upload(filename, buffer, { contentType: mimeType, upsert: false })

  if (uploadError) {
    return { success: false, error: 'Erro ao enviar imagem. Tente novamente.' }
  }

  const { data: urlData } = admin.storage.from('galeria').getPublicUrl(filename)

  // Insere registro no banco como 'pending' (aguarda aprovação do admin)
  const resolvedName = userName?.trim() ||
    (signedIn ? (user?.user_metadata?.full_name as string | undefined) : undefined) ||
    null

  const { error: dbError } = await admin
    .from('gallery_photos')
    .insert({
      url: urlData.publicUrl,
      status: 'pending',
      user_id: signedIn ? user!.id : null,
      user_name: resolvedName,
    })

  if (dbError) {
    // Tenta remover o arquivo do storage para não deixar órfão
    await admin.storage.from('galeria').remove([filename])
    return { success: false, error: 'Erro ao salvar foto. Tente novamente.' }
  }

  return { success: true }
}
