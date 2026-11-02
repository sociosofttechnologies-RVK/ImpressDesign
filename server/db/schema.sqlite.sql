-- Impress Design — SQLite schema for local development (DB_CLIENT=sqlite, the default).
-- Applied automatically when the API starts; same tables and columns as schema.sql (MySQL).
-- Timestamps are stored as ISO-8601 UTC text.

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  phone         VARCHAR(40)  NULL,
  role          TEXT NOT NULL DEFAULT 'customer',
  disabled      INTEGER NOT NULL DEFAULT 0,               -- 1 = blocked by an admin (cannot sign in)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  company      VARCHAR(120) NULL,
  phone        VARCHAR(40)  NOT NULL,
  street1      VARCHAR(190) NOT NULL,
  street2      VARCHAR(190) NULL,
  post_code    VARCHAR(20)  NOT NULL,
  city         VARCHAR(120) NOT NULL,
  country      CHAR(2)      NOT NULL DEFAULT 'FR',
  is_default   INTEGER   NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- artwork files
CREATE TABLE IF NOT EXISTS uploads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime          VARCHAR(120) NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------- vendor (TopTex) orders
-- One row per purchase order sent to TopTex. A grouped order covers items from many customer orders.
CREATE TABLE IF NOT EXISTS vendor_orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reference        VARCHAR(40)  NOT NULL UNIQUE,         -- our reference, sent as myOrderId
  toptex_order_id  VARCHAR(60)  NULL,                    -- id returned by TopTex
  mode             TEXT NOT NULL,
  deliver_to       TEXT NOT NULL,  -- customer = direct (no customisation)
  status           TEXT NOT NULL,
  dry_run          INTEGER NOT NULL DEFAULT 0,          -- 1 when TopTex credentials were not configured
  request_json     TEXT NULL,
  response_json    TEXT NULL,
  error            TEXT NULL,
  created_by       INTEGER NULL,
  placed_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  received_at      TEXT NULL
);

CREATE TABLE IF NOT EXISTS vendor_order_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_order_id INTEGER NOT NULL,
  sku             VARCHAR(60) NOT NULL,
  quantity        INTEGER NOT NULL,
  CONSTRAINT fk_vol_vo FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- customer orders
CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number     VARCHAR(20) NOT NULL UNIQUE,
  user_id          INTEGER NOT NULL,
  -- customised: TopTex -> workshop -> marking -> our delivery partner -> customer
  -- direct:     TopTex ships straight to the customer (no customisation)
  fulfilment_type  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'placed',
  payment_status   TEXT NOT NULL DEFAULT 'unpaid',
  contact_name     VARCHAR(120) NOT NULL,
  contact_email    VARCHAR(190) NOT NULL,
  contact_phone    VARCHAR(40)  NOT NULL,
  company          VARCHAR(120) NULL,
  ship_street1     VARCHAR(190) NOT NULL,
  ship_street2     VARCHAR(190) NULL,
  ship_post_code   VARCHAR(20)  NOT NULL,
  ship_city        VARCHAR(120) NOT NULL,
  ship_country     CHAR(2)      NOT NULL,
  shipping_method  VARCHAR(40)  NOT NULL,
  shipping_zone    VARCHAR(20)  NULL,
  weight_kg        REAL NOT NULL DEFAULT 0,
  goods_total      REAL NOT NULL,
  marking_total    REAL NOT NULL DEFAULT 0,
  shipping_cost    REAL NOT NULL DEFAULT 0,
  tax_rate         REAL  NOT NULL,
  tax_total        REAL NOT NULL,
  grand_total      REAL NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'EUR',
  notes            TEXT NULL,
  admin_notes      TEXT NULL,                            -- internal, never shown to the customer
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- order detail: one row per SKU + customisation
CREATE TABLE IF NOT EXISTS order_items (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id             INTEGER NOT NULL,
  sku                  VARCHAR(60)  NOT NULL,
  catalog_ref          VARCHAR(30)  NOT NULL,
  product_slug         VARCHAR(190) NOT NULL,
  product_name         VARCHAR(190) NOT NULL,
  brand                VARCHAR(80)  NOT NULL,
  color                VARCHAR(80)  NOT NULL,
  size                 VARCHAR(30)  NOT NULL,
  image_url            VARCHAR(400) NULL,
  quantity             INTEGER NOT NULL,
  unit_price           REAL NOT NULL,
  goods_total          REAL NOT NULL,
  customisation_type   TEXT NULL,
  placements           TEXT NULL,               -- ["front-left","back-large"]
  artwork_upload_id    INTEGER NULL,
  design_spec          TEXT NULL,               -- design studio: {garment, mockupUploadId, items:[{zone, kind, text|uploadId, ...}]}
  marking_total        REAL NOT NULL DEFAULT 0,
  vendor_status        TEXT NOT NULL DEFAULT 'pending',
  vendor_order_id      INTEGER NULL,
  customisation_status TEXT NOT NULL DEFAULT 'not_required',
  CONSTRAINT fk_item_order  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_vendor FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_item_upload FOREIGN KEY (artwork_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  status     VARCHAR(40) NOT NULL,
  note       VARCHAR(255) NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT fk_hist_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- shipments & tracking
CREATE TABLE IF NOT EXISTS shipments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL,
  source          TEXT NOT NULL,  -- partner = our delivery partner API
  carrier         VARCHAR(80)  NOT NULL,
  service         VARCHAR(80)  NULL,
  tracking_number VARCHAR(80)  NULL,
  tracking_url    VARCHAR(400) NULL,
  label_url       VARCHAR(400) NULL,
  cost            REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'created',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  delivered_at    TEXT NULL,
  CONSTRAINT fk_ship_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  status      VARCHAR(40)  NOT NULL,
  description VARCHAR(255) NOT NULL,
  location    VARCHAR(120) NULL,
  occurred_at TEXT NOT NULL,
  CONSTRAINT fk_evt_ship FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- invoices (one per shipment)
CREATE TABLE IF NOT EXISTS invoices (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number VARCHAR(20) NOT NULL UNIQUE,
  order_id       INTEGER NOT NULL,
  shipment_id    INTEGER NULL,
  bill_to        TEXT NOT NULL,   -- address snapshot at time of invoice
  ship_to        TEXT NOT NULL,
  line_items     TEXT NOT NULL,
  goods_total    REAL NOT NULL,
  marking_total  REAL NOT NULL,
  shipping_cost  REAL NOT NULL,
  tax_rate       REAL  NOT NULL,
  tax_total      REAL NOT NULL,
  grand_total    REAL NOT NULL,
  currency       CHAR(3) NOT NULL,
  issued_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT fk_inv_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_ship  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------- feedback
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL,
  rating     INTEGER NOT NULL,
  comment    TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT fk_fb_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_fb_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_items_vendor_status ON order_items (vendor_status);
