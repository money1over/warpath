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
            console.log('Получено состояние игры:', state);

            // Инициализируем состояние игры, если оно еще не создано
            if (!this.game.gameState) {
                this.game.gameState = {
                    players: new Map(),
                    planets: new Map(),
                    projectiles: new Set(),
                    resources: { credits: 0 }
                };
            }

            // Обновляем состояние текущего игрока
            if (state.players) {
                const currentPlayer = state.players.find(player => player.id === this.socket.id);
                if (currentPlayer) {
                    this.game.playerShip.x = currentPlayer.x;
                    this.game.playerShip.y = currentPlayer.y;
                    this.game.playerShip.rotation = currentPlayer.rotation;
                    this.game.playerShip.shield = currentPlayer.shield;
                    this.game.playerShip.weapons = currentPlayer.weapons;
                    this.game.playerShip.cargoSlots = currentPlayer.cargoSlots;
                }

                // Обновляем других игроков
                state.players.forEach(player => {
                    if (player.id !== this.socket.id) {
                        this.game.gameState.players.set(player.id, player);
                    }
                });
            }

            // Обновляем состояние планет
            if (state.planets) {
                state.planets.forEach(planet => {
                    this.game.gameState.planets.set(planet.name, planet);
                });
            }

            // Добавляем существующие снаряды
            if (state.projectiles) {
                this.game.gameState.projectiles.clear();
                state.projectiles.forEach(projectile => {
                    this.game.gameState.projectiles.add(projectile);
                });
            }

            // Добавляем ботов
            if (state.bots) {
                this.game.bots = state.bots;
            }

            // Обновляем ресурсы
            if (state.resources) {
                this.game.gameState.resources = state.resources;
            }

            // Обновляем UI
            this.game.updateUI();
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
            console.log('Получен урон:', data);
            
            if (this.game.playerShip) {
                // Проверяем, что shield является числом
                if (typeof data.shield === 'number') {
                    this.game.playerShip.shield = data.shield;
                } else {
                    console.error('Некорректное значение щита:', data.shield);
                    return;
                }
                
                // Активируем анимацию урона только если вкладка активна
                if (this.game.isPageVisible) {
                    this.game.damageAnimation.active = true;
                    this.game.damageAnimation.startTime = Date.now();
                    this.game.showDamageNumber(this.game.playerShip.x, this.game.playerShip.y, data.damage);
                }
                
                // Проверяем уничтожение корабля
                if (this.game.playerShip.shield <= 0) {
                    this.game.playerShip.destroyed = true;
                    window.setTimeout(() => this.game.showRestartDialog(), 100);
                }
                
                this.game.updateUI();
            } else {
                console.error('playerShip не инициализирован');
            }
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