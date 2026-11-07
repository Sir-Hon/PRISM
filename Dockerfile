FROM php:8.2-cli

RUN docker-php-ext-install pdo pdo_mysql mysqli

COPY docker/php.ini /usr/local/etc/php/conf.d/prism.ini

WORKDIR /app
COPY . .

CMD php -S 0.0.0.0:${PORT:-8080} -t . router.php