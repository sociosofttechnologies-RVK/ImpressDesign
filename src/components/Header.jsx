import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon, { Close } from './Icon.jsx';
import { NAV } from '../lib/content.js';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { DEMO_MODE } from '../lib/demo.js';

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { count, setOpen } = useCart();
  const { user, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); }, [pathname]);
  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);

  const isActive = (to) => (to === '/' ? pathname === '/' : !to.includes('#') && pathname.startsWith(to));
  const submit = (e) => {
    e.preventDefault();
    navigate(`/clothing${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
    setSearchOpen(false);
  };

  return (
    <header className="header">
      <div className="container header__row">
        <button className="header__burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          <span /><span /><span />
        </button>
        <Link to="/" className="header__logo" aria-label="Impress Design — home">
          <img src="/images/logo.png" alt="Impress Design" width="202" height="30" />
        </Link>
        <nav className={`nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.label} to={n.to} className={`nav__link ${isActive(n.to) ? 'is-active' : ''}`}>{n.label}</Link>
          ))}
        </nav>
        <div className="header__actions">
          <button className="icon-btn" aria-label="Search" onClick={() => setSearchOpen((v) => !v)}><Icon name="search" /></button>
          {isAdmin && <Link to="/admin" className="header__admin">Admin</Link>}
          {(!DEMO_MODE || user) && <Link to={user ? '/account' : '/login'} className="icon-btn" aria-label={user ? `My account (${user.name})` : 'Sign in'} title={user ? user.name : 'Sign in'}><Icon name="user" /></Link>}
          <span className="icon-btn icon-btn--static" title="Favourites"><Icon name="heart" /></span>
          <button className="icon-btn" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`} onClick={() => setOpen(true)}>
            <Icon name="cart" />
            {count > 0 && <span className="badge">{count}</span>}
          </button>
        </div>
      </div>
      {searchOpen && (
        <form className="searchbar" onSubmit={submit} role="search">
          <div className="container searchbar__row">
            <Icon name="search" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, brands or references" aria-label="Search products" />
            <button type="submit" className="btn btn--dark btn--sm">Search</button>
            <button type="button" className="icon-btn" aria-label="Close search" onClick={() => setSearchOpen(false)}><Close /></button>
          </div>
        </form>
      )}
    </header>
  );
}
