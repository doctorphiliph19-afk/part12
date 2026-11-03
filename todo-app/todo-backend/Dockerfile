
FROM node:20

WORKDIR /usr/src/app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Expose backend port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
