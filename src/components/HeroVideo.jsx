import { useEffect, useRef, useState } from 'react';

// Hero background: the designer's two montages play in turn with a cross-fade, muted and inline.
// Always autoplays (muted + playsInline satisfies browser autoplay policies). A pause button stays
// available for visitors who want motion off. Pauses off-screen and in background tabs.
const CLIPS = [
  { name: 'hero-workshop', poster: '/videos/hero-workshop.jpg' },
  { name: 'hero-sewing', poster: '/videos/hero-sewing.jpg' },
];

// React does not reliably emit the `muted` attribute, and browsers only allow autoplay for
// muted media — so force it on the element itself before every play() call.
const forceMuted = (v) => {
  if (!v) return;
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute('muted', '');
};

export default function HeroVideo() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true); // false only when the visitor presses Pause
  const refs = [useRef(null), useRef(null)];
  const wrap = useRef(null);
  const visible = useRef(true);

  const tryPlay = (v) => {
    if (!v) return;
    forceMuted(v);
    const p = v.play();
    // If the browser still blocks autoplay (e.g. power-saver mode), start on the first interaction.
    if (p?.catch) {
      p.catch(() => {
        const resume = () => {
          forceMuted(v);
          v.play().catch(() => {});
          ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) => window.removeEventListener(e, resume));
        };
        ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) =>
          window.addEventListener(e, resume, { once: true, passive: true }),
        );
      });
    }
  };

  useEffect(() => { refs.forEach((r) => forceMuted(r.current)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Play the active clip, rewind the other one so it is ready for the next turn.
  useEffect(() => {
    const cur = refs[active].current, other = refs[1 - active].current;
    if (other) { other.pause(); other.currentTime = 0; other.preload = 'auto'; }
    if (cur && playing && visible.current && !document.hidden) tryPlay(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playing]);

  // Pause while scrolled out of view or the tab is hidden.
  useEffect(() => {
    if (!wrap.current) return undefined;
    const sync = () => {
      const v = refs[active].current;
      if (!v) return;
      if (playing && visible.current && !document.hidden) tryPlay(v); else v.pause();
    };
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; sync(); });
    io.observe(wrap.current);
    document.addEventListener('visibilitychange', sync);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playing]);

  const toggle = () => {
    const v = refs[active].current;
    if (playing) v?.pause(); else tryPlay(v);
    setPlaying(!playing);
  };

  return (
    <div className="hero__video" ref={wrap}>
      {CLIPS.map((c, i) => (
        <video
          key={c.name}
          ref={refs[i]}
          className={i === active ? 'is-on' : ''}
          poster={c.poster}
          aria-hidden="true"
          muted
          playsInline
          autoPlay={i === 0}
          preload={i === 0 ? 'auto' : 'none'}
          onEnded={() => setActive((a) => (a + 1) % CLIPS.length)}
        >
          {/* WebM (VP9) first: smaller, and plays in browsers without H.264; MP4 for Safari/iOS. */}
          <source src={`/videos/${c.name}.webm`} type="video/webm" />
          <source src={`/videos/${c.name}.mp4`} type="video/mp4" />
        </video>
      ))}
      <button type="button" className="hero__toggle" onClick={toggle} aria-label={playing ? 'Pause background video' : 'Play background video'}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>
        )}
      </button>
    </div>
  );
}
