# Al-Arabi (العربي) - Arabic Service Marketplace

![Al-Arabi Logo](./assets/logo-arabic.png)

## Overview

Al-Arabi is a comprehensive Arabic-first service marketplace designed for the MENA region, connecting service providers with customers through a modern gig economy platform. The platform features beautiful Arabic typography, RTL support, and integrated Arab payment gateways including the innovative "Geyb Al-Arabi" digital wallet.

## 🌟 Key Features

### Core Marketplace
- **Service Listings**: Browse and post services across multiple categories
- **Buyer/Seller Workflows**: Complete gig marketplace functionality
- **Arabic-First Design**: Beautiful RTL interface with Arabic typography
- **Multi-Platform**: Web (React.js/Next.js) and Mobile (React Native)

### Payment & Wallet
- **Geyb Al-Arabi Digital Wallet**: Native digital wallet system
- **Arab Payment Gateways**: BaridiMob (Algeria), STC Pay (KSA), Fawry (Egypt)
- **Multi-Currency Support**: DZD, SAR, EGP, AED, USD
- **Escrow System**: Secure payment holding until service completion

### Smart Contracts
- **Auto-Contract Generation**: PDF contracts generated automatically
- **E-Signature Integration**: Digital signature workflow
- **AWS S3 Storage**: Secure contract document storage
- **Legal Compliance**: MENA region legal framework compliance

### Authentication & Security
- **OTP Authentication**: Arabic SMS gateway integration
- **Multi-Factor Authentication**: Enhanced security measures
- **Role-Based Access**: Buyer, Seller, Admin, Super Admin roles
- **Data Protection**: GDPR and regional compliance

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mobile Apps   │    │   Web Platform  │    │ Admin Dashboard │
│ (React Native)  │    │ (Next.js/React) │    │   (Next.js)     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      API Gateway         │
                    │    (AWS ALB + CDN)       │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │    Node.js Backend       │
                    │  (Express + Socket.IO)   │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│   PostgreSQL    │    │     Redis       │    │   AWS S3        │
│   Database      │    │     Cache       │    │ File Storage    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📊 Database Schema

### Core Tables
- **users**: User profiles and authentication
- **services**: Service listings and details
- **orders**: Order management and tracking
- **contracts**: Auto-generated legal contracts
- **transactions**: Payment and wallet transactions
- **wallet_accounts**: Geyb Al-Arabi digital wallet
- **reviews**: Service reviews and ratings
- **categories**: Service categorization
- **messages**: In-platform communication

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose
- AWS CLI configured

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/al-arabi-marketplace.git
cd al-arabi-marketplace

# Install dependencies
npm run install:all

# Set up environment
cp backend/.env.example backend/.env
cp web-platform/.env.local.example web-platform/.env.local

# Start services
docker-compose up -d

# Run database migrations
npm run db:migrate

# Seed sample data
npm run db:seed

# Start development servers
npm run dev
```

### Access Points
- **Web Platform**: http://localhost:3000
- **API Documentation**: http://localhost:3001/api-docs
- **Admin Dashboard**: http://localhost:3000/admin
- **Mobile App**: Expo DevTools at http://localhost:19002

## 🛠️ Technology Stack

### Frontend
- **Web**: Next.js 14, React 18, TypeScript
- **Mobile**: React Native, Expo
- **Styling**: Tailwind CSS with RTL support
- **State Management**: Zustand, React Query
- **UI Components**: Custom Arabic design system

### Backend
- **Runtime**: Node.js 18 with Express
- **Database**: PostgreSQL 15 with PostGIS
- **Cache**: Redis 7
- **Authentication**: JWT with OTP verification
- **Real-time**: Socket.IO for live features
- **File Storage**: AWS S3 with CloudFront CDN

### Infrastructure
- **Cloud**: AWS (ECS, RDS, ElastiCache, S3)
- **Containerization**: Docker with Kubernetes
- **CI/CD**: GitHub Actions with automated testing
- **Monitoring**: Prometheus, Grafana, ELK Stack
- **Security**: AWS WAF, SSL/TLS, encryption at rest

## 🎯 Core Features

### Service Marketplace
- **Service Categories**: Technology, Design, Writing, Marketing, Business
- **Gig Packages**: Basic, Standard, Premium tiers
- **Portfolio Showcase**: Image galleries and work samples
- **Skill-Based Matching**: AI-powered service recommendations
- **Geographic Filtering**: Location-based service discovery

### Payment & Wallet System
- **Geyb Al-Arabi Wallet**: 
  - Digital wallet with QR code payments
  - Top-up via bank transfer or payment cards
  - Peer-to-peer transfers
  - Transaction history and analytics
- **Escrow Protection**: Funds held until service completion
- **Commission System**: Platform fees and seller payouts
- **Multi-Currency**: Automatic currency conversion

### Contract & Legal
- **Smart Contracts**: Auto-generated based on service terms
- **E-Signature**: DocuSign-style digital signing
- **Legal Templates**: MENA region compliance
- **Dispute Resolution**: Built-in arbitration system
- **Document Storage**: Encrypted AWS S3 with versioning

### Arabic Experience
- **RTL Layout**: Complete right-to-left interface
- **Arabic Typography**: Beautiful fonts (Amiri, Dubai, Noto Sans Arabic)
- **Cultural Design**: Islamic geometric patterns and colors
- **Localized Content**: Arabic service descriptions and categories
- **Arabic SEO**: Optimized for Arabic search engines

## 🔒 Security Features

### Authentication & Authorization
- **Multi-Factor Authentication**: OTP + biometric
- **Role-Based Access Control**: Fine-grained permissions
- **Session Management**: Secure JWT with refresh tokens
- **Account Verification**: Phone and email verification

### Data Protection
- **Encryption**: AES-256 encryption at rest and in transit
- **PII Protection**: Personal data anonymization
- **GDPR Compliance**: Data privacy regulations
- **Audit Logging**: Comprehensive security logs

### Payment Security
- **PCI DSS Compliance**: Secure payment processing
- **Fraud Detection**: AI-powered transaction monitoring
- **Secure Wallets**: Hardware security module integration
- **Anti-Money Laundering**: KYC/AML compliance

## 📱 Mobile Applications

### Features
- **Native Performance**: React Native with native modules
- **Offline Support**: Service browsing and wallet access
- **Push Notifications**: Order updates and messages
- **QR Code Scanner**: Wallet payments and service verification
- **Arabic Keyboard**: Optimized input for Arabic text

### Platforms
- **iOS**: App Store deployment ready
- **Android**: Google Play Store compatible
- **PWA**: Progressive Web App fallback

## 🌍 Deployment

### Development
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Production (AWS)
```bash
# Infrastructure setup
terraform apply -var-file="production.tfvars"

# Container deployment
kubectl apply -f deployment/kubernetes/
```

### CI/CD Pipeline
- **Automated Testing**: Unit, integration, and E2E tests
- **Security Scanning**: Dependency and vulnerability checks
- **Performance Testing**: Load testing with k6
- **Deployment**: Blue-green deployment strategy

## 📈 Analytics & Monitoring

### Business Metrics
- Service booking conversion rates
- Wallet adoption and usage
- Payment gateway success rates
- User engagement and retention
- Revenue and commission tracking

### Technical Monitoring
- API response times and error rates
- Database performance and queries
- Cache hit rates and memory usage
- Infrastructure costs and scaling

## 🤝 Contributing

Please read our [Contributing Guidelines](./docs/CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

- **Documentation**: https://docs.al-arabi.com
- **Community**: https://community.al-arabi.com
- **Email**: support@al-arabi.com
- **Phone**: +966 11 XXX XXXX

---

**Built with ❤️ for the Arab world** 🌙