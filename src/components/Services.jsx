import { SERVICES } from '../lib/content.js';

export default function Services({ id }) {
  return (
    <section className="services container" id={id}>
      <div className="section-head">
        <h2 className="h2">Give your clothing an identity</h2>
        <p>Your logo, message, colors or team names can transform standard clothing into something that represents your organization.</p>
      </div>
      <div className="services__grid">
        {SERVICES.map((s) => (
          <article key={s.title} className="tile">
            <img src={s.img} alt="" loading="lazy" />
            <h3 className="h3">{s.title}</h3>
            <p>{s.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
