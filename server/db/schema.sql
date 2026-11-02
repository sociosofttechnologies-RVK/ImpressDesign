-- Impress Design — database schema (MySQL 8 / MariaDB 10.6+)
-- Run with:  mysql -u root -p < db/schema.sql      (or: npm run db:init)

CREATE DATABASE IF NOT EXISTS impress_design CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE impress_design;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  phone         VARCHAR(40)  NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  disabled      TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS addresses (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  company      VARCHAR(120) NULL,
  phone        VARCHAR(40)  NOT NULL,
  street1      VARCHAR(190) NOT NULL,
  street2      VARCHAR(190) NULL,
  post_code    VARCHAR(20)  NOT NULL,
  city         VARCHAR(120) NOT NULL,
  country      CHAR(2)      NOT NULL DEFAULT 'FR',
  is_default   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- artwork files
CREATE TABLE IF NOT EXISTS uploads (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  mime          VARCHAR(120) NOT NULL,
  size_bytes    INT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- vendor (TopTex) orders
-- One row per purchase order sent to TopTex. A grouped order covers items from many customer orders.
CREATE TABLE IF NOT EXISTS vendor_orders (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference        VARCHAR(40)  NOT NULL UNIQUE,         -- our reference, sent as myOrderId
  toptex_order_id  VARCHAR(60)  NULL,                    -- id returned by TopTex
  mode             ENUM('immediate','grouped') NOT NULL,
  deliver_to       ENUM('workshop','customer') NOT NULL,  -- customer = direct (no customisation)
  status           ENUM('placed','failed','received','cancelled') NOT NULL,
  dry_run          TINYINT(1) NOT NULL DEFAULT 0,          -- 1 when TopTex credentials were not configured
  request_json     JSON NULL,
  response_json    JSON NULL,
  error            TEXT NULL,
  created_by       INT UNSIGNED NULL,
  placed_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at      DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendor_order_lines (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vendor_order_id INT UNSIGNED NOT NULL,
  sku             VARCHAR(60) NOT NULL,
  quantity        INT UNSIGNED NOT NULL,
  CONSTRAINT fk_vol_vo FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- customer orders
CREATE TABLE IF NOT EXISTS orders (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number     VARCHAR(20) NOT NULL UNIQUE,
  user_id          INT UNSIGNED NOT NULL,
  -- customised: TopTex -> workshop -> marking -> our delivery partner -> customer
  -- direct:     TopTex ships straight to the customer (no customisation)
  fulfilment_type  ENUM('customised','direct') NOT NULL,
  status           ENUM('placed','materials_ordered','materials_received','in_customisation',
                        'ready_to_ship','shipped','delivered','cancelled') NOT NULL DEFAULT 'placed',
  payment_status   ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
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
  weight_kg        DECIMAL(8,3) NOT NULL DEFAULT 0,
  goods_total      DECIMAL(10,2) NOT NULL,
  marking_total    DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_cost    DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_rate         DECIMAL(5,4)  NOT NULL,
  tax_total        DECIMAL(10,2) NOT NULL,
  grand_total      DECIMAL(10,2) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'EUR',
  notes            TEXT NULL,
  admin_notes      TEXT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_user (user_id)
) ENGINE=InnoDB;

-- order detail: one row per SKU + customisation
CREATE TABLE IF NOT EXISTS order_items (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id             INT UNSIGNED NOT NULL,
  sku                  VARCHAR(60)  NOT NULL,
  catalog_ref          VARCHAR(30)  NOT NULL,
  product_slug         VARCHAR(190) NOT NULL,
  product_name         VARCHAR(190) NOT NULL,
  brand                VARCHAR(80)  NOT NULL,
  color                VARCHAR(80)  NOT NULL,
  size                 VARCHAR(30)  NOT NULL,
  image_url            VARCHAR(400) NULL,
  quantity             INT UNSIGNED NOT NULL,
  unit_price           DECIMAL(10,2) NOT NULL,
  goods_total          DECIMAL(10,2) NOT NULL,
  customisation_type   ENUM('Printing','Embroidery') NULL,
  placements           JSON NULL,               -- ["front-left","back-large"]
  artwork_upload_id    INT UNSIGNED NULL,
  design_spec          JSON NULL,               -- design studio: {garment, mockupUploadId, items:[{zone, kind, text|uploadId, ...}]}
  marking_total        DECIMAL(10,2) NOT NULL DEFAULT 0,
  vendor_status        ENUM('pending','ordered','received') NOT NULL DEFAULT 'pending',
  vendor_order_id      INT UNSIGNED NULL,
  customisation_status ENUM('not_required','pending','done') NOT NULL DEFAULT 'not_required',
  CONSTRAINT fk_item_order  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_vendor FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_item_upload FOREIGN KEY (artwork_upload_id) REFERENCES uploads(id) ON DELETE SET NULL,
  INDEX idx_items_vendor_status (vendor_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id   INT UNSIGNED NOT NULL,
  status     VARCHAR(40) NOT NULL,
  note       VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- shipments & tracking
CREATE TABLE IF NOT EXISTS shipments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id        INT UNSIGNED NOT NULL,
  source          ENUM('partner','toptex','manual') NOT NULL,  -- partner = our delivery partner API
  carrier         VARCHAR(80)  NOT NULL,
  service         VARCHAR(80)  NULL,
  tracking_number VARCHAR(80)  NULL,
  tracking_url    VARCHAR(400) NULL,
  label_url       VARCHAR(400) NULL,
  cost            DECIMAL(10,2) NOT NULL DEFAULT 0,
  status          ENUM('created','in_transit','out_for_delivery','delivered','exception') NOT NULL DEFAULT 'created',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at    DATETIME NULL,
  CONSTRAINT fk_ship_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipment_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT UNSIGNED NOT NULL,
  status      VARCHAR(40)  NOT NULL,
  description VARCHAR(255) NOT NULL,
  location    VARCHAR(120) NULL,
  occurred_at DATETIME NOT NULL,
  CONSTRAINT fk_evt_ship FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- invoices (one per shipment)
CREATE TABLE IF NOT EXISTS invoices (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(20) NOT NULL UNIQUE,
  order_id       INT UNSIGNED NOT NULL,
  shipment_id    INT UNSIGNED NULL,
  bill_to        JSON NOT NULL,   -- address snapshot at time of invoice
  ship_to        JSON NOT NULL,
  line_items     JSON NOT NULL,
  goods_total    DECIMAL(10,2) NOT NULL,
  marking_total  DECIMAL(10,2) NOT NULL,
  shipping_cost  DECIMAL(10,2) NOT NULL,
  tax_rate       DECIMAL(5,4)  NOT NULL,
  tax_total      DECIMAL(10,2) NOT NULL,
  grand_total    DECIMAL(10,2) NOT NULL,
  currency       CHAR(3) NOT NULL,
  issued_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_ship  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- feedback
CREATE TABLE IF NOT EXISTS feedback (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id   INT UNSIGNED NOT NULL UNIQUE,
  user_id    INT UNSIGNED NOT NULL,
  rating     TINYINT UNSIGNED NOT NULL,
  comment    TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fb_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_fb_user  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
