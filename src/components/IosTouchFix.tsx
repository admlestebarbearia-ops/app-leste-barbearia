'use client';
import { useEffect } from 'react';

export default function IosTouchFix() {
  useEffect(() => {
    // Força o motor WebKit do iOS antigo a tratar o body como interativo
    document.body.style.cursor = 'pointer';
    (document.body.style as unknown as Record<string, string>).webkitTapHighlightColor = 'transparent';
    const touchFix = () => {};
    document.addEventListener('touchstart', touchFix, { passive: true });
    return () => document.removeEventListener('touchstart', touchFix);
  }, []);
  return null;
}