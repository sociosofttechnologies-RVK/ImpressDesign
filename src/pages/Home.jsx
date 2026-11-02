import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import HeroVideo from '../components/HeroVideo.jsx';
import Services from '../components/Services.jsx';
import Faq from '../components/Faq.jsx';
import QuoteCta from '../components/QuoteCta.jsx';
import { CATEGORIES, POPULAR, TESTIMONIALS, TRUST } from '../lib/content.js';

const Quote = () => (
  <svg width="31" height="23" viewBox="0 0 31 23" aria-hidden="true" fill="#c41c00">
    <path d="M0 8h14v15H0zM4 0h10L11 8H0zM17 8h14v15H17zM21 0h10l-3 8H17z" />
  </svg>
);

export default function Home({ onQuote }) {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero__media">
          <HeroVideo />
          <h1>Your clothing. Your identity. Our expertise.</h1>
        </div>
        <div className="trust">
          <ul className="container trust__row">
            {TRUST.map((t) => (
              <li key={t.title}>
                <Icon name={t.icon} size={46} />
                <div>
                  <strong>{t.title}</strong>
                  <span>{t.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container block">
        <h2 className="h2 center">Popular for Customization</h2>
        <div className="grid-4">
          {POPULAR.map((c) => (
            <Link key={c.title} to={`/clothing?q=${encodeURIComponent(c.q)}`} className="tile tile--link">
              <img src={c.img} alt="" loading="lazy" />
              <h3 className="h3">{c.title}</h3>
              <span className="tile__cta">Explore →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container block">
        <div className="section-head">
          <h2 className="h2">Popular categories</h2>
          <p>Explore our main clothing and equipment categories.</p>
        </div>
        <div className="grid-4">
          {CATEGORIES.map((c) => (
            <Link key={c.title} to={c.to} className="tile tile--link tile--tall">
              <img src={c.img} alt="" loading="lazy" />
              <h3 className="h3">{c.title}</h3>
              <span className="tile__cta">{c.cta} →</span>
            </Link>
          ))}
        </div>
        <div className="center">
          <Link to="/clothing" className="btn btn--outline btn--lg">Explore More →</Link>
        </div>
      </section>

      <Services id="customization" />

      <section className="banner">
        <h2>Design.personalise.we deliver</h2>
      </section>

      <section className="container block">
        <div className="section-head">
          <h2 className="h2">Trusted by our customers</h2>
          <p className="lead">See what customers have to say about their clothing orders and customization projects.</p>
        </div>
        <div className="testimonials">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="testimonial">
              <Quote />
              <blockquote>{t.text}</blockquote>
              <figcaption>{t.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <Faq />
      <QuoteCta onQuote={onQuote} />
    </div>
  );
}
