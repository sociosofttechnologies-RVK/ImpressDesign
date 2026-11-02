import { useEffect } from 'react';
import { Close } from '../../components/Icon.jsx';

/** Centered dialog used across the admin screens (Esc or backdrop click closes it). */
export default function AdminModal({ title, onClose, wide = false, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay overlay--center" onClick={onClose}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <h2 className="h3">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Close /></button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
