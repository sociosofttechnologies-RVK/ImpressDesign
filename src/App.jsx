import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { DEMO_MODE } from './lib/demo.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import QuoteModal from './components/QuoteModal.jsx';
import Home from './pages/Home.jsx';
import Listing from './pages/Listing.jsx';
import Product from './pages/Product.jsx';
import Placeholder from './pages/Placeholder.jsx';
import DesignStudioPage from './pages/DesignStudioPage.jsx';
import Login from './pages/Login.jsx';
import Checkout from './pages/Checkout.jsx';
import Account from './pages/Account.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Invoice from './pages/Invoice.jsx';
import Admin from './pages/admin/Admin.jsx';
import AdminOrder from './pages/admin/AdminOrder.jsx';

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const openQuote = () => setQuoteOpen(true);
  return (
    <>
      <ScrollManager />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home onQuote={openQuote} />} />
          <Route path="/clothing" element={<Listing onQuote={openQuote} />} />
          <Route path="/clothing/:slug" element={<Product onQuote={openQuote} />} />
          <Route path="/design-studio" element={<DesignStudioPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/checkout" element={DEMO_MODE ? <Navigate to="/" replace /> : <Checkout />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/orders/:number" element={<OrderDetail />} />
          <Route path="/invoice/:number" element={<Invoice />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/orders/:number" element={<AdminOrder />} />
          <Route path="/ppe-clothing" element={<Placeholder title="PPE Clothing" />} />
          <Route path="/ppe-accessories" element={<Placeholder title="PPE Accessories" />} />
          <Route path="/luggage-storage" element={<Placeholder title="Luggage storage" />} />
          <Route path="*" element={<Placeholder title="Page not found" notFound />} />
        </Routes>
      </main>
      <Footer />
      <CartDrawer />
      {quoteOpen && <QuoteModal onClose={() => setQuoteOpen(false)} />}
    </>
  );
}
