# Al-Arabi Platform Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Al-Arabi ticketing platform to AWS using Docker and Kubernetes.

## Prerequisites

### Required Tools
- AWS CLI configured with appropriate permissions
- Docker and Docker Compose
- kubectl configured for your Kubernetes cluster
- Terraform (optional, for infrastructure as code)
- Git

### AWS Services Required
- EKS (Elastic Kubernetes Service) or ECS
- RDS (PostgreSQL 15)
- ElastiCache (Redis)
- S3 Buckets
- CloudFront CDN
- Application Load Balancer
- Route 53 (for domain management)
- Certificate Manager (for SSL certificates)

## Quick Start (Development)

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/al-arabi-platform.git
cd al-arabi-platform
```

### 2. Environment Setup
```bash
# Copy environment files
cp backend/.env.example backend/.env
cp web-platform/.env.local.example web-platform/.env.local

# Edit environment variables
nano backend/.env
nano web-platform/.env.local
```

### 3. Start with Docker Compose
```bash
cd deployment/docker
docker-compose up -d
```

### 4. Initialize Database
```bash
# Run migrations
docker-compose exec backend npm run migrate

# Seed initial data
docker-compose exec backend npm run seed
```

### 5. Access the Platform
- Web Platform: http://localhost:3000
- API Documentation: http://localhost:3001/api-docs
- Admin Dashboard: http://localhost:3000/admin
- Grafana: http://localhost:3001 (admin/admin123)

## Production Deployment

### Step 1: Infrastructure Setup

#### 1.1 Create EKS Cluster
```bash
# Using eksctl
eksctl create cluster \
  --name al-arabi-cluster \
  --region us-east-1 \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 10 \
  --node-type t3.medium \
  --with-oidc \
  --managed
```

#### 1.2 Create RDS Instance
```bash
aws rds create-db-instance \
  --db-instance-identifier al-arabi-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username postgres \
  --master-user-password 'YourSecurePassword' \
  --allocated-storage 20 \
  --storage-type gp2 \
  --vpc-security-group-ids sg-xxxxxxxx \
  --db-subnet-group-name al-arabi-db-subnet-group \
  --backup-retention-period 7 \
  --multi-az \
  --storage-encrypted
```

#### 1.3 Create ElastiCache Cluster
```bash
aws elasticache create-replication-group \
  --replication-group-id al-arabi-redis \
  --replication-group-description "Al-Arabi Redis Cluster" \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-clusters 2 \
  --security-group-ids sg-xxxxxxxx \
  --subnet-group-name al-arabi-cache-subnet-group
```

#### 1.4 Create S3 Buckets
```bash
# Main assets bucket
aws s3 mb s3://al-arabi-platform-assets

# Contracts bucket
aws s3 mb s3://al-arabi-contracts

# Configure bucket policies and CORS
aws s3api put-bucket-cors \
  --bucket al-arabi-platform-assets \
  --cors-configuration file://s3-cors-config.json
```

### Step 2: Container Images

#### 2.1 Build and Push Images
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# Build backend image
docker build -f deployment/docker/Dockerfile.backend -t al-arabi/backend:latest .
docker tag al-arabi/backend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/al-arabi/backend:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/al-arabi/backend:latest

# Build web platform image
docker build -f deployment/docker/Dockerfile.web -t al-arabi/web:latest .
docker tag al-arabi/web:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/al-arabi/web:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/al-arabi/web:latest
```

### Step 3: Kubernetes Deployment

#### 3.1 Create Secrets
```bash
# Create namespace
kubectl apply -f deployment/kubernetes/namespace.yaml

# Create secrets
kubectl create secret generic al-arabi-secrets \
  --namespace=al-arabi \
  --from-literal=db-host=al-arabi-db.cluster-xxx.us-east-1.rds.amazonaws.com \
  --from-literal=db-user=postgres \
  --from-literal=db-password=YourSecurePassword \
  --from-literal=redis-url=redis://al-arabi-redis.xxx.cache.amazonaws.com:6379 \
  --from-literal=jwt-secret=your-super-secret-jwt-key \
  --from-literal=jwt-refresh-secret=your-refresh-secret \
  --from-literal=aws-access-key-id=AKIAIOSFODNN7EXAMPLE \
  --from-literal=aws-secret-access-key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  --from-literal=stripe-secret-key=sk_live_... \
  --from-literal=unifonic-app-sid=your-unifonic-app-sid \
  --from-literal=twilio-account-sid=your-twilio-account-sid \
  --from-literal=twilio-auth-token=your-twilio-auth-token
```

#### 3.2 Create ConfigMaps
```bash
kubectl create configmap al-arabi-config \
  --namespace=al-arabi \
  --from-literal=db-port=5432 \
  --from-literal=db-name=al_arabi_platform \
  --from-literal=aws-region=us-east-1 \
  --from-literal=s3-bucket-name=al-arabi-platform-assets
```

#### 3.3 Deploy Applications
```bash
# Deploy backend
kubectl apply -f deployment/kubernetes/backend-deployment.yaml

# Deploy web platform
kubectl apply -f deployment/kubernetes/web-deployment.yaml

# Deploy ingress
kubectl apply -f deployment/kubernetes/ingress.yaml
```

### Step 4: SSL and Domain Setup

#### 4.1 Request SSL Certificate
```bash
aws acm request-certificate \
  --domain-name al-arabi.com \
  --subject-alternative-names *.al-arabi.com \
  --validation-method DNS \
  --region us-east-1
```

#### 4.2 Configure Route 53
```bash
# Create hosted zone
aws route53 create-hosted-zone \
  --name al-arabi.com \
  --caller-reference $(date +%s)

# Add A record pointing to load balancer
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch file://route53-changes.json
```

### Step 5: Monitoring and Logging

#### 5.1 Deploy Prometheus and Grafana
```bash
# Add Helm repositories
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# Install Grafana
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword=admin123
```

#### 5.2 Configure Log Aggregation
```bash
# Deploy Fluentd for log collection
kubectl apply -f deployment/kubernetes/fluentd-daemonset.yaml

# Configure log shipping to CloudWatch
kubectl apply -f deployment/kubernetes/cloudwatch-logs.yaml
```

## Environment Variables

### Backend Environment Variables
```bash
# Core Configuration
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DB_HOST=your-rds-endpoint
DB_PORT=5432
DB_NAME=al_arabi_platform
DB_USER=postgres
DB_PASSWORD=your-secure-password

# Redis
REDIS_URL=redis://your-elasticache-endpoint:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=al-arabi-platform-assets

# Payment Gateways
STRIPE_SECRET_KEY=sk_live_...
PAYPAL_CLIENT_SECRET=your-paypal-secret
BARIDIMOB_SECRET_KEY=your-baridimob-secret
STC_PAY_SECRET_KEY=your-stc-pay-secret
FAWRY_SECRET_KEY=your-fawry-secret
TELR_AUTH_KEY=your-telr-auth-key

# SMS
UNIFONIC_APP_SID=your-unifonic-app-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
```

### Frontend Environment Variables
```bash
# Next.js Configuration
NEXT_PUBLIC_APP_URL=https://al-arabi.com
NEXT_PUBLIC_API_URL=https://api.al-arabi.com
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_live_...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key
NEXT_PUBLIC_GA_ID=GA-XXXXXXXXX
```

## Security Checklist

### Network Security
- [ ] VPC with private subnets for database and Redis
- [ ] Security groups with minimal required access
- [ ] WAF configured on CloudFront
- [ ] DDoS protection enabled

### Application Security
- [ ] JWT secrets are strong and rotated regularly
- [ ] API rate limiting configured
- [ ] Input validation on all endpoints
- [ ] SQL injection protection
- [ ] XSS protection headers

### Data Security
- [ ] Database encryption at rest
- [ ] S3 bucket encryption
- [ ] SSL/TLS certificates configured
- [ ] Secrets stored in AWS Secrets Manager or Kubernetes secrets

### Access Control
- [ ] IAM roles with least privilege
- [ ] RBAC configured in Kubernetes
- [ ] Admin access restricted to VPN
- [ ] Audit logging enabled

## Monitoring and Alerting

### Key Metrics to Monitor
- API response times and error rates
- Database connection pool usage
- Redis cache hit rates
- Payment gateway success rates
- User registration and login rates
- Event booking conversion rates

### Alerting Rules
```yaml
# High error rate alert
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected"

# Database connection issues
- alert: DatabaseConnectionIssues
  expr: postgresql_up == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Database connection down"
```

## Backup and Recovery

### Database Backups
- Automated daily snapshots
- Point-in-time recovery enabled
- Cross-region backup replication
- Regular restore testing

### File Storage Backups
- S3 versioning enabled
- Cross-region replication
- Lifecycle policies for cost optimization
- Regular backup verification

### Disaster Recovery Plan
1. **RTO (Recovery Time Objective)**: 4 hours
2. **RPO (Recovery Point Objective)**: 1 hour
3. **Backup locations**: Primary (us-east-1), Secondary (eu-west-1)
4. **Failover procedure**: Documented and tested quarterly

## Scaling Considerations

### Horizontal Scaling
- Auto-scaling groups for web and API tiers
- Read replicas for database scaling
- Redis cluster for cache scaling
- CDN for global content delivery

### Performance Optimization
- Database query optimization
- Caching strategies
- Image optimization and compression
- Code splitting and lazy loading

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues
```bash
# Check database connectivity
kubectl exec -it deployment/al-arabi-backend -- psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxxxxxxx
```

#### 2. Redis Connection Issues
```bash
# Test Redis connectivity
kubectl exec -it deployment/al-arabi-backend -- redis-cli -h $REDIS_HOST ping
```

#### 3. SSL Certificate Issues
```bash
# Check certificate status
aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:123456789:certificate/xxx

# Verify DNS validation
nslookup _xxx.al-arabi.com
```

### Support Contacts
- **Infrastructure**: devops@al-arabi.com
- **Application**: backend@al-arabi.com
- **Security**: security@al-arabi.com

---

*This deployment guide is maintained by the Al-Arabi DevOps team. Last updated: $(date)*