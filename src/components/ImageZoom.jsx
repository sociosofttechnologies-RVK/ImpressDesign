import { useCallback, useEffect, useRef, useState } from 'react';
import ProductImage from './ProductImage.jsx';
import { Chevron, Close } from './Icon.jsx';

const ZOOM = 2.5; // magnification in the hover pane
const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches;

/**
 * Main product photo with an e-commerce style magnifier:
 *  - desktop: hover shows a lens on the photo and a zoomed pane beside it
 *  - everywhere: click/tap opens a full-screen viewer (prev/next, click-to-zoom, drag to pan)
 */
export default function ImageZoom({ gallery, index, onIndex, alt, label }) {
  const item = gallery[index];
  const boxRef = useRef(null);
  const imgRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(null); // { lens: {x,y,w,h}, bg: {x,y,w,h} }
  const [viewer, setViewer] = useState(false);
  const [hoverOk, setHoverOk] = useState(canHover);

  useEffect(() => { setFailed(false); setHover(null); }, [item?.url]);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
    const on = () => setHoverOk(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // Rectangle the photo actually occupies inside the square box (object-fit: contain leaves margins).
  const imageRect = () => {
    const box = boxRef.current.getBoundingClientRect();
    const img = imgRef.current;
    const nw = img?.naturalWidth || 1, nh = img?.naturalHeight || 1;
    const scale = Math.min(box.width / nw, box.height / nh);
    const w = nw * scale, h = nh * scale;
    return { box, x: (box.width - w) / 2, y: (box.height - h) / 2, w, h };
  };

  const onMove = (e) => {
    if (!hoverOk || failed || !imgRef.current?.complete) return;
    const r = imageRect();
    const px = e.clientX - r.box.left - r.x, py = e.clientY - r.box.top - r.y;
    if (px < 0 || py < 0 || px > r.w || py > r.h) { setHover(null); return; }
    const pane = r.box.width; // the zoom pane is as large as the photo box
    const lw = Math.min(r.w, pane / ZOOM), lh = Math.min(r.h, pane / ZOOM);
    const lx = Math.max(0, Math.min(r.w - lw, px - lw / 2)), ly = Math.max(0, Math.min(r.h - lh, py - lh / 2));
    setHover({
      lens: { x: r.x + lx, y: r.y + ly, w: lw, h: lh },
      bg: { w: r.w * ZOOM, h: r.h * ZOOM, x: -lx * ZOOM, y: -ly * ZOOM },
    });
  };

  if (!item) return null;
  return (
    <>
      <div
        ref={boxRef}
        className={`zoom ${failed ? '' : 'zoom--ready'}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => !failed && setViewer(true)}
        onKeyDown={(e) => { if (!failed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setViewer(true); } }}
        role={failed ? undefined : 'button'}
        tabIndex={failed ? undefined : 0}
        aria-label={failed ? undefined : `${alt} — open full-screen view`}
      >
        {failed ? (
          <ProductImage src={null} alt={alt} label={label} />
        ) : (
          <img ref={imgRef} className="pimg" src={item.url} alt={alt} onError={() => setFailed(true)} draggable={false} />
        )}
        {hover && <span className="zoom__lens" style={{ left: hover.lens.x, top: hover.lens.y, width: hover.lens.w, height: hover.lens.h }} />}
        {hover && (
          <div
            className="zoom__pane"
            aria-hidden="true"
            style={{ backgroundImage: `url("${item.url}")`, backgroundSize: `${hover.bg.w}px ${hover.bg.h}px`, backgroundPosition: `${hover.bg.x}px ${hover.bg.y}px` }}
          />
        )}
      </div>
      {!failed && <p className="zoom__hint muted small">{hoverOk ? 'Hover to zoom · click to enlarge' : 'Tap to enlarge'}</p>}
      {viewer && <Viewer gallery={gallery} index={index} onIndex={onIndex} alt={alt} onClose={() => setViewer(false)} />}
    </>
  );
}

function Viewer({ gallery, index, onIndex, alt, onClose }) {
  const [zoomed, setZoomed] = useState(false);
  const stage = useRef(null);
  const item = gallery[index];
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const go = useCallback((d) => { setZoomed(false); onIndex((index + d + gallery.length) % gallery.length); }, [index, gallery.length, onIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  // Zoom in at the clicked point, then pan by moving the mouse (touch: drag scrolls the stage).
  const toggleZoom = (e) => {
    const el = stage.current;
    const rect = el.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    setZoomed((z) => {
      if (!z) requestAnimationFrame(() => { el.scrollLeft = fx * (el.scrollWidth - el.clientWidth); el.scrollTop = fy * (el.scrollHeight - el.clientHeight); });
      return !z;
    });
  };
  const pan = (e) => {
    if (!zoomed || e.pointerType !== 'mouse') return;
    const el = stage.current, rect = el.getBoundingClientRect();
    el.scrollLeft = ((e.clientX - rect.left) / rect.width) * (el.scrollWidth - el.clientWidth);
    el.scrollTop = ((e.clientY - rect.top) / rect.height) * (el.scrollHeight - el.clientHeight);
  };

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${alt} — photo ${index + 1} of ${gallery.length}`}>
      <div className="viewer__bar">
        <span className="viewer__count">{index + 1} / {gallery.length} · {item.label}</span>
        <span className="muted small">{(touch ? 'Tap' : 'Click') + (zoomed ? ' to zoom out' : ' the photo to zoom')}{touch && zoomed ? ' · drag to move' : ''}</span>
        <button className="icon-btn viewer__close" aria-label="Close" onClick={onClose}><Close size={22} /></button>
      </div>
      <div ref={stage} className={`viewer__stage ${zoomed ? 'is-zoomed' : ''}`} onPointerMove={pan}>
        <img src={item.url} alt={alt} onClick={toggleZoom} draggable={false} />
      </div>
      {gallery.length > 1 && (
        <>
          <button className="viewer__nav viewer__nav--prev" aria-label="Previous photo" onClick={() => go(-1)}><Chevron dir="left" size={26} /></button>
          <button className="viewer__nav viewer__nav--next" aria-label="Next photo" onClick={() => go(1)}><Chevron dir="right" size={26} /></button>
          <div className="viewer__thumbs">
            {gallery.map((g, i) => (
              <button key={g.url} className={`thumb ${i === index ? 'is-on' : ''}`} aria-label={`${g.label} view`} aria-pressed={i === index} onClick={() => { setZoomed(false); onIndex(i); }}>
                <ProductImage src={g.url} alt="" label={g.label} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
