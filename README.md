# Full Stack Open – Part 12: Containers

This repository contains my exercises and projects for Full Stack Open Part 12, focusing on containerization with Docker and Docker Compose.

## Repository structure

- `answers/` – Exercise answers and documentation.
- `todo-app/` – Todo application used in the containerization exercises.
- `todo-tests/` – Testing project.
- `my-app/` – Containerized development environment for Kakuma Creative Zone.

## Exercise 22 – Containerized Development Environment

For Exercise 22, I created a Docker-based development environment for my own full-stack application, **Kakuma Creative Zone**.

Original application repository:

[Kakuma Creative Zone – GitHub](https://github.com/doctorphiliph19-afk/kakuma-Creative-zone)

### Technologies

- Docker
- Docker Compose
- Node.js 20
- Express.js
- Nginx
- HTML, CSS and JavaScript

### Application services

| Service | Host address |
|---|---|
| Frontend (Nginx) | http://localhost:8081 |
| Backend (Express) | http://localhost:3001 |
| Backend health check | http://localhost:3001/api/health |
| Proxied health check | http://localhost:8081/api/health |

### Project structure

```text
my-app/
├── backend/
│   ├── data/
│   ├── uploads/
│   ├── server.js
│   └── dev.Dockerfile
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   └── dev.Dockerfile
├── nginx.dev.conf
└── docker-compose.dev.yml
```

### Run the development environment

From the repository root, execute:

```bash
docker compose -f my-app/docker-compose.dev.yml up --build
```

Open the application:

http://localhost:8081

To stop the containers:

```bash
docker compose -f my-app/docker-compose.dev.yml down
```

The application data and uploads are stored in local project folders through Docker bind mounts.

## Author

**Khim Philiph Chuol**

GitHub: [doctorphiliph19-afk](https://github.com/doctorphiliph19-afk)