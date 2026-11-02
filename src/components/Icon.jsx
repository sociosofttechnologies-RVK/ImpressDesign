import search from '../assets/icons/search.svg?raw';
import user from '../assets/icons/user.svg?raw';
import heart from '../assets/icons/heart.svg?raw';
import cart from '../assets/icons/cart.svg?raw';
import france from '../assets/icons/trust-france.svg?raw';
import prices from '../assets/icons/trust-prices.svg?raw';
import delivery from '../assets/icons/trust-delivery.svg?raw';
import payment from '../assets/icons/trust-payment.svg?raw';

// Icons exported from the Figma file, inlined so they inherit `color`.
const ICONS = { search, user, heart, cart, france, prices, delivery, payment };

export default function Icon({ name, size, className = '' }) {
  return (
    <span
      className={`icon ${className}`}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

export const Chevron = ({ dir = 'down', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true"
    style={{ transform: { up: 'rotate(180deg)', right: 'rotate(-90deg)', left: 'rotate(90deg)', down: 'none' }[dir] }}>
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Close = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
