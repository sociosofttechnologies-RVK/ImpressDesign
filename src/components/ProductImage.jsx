import { useEffect, useState } from 'react';

// Product photos are served from the supplier CDN; show a neutral tile if one fails to load.
export default function ProductImage({ src, alt, label, className = '', eager = false }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);
  if (failed) {
    return <div className={`pimg pimg--fallback ${className}`} role="img" aria-label={alt}><span>{label}</span></div>;
  }
  return <img className={`pimg ${className}`} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />;
}
