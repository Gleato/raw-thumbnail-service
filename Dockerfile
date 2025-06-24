FROM ubuntu:22.04

# Install darktable-cli and dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    darktable imagemagick libgl1-mesa-glx libxrandr2 libxinerama1 libxcursor1 libxi6 && \
    apt-get clean

WORKDIR /app

