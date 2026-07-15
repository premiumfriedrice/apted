"use client";

import { useEffect, useRef, useState } from "react";

// Shared dark-pane PDF canvas viewer used by the master resume editor and the
// resume detail page. Renders PDF pages to <canvas> via pdfjs-dist with zoom,
// page navigation, and ctrl+wheel zoom — matching the master preview pane.

const previewIconBtnCls =
  "p-2 text-inverse-on-surface hover:bg-white/10 transition-colors duration-200 rounded disabled:opacity-30";

type PdfSrc = string | Uint8Array;

export function PdfPreviewPane({
  src,
  ready,
  width,
  headerExtra,
  actionsExtra,
}: {
  /** URL string or raw PDF bytes. */
  src: PdfSrc | null;
  /** When false, shows a "Loading preview…" placeholder and skips loading. */
  ready: boolean;
  /** Pane width as a percentage of the parent flex container. */
  width: number;
  /** Optional content rendered on the left of the top bar (e.g. filename). */
  headerExtra?: React.ReactNode;
  /** Optional content rendered on the right of the top bar, before page/zoom. */
  actionsExtra?: React.ReactNode;
}) {
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Load PDF and fit first page to viewer width.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!src) return;
      setLoading(true);
      setError(null);
      setPage(1);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const params = typeof src === "string" ? src : { data: new Uint8Array(src) };
        const doc = await pdfjsLib.getDocument(params).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        const container = viewerRef.current;
        if (container) {
          const firstPage = await doc.getPage(1);
          const unscaled = firstPage.getViewport({ scale: 1 });
          const targetWidth = container.clientWidth - 48;
          if (targetWidth > 0 && unscaled.width > 0) {
            setZoom(Math.round((targetWidth / unscaled.width) * 100));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load PDF");
      } finally {
        setLoading(false);
      }
    }
    if (ready) load();
    return () => { cancelled = true; };
  }, [src, ready]);

  // Render all pages at current zoom with device-pixel-ratio scaling.
  // Depends on `loading` too: the <canvas> elements are only mounted once
  // loading flips false, so rendering before that hits null refs and draws
  // nothing — leaving blank white boxes until a zoom change re-triggers.
  useEffect(() => {
    if (!pdf || numPages === 0 || loading) return;
    let cancelled = false;
    async function renderAll() {
      const dpr = window.devicePixelRatio || 1;
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        const canvas = pageRefs.current[i - 1];
        if (!canvas) continue;
        const pg = await pdf.getPage(i);
        const viewport = pg.getViewport({ scale: (zoom / 100) * dpr });
        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const offCtx = offscreen.getContext("2d")!;
        await pg.render({ canvasContext: offCtx, viewport }).promise;
        if (cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(offscreen, 0, 0);
      }
    }
    renderAll();
    return () => { cancelled = true; };
  }, [pdf, zoom, numPages, loading]);

  // Track the currently visible page from scroll position.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || numPages === 0) return;
    const root = el;
    function onScroll() {
      const top = root.scrollTop + 24;
      let best = 0;
      pageRefs.current.forEach((canvas, i) => {
        if (!canvas) return;
        if (canvas.offsetTop <= top) best = i;
      });
      setPage(best + 1);
    }
    root.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener("scroll", onScroll);
  }, [pdf, numPages, zoom]);

  // Trackpad / ctrl+wheel zoom inside the viewer.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -3 : 3;
        setZoom((z) => Math.max(25, Math.min(300, z + delta)));
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function scrollToPage(p: number) {
    const canvas = pageRefs.current[Math.max(0, Math.min(numPages - 1, p - 1))];
    if (canvas && viewerRef.current) {
      canvas.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="hidden lg:flex flex-col bg-inverse-surface relative" style={{ width: `${width}%` }}>
      <div className="h-12 border-b border-inverse-on-surface/10 bg-inverse-surface flex items-center justify-between px-md sticky top-0 z-10">
        {headerExtra ?? <span className="text-label-md font-label-md text-inverse-on-surface font-semibold">Preview</span>}
        <div className="flex items-center gap-1">
          {actionsExtra}
          <button
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 1 || !pdf}
            className={previewIconBtnCls}
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-inverse-on-surface/10 text-body-sm font-body-sm text-inverse-on-surface min-w-[4rem] justify-center">
            {page}<span className="text-inverse-on-surface/60">/</span>{numPages || "-"}
          </div>
          <button
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= (numPages || 1) || !pdf}
            className={previewIconBtnCls}
            aria-label="Next page"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <div className="w-px h-5 bg-inverse-on-surface/20 mx-1" />
          <button
            onClick={() => setZoom((z) => Math.max(25, z - 25))}
            disabled={!pdf}
            className={previewIconBtnCls}
            aria-label="Zoom out"
          >
            <span className="material-symbols-outlined text-[18px]">remove</span>
          </button>
          <span className="text-body-sm font-body-sm text-inverse-on-surface min-w-[3rem] text-center">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(300, z + 25))}
            disabled={!pdf}
            className={previewIconBtnCls}
            aria-label="Zoom in"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>
      <div ref={viewerRef} className="flex-1 overflow-auto bg-inverse-surface">
        {ready ? (
          loading ? (
            <div className="w-full h-full flex items-center justify-center text-body-sm text-inverse-on-surface/70">
              Loading preview…
            </div>
          ) : error ? (
            <div className="w-full h-full flex items-center justify-center text-body-sm text-error px-8 text-center">
              {error}
            </div>
          ) : (
            <div className="min-w-full w-fit flex flex-col items-center py-6 gap-4">
              {Array.from({ length: numPages }, (_, i) => (
                <canvas
                  key={i}
                  ref={(el) => { pageRefs.current[i] = el; }}
                  className="bg-white shadow-2xl shrink-0"
                />
              ))}
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-body-sm text-inverse-on-surface/70">
            Loading preview…
          </div>
        )}
      </div>
    </div>
  );
}
