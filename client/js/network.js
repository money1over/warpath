class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = io();
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // Подключение к серверу
        this.socket.on('connect', () => {
            console.log('Подключено к серверу');
            this.initializePlayer();
        });

        // Получение полного состояния игры
        this.socket.on('game:state', (state) => {
            // Обновляем состояние игры
            state.players.forEach(player => {
                if (player.id !== this.socket.id) {
                    this.game.addOtherPlayer(player);
                }
            });

            // Обновляем состояние планет
            state.planets.forEach(planet => {
                this.game.updatePlanet(planet);
            });

            // Добавляем существующие снаряды
            state.projectiles.forEach(projectile => {
                this.game.addProjectile(projectile);
            });

            // Добавляем ботов
            if (state.bots) {
                this.game.bots = state.bots;
            }
        });

        // Новый игрок подключился
        this.socket.on('player:joined', (player) => {
            if (player.id !== this.socket.id) {
                this.game.addOtherPlayer(player);
                this.game.showNotification(`Игрок ${player.name} присоединился к игре`);
            }
        });

        // Обновление cargo slots
        this.socket.on('player:cargo_updated', (data) => {
            console.log('Получено обновление карго:', data);
            if (data.cargoSlots) {
                Object.entries(data.cargoSlots).forEach(([slotId, slotData]) => {
                    this.game.playerShip.cargoSlots[slotId] = {
                        ...this.game.playerShip.cargoSlots[slotId],
                        ...slotData
                    };
                });
                this.game.updateUI();
                this.game.showNotification('Ресурсы добыты!');
            }
        });

        // Обновление состояния игрока (включая оружие)
        this.socket.on('player:updated', (data) => {
            if (data.id === this.socket.id) {
                if (data.credits !== undefined) {
                    this.game.gameState.resources.credits = data.credits;
                }
                if (data.weapons !== undefined) {
                    this.game.playerShip.weapons = data.weapons;
                    this.game.showNotification('Оружие куплено!');
                }
                this.game.updateUI();
            } else {
                this.game.updateOtherPlayer(data);
            }
        });

        // Создание снаряда
        this.socket.on('projectile:created', (projectile) => {
            this.game.addProjectile(projectile);
        });

        // Обновление щита игрока
        this.socket.on('player:damaged', (data) => {
            // Обновляем щит независимо от состояния вкладки
            this.game.playerShip.shield = data.shield;
            
            // Активируем анимацию урона только если вкладка активна
            if (this.game.isPageVisible) {
                this.game.damageAnimation.active = true;
                this.game.damageAnimation.startTime = Date.now();
                this.game.showDamageNumber(this.game.playerShip.x, this.game.playerShip.y, data.damage);
            }
            
            // Проверяем уничтожение корабля
            if (data.shield <= 0) {
                this.game.playerShip.destroyed = true;
                window.setTimeout(() => this.game.showRestartDialog(), 100);
            }
            
            this.game.updateUI();
        });

        // Обновление кредитов
        this.socket.on('player:credits_updated', (data) => {
            this.game.gameState.resources.credits = data.credits;
            this.game.updateUI();
        });

        // Покупка оружия другим игроком
        this.socket.on('player:weapon_bought', (data) => {
            const player = this.game.getOtherPlayer(data.playerId);
            if (player) {
                player.weapons[data.weapon] = true;
            }
        });

        // Обновление ресурсов планеты
        this.socket.on('planet:resources_updated', (data) => {
            const planet = this.game.gameState.planets.get(data.name);
            if (planet) {
                planet.resources = data.resources;
                if (planet === this.game.gameState.currentPlanet) {
                    this.game.setTargetPlanet(planet); // Обновляем меню планеты
                }
            }
        });

        // Игрок отключился
        this.socket.on('player:left', (playerId) => {
            const player = this.game.getOtherPlayer(playerId);
            if (player) {
                this.game.removeOtherPlayer(playerId);
                this.game.showNotification(`Игрок ${player.name} покинул игру`);
            }
        });

        // Обновление состояния ботов
        this.socket.on('bots:updated', (bots) => {
            this.game.bots = bots;
        });

        // Обновление cargo slots
        this.socket.on('resources:extracted', (data) => {
            console.log('Ресурсы добыты:', data);
            
            // Обновляем состояние карго слотов
            if (data.cargoSlots) {
                Object.entries(data.cargoSlots).forEach(([slotId, slotData]) => {
                    this.game.playerShip.cargoSlots[slotId] = {
                        ...this.game.playerShip.cargoSlots[slotId],
                        ...slotData
                    };
                });
            }

            // Сохраняем ID планеты, с которой добыли ресурсы
            this.game.lastResourcePlanet = data.planetId;

            // Обновляем состояние планеты
            const planet = this.game.gameState.planets.get(data.planetId);
            if (planet) {
                planet.resources = data.planetResources;
            }

            // Обновляем интерфейс
            this.game.updateUI();
            this.game.showNotification('Ресурсы успешно добыты!');
        });
    }

    initializePlayer(name) {
        this.socket.emit('player:init', {
            x: this.game.playerShip.x,
            y: this.game.playerShip.y,
            rotation: this.game.playerShip.rotation,
            name: name || localStorage.getItem('playerName') || `Игрок ${Math.floor(Math.random() * 1000)}`
        });
    }

    sendMove(target, rotation, speed) {
        this.socket.emit('player:move', { target, rotation, speed });
    }

    sendShot(type) {
        this.socket.emit('player:shoot', {
            rotation: this.game.playerShip.rotation,
            type: type
        });
    }

    sendWeaponPurchase(weapon) {
        this.socket.emit('player:buy_weapon', { weapon });
    }

    sendResourceExtraction(planetName, amount) {
        this.socket.emit('resources:extract', {
            planetId: planetName,
            amount: amount
        });
    }
}

export default NetworkManager; 