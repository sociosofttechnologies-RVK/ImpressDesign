import { Link } from 'react-router-dom';

export default function Placeholder({ title, notFound = false }) {
  return (
    <section className="container placeholder">
      <h1 className="h1">{title}</h1>
      <p>{notFound ? 'This page does not exist.' : 'This section has no products in the current catalog yet.'}</p>
      <Link className="btn btn--outline btn--lg" to="/clothing">Browse clothing →</Link>
    </section>
  );
}
