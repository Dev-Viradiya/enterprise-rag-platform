# Enterprise Multi-Tenant RAG Platform 🚀

A production-ready, full-stack **Enterprise Retrieval-Augmented Generation (RAG)** SaaS platform built with **FastAPI**, **React (Vite)**, **MongoDB**, **Pinecone**, and **Groq (Llama-3)**.

Designed with strict **Multi-Tenant Data Isolation**, granular **Role-Based Access Control (RBAC)**, and dedicated tenant user management.

---

## 🌟 Key Features

### 🏢 Multi-Tenant Architecture & Data Isolation
- **Physical Vector Isolation**: Document chunks are stored in Pinecone using tenant `organization_id` namespaces, ensuring zero cross-tenant vector leakage.
- **Access Control Levels**: Supports `PUBLIC` (organization-wide) and `PRIVATE` (Org Admin only) documents.

### 🛡️ Role Hierarchy & Permissions
1. **Central Super Admin**:
   - Master platform governance.
   - Provision & onboard new client organizations/tenants.
   - Platform-wide telemetry (organizations, users, vector chunk volume, storage).
   - Global or tenant-scoped AI chat and document oversight.
2. **Organization Admin**:
   - Ingest organizational documents (PDF, DOCX, TXT).
   - **Tenant-Scoped User Management**: Provision End Users strictly within their own organization.
   - Reset member passwords and manage team roster.
3. **End User**:
   - Query organizational knowledge base via AI chat with real-time streaming and citation references.
   - Access public documents uploaded within their organization.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.12, FastAPI, Motor (Async MongoDB), LangChain, PyJWT, Argon2 (pwdlib)
- **Vector DB**: Pinecone (Namespace-isolated)
- **Embeddings**: HuggingFace (`all-MiniLM-L6-v2`) / Fast sentence transformers
- **LLM Inference**: Groq Cloud API (`llama-3.3-70b-versatile`)
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide React, Axios, React Markdown, Prism Syntax Highlighter

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd enterprise-rag-platform
```

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and insert your MongoDB, Pinecone, and Groq API keys
```

Start the FastAPI backend server:
```bash
uvicorn main:app --reload --port 8000
```
API Documentation available at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd frontend

# Install packages
npm install

# Start Vite dev server
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 🔐 Environment Variables (`.env`)

See `.env.example` for all required configurations:

| Variable | Description |
| :--- | :--- |
| `MONGO_URI` | MongoDB Connection URI (Local or MongoDB Atlas) |
| `SECRET_KEY` | Secret key used for JWT signing (32+ chars) |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX_NAME` | Pinecone index name (e.g. `enterprise-rag`) |
| `GROQ_API_KEY` | Groq Cloud API key |
| `CENTRAL_ADMIN_EMAIL` | Platform Super Admin email (Default: `superadmin@ragplatform.com`) |
| `CENTRAL_ADMIN_PASSWORD` | Platform Super Admin initial password |
| `ALLOW_PUBLIC_SIGNUP` | Self-registration toggle (`false` recommended) |

---

## 📄 License
MIT License.
