FROM node:18

# Install exiftool
RUN apt-get update && \
    apt-get install -y libimage-exiftool-perl && \
    apt-get clean

# Set working directory
WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Expose port
ENV PORT=3000
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]

