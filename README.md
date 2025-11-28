# Beats By M.A.J. - Beat Store Platform

A complete e-commerce platform for selling beats with Stripe integration, email delivery, and admin dashboard.

## Features

### Customer-Facing
- 🎵 Interactive beat player widget (`index2.html`)
- 💳 Stripe Checkout integration
- 📧 Automated email delivery with download links
- 📄 Multiple license tiers (Basic, Premium, Unlimited, Exclusive)

### Admin Dashboard (`admin.html`)
- 📊 Analytics & revenue tracking
- 🎵 Beat management (upload, edit, delete)
- 📜 License template management
- 🎟️ Coupon/discount code system
- 💰 Sales & transaction history
- ✉️ Email automation & broadcast
- ⚙️ Settings management

## Quick Start

### Prerequisites

You need either:
- **Node.js** (v18+) and npm, OR
- **Docker** and docker-compose

### Installation

1. **Clone/Download** this repository

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables in `.env`:**

   **Required for payments:**
   - `STRIPE_SECRET_KEY` - Your Stripe secret key
   - `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret

   **Required for admin auth:**
   - `ADMIN_USERNAME` - Admin username (default: `admin`)
   - `ADMIN_PASSWORD_HASH` - Bcrypt hash of admin password
   - `JWT_SECRET` - Secret key for JWT tokens

   **Generate password hash:**
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
   ```

   **Optional (email):**
   - `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS` - SMTP credentials
   - If not set, a test Ethereal account will be used

5. **Run the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

### Using Docker

```bash
docker-compose up --build
```

## Usage

### Access Points

- **Main Store:** `http://localhost:4242/`
- **Admin Dashboard:** `http://localhost:4242/admin`
- **API Endpoints:** `http://localhost:4242/api/...`

### Default Admin Credentials

- **Username:** `admin`
- **Password:** `admin123`

⚠️ **IMPORTANT:** Change these in production by setting environment variables!

## API Endpoints

### Public Endpoints
- `POST /api/create-checkout-session` - Create Stripe checkout
- `POST /webhook` - Stripe webhook handler
- `POST /dev/simulate-purchase` - Test purchase flow (dev only)

### Admin Endpoints (require authentication)

**Authentication:**
- `POST /api/admin/login` - Login (returns JWT token)
- `GET /api/admin/verify` - Verify token

**Analytics:**
- `GET /api/admin/analytics` - Get dashboard analytics

**Beats:**
- `GET /api/admin/beats` - List all beats
- `POST /api/admin/beats` - Upload new beat (multipart/form-data)
- `PUT /api/admin/beats/:id` - Update beat
- `DELETE /api/admin/beats/:id` - Delete beat

**Licenses:**
- `GET /api/admin/licenses` - List all licenses
- `POST /api/admin/licenses` - Create license
- `PUT /api/admin/licenses/:id` - Update license
- `DELETE /api/admin/licenses/:id` - Delete license

**Coupons:**
- `GET /api/admin/coupons` - List all coupons
- `POST /api/admin/coupons` - Create coupon
- `PUT /api/admin/coupons/:id` - Update coupon
- `DELETE /api/admin/coupons/:id` - Delete coupon

**Sales:**
- `GET /api/admin/sales` - Get sales history

## Authentication

Admin routes use JWT (JSON Web Tokens) for authentication.

### Login Flow

1. POST to `/api/admin/login` with:
   ```json
   {
     "username": "admin",
     "password": "admin123"
   }
   ```

2. Receive token in response:
   ```json
   {
     "success": true,
     "token": "eyJhbGciOiJIUzI1...",
     "user": { "username": "admin" }
   }
   ```

3. Include token in subsequent requests:
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1...
   ```

The admin dashboard handles this automatically via localStorage.

## Data Storage

Currently uses JSON files in the `data/` directory:
- `data/beats.json` - Beat catalog
- `data/licenses.json` - License templates
- `data/coupons.json` - Discount codes
- `data/sales.json` - Transaction history

For production, consider upgrading to a database (PostgreSQL, MongoDB, etc.).

## File Uploads

- **Audio files:** Stored in `audio/` directory
- **Cover images:** Stored in `uploads/` directory

For production, consider using cloud storage (AWS S3, Google Cloud Storage, etc.).

## Development

### Testing Purchase Flow (without Stripe)

```bash
curl -X POST http://localhost:4242/dev/simulate-purchase \
  -H "Content-Type: application/json" \
  -d '{
    "beatId": "trap_wave_001",
    "licenseId": "premium",
    "email": "test@example.com"
  }'
```

This triggers the email delivery without requiring a Stripe payment.

### Project Structure

```
Beat Store/
├── index.html              # Landing page with banner
├── index2.html             # Customer-facing beat store widget
├── admin.html              # Admin dashboard
├── server.js               # Express server (main)
├── admin-routes.js         # Admin API routes & authentication
├── package.json            # Dependencies
├── .env.example            # Environment variables template
├── Dockerfile              # Docker image config
├── docker-compose.yml      # Docker orchestration
├── audio/                  # Beat audio files
├── uploads/                # User-uploaded files
└── data/                   # JSON data storage
    ├── beats.json
    ├── licenses.json
    ├── coupons.json
    └── sales.json
```

## Security Notes

⚠️ **Before deploying to production:**

1. **Change default admin credentials**
2. **Set strong JWT_SECRET**
3. **Use HTTPS** (not HTTP)
4. **Configure CORS** properly
5. **Set up Stripe webhooks** with proper secrets
6. **Add rate limiting** to prevent abuse
7. **Implement proper database** instead of JSON files
8. **Use cloud storage** for files (not local disk)
9. **Add input validation** and sanitization
10. **Set up proper logging** and monitoring

## License

MIT

## Support

For issues or questions, please contact the administrator.
