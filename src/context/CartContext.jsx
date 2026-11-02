import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const KEY = 'impress-design-cart';

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};

export function CartProvider({ children }) {
  const [lines, setLines] = useState(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage unavailable */ }
  }, [lines]);

  const value = useMemo(() => ({
    lines,
    open,
    setOpen,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0),
    // A line is unique per SKU + customisation, so the same size with different marking stays separate.
    add(newLines) {
      setLines((prev) => {
        const next = [...prev];
        for (const l of newLines) {
          const key = `${l.sku}|${l.customisation?.type || ''}|${(l.customisation?.placements || []).join(',')}|${l.customisation?.artwork || ''}|${l.customisation?.designKey || ''}`;
          const i = next.findIndex((x) => x.key === key);
          if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + l.qty };
          else next.push({ ...l, key });
        }
        return next;
      });
      setOpen(true);
    },
    setQty(key, qty) {
      setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l))));
    },
    remove(key) { setLines((prev) => prev.filter((l) => l.key !== key)); },
    clear() { setLines([]); },
  }), [lines, open]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
