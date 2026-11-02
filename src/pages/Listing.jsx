import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import Services from '../components/Services.jsx';
import Faq from '../components/Faq.jsx';
import QuoteCta from '../components/QuoteCta.jsx';
import { Chevron } from '../components/Icon.jsx';
import { COLOR_FAMILIES, facets as localFacets } from '../lib/catalog.js';
import { fetchFacets, fetchProducts } from '../lib/products.js';

const PAGE = 12;
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function Group({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fgroup">
      <button className="fgroup__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <Chevron dir={open ? 'up' : 'down'} />
      </button>
      {open && <div className="fgroup__body">{children}</div>}
    </div>
  );
}

const Check = ({ label, checked, onChange }) => (
  <label className="check">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span>{label}</span>
  </label>
);

export default function Listing({ onQuote }) {
  const [params, setParams] = useSearchParams();
  const category = params.get('cat') || '';
  const q = params.get('q') || '';
  const [sizes, setSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [genders, setGenders] = useState([]);
  const [types, setTypes] = useState([]);
  const [eco, setEco] = useState(false);
  const [facets, setFacets] = useState(localFacets);
  const [maxPrice, setMaxPrice] = useState(localFacets.priceMax);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Server-side paging: the first page loads on every filter change, the next pages load as the
  // sentinel under the grid scrolls into view (infinite scroll).
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqId = useRef(0);
  const sentinel = useRef(null);

  useEffect(() => {
    let live = true;
    fetchFacets().then((f) => {
      if (!live || !f || f.priceMax == null) return; // keep the built-in facets if nothing usable came back
      setFacets(f);
      setMaxPrice((m) => (m >= facets.priceMax ? f.priceMax : m));
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = useMemo(
    () => ({ cat: category, q, sizes, colors, genders, eco, types, maxPrice: maxPrice < facets.priceMax ? maxPrice : null }),
    [category, q, sizes, colors, genders, eco, types, maxPrice, facets.priceMax]
  );

  const load = useCallback(async (nextPage, reset) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const r = await fetchProducts(filters, nextPage, PAGE);
      if (id !== reqId.current) return; // a newer filter change won
      setItems((prev) => (reset ? r.items : [...prev, ...r.items.filter((p) => !prev.some((x) => x.id === p.id))]));
      setTotal(r.total);
      setPage(nextPage);
      setHasMore(r.hasMore);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { setItems([]); setHasMore(true); load(1, true); }, [load]);

  // Load the next page when the end of the grid comes within 600px of the viewport. A scroll check
  // (rather than IntersectionObserver) also catches jumps straight past the grid (End key, scrollbar drag).
  useEffect(() => {
    if (!page || !hasMore || loading || error) return undefined; // page 0 = first page still loading
    let fired = false;
    const check = () => {
      const el = sentinel.current;
      if (!fired && el && el.getBoundingClientRect().top < window.innerHeight + 600) { fired = true; load(page + 1, false); }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [hasMore, loading, error, page, load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const activeCount = sizes.length + colors.length + genders.length + types.length + (eco ? 1 : 0) + (maxPrice < facets.priceMax ? 1 : 0);
  const clearAll = () => { setSizes([]); setColors([]); setGenders([]); setTypes([]); setEco(false); setMaxPrice(facets.priceMax); setParams({}, { replace: true }); };

  return (
    <div className="page">
      <div className="container">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><Chevron dir="right" size={12} />
          <Link to="/clothing">Clothing</Link><Chevron dir="right" size={12} />
          <span>{category || 'All'}</span>
        </nav>

        <div className="listing">
          <aside className={`filters ${filtersOpen ? 'is-open' : ''}`}>
            <button className="filters__toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
              <span>Filters{activeCount ? ` (${activeCount})` : ''}</span><Chevron dir={filtersOpen ? 'up' : 'down'} />
            </button>
            <div className="filters__title">
              <span>Filters</span>
              {(activeCount > 0 || q) && <button className="link" onClick={clearAll}>Clear all</button>}
            </div>
            <div className="filters__body">
              <Group title="Size">
                <div className="sizes">
                  {facets.sizes.map((s) => (
                    <button key={s} className={`sizebtn ${sizes.includes(s) ? 'is-on' : ''}`} aria-pressed={sizes.includes(s)} onClick={() => setSizes(toggle(sizes, s))}>{s}</button>
                  ))}
                </div>
              </Group>
              <Group title="Color">
                <div className="swatches">
                  {facets.colors.map((c) => (
                    <button key={c} className={`dot dot--lg ${colors.includes(c) ? 'is-on' : ''}`} style={{ background: COLOR_FAMILIES[c] }} title={c} aria-label={c} aria-pressed={colors.includes(c)} onClick={() => setColors(toggle(colors, c))} />
                  ))}
                </div>
              </Group>
              <Group title="Gender">
                <div className="checks">
                  {facets.genders.map((g) => <Check key={g} label={g} checked={genders.includes(g)} onChange={() => setGenders(toggle(genders, g))} />)}
                </div>
              </Group>
              <Group title="Eco Responsible">
                <Check label={`Eco Responsible(${facets.ecoCount})`} checked={eco} onChange={() => setEco((v) => !v)} />
              </Group>
              <Group title="Price">
                <div className="price">
                  <span>€{facets.priceMin}</span>
                  <span>Up to €{maxPrice}</span>
                </div>
                <input className="range" type="range" min={facets.priceMin} max={facets.priceMax} step="1" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} aria-label="Maximum price" />
              </Group>
              <Group title="Product Type" defaultOpen={false}>
                <div className="checks checks--col">
                  {facets.types.map((t) => <Check key={t} label={t} checked={types.includes(t)} onChange={() => setTypes(toggle(types, t))} />)}
                </div>
              </Group>
            </div>
          </aside>

          <div className="results">
            <div className="tabs" role="tablist" aria-label="Categories">
              <button role="tab" aria-selected={!category} className={!category ? 'is-active' : ''} onClick={() => setParam('cat', '')}>All</button>
              {facets.categories.map((c) => (
                <button key={c} role="tab" aria-selected={category === c} className={category === c ? 'is-active' : ''} onClick={() => setParam('cat', c)}>{c}</button>
              ))}
            </div>
            <p className="results__count">
              {loading && !items.length ? 'Loading products…' : <>{total} product{total === 1 ? '' : 's'}</>}
              {q && <> for “{q}” <button className="link" onClick={() => setParam('q', '')}>clear search</button></>}
            </p>

            {!loading && !error && items.length === 0 ? (
              <div className="empty">
                <h2 className="h3">No products match</h2>
                <p>Nothing in the current catalog fits this selection.</p>
                <button className="btn btn--outline" onClick={clearAll}>Clear filters</button>
              </div>
            ) : (
              <div className="grid-3">
                {items.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
            <div ref={sentinel} className="scroll-sentinel" aria-live="polite">
              {loading && items.length > 0 && <p className="muted">Loading more products…</p>}
              {error && (
                <p className="form-error">
                  {error} <button className="link link--strong" onClick={() => load(items.length ? page + 1 : 1, !items.length)}>Retry</button>
                </p>
              )}
              {!hasMore && items.length > PAGE && <p className="muted small">You've seen all {total} products.</p>}
            </div>
          </div>
        </div>
      </div>

      <Services />
      <Faq />
      <QuoteCta onQuote={onQuote} />
    </div>
  );
}
