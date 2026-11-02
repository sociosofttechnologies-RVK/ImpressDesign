import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Close } from './Icon.jsx';
import { api } from '../lib/api.js';
import {
  GARMENTS, FONTS, INK, fontCss, garmentBaseMarkup, garmentShadeMarkup, hasContent, layout, luminance, ensureFonts, previewFromFile,
} from '../lib/garments.js';

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES = 15 * 1024 * 1024;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/** Re-renders when web fonts finish loading, so text measured with a fallback font is re-fitted. */
function useFontTick(designs) {
  const [tick, setTick] = useState(0);
  const key = Object.values(designs).filter((d) => d?.kind === 'text').map((d) => `${d.font}${d.bold ? 'b' : ''}`).join();
  useEffect(() => {
    let live = true;
    ensureFonts(Object.values(designs).filter(Boolean)).then(() => live && setTick((t) => t + 1));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return tick;
}

/**
 * Live garment preview. Interactive mode: click a print area to select it, drag the artwork to move it,
 * drag the corner handle to resize.
 */
export function GarmentPreview({ kind, side, colors, designs, activeZone, onSelectZone, onChange, interactive = false, showZones = true, className = '' }) {
  const g = GARMENTS[kind];
  const [vw, vh] = g.viewBox;
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef(null);
  const drag = useRef(null);
  useFontTick(designs);
  const zones = g.zones.filter((z) => z.side === side).sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]);

  const toSvg = (e) => {
    const m = svgRef.current.getScreenCTM().inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const start = (e, zone, mode) => {
    if (!interactive) return;
    e.stopPropagation();
    if (zone.id !== activeZone) { onSelectZone?.(zone.id); return; }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const d = designs[zone.id];
    const p = toSvg(e);
    const L = layout(d, zone);
    drag.current = { mode, zone, p, x: d.x || 0, y: d.y || 0, scale: d.scale ?? 0.9, dist: Math.hypot(p.x - L.cx, p.y - L.cy) || 1, cx: L.cx, cy: L.cy, fw: Math.max(1, zone.box[2] - L.w), fh: Math.max(1, zone.box[3] - L.h) };
  };
  const move = (e) => {
    const s = drag.current;
    if (!s) return;
    const p = toSvg(e);
    if (s.mode === 'move') onChange?.(s.zone.id, { x: clamp(s.x + (p.x - s.p.x) / s.fw, -0.5, 0.5), y: clamp(s.y + (p.y - s.p.y) / s.fh, -0.5, 0.5) });
    else onChange?.(s.zone.id, { scale: clamp((s.scale * Math.hypot(p.x - s.cx, p.y - s.cy)) / s.dist, 0.1, 1) });
  };
  const end = () => { drag.current = null; };

  return (
    <svg ref={svgRef} className={`gprev ${className}`} viewBox={`0 0 ${vw} ${vh}`} role="img" aria-label={`${g.name} ${side.toLowerCase()} preview`}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <defs>
        <clipPath id={`${uid}-body`}><path d={g.sides[side].body} /></clipPath>
        {zones.map((z) => <clipPath key={z.id} id={`${uid}-${z.id}`}><rect x={z.box[0]} y={z.box[1]} width={z.box[2]} height={z.box[3]} /></clipPath>)}
      </defs>
      <g dangerouslySetInnerHTML={{ __html: garmentBaseMarkup(kind, side, colors) }} />
      {interactive && zones.map((z) => (
        <rect key={z.id} x={z.box[0]} y={z.box[1]} width={z.box[2]} height={z.box[3]} fill="transparent" className="ds-hit"
          onPointerDown={(e) => { e.stopPropagation(); if (z.id !== activeZone) onSelectZone?.(z.id); }} />
      ))}
      <g clipPath={`url(#${uid}-body)`}>
        {zones.map((z) => {
          const d = designs[z.id];
          if (!hasContent(d)) return null;
          const L = layout(d, z);
          const on = interactive && z.id === activeZone;
          return (
            <g key={z.id} clipPath={`url(#${uid}-${z.id})`}>
              <g transform={`translate(${L.cx} ${L.cy}) rotate(${d.rotate || 0})`} className={interactive ? 'ds-art' : undefined}
                onPointerDown={(e) => start(e, z, 'move')}>
                {d.kind === 'image'
                  ? <image href={d.src} x={-L.w / 2} y={-L.h / 2} width={L.w} height={L.h} preserveAspectRatio="xMidYMid meet" />
                  : (
                    <text textAnchor="middle" fontFamily={`${fontCss(d.font)}, sans-serif`} fontWeight={d.bold ? 700 : 400} fontSize={L.fs} fill={d.color}>
                      {L.lines.map((ln, i) => <tspan key={i} x="0" y={-L.h / 2 + (i + 0.5) * L.lineH} dominantBaseline="central">{ln || ' '}</tspan>)}
                    </text>
                  )}
                {on && <rect x={-L.w / 2 - 2} y={-L.h / 2 - 2} width={L.w + 4} height={L.h + 4} fill="none" stroke="#c41c00" strokeWidth="1" strokeDasharray="4 3" pointerEvents="none" />}
              </g>
            </g>
          );
        })}
      </g>
      <g style={{ mixBlendMode: 'multiply' }} pointerEvents="none" dangerouslySetInnerHTML={{ __html: garmentShadeMarkup(kind, side, uid) }} />
      {showZones && zones.filter((z) => showZones !== 'active' || z.id === activeZone).map((z) => {
        const on = z.id === activeZone;
        const [x, y, w, h] = z.box;
        return (
          <g key={z.id} className={`ds-zone ${on ? 'is-on' : ''}`} pointerEvents="none">
            <rect x={x} y={y} width={w} height={h} rx="3" />
            {on && interactive && <text x={x + 4} y={y - 5} className="ds-zone__label">{z.label}</text>}
          </g>
        );
      })}
      {interactive && activeZone && hasContent(designs[activeZone]) && zones.some((z) => z.id === activeZone) && (() => {
        const z = zones.find((x) => x.id === activeZone);
        const d = designs[activeZone];
        const L = layout(d, z);
        const r = ((d.rotate || 0) * Math.PI) / 180;
        const hx = L.cx + (L.w / 2) * Math.cos(r) - (L.h / 2) * Math.sin(r);
        const hy = L.cy + (L.w / 2) * Math.sin(r) + (L.h / 2) * Math.cos(r);
        return <circle className="ds-handle" cx={hx} cy={hy} r="7" onPointerDown={(e) => start(e, z, 'scale')} aria-label="Resize" />;
      })()}
    </svg>
  );
}

// ------------------------------------------------------------------ 3D cap
const loadCap3d = () => import('../lib/cap3d.js');

/**
 * Rotatable 3D cap. Drag to turn it in any direction; in interactive mode click a print area to select it and
 * drag the artwork to move it. `view` + `viewKey` turn the camera to Front / Left / Back / Right / Top.
 */
export function Cap3D({ colors, designs, activeZone = null, guides = false, view = 'Front', viewKey = 0, autoRotate = false, interactive = false, onSelectZone, onChange, className = '' }) {
  const box = useRef(null);
  const viewer = useRef(null);
  const cbs = useRef({});
  cbs.current = { onSelectZone, onChange };
  const [state, setState] = useState('loading');
  const latest = useRef({});
  latest.current = { colors, designs, active: activeZone, guides };

  useEffect(() => {
    let live = true;
    loadCap3d().then((m) => {
      if (!live || !box.current) return;
      try {
        viewer.current = m.createCapViewer(box.current, {
          interactive,
          onSelectZone: (id) => cbs.current.onSelectZone?.(id),
          onChange: (id, p) => cbs.current.onChange?.(id, p),
        });
        viewer.current.update(latest.current);
        viewer.current.setAutoRotate(autoRotate);
        setState('ready');
      } catch (e) {
        console.error('[cap3d]', e);
        setState('error');
      }
    }).catch(() => live && setState('error'));
    return () => { live = false; viewer.current?.dispose(); viewer.current = null; };
  }, [interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { viewer.current?.update({ colors, designs, active: activeZone, guides }); }, [colors, designs, activeZone, guides]);
  useEffect(() => { viewer.current?.setView(view); }, [view, viewKey]);
  useEffect(() => { viewer.current?.setAutoRotate(autoRotate); }, [autoRotate]);

  return (
    <div ref={box} className={`cap3d ${className}`} role="img" aria-label="3D cap preview — drag to turn">
      {state === 'loading' && <span className="cap3d__msg muted small">Loading 3D preview…</span>}
      {state === 'error' && <span className="cap3d__msg muted small">3D preview is not available in this browser.</span>}
    </div>
  );
}

/** Small rendered picture of each cap print zone (re-rendered shortly after the design changes). */
export function useCapThumbs(colors, designs, enabled = true) {
  const [thumbs, setThumbs] = useState({});
  const key = JSON.stringify([colors, Object.entries(designs || {}).map(([k, d]) => [k, d && { ...d, src: d.src ? d.src.length + d.src.slice(-32) : '' }])]);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const t = setTimeout(() => {
      loadCap3d().then((m) => m.renderZoneThumbs(colors, designs)).then((r) => live && setThumbs(r)).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return thumbs;
}

/** Thumbnail of one print zone with that zone highlighted. */
export function ZoneThumb({ kind, zone, designs, colors, thumbs }) {
  if (GARMENTS[kind].three) return thumbs?.[zone.id] ? <img className="zthumb" src={thumbs[zone.id]} alt="" /> : <span className="zthumb zthumb--blank" />;
  return <GarmentPreview kind={kind} side={zone.side} colors={colors} designs={designs} activeZone={zone.id} showZones="active" />;
}

/** Read-only preview of a whole design: 3D cap (drag to turn) or T-shirt front + back. */
export function DesignOverview({ kind, colors, designs, autoRotate = true }) {
  const g = GARMENTS[kind];
  if (g.three) return <Cap3D colors={colors} designs={designs} autoRotate={autoRotate} className="cap3d--overview" />;
  return Object.keys(g.sides).map((s) => (
    <figure key={s}>
      <GarmentPreview kind={kind} side={s} colors={colors} designs={designs} showZones={false} />
      <figcaption>{s}</figcaption>
    </figure>
  ));
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <label className="ds-slider">
      <span>{label}<em>{Math.round(value)}{unit}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/**
 * Full design studio: choose print location(s), upload an image or type text for each, move / resize / rotate it,
 * and see the result on the garment in real time.
 *
 * designs: { [zoneId]: { kind:'image'|'text', src, aspect, name, uploadId, text, font, color, bold, x, y, scale, rotate } }
 */
export default function DesignStudio({
  kind, colors, colorOptions, colorIndex, onColor, designs, setDesigns, type, onType, initialZone, onClose, onDone, doneLabel = 'Save design', asPage = false,
}) {
  const g = GARMENTS[kind];
  const sides = Object.keys(g.sides);
  const firstZone = initialZone && g.zones.some((z) => z.id === initialZone) ? initialZone : (g.zones.find((z) => hasContent(designs[z.id])) || g.zones[0]).id;
  const [active, setActive] = useState(firstZone);
  const zone = g.zones.find((z) => z.id === active) || g.zones[0];
  const [side, setSide] = useState(zone.side);
  const [guides, setGuides] = useState(true);
  const [viewKey, setViewKey] = useState(0);
  const [spin, setSpin] = useState(false);
  const is3d = !!g.three;
  const thumbs = useCapThumbs(colors, designs, is3d);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const d = designs[zone.id];
  const ink = luminance(colors?.[0] || '#fff') > 0.55 ? '#000000' : '#ffffff';

  useEffect(() => { setSide(zone.side); setViewKey((k) => k + 1); setSpin(false); setErr(''); }, [zone.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (asPage) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [asPage, onClose]);

  const patch = (id, p) => setDesigns((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  const remove = (id) => setDesigns((prev) => { const n = { ...prev }; delete n[id]; return n; });
  const selectZone = (id) => setActive(id);
  const used = g.zones.filter((z) => hasContent(designs[z.id]));
  const clash = used.filter((z) => z.id !== zone.id && z.side === zone.side && overlaps(z.box, zone.box));

  async function onFile(f) {
    setErr('');
    if (!f) return;
    if (!IMAGE_TYPES.split(',').includes(f.type)) { setErr('Use a PNG, JPG, WebP or SVG image.'); return; }
    if (f.size > MAX_BYTES) { setErr('That file is larger than 15 MB.'); return; }
    const id = zone.id;
    try {
      const pv = await previewFromFile(f);
      setDesigns((prev) => ({ ...prev, [id]: { kind: 'image', ...pv, name: f.name, uploading: true, scale: 0.9, x: 0, y: 0, rotate: 0 } }));
      if (pv.px && Math.max(...pv.px) < 600 && f.type !== 'image/svg+xml') setErr(`Low resolution (${pv.px[0]}×${pv.px[1]} px) — the print may look blurry. 1500 px or more is best.`);
    } catch {
      setErr('This image could not be read.');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await api('/uploads', { method: 'POST', form: fd });
      setDesigns((prev) => (prev[id]?.name === f.name ? { ...prev, [id]: { ...prev[id], uploading: false, uploadId: r.id, error: '' } } : prev));
    } catch (e) {
      setDesigns((prev) => (prev[id]?.name === f.name ? { ...prev, [id]: { ...prev[id], uploading: false, error: e.message } } : prev));
    }
  }
  const startText = () => setDesigns((prev) => ({ ...prev, [zone.id]: { kind: 'text', text: '', font: 'bebas', color: ink, bold: false, scale: 0.9, x: 0, y: 0, rotate: 0 } }));

  const body = (
    <div className={`studio ${asPage ? 'studio--page' : ''}`} role={asPage ? undefined : 'dialog'} aria-label="Design studio" onClick={(e) => e.stopPropagation()}>
      {!asPage && (
        <div className="studio__head">
          <h2 className="h2">Design your {g.name.toLowerCase()}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Close /></button>
        </div>
      )}
      <div className="studio__grid">
        <div className="studio__stage">
          <div className="studio__bar">
            <div className="seg seg--sm" role="tablist" aria-label="Garment side">
              {sides.map((s) => {
                const n = used.filter((z) => z.side === s).length;
                return (
                  <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'is-on' : ''}
                    onClick={() => { setSide(s); setViewKey((k) => k + 1); setSpin(false); if (zone.side !== s) setActive((g.zones.find((z) => z.side === s && hasContent(designs[z.id])) || g.zones.find((z) => z.side === s)).id); }}>
                    {s}{n ? ` · ${n}` : ''}
                  </button>
                );
              })}
              {is3d && <button role="tab" aria-selected={spin} className={spin ? 'is-on' : ''} onClick={() => setSpin((v) => !v)} title="Turn the cap continuously">360°</button>}
            </div>
            <label className="check small"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Show print areas</label>
          </div>
          <div className="studio__canvas">
            {is3d ? (
              <Cap3D colors={colors} designs={designs} activeZone={zone.id} guides={guides} view={side} viewKey={viewKey} autoRotate={spin} interactive
                onSelectZone={selectZone} onChange={patch} className="cap3d--stage" />
            ) : (
              <GarmentPreview kind={kind} side={side} colors={colors} designs={designs} activeZone={zone.id} interactive showZones={guides}
                onSelectZone={selectZone} onChange={patch} />
            )}
          </div>
          <p className="muted small studio__tip">
            {is3d
              ? 'Drag the cap to turn it in any direction · tap a print area to select it · drag your design to move it · scroll or pinch to zoom.'
              : 'Tap a print area to select it · drag your design to move it · drag the red dot to resize.'}
          </p>
          {colorOptions?.length > 1 && (
            <div className="studio__colors" role="group" aria-label="Garment colour">
              {colorOptions.map((c, i) => (
                <button key={c.name} className={`dot ${i === colorIndex ? 'is-on' : ''}`} title={c.name} aria-label={c.name} aria-pressed={i === colorIndex}
                  style={{ background: c.hex.length > 1 ? `linear-gradient(90deg, ${c.hex[0]} 50%, ${c.hex[1]} 50%)` : c.hex[0] }} onClick={() => onColor(i)} />
              ))}
            </div>
          )}
        </div>

        <div className="studio__panel">
          {onType && (
            <div className="studio__section">
              <h3 className="studio__h">Technique</h3>
              <div className="seg seg--sm" role="radiogroup" aria-label="Customisation type">
                {['Printing', 'Embroidery'].map((t) => <button key={t} role="radio" aria-checked={type === t} className={type === t ? 'is-on' : ''} onClick={() => onType(t)}>{t}</button>)}
              </div>
              {type === 'Embroidery' && <p className="muted small">Embroidery suits logos and text with solid colours; very fine detail and gradients are simplified.</p>}
            </div>
          )}

          <div className="studio__section">
            <h3 className="studio__h">Print location</h3>
            {sides.map((s) => (
              <div key={s} className="zlist">
                <span className="zlist__side">{s}</span>
                {g.zones.filter((z) => z.side === s).map((z) => {
                  const dz = designs[z.id];
                  return (
                    <button key={z.id} className={`zitem ${z.id === zone.id ? 'is-on' : ''}`} aria-pressed={z.id === zone.id} onClick={() => selectZone(z.id)}>
                      <span className="zitem__mini" aria-hidden="true">
                        <ZoneThumb kind={kind} zone={z} designs={designs} colors={colors} thumbs={thumbs} />
                      </span>
                      <span className="zitem__txt"><strong>{z.label}</strong><span className="muted small">{z.hint}</span></span>
                      <span className={`zitem__state ${hasContent(dz) ? 'is-set' : ''}`}>{hasContent(dz) ? (dz.kind === 'image' ? 'Image' : 'Text') : 'Empty'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="studio__section">
            <h3 className="studio__h">{zone.label}</h3>
            {clash.length > 0 && <p className="pdp__notice small">This area overlaps your design on “{clash.map((z) => z.label).join(', ')}”. Both will be printed.</p>}
            {!d && (
              <div className="ds-start">
                <button className="ds-start__btn" onClick={() => fileRef.current?.click()}><span className="ds-ico" aria-hidden="true">⤒</span>Upload image<small>PNG, JPG, SVG, WebP</small></button>
                <button className="ds-start__btn" onClick={startText}><span className="ds-ico" aria-hidden="true">T</span>Add text<small>Names, slogans, numbers</small></button>
              </div>
            )}
            <input ref={fileRef} type="file" accept={IMAGE_TYPES} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />

            {d?.kind === 'image' && (
              <div className="ds-edit">
                <div className="ds-file">
                  <img src={d.src} alt="" />
                  <div>
                    <strong className="ds-file__name">{d.name}</strong>
                    <span className="muted small">{d.uploading ? 'Uploading…' : d.uploadId ? 'Uploaded ✓' : d.error ? 'Not uploaded yet — we retry when you add to cart' : 'Will upload with your order'}</span>
                  </div>
                  <button className="link" onClick={() => fileRef.current?.click()}>Replace</button>
                </div>
              </div>
            )}

            {d?.kind === 'text' && (
              <div className="ds-edit">
                <label className="ds-field">Your text
                  <textarea rows={2} maxLength={80} value={d.text} autoFocus placeholder="Type here…"
                    onChange={(e) => patch(zone.id, { text: e.target.value.split('\n').slice(0, 4).join('\n') })} />
                </label>
                <label className="ds-field">Font
                  <select value={d.font} onChange={(e) => patch(zone.id, { font: e.target.value })} style={{ fontFamily: fontCss(d.font) }}>
                    {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.label}</option>)}
                  </select>
                </label>
                <div className="ds-field">Colour
                  <div className="ds-inks">
                    {INK.map((c) => <button key={c} className={`ds-ink ${d.color === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={d.color === c} onClick={() => patch(zone.id, { color: c })} />)}
                    <label className="ds-ink ds-ink--custom" title="Custom colour"><input type="color" value={d.color} onChange={(e) => patch(zone.id, { color: e.target.value })} aria-label="Custom colour" /></label>
                  </div>
                </div>
                <label className="check small"><input type="checkbox" checked={!!d.bold} onChange={(e) => patch(zone.id, { bold: e.target.checked })} /> Bold</label>
              </div>
            )}

            {hasContent(d) || d?.kind === 'text' ? (
              <div className="ds-edit">
                <Slider label="Size" unit="%" min={10} max={100} value={(d.scale ?? 0.9) * 100} onChange={(v) => patch(zone.id, { scale: v / 100 })} />
                <Slider label="Rotate" unit="°" min={-45} max={45} value={d.rotate || 0} onChange={(v) => patch(zone.id, { rotate: v })} />
                <div className="ds-row">
                  <button className="btn btn--outline btn--sm" onClick={() => patch(zone.id, { x: 0, y: 0, rotate: 0 })}>Centre</button>
                  <button className="btn btn--outline btn--sm" onClick={() => remove(zone.id)}>Remove</button>
                </div>
              </div>
            ) : null}
            {err && <p className="pdp__notice small">{err}</p>}
          </div>

          <div className="studio__foot">
            <p className="small">
              {used.length ? <><strong>{used.length}</strong> print location{used.length === 1 ? '' : 's'}: {used.map((z) => z.label).join(', ')}</> : <span className="muted">No design yet — pick a location and add an image or text.</span>}
            </p>
            {onDone && <button className="btn btn--primary btn--lg btn--block" onClick={onDone} disabled={Object.values(designs).some((x) => x?.uploading)}>{doneLabel}</button>}
          </div>
        </div>
      </div>
    </div>
  );

  if (asPage) return body;
  return <div className="overlay overlay--center overlay--studio" onClick={onClose}>{body}</div>;
}

/** Design draft per garment kind, kept for the browser session so it follows the customer between products. */
export function useDesignDraft(kind) {
  const key = `impress-studio-${kind || 'none'}`;
  const read = () => {
    if (!kind) return {};
    try {
      const v = JSON.parse(sessionStorage.getItem(key)) || {};
      for (const k of Object.keys(v)) if (v[k]?.uploading) v[k] = { ...v[k], uploading: false };
      return v;
    } catch { return {}; }
  };
  const [designs, setDesigns] = useState(read);
  useEffect(() => { setDesigns(read()); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!kind) return;
    try { sessionStorage.setItem(key, JSON.stringify(designs)); } catch { /* quota or storage unavailable: the draft just isn't kept */ }
  }, [key, designs, kind]);
  return [designs, setDesigns];
}

/** Images that never reached the server (offline, or a reloaded draft) are uploaded from their preview copy. */
export async function ensureUploaded(designs, setDesigns) {
  const out = { ...designs };
  for (const [id, d] of Object.entries(designs)) {
    if (d?.kind !== 'image' || d.uploadId || !d.src) continue;
    try {
      const blob = await (await fetch(d.src)).blob();
      const fd = new FormData();
      fd.append('file', blob, /\.\w+$/.test(d.name || '') ? d.name.replace(/\.\w+$/, blob.type === 'image/svg+xml' ? '.svg' : '.png') : 'artwork.png');
      const r = await api('/uploads', { method: 'POST', form: fd });
      out[id] = { ...d, uploadId: r.id, error: '' };
    } catch (e) {
      out[id] = { ...d, error: e.message };
    }
  }
  setDesigns?.(out);
  return out;
}

export const useDesignSummary = (kind, designs) => useMemo(() => (kind ? GARMENTS[kind].zones.filter((z) => hasContent(designs[z.id])) : []), [kind, designs]);
