# AI Validator

**AI Validator** is a full-stack tool for validating APIs against canonical data models. It compares API schemas (OpenAPI/JSON) with reference data models, generates structured validation reports (JSON), and produces professional PDF dashboards.

It is designed to help organizations ensure **data interoperability, accuracy, and compliance** across multiple systems.

---

## ✨ Features

- **Schema Comparison Engine**
  Compares uploaded API schemas against canonical data models.

- **Semantic Mapping Support**
  Uses `x-system-mappings` and semantic equivalence to align fields.

- **Validation Reports**
  Generates structured JSON reports with:
  - Accuracy score
  - Matched / unmatched fields
  - Missing / extra fields
  - Suggestions

- **PDF Dashboard Generation**
  Uses a Python microservice to produce visually rich reports, including:
  - Accuracy progress bar
  - Status distribution pie chart
  - Validation summary tables

- **Full-Stack Architecture**
  - **Backend:** NestJS (API service)
  - **Frontend:** Next.js (React web app)
  - **Microservice:** Python (PDF rendering)
  - **Databases:** PostgreSQL & MongoDB

- **Dockerized Deployment**
  All services are containerized with Docker Compose for easy setup.

---

## 🏗️ Project Structure

```
ai-validator-2/
├── apps/
│   ├── api/              # NestJS backend
│   ├── web/              # Next.js frontend
│   ├── document-api/     # PDF microservice (Python)
├── docker-compose.yml    # Multi-service orchestration
├── docs/                 # Documentation (if any)
└── README.md             # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- Python 3.11+
- Docker & Docker Compose
- MongoDB

### Installation

Clone the repository:
```bash
git clone https://github.com/your-org/ai-validator-2.git
cd ai-validator-2
```

Install dependencies:
```bash
npm install
```

### Running with Docker

```bash
docker-compose up --build
```

### Running Locally

Start backend:
```bash
cd apps/api
npm run start:dev
```

Start frontend:
```bash
cd apps/web
npm run dev
```

Run PDF microservice:
```bash
cd apps/document-api
python app.py
```

---

## 📊 Usage

1. Upload or fetch API schema.
2. Select or auto-detect the correct canonical data model.
3. Run validation to compare fields.
4. View results in JSON and download a PDF dashboard.

---

## 🧩 Tech Stack

- **NestJS** – Backend API
- **Next.js** – Frontend web app
- **PostgreSQL / MongoDB** – Databases
- **Python (FastAPI/Starlette)** – PDF generation microservice
- **Docker Compose** – Container orchestration

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
