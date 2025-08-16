-- Al-Arabi Service Marketplace Database Schema
-- PostgreSQL with Arabic text support and PostGIS for location services

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Users table - Core user management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    first_name_ar VARCHAR(100),
    last_name_ar VARCHAR(100),
    display_name VARCHAR(150),
    display_name_ar VARCHAR(150),
    
    -- Profile Details
    avatar_url TEXT,
    bio TEXT,
    bio_ar TEXT,
    date_of_birth DATE,
    gender VARCHAR(10),
    nationality VARCHAR(3), -- ISO country code
    
    -- Location
    city VARCHAR(100),
    city_ar VARCHAR(100),
    country VARCHAR(3) NOT NULL, -- ISO country code
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    location GEOGRAPHY(POINT, 4326),
    
    -- Account Settings
    preferred_language VARCHAR(5) DEFAULT 'ar',
    currency_preference VARCHAR(3) DEFAULT 'SAR',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP WITH TIME ZONE,
    
    -- User Types and Roles
    user_type VARCHAR(20) DEFAULT 'both', -- buyer, seller, both
    role VARCHAR(20) DEFAULT 'user', -- user, admin, super_admin
    seller_level VARCHAR(20) DEFAULT 'new', -- new, level_1, level_2, top_rated
    
    -- Verification Status
    phone_verified BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    identity_verified BOOLEAN DEFAULT FALSE,
    
    -- Business Information (for sellers)
    business_name VARCHAR(200),
    business_name_ar VARCHAR(200),
    business_type VARCHAR(50), -- individual, company, freelancer
    tax_id VARCHAR(50),
    business_license VARCHAR(100),
    
    -- Platform Statistics
    total_earnings DECIMAL(15, 2) DEFAULT 0,
    total_spent DECIMAL(15, 2) DEFAULT 0,
    orders_completed INTEGER DEFAULT 0,
    orders_cancelled INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Categories table - Service categories with hierarchy
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES categories(id),
    name VARCHAR(150) NOT NULL,
    name_ar VARCHAR(150) NOT NULL,
    description TEXT,
    description_ar TEXT,
    slug VARCHAR(200) UNIQUE NOT NULL,
    icon_url TEXT,
    banner_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    seo_title VARCHAR(200),
    seo_description TEXT,
    commission_rate DECIMAL(5, 2) DEFAULT 10.00, -- Platform commission percentage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Services table - Service listings/gigs
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID REFERENCES users(id) NOT NULL,
    category_id UUID REFERENCES categories(id) NOT NULL,
    
    -- Service Details
    title VARCHAR(200) NOT NULL,
    title_ar VARCHAR(200),
    description TEXT NOT NULL,
    description_ar TEXT,
    tags TEXT[], -- Skills/keywords
    tags_ar TEXT[],
    
    -- Pricing and Packages
    starting_price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'SAR',
    has_packages BOOLEAN DEFAULT FALSE,
    
    -- Service Metadata
    delivery_time INTEGER NOT NULL, -- Days for delivery
    revisions_included INTEGER DEFAULT 1,
    service_type VARCHAR(50) DEFAULT 'standard', -- standard, express, custom
    complexity_level VARCHAR(20) DEFAULT 'beginner', -- beginner, intermediate, expert
    
    -- Media and Portfolio
    thumbnail_url TEXT,
    gallery_urls JSONB, -- Array of image/video URLs
    portfolio_urls JSONB, -- Portfolio items
    
    -- Requirements and Extras
    requirements JSONB, -- What buyer needs to provide
    extras JSONB, -- Additional services and pricing
    faqs JSONB, -- Frequently asked questions
    
    -- Geographic and Language
    service_location VARCHAR(100), -- Can be remote, specific city, etc.
    languages_offered TEXT[], -- Languages seller can work in
    
    -- Status and Visibility
    status VARCHAR(20) DEFAULT 'draft', -- draft, active, paused, suspended
    is_featured BOOLEAN DEFAULT FALSE,
    is_promoted BOOLEAN DEFAULT FALSE,
    auto_accept_orders BOOLEAN DEFAULT FALSE,
    
    -- Statistics
    views_count INTEGER DEFAULT 0,
    favorites_count INTEGER DEFAULT 0,
    orders_in_queue INTEGER DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    completion_rate DECIMAL(5, 2) DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    
    -- SEO
    slug VARCHAR(300) UNIQUE NOT NULL,
    seo_title VARCHAR(200),
    seo_description TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    featured_until TIMESTAMP WITH TIME ZONE
);

-- Service Packages table - Different pricing tiers
CREATE TABLE service_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID REFERENCES services(id) NOT NULL,
    package_type VARCHAR(20) NOT NULL, -- basic, standard, premium
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    description TEXT NOT NULL,
    description_ar TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'SAR',
    delivery_time INTEGER NOT NULL, -- Days
    revisions_included INTEGER DEFAULT 1,
    features JSONB, -- List of included features
    extras_included JSONB, -- Included extras
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table - Service orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    buyer_id UUID REFERENCES users(id) NOT NULL,
    seller_id UUID REFERENCES users(id) NOT NULL,
    service_id UUID REFERENCES services(id) NOT NULL,
    package_id UUID REFERENCES service_packages(id),
    
    -- Order Details
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    requirements JSONB, -- Buyer requirements
    
    -- Pricing
    subtotal DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2) NOT NULL,
    seller_fee DECIMAL(10, 2) NOT NULL,
    extras_cost DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'SAR',
    
    -- Timeline
    delivery_time INTEGER NOT NULL, -- Days
    revisions_allowed INTEGER DEFAULT 1,
    revisions_used INTEGER DEFAULT 0,
    expected_delivery TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    
    -- Status Management
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, delivered, completed, cancelled, disputed
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, held, released, refunded
    
    -- Communication
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_urgent BOOLEAN DEFAULT FALSE,
    priority_level INTEGER DEFAULT 1, -- 1-5 priority scale
    
    -- Completion and Review
    completion_notes TEXT,
    buyer_satisfaction INTEGER, -- 1-5 rating
    seller_feedback TEXT,
    
    -- Cancellation/Dispute
    cancellation_reason TEXT,
    dispute_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Order Deliverables table - Files and deliverables
CREATE TABLE order_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) NOT NULL,
    file_name VARCHAR(300) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    description TEXT,
    uploaded_by UUID REFERENCES users(id) NOT NULL,
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wallet Accounts table - Geyb Al-Arabi Digital Wallet
CREATE TABLE wallet_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL UNIQUE,
    wallet_number VARCHAR(20) UNIQUE NOT NULL, -- Unique wallet identifier
    
    -- Balances (multi-currency support)
    balance_sar DECIMAL(15, 2) DEFAULT 0,
    balance_aed DECIMAL(15, 2) DEFAULT 0,
    balance_egp DECIMAL(15, 2) DEFAULT 0,
    balance_dzd DECIMAL(15, 2) DEFAULT 0,
    balance_usd DECIMAL(15, 2) DEFAULT 0,
    
    -- Wallet Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_frozen BOOLEAN DEFAULT FALSE,
    daily_limit DECIMAL(15, 2) DEFAULT 10000,
    monthly_limit DECIMAL(15, 2) DEFAULT 100000,
    
    -- Security
    pin_hash VARCHAR(255), -- Encrypted wallet PIN
    pin_attempts INTEGER DEFAULT 0,
    last_pin_attempt TIMESTAMP WITH TIME ZONE,
    
    -- KYC Information
    kyc_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected
    kyc_documents JSONB,
    kyc_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table - All financial transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(30) UNIQUE NOT NULL,
    
    -- Transaction Parties
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    from_wallet_id UUID REFERENCES wallet_accounts(id),
    to_wallet_id UUID REFERENCES wallet_accounts(id),
    
    -- Transaction Details
    transaction_type VARCHAR(30) NOT NULL, -- order_payment, wallet_topup, wallet_transfer, withdrawal, refund, commission
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    converted_amount DECIMAL(15, 2), -- If currency conversion applied
    exchange_rate DECIMAL(10, 6),
    
    -- Related Entities
    order_id UUID REFERENCES orders(id),
    reference_id VARCHAR(100), -- External payment reference
    
    -- Payment Gateway Information
    payment_gateway VARCHAR(50), -- baridimob, stcpay, fawry, stripe, etc.
    gateway_transaction_id VARCHAR(255),
    gateway_fee DECIMAL(10, 2) DEFAULT 0,
    
    -- Status and Processing
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    processing_fee DECIMAL(10, 2) DEFAULT 0,
    net_amount DECIMAL(15, 2), -- Amount after fees
    
    -- Metadata
    description TEXT,
    metadata JSONB, -- Additional transaction data
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    settled_at TIMESTAMP WITH TIME ZONE
);

-- Contracts table - Auto-generated service contracts
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_number VARCHAR(30) UNIQUE NOT NULL,
    
    -- Contract Parties
    buyer_id UUID REFERENCES users(id) NOT NULL,
    seller_id UUID REFERENCES users(id) NOT NULL,
    order_id UUID REFERENCES orders(id) NOT NULL,
    
    -- Contract Details
    title VARCHAR(300) NOT NULL,
    terms_and_conditions TEXT NOT NULL,
    terms_and_conditions_ar TEXT,
    deliverables TEXT NOT NULL,
    payment_terms TEXT NOT NULL,
    cancellation_policy TEXT,
    
    -- Legal Framework
    governing_law VARCHAR(100) DEFAULT 'Kingdom of Saudi Arabia',
    jurisdiction VARCHAR(100) DEFAULT 'Saudi Arabian Courts',
    contract_language VARCHAR(10) DEFAULT 'ar',
    
    -- Document Management
    pdf_url TEXT, -- AWS S3 URL
    pdf_hash VARCHAR(64), -- SHA-256 hash for integrity
    template_version VARCHAR(10) DEFAULT '1.0',
    
    -- E-Signature
    buyer_signed BOOLEAN DEFAULT FALSE,
    seller_signed BOOLEAN DEFAULT FALSE,
    buyer_signature_data JSONB, -- Signature metadata
    seller_signature_data JSONB,
    buyer_signed_at TIMESTAMP WITH TIME ZONE,
    seller_signed_at TIMESTAMP WITH TIME ZONE,
    buyer_ip_address INET,
    seller_ip_address INET,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- draft, pending_signatures, active, completed, terminated
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Reviews table - Service reviews and ratings
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) NOT NULL UNIQUE,
    reviewer_id UUID REFERENCES users(id) NOT NULL,
    reviewed_id UUID REFERENCES users(id) NOT NULL, -- The person being reviewed
    service_id UUID REFERENCES services(id) NOT NULL,
    
    -- Rating Components (1-5 scale)
    overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    delivery_rating INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
    
    -- Review Content
    title VARCHAR(200),
    content TEXT,
    content_ar TEXT,
    
    -- Review Metadata
    is_public BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT TRUE, -- Only from completed orders
    helpful_votes INTEGER DEFAULT 0,
    
    -- Response from Seller
    seller_response TEXT,
    seller_response_ar TEXT,
    seller_responded_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table - In-platform messaging
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL, -- Groups messages in conversation
    order_id UUID REFERENCES orders(id), -- Related order if any
    
    -- Message Parties
    sender_id UUID REFERENCES users(id) NOT NULL,
    recipient_id UUID REFERENCES users(id) NOT NULL,
    
    -- Message Content
    message_type VARCHAR(20) DEFAULT 'text', -- text, image, file, order_update, system
    content TEXT NOT NULL,
    attachments JSONB, -- File attachments
    
    -- Message Status
    is_read BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table - System notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    -- Notification Details
    type VARCHAR(50) NOT NULL, -- order_update, payment_received, message_received, etc.
    title VARCHAR(200) NOT NULL,
    title_ar VARCHAR(200),
    message TEXT NOT NULL,
    message_ar TEXT,
    
    -- Notification Data
    data JSONB, -- Additional data (order_id, etc.)
    action_url TEXT, -- Deep link or URL
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    is_sent BOOLEAN DEFAULT FALSE,
    delivery_method VARCHAR(20) DEFAULT 'in_app', -- in_app, email, sms, push
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Disputes table - Order dispute management
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) NOT NULL,
    raised_by UUID REFERENCES users(id) NOT NULL,
    against_user UUID REFERENCES users(id) NOT NULL,
    
    -- Dispute Details
    reason VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    evidence JSONB, -- Supporting files/screenshots
    
    -- Resolution
    status VARCHAR(20) DEFAULT 'open', -- open, investigating, resolved, closed
    resolution TEXT,
    resolved_by UUID REFERENCES users(id), -- Admin who resolved
    resolution_amount DECIMAL(10, 2), -- Refund amount if any
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- User Skills table - Seller skills and certifications
CREATE TABLE user_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    skill_name VARCHAR(100) NOT NULL,
    skill_name_ar VARCHAR(100),
    proficiency_level VARCHAR(20) DEFAULT 'beginner', -- beginner, intermediate, advanced, expert
    years_experience INTEGER,
    is_certified BOOLEAN DEFAULT FALSE,
    certification_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Favorites table - Users favoriting services
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    service_id UUID REFERENCES services(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, service_id)
);

-- OTP Codes table - Authentication codes
CREATE TABLE otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- registration, login, wallet_access, password_reset
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Platform Settings table - Global platform configuration
CREATE TABLE platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE, -- Can be accessed by frontend
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics Events table - User behavior tracking
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_id UUID,
    event_type VARCHAR(50) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    properties JSONB,
    page_url TEXT,
    user_agent TEXT,
    ip_address INET,
    country VARCHAR(3),
    city VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance optimization
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_country ON users(country);
CREATE INDEX idx_users_seller_level ON users(seller_level);
CREATE INDEX idx_users_location ON users USING GIST(location);

CREATE INDEX idx_services_seller ON services(seller_id);
CREATE INDEX idx_services_category ON services(category_id);
CREATE INDEX idx_services_status ON services(status);
CREATE INDEX idx_services_featured ON services(is_featured);
CREATE INDEX idx_services_title_search ON services USING GIN(to_tsvector('arabic', title));
CREATE INDEX idx_services_tags ON services USING GIN(tags);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_service ON orders(service_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

CREATE INDEX idx_transactions_user_from ON transactions(from_user_id);
CREATE INDEX idx_transactions_user_to ON transactions(to_user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

CREATE INDEX idx_contracts_buyer ON contracts(buyer_id);
CREATE INDEX idx_contracts_seller ON contracts(seller_id);
CREATE INDEX idx_contracts_order ON contracts(order_id);
CREATE INDEX idx_contracts_status ON contracts(status);

CREATE INDEX idx_reviews_service ON reviews(service_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_reviewed ON reviews(reviewed_id);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Create triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallet_accounts_updated_at BEFORE UPDATE ON wallet_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_number VARCHAR(20);
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_number := 'ALR' || LPAD(FLOOR(RANDOM() * 9999999)::TEXT, 7, '0');
        done := NOT EXISTS(SELECT 1 FROM orders WHERE order_number = new_number);
    END LOOP;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique wallet numbers
CREATE OR REPLACE FUNCTION generate_wallet_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_number VARCHAR(20);
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_number := 'GYB' || LPAD(FLOOR(RANDOM() * 99999999999)::TEXT, 11, '0');
        done := NOT EXISTS(SELECT 1 FROM wallet_accounts WHERE wallet_number = new_number);
    END LOOP;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique contract numbers
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS VARCHAR(30) AS $$
DECLARE
    new_number VARCHAR(30);
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_number := 'CNT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0');
        done := NOT EXISTS(SELECT 1 FROM contracts WHERE contract_number = new_number);
    END LOOP;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique transaction numbers
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS VARCHAR(30) AS $$
DECLARE
    new_number VARCHAR(30);
    done BOOLEAN := FALSE;
BEGIN
    WHILE NOT done LOOP
        new_number := 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 999999999)::TEXT, 9, '0');
        done := NOT EXISTS(SELECT 1 FROM transactions WHERE transaction_number = new_number);
    END LOOP;
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-generate unique numbers
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        NEW.order_number := generate_order_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number_trigger BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION set_order_number();

CREATE OR REPLACE FUNCTION set_wallet_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.wallet_number IS NULL THEN
        NEW.wallet_number := generate_wallet_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_wallet_number_trigger BEFORE INSERT ON wallet_accounts FOR EACH ROW EXECUTE FUNCTION set_wallet_number();

CREATE OR REPLACE FUNCTION set_contract_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.contract_number IS NULL THEN
        NEW.contract_number := generate_contract_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_contract_number_trigger BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION set_contract_number();

CREATE OR REPLACE FUNCTION set_transaction_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_number IS NULL THEN
        NEW.transaction_number := generate_transaction_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_transaction_number_trigger BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION set_transaction_number();