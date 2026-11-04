# Express application

Install dependencies with `npm install`

Run with `npm start`

Or in development mode with `npm run dev`

# Visit counter

When running the server, visit http://localhost:3000 to see visit counter, or give environment variable `PORT` to change the port.

# MongoDB

The application has /todos CRUD which requires MongoDB. For the containerized MongoDB and host-run backend setup:

1. If MongoDB is not already running on port 27017, start it from this directory with `docker compose up -d mongo`.
2. In PowerShell, set the host connection URL and start the backend:

   ```powershell
   $env:MONGO_URL = "mongodb://localhost:27017/todo-app"
   npm start
   ```

The backend runs outside Docker, so use `localhost` in `MONGO_URL` rather than the Compose service name.

# Redis

Pass connection url with env `REDIS_URL`