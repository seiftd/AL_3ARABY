# Al-Arabi (العرّبي) - Arabic Ticketing Platform

![Al-Arabi Logo](./assets/logo.png)

## Overview
Al-Arabi is a comprehensive Arabic-first ticketing platform designed for the MENA region, featuring beautiful Arabic typography, RTL support, and integrated Arab payment gateways.

## Architecture

### Core Components
- **Backend API**: Node.js with Express, JWT authentication
- **Web Platform**: Next.js with Arabic RTL support
- **Mobile Apps**: React Native for iOS and Android
- **Database**: PostgreSQL with optimized Arabic text support
- **Payment**: Multi-gateway (BaridiMob, STC Pay, Fawry, Telr, Stripe, PayPal)
- **Contracts**: PDF generation with e-signature workflow

### Key Features
- 🔐 OTP Authentication with Arabic SMS gateways
- 🎫 QR-based ticketing with real-time validation
- 📍 Location-based event discovery
- 💰 Dynamic pricing engine
- 📱 Real-time notifications
- 📄 Seller contract management system
- 🌍 Multi-currency support (DZD, SAR, EGP, AED)

## Project Structure

```
al-arabi-platform/
├── backend/              # Node.js API server
├── web-platform/         # Next.js web application
├── mobile-app/          # React Native mobile app
├── database/            # PostgreSQL schemas and migrations
├── docs/               # Documentation and diagrams
├── deployment/         # Docker, Kubernetes, Terraform configs
└── assets/            # Branding and media assets
```

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis
- AWS CLI (for deployment)

### Development Setup

1. Clone the repository
2. Install dependencies: `npm run install:all`
3. Start services: `docker-compose up -d`
4. Run migrations: `npm run db:migrate`
5. Start development servers: `npm run dev`

## Deployment

The platform is designed for AWS deployment with:
- ECS/EKS for container orchestration
- RDS for PostgreSQL
- S3 for file storage
- CloudFront for CDN
- ElastiCache for Redis

## Contributing

Please read our [Contributing Guidelines](./docs/CONTRIBUTING.md) before submitting PRs.

## License

MIT License - see [LICENSE](./LICENSE) file for details.

---

Built with ❤️ for the Arab world