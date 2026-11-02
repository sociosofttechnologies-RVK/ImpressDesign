import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DesignStudio, { useDesignDraft } from '../components/DesignStudio.jsx';
import { GARMENTS } from '../lib/garments.js';

// Preview colours for trying designs before choosing a product (the product page uses the product's real colours).
const PRESETS = [
  { name: 'White', hex: ['#ffffff'] }, { name: 'Black', hex: ['#1a1a1a'] }, { name: 'Heather grey', hex: ['#a7a7a2'] },
  { name: 'Navy', hex: ['#1d2a44'] }, { name: 'Red', hex: ['#c41c00'] }, { name: 'Royal blue', hex: ['#264d8c'] },
  { name: 'Bottle green', hex: ['#2d4f3a'] }, { name: 'Sand', hex: ['#d8c8b4'] }, { name: 'Black / White', hex: ['#1a1a1a', '#ffffff'] },
];
const SHOP = { tshirt: '/clothing?q=T-shirt', cap: '/clothing?cat=Caps' };

export default function DesignStudioPage() {
  const [params, setParams] = useSearchParams();
  const kind = GARMENTS[params.get('garment')] ? params.get('garment') : 'tshirt';
  const [ci, setCi] = useState(kind === 'tshirt' ? 0 : 1);
  const [type, setType] = useState('Printing');
  const [designs, setDesigns] = useDesignDraft(kind);
  const colors = PRESETS.filter((c) => kind === 'cap' || c.hex.length === 1);

  return (
    <div className="studio-page">
      <div className="container">
        <div className="studio-page__top">
          <div>
            <h1 className="h1">Design studio</h1>
            <p className="muted">Pick where it goes, upload your logo or type your text, and see it on the garment as you go. Your design is kept while you choose the exact product to order.</p>
          </div>
          <div className="seg" role="tablist" aria-label="Garment">
            {Object.entries(GARMENTS).map(([k, g]) => (
              <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setParams({ garment: k }, { replace: true })}>{g.name}</button>
            ))}
          </div>
        </div>
        <DesignStudio key={kind} asPage kind={kind} colors={colors[ci % colors.length].hex} colorOptions={colors} colorIndex={ci % colors.length} onColor={setCi}
          designs={designs} setDesigns={setDesigns} type={type} onType={setType} />
        <div className="studio-page__top" style={{ marginTop: 18 }}>
          <p className="muted small">Next: choose the {GARMENTS[kind].name.toLowerCase()} model, colour and sizes — your design is applied automatically.</p>
          <Link className="btn btn--primary btn--lg" to={SHOP[kind]}>Choose a {GARMENTS[kind].name.toLowerCase()} to order →</Link>
        </div>
      </div>
    </div>
  );
}
