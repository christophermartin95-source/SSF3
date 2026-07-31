# SSF - Sex Sound Files

The home of the filthiest sounds. A full-stack audio/video sharing community.

## Tech Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Express + TypeScript + Drizzle ORM
- **Database:** PostgreSQL
- **Auth:** Clerk
- **Payments:** Stripe
- **Storage:** Google Cloud Storage

## Project Structure

```
artifacts/
  earshot/          # Frontend (React web app)
  api-server/       # Backend (Express API)
  mockup-sandbox/   # UI component preview (dev only)
```

## Deploying to Render

1. Push this repo to GitHub
2. Connect Render to your GitHub account
3. Click the **"Use Blueprint"** button in your Render dashboard
4. Render will automatically create:
   - PostgreSQL database
   - Backend API service
   - Static frontend site

## Environment Variables

Required for production:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `CLERK_SECRET_KEY` | Clerk auth secret |
| `ADMIN_EMAILS` | Comma-separated admin emails |
