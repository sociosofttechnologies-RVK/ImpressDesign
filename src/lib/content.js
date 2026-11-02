// Copy taken from the Impress Design Figma file.
export const NAV = [
  { label: 'Home', to: '/' },
  { label: 'Clothing', to: '/clothing' },
  { label: 'Customization', to: '/#customization' },
  { label: 'PPE Clothing', to: '/ppe-clothing' },
  { label: 'PPE Accessories', to: '/ppe-accessories' },
  { label: 'Luggage storage', to: '/luggage-storage' },
];

export const SERVICES = [
  { img: '/images/svc-printing.jpg', title: 'Textile Printing', text: 'Ideal for graphics, text and artwork — particularly for larger-volume orders.' },
  { img: '/images/svc-embroidery.jpg', title: 'Embroidery', text: 'A professional and durable finish, particularly suited to polos, jackets, sweatshirts and professional clothing.' },
  { img: '/images/svc-names.jpg', title: 'Names & Numbers', text: 'Personalize individual garments to identify members of a team or group.' },
];

// The design file uses the same answer under every question; replace with final copy when available.
const FAQ_ANSWER = 'Choose your garment, then select the customization options available for that product — depending on the garment and project, this may include printing, embroidery, or personalization with names and numbers.';
export const FAQ = [
  'How do I customise a garment?',
  "What's the difference between printing and embroidery?",
  'Can I customize clothing with my logo?',
  'Can I add names and numbers to clothing?',
  "What's the minimum order quantity for customised clothing?",
  'Can I order customized clothing for my business?',
  'Do you offer volume pricing?',
].map((q) => ({ q, a: FAQ_ANSWER }));

export const TESTIMONIALS = [
  { text: '"Exceptional quality on our embroidered polo shirts. The logo came out perfectly and the team loved the result. Will definitely reorder."', name: 'Sophie M.' },
  { text: 'We needed high-visibility jackets for a field crew on a tight deadline, and the team helped us pick a suitable option quickly.', name: 'S. Idrissi' },
  { text: 'Printed T-shirts with names and numbers for our club season — good communication throughout the order.', name: 'C. Bertrand' },
  { text: 'Good quality and good support for customization. Even I asked for changes very late and they did it very calmly. Fast delivery. I got a t-shirt in one day.', name: 'John' },
];

export const TRUST = [
  { icon: 'france', title: 'Marking in France', text: 'Workshop based in Ile de France' },
  { icon: 'prices', title: 'Decreasing prices', text: 'Decreasing prices with a discount deducted from your order' },
  { icon: 'delivery', title: 'Delivery within 24 hours', text: 'Delivery within 24 hours for hundreds of items' },
  { icon: 'payment', title: 'Secure payments', text: 'Credit card, PayPal...' },
];

export const POPULAR = [
  { img: '/images/pop-tshirt.jpg', title: 'T-Shirt', q: 'T-Shirt' },
  { img: '/images/pop-polo.jpg', title: 'Polo', q: 'Polo' },
  { img: '/images/pop-sweatshirt.jpg', title: 'Sweatshirt', q: 'Sweatshirt' },
  { img: '/images/pop-hivis.jpg', title: 'Hi-Vis Jacket', q: 'Hi-Vis' },
];

export const CATEGORIES = [
  { img: '/images/cat-workwear.jpg', title: 'Workwear', cta: 'Shop Workwear', to: '/clothing?q=Workwear' },
  { img: '/images/cat-ppe.jpg', title: 'PPE & High-Visibility Clothing', cta: 'Shop PPE', to: '/ppe-clothing' },
  { img: '/images/cat-teamwear.jpg', title: 'Sports & Teamwear', cta: 'Shop Teamwear', to: '/clothing?q=Sport' },
  { img: '/images/cat-caps.jpg', title: 'Caps & Accessories', cta: 'Shop Accessories', to: '/clothing' },
];

// Marking positions offered in the placement picker. `zone` is [x, y, w, h] in % of the tile's garment area.
export const PLACEMENTS = {
  Front: [
    { id: 'front-left', label: 'Small — left', zone: [56, 22, 20, 14], basic: true },
    { id: 'front-band', label: 'Centre band', zone: [26, 40, 48, 16], basic: true },
    { id: 'front-large', label: 'Large — centre', zone: [30, 26, 40, 44], basic: true },
    { id: 'front-right', label: 'Small — right', zone: [24, 22, 20, 14] },
    { id: 'front-top', label: 'Top band', zone: [26, 20, 48, 14] },
    { id: 'front-bottom', label: 'Bottom corner', zone: [24, 66, 18, 12] },
  ],
  Back: [
    { id: 'back-top', label: 'Top band', zone: [26, 20, 48, 16], basic: true },
    { id: 'back-large', label: 'Large — centre', zone: [30, 26, 40, 44], basic: true },
    { id: 'back-centre', label: 'Small — centre', zone: [40, 36, 20, 16] },
    { id: 'back-bottom', label: 'Bottom band', zone: [26, 62, 48, 14] },
  ],
  Left: [
    { id: 'left-top', label: 'Top', zone: [38, 20, 24, 16] },
    { id: 'left-mid', label: 'Middle', zone: [38, 42, 24, 16] },
    { id: 'left-bottom', label: 'Bottom', zone: [38, 64, 24, 14] },
  ],
  Right: [
    { id: 'right-top', label: 'Top', zone: [38, 20, 24, 16] },
    { id: 'right-mid', label: 'Middle', zone: [38, 42, 24, 16] },
    { id: 'right-bottom', label: 'Bottom', zone: [38, 64, 24, 14] },
  ],
};
