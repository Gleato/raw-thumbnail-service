FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    curl \
    darktable \
    nodejs \
    npm \
    libgl1-mesa-glx \
    libxrandr2 \
    libxinerama1 \
    libxcursor1 \
    libxi6 \
    && apt-get clean

# Set working directory
WORKDIR /app

# Copy your Node app code
COPY . .

# Install dependencies
RUN npm install

# Expose the port (optional but good practice)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
