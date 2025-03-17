#!/bin/bash

# Обновление системы
apt update && apt upgrade -y

# Установка необходимых пакетов
apt install -y git nginx nodejs npm

# Установка PM2 глобально
npm install -g pm2

# Создание директории для проекта
mkdir -p /var/www/dev.iboost.ua/warpath

# Клонирование репозитория
git clone https://github.com/money1over/warpath.git /var/www/dev.iboost.ua/warpath

# Установка зависимостей
cd /var/www/dev.iboost.ua/warpath/server
npm install

# Настройка Nginx
cat > /etc/nginx/sites-available/dev.iboost.ua << 'EOL'
server {
    listen 80;
    server_name dev.iboost.ua;

    charset utf-8;
    client_max_body_size 20M;

    root /var/www/dev.iboost.ua/warpath/client;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';
    }

    location /assets/ {
        alias /var/www/dev.iboost.ua/warpath/client/assets/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    location /socket.io/ {
        proxy_pass http://localhost:81;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOL

# Активация конфигурации Nginx
ln -sf /etc/nginx/sites-available/dev.iboost.ua /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Запуск приложения через PM2
cd /var/www/dev.iboost.ua/warpath/server
pm2 delete all
pm2 start server.js --name "warpath" -- --port 81
pm2 save
pm2 startup 