# Al-Arabi Service Marketplace - Entity Relationship Diagram

## Overview

This document presents the Entity Relationship Diagram (ERD) for the Al-Arabi service marketplace platform, showcasing the relationships between core entities in the PostgreSQL database.

## Database Schema Visualization

```mermaid
erDiagram
    users ||--o{ services : creates
    users ||--o{ orders : "places as buyer"
    users ||--o{ orders : "receives as seller"
    users ||--o{ contracts : "signs as buyer"
    users ||--o{ contracts : "signs as seller"
    users ||--o{ wallet_accounts : owns
    users ||--o{ transactions : "sends from"
    users ||--o{ transactions : "receives to"
    users ||--o{ reviews : writes
    users ||--o{ reviews : receives
    users ||--o{ messages : sends
    users ||--o{ messages : receives
    users ||--o{ notifications : receives
    users ||--o{ user_skills : has
    users ||--o{ favorites : creates
    users ||--o{ disputes : raises
    users ||--o{ analytics_events : generates

    categories ||--o{ categories : "parent of"
    categories ||--o{ services : categorizes

    services ||--o{ service_packages : contains
    services ||--o{ orders : generates
    services ||--o{ reviews : receives
    services ||--o{ favorites : "favorited by"

    service_packages ||--o{ orders : "selected in"

    orders ||--o{ order_deliverables : contains
    orders ||--o{ contracts : requires
    orders ||--o{ transactions : processes
    orders ||--o{ reviews : generates
    orders ||--o{ disputes : "disputed for"

    wallet_accounts ||--o{ transactions : "sends from"
    wallet_accounts ||--o{ transactions : "receives to"

    transactions ||--o{ wallet_accounts : "affects from"
    transactions ||--o{ wallet_accounts : "affects to"

    contracts ||--o{ orders : governs

    messages ||--o{ users : "between"

    otp_codes }|--|| users : verifies

    users {
        uuid id PK
        varchar email UK
        varchar phone UK
        varchar password_hash
        varchar first_name
        varchar last_name
        varchar first_name_ar
        varchar last_name_ar
        varchar display_name
        varchar display_name_ar
        text avatar_url
        text bio
        text bio_ar
        date date_of_birth
        varchar gender
        varchar nationality
        varchar city
        varchar city_ar
        varchar country
        varchar timezone
        geography location
        varchar preferred_language
        varchar currency_preference
        boolean is_verified
        boolean is_active
        boolean is_online
        timestamp last_seen
        varchar user_type
        varchar role
        varchar seller_level
        boolean phone_verified
        boolean email_verified
        boolean identity_verified
        varchar business_name
        varchar business_name_ar
        varchar business_type
        varchar tax_id
        varchar business_license
        decimal total_earnings
        decimal total_spent
        integer orders_completed
        integer orders_cancelled
        decimal average_rating
        integer total_reviews
        timestamp created_at
        timestamp updated_at
        timestamp last_login_at
    }

    categories {
        uuid id PK
        uuid parent_id FK
        varchar name
        varchar name_ar
        text description
        text description_ar
        varchar slug UK
        text icon_url
        text banner_url
        integer sort_order
        boolean is_active
        varchar seo_title
        text seo_description
        decimal commission_rate
        timestamp created_at
        timestamp updated_at
    }

    services {
        uuid id PK
        uuid seller_id FK
        uuid category_id FK
        varchar title
        varchar title_ar
        text description
        text description_ar
        text_array tags
        text_array tags_ar
        decimal starting_price
        varchar currency
        boolean has_packages
        integer delivery_time
        integer revisions_included
        varchar service_type
        varchar complexity_level
        text thumbnail_url
        jsonb gallery_urls
        jsonb portfolio_urls
        jsonb requirements
        jsonb extras
        jsonb faqs
        varchar service_location
        text_array languages_offered
        varchar status
        boolean is_featured
        boolean is_promoted
        boolean auto_accept_orders
        integer views_count
        integer favorites_count
        integer orders_in_queue
        integer total_orders
        decimal completion_rate
        decimal average_rating
        integer total_reviews
        varchar slug UK
        varchar seo_title
        text seo_description
        timestamp created_at
        timestamp updated_at
        timestamp published_at
        timestamp featured_until
    }

    service_packages {
        uuid id PK
        uuid service_id FK
        varchar package_type
        varchar name
        varchar name_ar
        text description
        text description_ar
        decimal price
        varchar currency
        integer delivery_time
        integer revisions_included
        jsonb features
        jsonb extras_included
        boolean is_active
        integer sort_order
        timestamp created_at
        timestamp updated_at
    }

    orders {
        uuid id PK
        varchar order_number UK
        uuid buyer_id FK
        uuid seller_id FK
        uuid service_id FK
        uuid package_id FK
        varchar title
        text description
        jsonb requirements
        decimal subtotal
        decimal platform_fee
        decimal seller_fee
        decimal extras_cost
        decimal total_amount
        varchar currency
        integer delivery_time
        integer revisions_allowed
        integer revisions_used
        timestamp expected_delivery
        timestamp delivered_at
        varchar status
        varchar payment_status
        timestamp last_activity
        boolean is_urgent
        integer priority_level
        text completion_notes
        integer buyer_satisfaction
        text seller_feedback
        text cancellation_reason
        text dispute_reason
        uuid cancelled_by FK
        timestamp created_at
        timestamp updated_at
        timestamp accepted_at
        timestamp started_at
        timestamp cancelled_at
    }

    order_deliverables {
        uuid id PK
        uuid order_id FK
        varchar file_name
        text file_url
        varchar file_type
        bigint file_size
        text description
        uuid uploaded_by FK
        boolean is_final
        timestamp created_at
    }

    wallet_accounts {
        uuid id PK
        uuid user_id FK UK
        varchar wallet_number UK
        decimal balance_sar
        decimal balance_aed
        decimal balance_egp
        decimal balance_dzd
        decimal balance_usd
        boolean is_active
        boolean is_verified
        boolean is_frozen
        decimal daily_limit
        decimal monthly_limit
        varchar pin_hash
        integer pin_attempts
        timestamp last_pin_attempt
        varchar kyc_status
        jsonb kyc_documents
        timestamp kyc_verified_at
        timestamp created_at
        timestamp updated_at
    }

    transactions {
        uuid id PK
        varchar transaction_number UK
        uuid from_user_id FK
        uuid to_user_id FK
        uuid from_wallet_id FK
        uuid to_wallet_id FK
        varchar transaction_type
        decimal amount
        varchar currency
        decimal converted_amount
        decimal exchange_rate
        uuid order_id FK
        varchar reference_id
        varchar payment_gateway
        varchar gateway_transaction_id
        decimal gateway_fee
        varchar status
        decimal processing_fee
        decimal net_amount
        text description
        jsonb metadata
        timestamp created_at
        timestamp updated_at
        timestamp processed_at
        timestamp settled_at
    }

    contracts {
        uuid id PK
        varchar contract_number UK
        uuid buyer_id FK
        uuid seller_id FK
        uuid order_id FK
        varchar title
        text terms_and_conditions
        text terms_and_conditions_ar
        text deliverables
        text payment_terms
        text cancellation_policy
        varchar governing_law
        varchar jurisdiction
        varchar contract_language
        text pdf_url
        varchar pdf_hash
        varchar template_version
        boolean buyer_signed
        boolean seller_signed
        jsonb buyer_signature_data
        jsonb seller_signature_data
        timestamp buyer_signed_at
        timestamp seller_signed_at
        inet buyer_ip_address
        inet seller_ip_address
        varchar status
        timestamp created_at
        timestamp updated_at
        timestamp activated_at
        timestamp expires_at
    }

    reviews {
        uuid id PK
        uuid order_id FK UK
        uuid reviewer_id FK
        uuid reviewed_id FK
        uuid service_id FK
        integer overall_rating
        integer communication_rating
        integer quality_rating
        integer delivery_rating
        varchar title
        text content
        text content_ar
        boolean is_public
        boolean is_verified
        integer helpful_votes
        text seller_response
        text seller_response_ar
        timestamp seller_responded_at
        timestamp created_at
        timestamp updated_at
    }

    messages {
        uuid id PK
        uuid conversation_id
        uuid order_id FK
        uuid sender_id FK
        uuid recipient_id FK
        varchar message_type
        text content
        jsonb attachments
        boolean is_read
        boolean is_deleted
        timestamp read_at
        timestamp created_at
        timestamp updated_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        varchar type
        varchar title
        varchar title_ar
        text message
        text message_ar
        jsonb data
        text action_url
        boolean is_read
        boolean is_sent
        varchar delivery_method
        timestamp created_at
        timestamp read_at
        timestamp sent_at
    }

    disputes {
        uuid id PK
        uuid order_id FK
        uuid raised_by FK
        uuid against_user FK
        varchar reason
        text description
        jsonb evidence
        varchar status
        text resolution
        uuid resolved_by FK
        decimal resolution_amount
        timestamp created_at
        timestamp updated_at
        timestamp resolved_at
    }

    user_skills {
        uuid id PK
        uuid user_id FK
        varchar skill_name
        varchar skill_name_ar
        varchar proficiency_level
        integer years_experience
        boolean is_certified
        text certification_url
        timestamp created_at
    }

    favorites {
        uuid id PK
        uuid user_id FK
        uuid service_id FK
        timestamp created_at
    }

    otp_codes {
        uuid id PK
        varchar phone
        varchar code
        varchar purpose
        timestamp expires_at
        timestamp used_at
        integer attempts
        timestamp created_at
    }

    platform_settings {
        uuid id PK
        varchar setting_key UK
        text setting_value
        varchar setting_type
        text description
        boolean is_public
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    analytics_events {
        uuid id PK
        uuid user_id FK
        uuid session_id
        varchar event_type
        varchar event_name
        jsonb properties
        text page_url
        text user_agent
        inet ip_address
        varchar country
        varchar city
        timestamp created_at
    }
```

## Key Relationships

### Core Business Entities

1. **Users** - Central entity representing all platform users (buyers, sellers, admins)
2. **Services** - Marketplace offerings created by sellers
3. **Orders** - Transaction records between buyers and sellers
4. **Contracts** - Legal agreements auto-generated for each order
5. **Wallet Accounts** - Geyb Al-Arabi digital wallet system

### Supporting Entities

6. **Categories** - Hierarchical service categorization
7. **Service Packages** - Different pricing tiers for services
8. **Transactions** - All financial movements and payment records
9. **Reviews** - Quality assurance and reputation system
10. **Messages** - In-platform communication system

### Auxiliary Entities

11. **Notifications** - System and user notifications
12. **User Skills** - Seller qualifications and certifications
13. **Favorites** - User preference tracking
14. **Disputes** - Conflict resolution system
15. **OTP Codes** - Authentication and verification
16. **Analytics Events** - User behavior tracking

## Business Logic Constraints

### User Management
- Users can be buyers, sellers, or both
- Sellers must be verified to create services
- Each user has one wallet account
- Users can have multiple skills and certifications

### Service Marketplace
- Services belong to categories (hierarchical)
- Services can have multiple pricing packages
- Services track views, favorites, and orders
- Only active services appear in marketplace

### Order Workflow
1. Buyer places order for a service
2. Auto-contract generated and requires signatures
3. Payment held in escrow
4. Seller delivers work
5. Buyer approves and payment released
6. Both parties can leave reviews

### Payment System
- Multi-currency wallet support (SAR, AED, EGP, DZD, USD)
- Escrow system protects both parties
- Platform fees calculated automatically
- Transaction history maintained

### Contract Management
- PDF contracts auto-generated for orders
- Digital signatures required from both parties
- Contracts stored securely on AWS S3
- SHA-256 hashing ensures document integrity

## Indexing Strategy

### Performance Indexes
- `users(email, phone)` - Login and verification
- `services(status, category_id, seller_id)` - Marketplace browsing
- `orders(buyer_id, seller_id, status)` - Order management
- `transactions(user_id, type, status)` - Financial tracking
- `reviews(service_id, reviewer_id)` - Reputation system

### Search Indexes
- `services(title, description)` - Full-text search (GIN)
- `services(tags)` - Tag-based filtering (GIN)
- `users(location)` - Geographic search (GIST)

## Data Integrity Features

### Automatic Functions
- UUID generation for all primary keys
- Automatic timestamp updates
- Unique number generation (orders, contracts, transactions, wallets)

### Constraints
- Foreign key relationships ensure referential integrity
- Check constraints validate rating scales (1-5)
- Unique constraints prevent duplicate favorites/reviews
- Enum-like constraints for status fields

## Scalability Considerations

### Partitioning Strategies
- `analytics_events` - Partition by date for time-series data
- `transactions` - Partition by date for financial records
- `messages` - Partition by conversation for chat history

### Archive Strategies
- Old analytics events moved to cold storage
- Completed order data archived after 2 years
- Transaction history maintained for legal compliance

This ERD represents a comprehensive marketplace platform designed specifically for Arabic-speaking markets, with built-in wallet functionality, contract management, and cultural considerations.