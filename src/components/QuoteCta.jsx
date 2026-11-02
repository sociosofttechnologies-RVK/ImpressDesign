export default function QuoteCta({ onQuote, boxed = false }) {
  return (
    <section className={`quote ${boxed ? 'quote--boxed' : ''}`}>
      <div className="quote__inner">
        <h2>Need dozens or hundreds of garments?</h2>
        <p>Professional orders require more than adding products to a cart. We help you choose the right products, sizes, quantities and customisation options to fit your budget and deadlines.</p>
        <button className="btn btn--cta" onClick={onQuote}>Request a quote</button>
      </div>
    </section>
  );
}
