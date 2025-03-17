const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const { WEAPONS, CARGO_SLOTS, INITIAL_PLAYER_STATE } = require('./gameConfig');

// Статические файлы
app.use(express.static(path.join(__dirname, '../client')));

// Игровые константы
const WORLD_SIZE = {
    width: 9600,
    height: 9600
};

const TICK_RATE = 60; // Частота обновления игры (тиков в секунду)
const TICK_INTERVAL = 1000 / TICK_RATE;

// Состояние игры
const gameState = {
    players: new Map(),
    projectiles: [],
    planets: new Map([
        ["Home", {
            name: "Home",
            type: "Колония",
            x: 2500,
            y: 2500,
            radius: 45,
            color: "#FFD700",
            resources: 0,
            regeneration: 0,
            isPlayerBase: true
        }],
        ["Alpha", {
            name: "Alpha",
            type: "Земная",
            x: 1500,
            y: 1500,
            radius: 50,
            color: "#4CAF50",
            resources: 1000,
            regeneration: 1
        }],
        ["Beta", {
            name: "Beta",
            type: "Ледяная",
            x: 3500,
            y: 2500,
            radius: 55,
            color: "#2196F3",
            resources: 2000,
            regeneration: 2,
            isPlayerBase: false
        }],
        ["Gamma", {
            name: "Gamma",
            type: "Вулканическая",
            x: 4500,
            y: 3500,
            radius: 60,
            color: "#FF5722",
            resources: 3000,
            regeneration: 3,
            isPlayerBase: false
        }],
        ["Delta", {
            name: "Delta",
            type: "Пустынная",
            x: 5500,
            y: 4500,
            radius: 65,
            color: "#FFC107",
            resources: 2500,
            regeneration: 2,
            isPlayerBase: false
        }]
    ]),
    bots: [],
    lastUpdate: Date.now()
};

// Обработка столкновений
function checkCollision(obj1, obj2, radius = 20) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < radius;
}

// Инициализация ботов
function initBots() {
    const botTypes = ['peaceful', 'aggressive'];
    for (let i = 0; i < 10; i++) {
        const type = botTypes[Math.floor(Math.random() * botTypes.length)];
        const bot = {
            id: `bot_${i}`,
            x: Math.random() * WORLD_SIZE.width,
            y: Math.random() * WORLD_SIZE.height,
            rotation: Math.random() * Math.PI * 2,
            speed: 2,
            maxSpeed: 3,
            type: type,
            health: 100,
            weapons: type === 'aggressive' ? {
                laser: { damage: 10, range: 200, cooldown: 1000, lastShot: 0 }
            } : null,
            target: null,
            color: type === 'aggressive' ? '#ff0000' : '#00ff00'
        };
        gameState.bots.push(bot);
    }
}

// Обновление ботов
function updateBots() {
    gameState.bots.forEach(bot => {
        // Обновление движения бота
        if (!bot.target) {
            // Случайное движение
            if (Math.random() < 0.02) {
                bot.target = {
                    x: Math.random() * WORLD_SIZE.width,
                    y: Math.random() * WORLD_SIZE.height
                };
                bot.rotation = Math.atan2(
                    bot.target.y - bot.y,
                    bot.target.x - bot.x
                );
            }
        } else {
            // Движение к цели
            const dx = bot.target.x - bot.x;
            const dy = bot.target.y - bot.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                bot.x += Math.cos(bot.rotation) * bot.speed;
                bot.y += Math.sin(bot.rotation) * bot.speed;
            } else {
                bot.target = null;
            }
        }

        // Агрессивные боты атакуют ближайшего игрока
        if (bot.type === 'aggressive' && bot.weapons) {
            let nearestPlayer = null;
            let minDistance = Infinity;

            gameState.players.forEach(player => {
                if (!player.destroyed) {
                    const dx = player.x - bot.x;
                    const dy = player.y - bot.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestPlayer = player;
                    }
                }
            });

            if (nearestPlayer && minDistance < bot.weapons.laser.range) {
                bot.target = { x: nearestPlayer.x, y: nearestPlayer.y };
                bot.rotation = Math.atan2(
                    nearestPlayer.y - bot.y,
                    nearestPlayer.x - bot.x
                );

                // Стрельба с учетом перезарядки
                const now = Date.now();
                if (now - bot.weapons.laser.lastShot > bot.weapons.laser.cooldown) {
                    const projectile = {
                        playerId: bot.id,
                        x: bot.x,
                        y: bot.y,
                        rotation: bot.rotation,
                        type: 'laser',
                        speed: 10,
                        damage: bot.weapons.laser.damage,
                        range: bot.weapons.laser.range,
                        distanceTraveled: 0,
                        isBot: true
                    };
                    gameState.projectiles.push(projectile);
                    io.emit('projectile:created', projectile);
                    bot.weapons.laser.lastShot = now;
                }
            }
        }
    });

    // Отправляем обновленное состояние ботов всем игрокам
    io.emit('bots:updated', gameState.bots);
}

// Инициализируем ботов при запуске сервера
initBots();

// Обновление состояния игры
function updateGame() {
    // Обновление снарядов
    gameState.projectiles = gameState.projectiles.filter(projectile => {
        if (projectile.type === 'missile' && projectile.target) {
            // Обновляем цель ракеты
            const target = projectile.target.isBot ? 
                gameState.bots.find(bot => bot.id === projectile.target.id) :
                gameState.players.get(projectile.target.id);

            if (target) {
                // Вычисляем новое направление к цели
                const dx = target.x - projectile.x;
                const dy = target.y - projectile.y;
                const angleToTarget = Math.atan2(dy, dx);
                
                // Плавно поворачиваем ракету к цели
                const angleDiff = angleToTarget - projectile.rotation;
                const turnSpeed = 0.1;
                projectile.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnSpeed);
            }
        }

        // Движение снаряда
        projectile.x += Math.cos(projectile.rotation) * projectile.speed;
        projectile.y += Math.sin(projectile.rotation) * projectile.speed;
        projectile.distanceTraveled += projectile.speed;

        let shouldKeepProjectile = true;

        if (projectile.type === 'bombs' && projectile.distanceTraveled >= projectile.range) {
            const explosionRadius = 200;
            let hitSomething = false;

            // Урон по игрокам от взрыва
            gameState.players.forEach((player, playerId) => {
                if (playerId !== projectile.playerId && !player.destroyed) {
                    const dx = player.x - projectile.x;
                    const dy = player.y - projectile.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance <= explosionRadius) {
                        const damageMultiplier = 1 - (distance / explosionRadius);
                        const damage = Math.floor(projectile.damage * damageMultiplier);

                        if (damage > 0) {
                            hitSomething = true;
                            player.shield -= damage;
                            console.log(`Бомба нанесла урон ${damage} игроку ${player.name}`);

                            if (player.shield <= 0) {
                                player.destroyed = true;
                                const killerName = gameState.players.get(projectile.playerId)?.name || 'Неизвестный игрок';
                                io.emit('player:killed', {
                                    killer: killerName,
                                    victim: player.name,
                                    isBot: false
                                });
                            }

                            io.to(playerId).emit('player:damaged', {
                                shield: player.shield,
                                damage: damage
                            });
                        }
                    }
                }
            });

            // Урон по ботам от взрыва
            for (let i = gameState.bots.length - 1; i >= 0; i--) {
                const bot = gameState.bots[i];
                const dx = bot.x - projectile.x;
                const dy = bot.y - projectile.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= explosionRadius) {
                    const damageMultiplier = 1 - (distance / explosionRadius);
                    const damage = Math.floor(projectile.damage * damageMultiplier);

                    if (damage > 0) {
                        hitSomething = true;
                        bot.health -= damage;
                        console.log(`Бомба нанесла урон ${damage} боту ${bot.id}`);

                        if (bot.health <= 0) {
                            gameState.bots.splice(i, 1);
                            const killerName = gameState.players.get(projectile.playerId)?.name || 'Неизвестный игрок';
                            io.emit('bot:killed', {
                                killer: killerName,
                                botId: bot.id
                            });
                        }
                    }
                }
            }

            if (hitSomething) {
                io.emit('explosion', {
                    x: projectile.x,
                    y: projectile.y,
                    radius: explosionRadius,
                    damage: projectile.damage
                });
            }

            shouldKeepProjectile = false;
        } else if (projectile.type === 'laser') {
            // Проверка попаданий лазера
            let hit = false;

            // Проверяем попадания по игрокам
            gameState.players.forEach((player, playerId) => {
                if (!hit && playerId !== projectile.playerId && !player.destroyed) {
                    const dx = player.x - projectile.x;
                    const dy = player.y - projectile.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 30) {
                        hit = true;
                        player.shield -= projectile.damage;
                        console.log(`Лазер нанес урон ${projectile.damage} игроку ${player.name}`);

                        if (player.shield <= 0) {
                            player.destroyed = true;
                            const killerName = projectile.isBot ? 'Бот' : 
                                (gameState.players.get(projectile.playerId)?.name || 'Неизвестный игрок');
                            io.emit('player:killed', {
                                killer: killerName,
                                victim: player.name,
                                isBot: projectile.isBot
                            });
                        }

                        io.to(playerId).emit('player:damaged', {
                            shield: player.shield,
                            damage: projectile.damage
                        });
                    }
                }
            });

            // Проверяем попадания по ботам
            if (!hit) {
                for (let i = gameState.bots.length - 1; i >= 0; i--) {
                    const bot = gameState.bots[i];
                    const dx = bot.x - projectile.x;
                    const dy = bot.y - projectile.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 30) {
                        hit = true;
                        bot.health -= projectile.damage;
                        console.log(`Лазер нанес урон ${projectile.damage} боту ${bot.id}`);

                        if (bot.health <= 0) {
                            gameState.bots.splice(i, 1);
                            const killerName = gameState.players.get(projectile.playerId)?.name || 'Неизвестный игрок';
                            io.emit('bot:killed', {
                                killer: killerName,
                                botId: bot.id
                            });
                        }
                        break;
                    }
                }
            }

            if (hit) {
                shouldKeepProjectile = false;
            }
        }

        return shouldKeepProjectile && projectile.distanceTraveled < projectile.range;
    });

    // Обновление игроков
    gameState.players.forEach((player, playerId) => {
        if (player.target) {
            const dx = player.target.x - player.x;
            const dy = player.target.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                player.x += Math.cos(player.rotation) * player.speed;
                player.y += Math.sin(player.rotation) * player.speed;

                // Проверка границ мира
                player.x = Math.max(0, Math.min(player.x, WORLD_SIZE.width));
                player.y = Math.max(0, Math.min(player.y, WORLD_SIZE.height));

                // Оповещаем всех игроков о новой позиции
                io.emit('player:updated', {
                    id: playerId,
                    x: player.x,
                    y: player.y,
                    rotation: player.rotation
                });
            } else {
                player.target = null;
            }
        }

        // Регенерация щита
        if (player.shield < 100) {
            player.shield = Math.min(100, player.shield + 0.1);
            io.to(playerId).emit('player:damaged', { shield: player.shield });
        }
    });

    // Обновление ресурсов планет
    gameState.planets.forEach(planet => {
        if (!planet.isPlayerBase && planet.resources < 3000) {
            planet.resources = Math.min(3000, planet.resources + planet.regeneration);
        }
    });

    // Обновляем ботов
    updateBots();
}

// Запуск игрового цикла
setInterval(updateGame, TICK_INTERVAL);

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);

    socket.on('player:init', (data) => {
        // Проверяем, есть ли уже игрок с таким именем
        const existingPlayer = [...gameState.players.values()].find(p => p.name === data.name);
        if (existingPlayer) {
            // Немедленно удаляем старую сессию
            const oldSocket = io.sockets.sockets.get(existingPlayer.id);
            if (oldSocket) {
                oldSocket.disconnect(true);
            }
            gameState.players.delete(existingPlayer.id);
            console.log('Удаляем старую сессию:', existingPlayer.id, existingPlayer.name);
            
            // Оповещаем всех об удалении старой сессии
            io.emit('player:left', {
                id: existingPlayer.id,
                name: existingPlayer.name,
                wasDisconnect: false
            });
        }

        // Создаем нового игрока
        const player = {
            id: socket.id,
            x: data.x || 4800,
            y: data.y || 4800,
            rotation: data.rotation || 0,
            name: data.name,
            speed: 0,
            maxSpeed: 5,
            shield: 100,
            destroyed: false,
            target: null,
            resources: { credits: 1000 },
            weapons: { laser: false, bombs: false, missile: false },
            cargoSlots: {
                slot1: { unlocked: true, amount: 0 },
                slot2: { unlocked: false, amount: 0 },
                slot3: { unlocked: false, amount: 0 },
                slot4: { unlocked: false, amount: 0 },
                slot5: { unlocked: false, amount: 0 }
            },
            lastShotTime: {},
            lastActiveTime: Date.now(),
            sessionStartTime: Date.now()
        };

        // Добавляем игрока
        gameState.players.set(socket.id, player);
        console.log('Игрок инициализирован:', player);

        // Отправляем текущее состояние игры новому игроку
        socket.emit('game:state', {
            currentPlayer: player,
            players: Array.from(gameState.players.values()),
            planets: Array.from(gameState.planets.values()),
            projectiles: gameState.projectiles,
            bots: gameState.bots,
            config: {
                weapons: WEAPONS,
                cargoSlots: CARGO_SLOTS
            }
        });

        // Оповещаем всех о новом игроке
        socket.broadcast.emit('player:joined', player);
    });

    socket.on('disconnect', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            console.log('Игрок отключился:', socket.id, player.name);
            gameState.players.delete(socket.id);
            
            // Оповещаем всех об отключении
            io.emit('player:left', {
                id: socket.id,
                name: player.name,
                wasDisconnect: true
            });

            // Отправляем обновленный список игроков всем
            io.emit('players:sync', Array.from(gameState.players.values()));
        }
    });

    // Обработка обновления позиции игрока
    socket.on('player:move', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.destroyed) {
            player.target = data.target;
            player.rotation = data.rotation;
            player.speed = Math.min(data.speed, player.maxSpeed);
            player.lastActiveTime = Date.now();

            // Отправляем обновление всем игрокам
            io.emit('player:updated', {
                id: socket.id,
                x: player.x,
                y: player.y,
                rotation: player.rotation,
                speed: player.speed,
                target: player.target
            });
        }
    });

    // Добавляем обработчик для обновления времени активности
    socket.on('player:heartbeat', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            player.lastActiveTime = Date.now();
        }
    });

    // Обработка выстрела
    socket.on('player:shoot', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player || player.destroyed || !player.weapons[data.type]) return;

        const weapon = WEAPONS[data.type];
        const now = Date.now();
        
        // Проверяем перезарядку
        if (!player.lastShotTime[data.type]) {
            player.lastShotTime[data.type] = 0;
        }
        
        if (now - player.lastShotTime[data.type] < weapon.cooldown) {
            // Оружие еще перезаряжается
            socket.emit('weapon:cooldown', {
                type: data.type,
                remainingTime: weapon.cooldown - (now - player.lastShotTime[data.type])
            });
            return;
        }

        // Обновляем время последнего выстрела
        player.lastShotTime[data.type] = now;

        const projectile = {
            playerId: socket.id,
            x: player.x + Math.cos(data.rotation) * 30,
            y: player.y + Math.sin(data.rotation) * 30,
            rotation: data.rotation,
            type: data.type,
            speed: weapon.speed,
            damage: weapon.damage,
            range: weapon.range,
            distanceTraveled: 0,
            isBot: false,
            target: data.type === 'missile' ? findNearestTarget(player) : null
        };

        gameState.projectiles.push(projectile);
        io.emit('projectile:created', projectile);
    });

    // Обработка покупки оружия
    socket.on('weapon:buy', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player) {
            socket.emit('purchase:failed', { message: 'Игрок не найден' });
            return;
        }

        const weapon = WEAPONS[data.type];
        if (!weapon) {
            socket.emit('purchase:failed', { message: 'Неизвестный тип оружия' });
            return;
        }

        // Проверяем, не куплено ли уже оружие
        if (player.weapons[data.type]) {
            socket.emit('purchase:failed', { message: 'У вас уже есть это оружие' });
            return;
        }

        console.log('Попытка покупки оружия:', {
            weaponType: data.type,
            weaponPrice: weapon.price,
            playerCredits: player.resources.credits
        });

        // Проверяем достаточно ли кредитов
        if (player.resources.credits < weapon.price) {
            socket.emit('purchase:failed', { message: 'Недостаточно кредитов' });
            return;
        }

        // Покупаем оружие
        player.resources.credits -= weapon.price;
        player.weapons[data.type] = true;
        
        // Инициализируем время последнего выстрела для нового оружия
        if (!player.lastShotTime) {
            player.lastShotTime = {};
        }
        player.lastShotTime[data.type] = 0;

        // Отправляем обновленное состояние игрока
        socket.emit('weapon:purchased', {
            type: data.type,
            credits: player.resources.credits,
            weapons: player.weapons
        });

        console.log(`Оружие куплено: ${data.type} игроком ${socket.id}, осталось кредитов: ${player.resources.credits}`);
    });

    // Обработчик добычи ресурсов
    socket.on('resources:extract', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player) return;

        const planet = gameState.planets.get(data.planetId);
        if (!planet) return;

        // Вычисляем расстояние до планеты
        const dx = player.x - planet.x;
        const dy = player.y - planet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 330; // Максимальное расстояние для добычи

        // Считаем доступное место в грузовом отсеке
        let availableSpace = 0;
        let unlockedSlots = 0;
        
        Object.values(player.cargoSlots).forEach(slot => {
            if (slot.unlocked) {
                unlockedSlots++;
                availableSpace += (100 - slot.amount); // Каждый слот вмещает 100 единиц
            }
        });

        console.log('Проверка добычи:', {
            distance,
            maxDistance,
            planetResources: planet.resources,
            availableSpace,
            unlockedSlots,
            requestedAmount: data.amount,
            playerCargo: player.cargoSlots
        });

        // Проверяем возможность добычи
        if (distance <= maxDistance && availableSpace > 0 && planet.resources > 0) {
            const extractAmount = Math.min(data.amount, availableSpace, planet.resources);
            
            console.log('Начинаем добычу:', { extractAmount, availableSpace, unlockedSlots });

            // Распределяем ресурсы по слотам
            let remainingToExtract = extractAmount;
            
            for (const [slotId, slot] of Object.entries(player.cargoSlots)) {
                if (slot.unlocked && remainingToExtract > 0) {
                    const spaceInSlot = 100 - slot.amount;
                    const amountToAdd = Math.min(spaceInSlot, remainingToExtract);
                    
                    console.log(`Добавляем в слот ${slotId}:`, { spaceInSlot, amountToAdd, remainingToExtract });
                    
                    slot.amount += amountToAdd;
                    remainingToExtract -= amountToAdd;
                }
            }

            // Уменьшаем ресурсы планеты
            planet.resources -= extractAmount;

            console.log('Ресурсы успешно добыты:', {
                extractAmount,
                planetResources: planet.resources,
                playerCargo: player.cargoSlots
            });

            // Оповещаем об успешной добыче
            socket.emit('resources:extracted', {
                planetId: data.planetId,
                planetResources: planet.resources,
                cargoSlots: player.cargoSlots
            });
        } else {
            console.log('Не удалось добыть ресурсы:', {
                distance,
                maxDistance,
                planetResources: planet.resources,
                availableSpace,
                playerCargo: player.cargoSlots
            });
        }
    });

    // Обработчик разгрузки ресурсов
    socket.on('player:cargo_unloaded', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player) return;

        // Очищаем все слоты
        for (const slot of Object.values(player.cargoSlots)) {
            if (slot.unlocked) {
                slot.amount = 0;
            }
        }

        // Обновляем кредиты
        player.credits = data.credits;

        // Отправляем обновленное состояние всем игрокам
        io.emit('player:updated', {
            id: socket.id,
            cargoSlots: player.cargoSlots,
            credits: player.credits
        });

        console.log('Ресурсы разгружены:', {
            playerId: socket.id,
            cargoSlots: player.cargoSlots,
            credits: player.credits
        });
    });

    // Обработчик покупки карго слота
    socket.on('player:cargo_slot_purchased', (data) => {
        const { slotId, credits } = data;
        const player = gameState.players.get(socket.id);
        
        if (!player) return;
        
        // Обновляем состояние игрока
        player.cargoSlots[slotId].unlocked = true;
        player.resources.credits = credits;
        
        // Отправляем обновленное состояние всем игрокам
        io.emit('player:updated', {
            id: socket.id,
            cargoSlots: player.cargoSlots,
            resources: player.resources
        });
        
        console.log('Карго слот куплен:', {
            playerId: socket.id,
            slotId: slotId,
            credits: credits,
            cargoSlots: player.cargoSlots
        });
    });

    // Обработка сообщений чата
    socket.on('player:message', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.destroyed) {
            const message = data.message.slice(0, 100); // Ограничиваем длину сообщения
            console.log(`Чат: ${player.name}: ${message}`);
            // Отправляем сообщение всем игрокам
            io.emit('player:message', {
                playerId: socket.id,
                message: message
            });
        }
    });

    // Обработка перезапуска игрока
    socket.on('player:restart', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            // Полностью сбрасываем состояние игрока
            const newPlayer = {
                id: socket.id,
                name: player.name,
                x: WORLD_SIZE.width / 2,
                y: WORLD_SIZE.height / 2,
                rotation: 0,
                speed: 0,
                maxSpeed: 5,
                shield: 100,
                destroyed: false,
                target: null,
                resources: {
                    credits: 1000
                },
                weapons: {
                    laser: false,
                    bombs: false,
                    missile: false
                },
                cargoSlots: {
                    slot1: { unlocked: true, amount: 0 },
                    slot2: { unlocked: false, amount: 0 },
                    slot3: { unlocked: false, amount: 0 },
                    slot4: { unlocked: false, amount: 0 },
                    slot5: { unlocked: false, amount: 0 }
                }
            };
            
            // Заменяем старого игрока новым
            gameState.players.set(socket.id, newPlayer);
            
            console.log(`Игрок ${newPlayer.name} перезапустил игру`);
            
            // Оповещаем всех о возрождении игрока
            io.emit('player:restarted', {
                id: socket.id,
                x: newPlayer.x,
                y: newPlayer.y,
                rotation: newPlayer.rotation,
                speed: newPlayer.speed,
                shield: newPlayer.shield,
                destroyed: false,
                resources: newPlayer.resources,
                weapons: newPlayer.weapons,
                cargoSlots: newPlayer.cargoSlots
            });

            // Отправляем новому игроку полное состояние игры
            socket.emit('game:state', {
                players: Array.from(gameState.players.values()),
                planets: Array.from(gameState.planets.values()),
                projectiles: gameState.projectiles,
                bots: gameState.bots
            });
        }
    });
});

// Добавляем функцию поиска ближайшей цели для ракеты
function findNearestTarget(shooter) {
    let nearestTarget = null;
    let minDistance = Infinity;

    // Проверяем игроков
    gameState.players.forEach((player, playerId) => {
        if (playerId !== shooter.id && !player.destroyed) {
            const dx = player.x - shooter.x;
            const dy = player.y - shooter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestTarget = { x: player.x, y: player.y, id: playerId, isBot: false };
            }
        }
    });

    // Проверяем ботов
    gameState.bots.forEach((bot) => {
        const dx = bot.x - shooter.x;
        const dy = bot.y - shooter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
            minDistance = distance;
            nearestTarget = { x: bot.x, y: bot.y, id: bot.id, isBot: true };
        }
    });

    return nearestTarget;
}

// Запуск сервера
const PORT = process.argv[2] || 80;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
}); 