import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProductImage from './ProductImage.jsx';
import { formatPrice, primaryShot, swatchStyle } from '../lib/catalog.js';

const MAX_SWATCHES = 8;

export default function ProductCard({ product: p }) {
  const [ci, setCi] = useState(0);
  const extra = p.colors.length - MAX_SWATCHES;
  return (
    <article className="card">
      <Link to={`/clothing/${p.slug}`} className="card__media" aria-label={`${p.brand} ${p.name}`}>
        <ProductImage src={primaryShot(p, ci)} alt={`${p.name} — ${p.colors[ci].name}`} label={p.id} />
        {!p.active && <span className="tag">Discontinued</span>}
      </Link>
      <div className="card__swatches">
        {p.colors.slice(0, MAX_SWATCHES).map((c, i) => (
          <button key={c.name} className={`dot ${i === ci ? 'is-on' : ''}`} style={swatchStyle(c.hex)} title={c.name} aria-label={c.name} onMouseEnter={() => setCi(i)} onFocus={() => setCi(i)} onClick={() => setCi(i)} />
        ))}
        {extra > 0 && <span className="card__more">+{extra}</span>}
      </div>
      <Link to={`/clothing/${p.slug}`} className="card__text">
        <h3 className="card__brand">{p.brand}</h3>
        <p className="card__name">{p.name}</p>
        <p className="card__desc">{p.description}</p>
        <p className="card__price">From {formatPrice(p.priceFrom)}</p>
      </Link>
    </article>
  );
}
