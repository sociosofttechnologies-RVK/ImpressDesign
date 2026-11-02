import { Link } from 'react-router-dom';
import { NAV } from '../lib/content.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__row">
        <div className="footer__brand">
          <img src="/images/logo.png" alt="Impress Design" width="297" height="44" />
          <p>Custom clothing, textile marking and professional solutions since 1977.</p>
        </div>
        <nav className="footer__nav" aria-label="Footer">
          {NAV.map((n) => <Link key={n.label} to={n.to}>{n.label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}
