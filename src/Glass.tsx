import { useEffect } from 'react';
export function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function useGlassSurfaces(home: boolean) {
  useEffect(() => {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}background/glass.webp`;
    let active = true;
    const surfaces = [
      ...document.querySelectorAll<HTMLElement>(
        '.library-top,.library-sidebar,.topbar,.sidebar,.editor-pane,.preview-pane',
      ),
    ];
    const align = () => {
      if (!active || !image.naturalWidth) return;
      const w = window.innerWidth,
        h = window.innerHeight;
      const ratio = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const bw = image.naturalWidth * ratio,
        bh = image.naturalHeight * ratio;
      for (const surface of surfaces) {
        const r = surface.getBoundingClientRect();
        surface.style.setProperty('--glass-size', `${bw}px ${bh}px`);
        surface.style.setProperty('--glass-position', `${(w - bw) / 2 - r.left}px ${(h - bh) / 2 - r.top}px`);
      }
    };
    image.onload = align;
    const observer = new ResizeObserver(align);
    surfaces.forEach((el) => observer.observe(el));
    window.addEventListener('resize', align);
    align();
    return () => {
      active = false;
      image.onload = null;
      observer.disconnect();
      window.removeEventListener('resize', align);
    };
  }, [home]);
}
