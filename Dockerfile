FROM php:8.2-cli

RUN docker-php-ext-install pdo pdo_mysql mysqli

RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg-dev \
    libzip-dev \
    zip \
    unzip \
    && docker-php-ext-install gd zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

CMD php -S 0.0.0.0:${PORT:-8080} -t .