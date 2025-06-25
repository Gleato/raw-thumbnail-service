FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies and Node.js 18 LTS
RUN apt-get update && \
    apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y \
    nodejs \
    darktable \
    xvfb \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libglu1-mesa \
    libxrandr2 \
    libxinerama1 \
    libxcursor1 \
    libxi6 \
    libxss1 \
    libgconf-2-4 \
    libxtst6 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libasound2 \
    libatk1.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libgbm1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy your Node app code
COPY . .

# Create a script to run darktable-cli with virtual display
RUN echo '#!/bin/bash\nxvfb-run -a --server-args="-screen 0 1024x768x24" darktable-cli "$@"' > /usr/local/bin/darktable-cli-headless \
    && chmod +x /usr/local/bin/darktable-cli-headless

# Expose the port
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
