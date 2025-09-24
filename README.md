# 🤖 AI Validator

A powerful tool for comparing API specifications with data models using intelligent field matching and semantic analysis.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com/)

## 📋 Overview

AI Validator is a comprehensive comparison tool that analyzes API specifications (OpenAPI/Swagger) against data models (JSON Schema) to identify field mappings, type mismatches, and structural differences. It uses advanced semantic matching algorithms including Jaro-Winkler similarity, token analysis, and type compatibility checks to provide detailed validation reports.

### ✨ Key Features

- **🔍 Intelligent Field Matching**: Advanced semantic analysis using Jaro-Winkler similarity and token-based comparison
- **📊 Comprehensive Reports**: Detailed analysis with matched, missing, extra, and unresolved fields
- **🎯 High Precision Matching**: Exact normalized equality and core-token containment algorithms
- **📈 Visual Analytics**: Interactive charts and progress tracking
- **📄 Export Options**: JSON and PDF report generation
- **🌐 Modern Web Interface**: Drag-and-drop file uploads with real-time progress
- **🐳 Docker Support**: Containerized deployment with multi-service architecture

## 🏗️ Architecture

This project follows a monorepo structure with multiple services:

```
ai-validator/
├── apps/
│   ├── api/          # NestJS API service (Port 3100)
│   ├── web/          # Next.js frontend (Port 3000)
│   └── services/
│       └── report-python/  # Python PDF service (Port 3200)
├── docker-compose.yml
└── package.json
```

### Services

- **API Service**: NestJS-based REST API handling file uploads and comparison logic
- **Web Interface**: Next.js React application with modern UI and real-time progress
- **Report Service**: Python service for generating PDF reports

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended)
- **Node.js 18+** and **npm** (for local development)
- **Python 3.11+** (for local report service)

### 🐳 Docker Setup (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-validator
   ```

2. **Create environment file**
   ```bash
   # Copy and customize the environment file
   cp .env.example .env
   ```

3. **Start all services**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - **Web Interface**: http://localhost:3000
   - **API Documentation**: http://localhost:3100
   - **Report Service**: http://localhost:3200

### 💻 Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start development servers**
   ```bash
   # Start all services in development mode
   npm run dev:all

   # Or start services individually:
   npm run dev:api    # API service only
   npm run dev:web    # Web interface only
   ```

3. **Set up Python report service**
   ```bash
   cd apps/services/report-python
   pip install -r requirements.txt
   python app.py
   ```

## 📖 Usage Guide

### Web Interface

1. **Upload Files**: Drag and drop or click to upload:
   - **API File**: JSON/YAML OpenAPI specification or API response sample
   - **Data Model**: JSON Schema or data structure definition

2. **Start Comparison**: Click "Compare" to begin the analysis

3. **View Results**: Navigate through tabs to see:
   - **Overview**: Summary statistics and accuracy score
   - **Matched**: Successfully mapped fields
   - **Unresolved**: Fields requiring manual review
   - **Extra**: API fields without model counterparts
   - **Missing**: Model fields not found in API

4. **Export Reports**: Download results in JSON or PDF format

### API Endpoints

```bash
# Upload and compare files
POST /comparison/upload
Content-Type: multipart/form-data
Files: apiFile, modelFile

# Generate PDF report
POST /render
Content-Type: application/json
Body: comparison result object
```

### Example Files

#### API Sample (OpenAPI/JSON)
```json
{
  "user": {
    "id": "12345",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "birthDate": "1990-01-15",
    "isActive": true
  }
}
```

#### Data Model (JSON Schema)
```json
{
  "type": "object",
  "properties": {
    "userId": { "type": "string" },
    "name": { "type": "string" },
    "surname": { "type": "string" },
    "emailAddress": { "type": "string", "format": "email" },
    "dateOfBirth": { "type": "string", "format": "date" },
    "active": { "type": "boolean" }
  }
}
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# API Configuration
PORT=3100
WEB_ORIGIN=http://localhost:3000
REPORT_SERVICE_URL=http://localhost:3200

# Web Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:3100
NEXT_PUBLIC_REPORT_BASE_URL=http://localhost:3200

# Report Service
REPORT_PORT=3200
```

### Comparison Algorithm Settings

The comparison service supports various configuration options:

```typescript
const options: CompareOptions = {
  fuzzyThreshold: 0.76,    // Minimum similarity score (0-1)
  aiHints: false,          // Enable AI-powered token hints
  aiConfig: {              // AI service configuration
    // Add your AI service config
  }
};
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:api      # API service tests
npm run test:web      # Web interface tests

# Run with coverage
npm run test:cov
```

## 📊 Comparison Algorithm

The AI Validator uses a sophisticated two-step matching process:

### Step 1: High-Precision Matching
- **Exact Normalized Equality**: Direct matches after field name normalization
- **Core-Token Containment**: Subset matching (e.g., "birthDate" contains "date")

### Step 2: Semantic Fuzzy Matching
- **Jaro-Winkler Similarity**: String similarity scoring
- **Token Jaccard Index**: Set-based token comparison
- **Type Compatibility**: Data type matching validation
- **Date Field Bias**: Enhanced matching for date/time fields
- **Synonym Recognition**: Common field name variations

### Matching Confidence Scores
- **1.0**: Perfect match (exact equality)
- **0.97**: Core token containment
- **0.76+**: Semantic similarity above threshold
- **<0.76**: Below matching threshold

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

For questions, issues, or feature requests:

- **Issues**: [GitHub Issues](https://github.com/SheroyanMagdalena/ai-validator/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SheroyanMagdalena/ai-validator/discussions)

## 🚀 Roadmap

- [ ] **Database Integration**: Store comparison history
- [ ] **User Authentication**: Multi-user support
- [ ] **Batch Processing**: Compare multiple files
- [ ] **API Integration**: Direct API endpoint comparison
- [ ] **Machine Learning**: Improved matching with ML models
- [ ] **Custom Rules**: User-defined matching rules
- [ ] **Webhooks**: Integration with CI/CD pipelines
