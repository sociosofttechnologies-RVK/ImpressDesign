import { useState } from 'react';
import { FAQ } from '../lib/content.js';

export default function Faq() {
  const [open, setOpen] = useState(null);
  return (
    <section className="faq container">
      <h2 className="h2 center">Frequently asked questions</h2>
      <div className="faq__list">
        {FAQ.map((item, i) => (
          <div className="faq__item" key={item.q}>
            <button className="faq__q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{item.q}</span>
              <span className="faq__sign">{open === i ? '-' : '+'}</span>
            </button>
            {open === i && <p className="faq__a">{item.a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
