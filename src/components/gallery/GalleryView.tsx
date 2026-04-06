'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, Camera, X, Upload, Images } from 'lucide-react'
import { toast } from 'sonner'
import { compressImageToWebP } from '@/lib/image-utils'
import { submitClientGalleryPhoto } from '@/app/galeria/actions'
import type { GalleryPhoto } from '@/lib/supabase/types'

interface Props {
  photos: GalleryPhoto[]
  allowClientUploads: boolean
  userId: string | null
  userName: string | null
}

export function GalleryView({ photos, allowClientUploads, userId, userName }: Props) {
  const [uploading, setUploading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [nameInput, setNameInput] = useState(userName ?? '')
  const [sentSuccess, setSentSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Marquee visível quando há fotos suficientes para loop contínuo
  const showMarquee = photos.length >= 3
  // Duração proporcional à quantidade (mais fotos = scroll mais lento = confortável)
  const marqueeDuration = Math.max(22, photos.length * 5)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setSelectedFile(file)
    setPreviewUrl(url)
    setSentSuccess(false)
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!selectedFile) return
    try {
      setUploading(true)
      const webp = await compressImageToWebP(selectedFile, 1400, 0.82)
      const result = await submitClientGalleryPhoto(webp, 'image/webp', nameInput || undefined)
      if (result.success) {
        setSentSuccess(true)
        toast.success('Foto enviada! Será exibida após aprovação.')
        closeModal()
      } else {
        toast.error(result.error ?? 'Erro ao enviar foto.')
      }
    } catch {
      toast.error('Erro ao processar imagem. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setPreviewUrl(null)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-28 flex flex-col gap-6">

      {/* CSS do marquee — isolado, sem alterar globals */}
      <style>{`
        @keyframes gallery-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .gallery-marquee-track {
          animation: gallery-marquee ${marqueeDuration}s linear infinite;
          will-change: transform;
        }
        .gallery-marquee-wrap:hover .gallery-marquee-track {
          animation-play-state: paused;
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/agendar"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors shrink-0"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="flex flex-col gap-0">
          <h1 className="text-sm font-black uppercase tracking-[0.2em] text-white/85 flex items-center gap-2">
            <Images size={14} className="text-zinc-500" />
            Galeria
          </h1>
          <p className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">
            {photos.length > 0 ? `${photos.length} foto${photos.length !== 1 ? 's' : ''}` : 'Nenhuma foto ainda'}
          </p>
        </div>
      </div>

      {photos.length === 0 ? (
        /* ── Estado vazio ── */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-20 h-20 rounded-full bg-white/3 border border-white/6 flex items-center justify-center">
            <Camera size={32} className="text-zinc-700" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Galeria vazia</p>
            {allowClientUploads && (
              <p className="text-zinc-600 text-xs text-center max-w-52 leading-relaxed">
                Seja o primeiro a compartilhar uma foto do seu corte!
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── Marquee carousel ── */}
          {showMarquee && (
            <div className="gallery-marquee-wrap overflow-hidden -mx-4 relative">
              {/* Gradiente desbotando nas bordas */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-[#09090b] to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-[#09090b] to-transparent z-10 pointer-events-none" />

              <div className="gallery-marquee-track flex gap-3 pl-4" style={{ width: 'max-content' }}>
                {/* Duplica para loop contínuo sem salto */}
                {[...photos, ...photos].map((photo, i) => (
                  <div
                    key={`${photo.id}-${i}`}
                    className="relative shrink-0 rounded-2xl overflow-hidden ring-1 ring-white/[0.07]"
                    style={{ width: 160, height: 210 }}
                  >
                    <Image
                      src={photo.url}
                      alt="Galeria"
                      fill
                      sizes="160px"
                      className="object-cover"
                      loading={i < 6 ? 'eager' : 'lazy'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Grade masonry ── */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-700 font-black mb-4">
              Todas as fotos
            </p>
            {/* CSS columns = masonry sem JS */}
            <div
              style={{
                columns: 2,
                columnGap: 10,
              }}
            >
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative rounded-2xl overflow-hidden ring-1 ring-white/[0.07] group"
                  style={{ breakInside: 'avoid', marginBottom: 10, display: 'block' }}
                >
                  <img
                    src={photo.url}
                    alt="Galeria"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto block"
                  />
                  {/* Overlay com nome ao hover */}
                  {photo.user_name && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-linear-to-t from-black/75 via-black/30 to-transparent translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                      <p className="text-[10px] font-bold text-white/90 truncate">{photo.user_name}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── FAB: Enviar Foto ── */}
      {allowClientUploads && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="fixed bottom-6 right-4 z-50 flex items-center gap-2.5 bg-white text-black font-black text-[11px] uppercase tracking-[0.12em] px-5 h-12 rounded-full shadow-[0_4px_24px_rgba(255,255,255,0.18)] hover:scale-105 active:scale-95 transition-transform"
          >
            <Camera size={15} strokeWidth={2.5} />
            Enviar Foto
          </button>
        </>
      )}

      {/* ── Modal de envio ── */}
      {showModal && (
        <div className="fixed inset-0 z-70 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-[#111] border-t border-white/[0.07] rounded-t-3xl px-6 pt-5 pb-10 flex flex-col gap-5 animate-in slide-in-from-bottom duration-300 max-h-[90dvh] overflow-y-auto">

            {/* Handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-1 mb-1" />

            {/* Fechar */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/8 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={15} />
            </button>

            {/* Título */}
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Compartilhar Foto</p>
              <p className="text-[11px] text-white/35 mt-1 leading-relaxed">
                Sua foto será revisada pelo admin antes de aparecer na galeria.
              </p>
            </div>

            {/* Preview */}
            {previewUrl && (
              <div className="relative w-full rounded-2xl overflow-hidden ring-1 ring-white/10" style={{ aspectRatio: '4/3' }}>
                <Image
                  src={previewUrl}
                  alt="Preview"
                  fill
                  className="object-cover"
                />
              </div>
            )}

            {/* Campo nome opcional */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-600 font-black">
                Seu nome (opcional)
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex: João Silva"
                maxLength={60}
                className="bg-white/4 border border-white/[0.07] text-white h-11 px-4 rounded-xl text-sm outline-none focus:border-white/20 transition-colors placeholder:text-zinc-600"
              />
            </div>

            {/* Botão enviar */}
            <button
              onClick={handleSubmit}
              disabled={uploading || !selectedFile}
              className="w-full h-12 rounded-xl text-xs font-black tracking-[0.15em] uppercase bg-white text-black hover:bg-zinc-100 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/25 border-t-black rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload size={14} strokeWidth={2.5} />
                  Enviar para aprovação
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
