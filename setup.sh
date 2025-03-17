#!/bin/bash

# Обновление системы
apt update
apt upgrade -y

# Установка необходимых пакетов
apt install -y git nginx nodejs npm

# Установка NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Установка Node.js
nvm install 16
nvm use 16

# Создание директорий проектов
mkdir -p /var/www/dev.iboost.ua
mkdir -p /var/www/dev.iboost.ua/warpath

# Установка зависимостей
cd /var/www/dev.iboost.ua/warpath/server
npm install

# Настройка Nginx
cat > /etc/nginx/sites-available/dev.iboost.ua << 'EOL'
server {
    listen 80;
    server_name dev.iboost.ua;

    location / {
        root /var/www/dev.iboost.ua;
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name warpath.dev.iboost.ua;

    location / {
        root /var/www/dev.iboost.ua/warpath/client;
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:81;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Активация конфигурации Nginx
ln -sf /etc/nginx/sites-available/dev.iboost.ua /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# Установка PM2
npm install -g pm2

# Запуск приложений
cd /var/www/dev.iboost.ua/warpath/server
pm2 start server.js --name "warpath" -- --port 81
pm2 save
pm2 startup 