# Dockerfile

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Build the NestJS app
RUN npm run build

# Run the app
CMD ["npm", "run", "start:prod"]
