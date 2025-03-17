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
            console.log('Состояние playerShip до инициализации:', this.game.playerShip);
            this.initializePlayer();
        });

        // Получение полного состояния игры
        this.socket.on('game:state', (state) => {
            console.log('Получено обновление состояния игры:', state);
            
            // Обновляем состояние игры
            if (state.players) {
                // Находим текущего игрока
                const currentPlayer = state.players.find(p => p.id === this.socket.id);
                if (currentPlayer) {
                    console.log('Найден текущий игрок:', currentPlayer);
                    // Обновляем состояние корабля игрока
                    Object.assign(this.game.playerShip, currentPlayer);
                    console.log('Обновлено состояние корабля:', this.game.playerShip);
                }
            }
            
            // Обновляем другие части состояния
            if (state.planets) {
                this.game.gameState.planets = new Map(Object.entries(state.planets));
            }
            
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
            console.log('Получены данные об уроне:', data);
            console.log('Состояние корабля до обновления:', {
                shield: this.game.playerShip.shield,
                id: this.socket.id
            });
            
            if (data.playerId === this.socket.id) {
                // Проверяем, что значение щита является числом
                if (typeof data.shield === 'number') {
                    this.game.playerShip.shield = data.shield;
                    console.log('Состояние корабля после обновления:', {
                        shield: this.game.playerShip.shield,
                        id: this.socket.id
                    });
                    
                    // Активируем анимацию урона только если страница видна
                    if (this.game.isPageVisible) {
                        this.game.activateDamageAnimation();
                    }
                    
                    // Проверяем уничтожение корабля
                    if (data.shield <= 0) {
                        this.game.playerShip.destroyed = true;
                        this.game.showRestartDialog();
                    }
                    
                    this.game.updateUI();
                } else {
                    console.error('Получено некорректное значение щита:', data.shield);
                }
            } else {
                console.log('Получен урон для другого игрока:', data.playerId);
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

        // Обработка перезапуска игры
        this.socket.on('player:restarted', (data) => {
            console.log('Получены данные для перезапуска:', data);
            console.log('Состояние корабля до обновления:', {
                shield: this.game.playerShip.shield,
                id: this.socket.id
            });
            
            if (data.playerId === this.socket.id) {
                // Проверяем наличие необходимых данных
                if (data && typeof data.shield === 'number') {
                    // Полностью обновляем состояние корабля
                    Object.assign(this.game.playerShip, data);
                    
                    console.log('Состояние корабля после обновления:', {
                        shield: this.game.playerShip.shield,
                        id: this.socket.id
                    });
                    
                    this.game.updateUI();
                    this.game.showNotification('Игра перезапущена!');
                } else {
                    console.error('Получены некорректные данные для перезапуска:', data);
                }
            } else {
                console.log('Получено событие перезапуска для другого игрока:', data.playerId);
            }
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