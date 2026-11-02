// Demo mode: hides sign-in and disables checkout so the storefront can be shown without taking orders.
// On by default. To turn the full shop back on, set VITE_DEMO_MODE=false in .env and restart / rebuild.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';
