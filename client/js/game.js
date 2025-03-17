import NetworkManager from './network.js';
class Game {
    constructor(initialState) {
        this.explosions = []; // Инициализируем массив взрывов
        
        // Добавляем свойство для отслеживания планеты добычи
        this.lastResourcePlanet = null;

        this.isPageVisible = true;
        
        // Добавляем обработчик видимости страницы
        document.addEventListener('visibilitychange', () => {
            this.isPageVisible = !document.hidden;
        });

        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error('Canvas not found!');
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Показываем игровой контейнер
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.display = 'block';
        }

        // Инициализация мини-карты
        this.minimap = {
            canvas: document.getElementById('minimapCanvas'),
            scale: 0.02, // 2% от размера мира
            size: 150 // размер в пикселях
        };

        if (this.minimap.canvas) {
            this.minimap.ctx = this.minimap.canvas.getContext('2d');
            this.minimap.canvas.width = this.minimap.size;
            this.minimap.canvas.height = this.minimap.size;
        } else {
            console.error('Minimap canvas not found!');
        }

        // Устанавливаем размеры canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Размер игрового мира
        this.worldSize = {
            width: 9600,  // 8 секторов по 1200 пикселей
            height: 9600
        };

        // Viewport (камера)
        this.viewport = {
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };

        // Инициализируем состояние игры
        this.gameState = {
            players: new Map(),
            planets: new Map(),
            projectiles: new Set(),
            resources: {
                credits: initialState?.resources?.credits || 1000
            }
        };

        // Инициализация корабля игрока
        this.playerShip = {
            x: this.worldSize.width / 2,
            y: this.worldSize.height / 2,
            rotation: 0,
            speed: 0,
            maxSpeed: 5,
            acceleration: 0.1,
            deceleration: 0.05,
            shield: 100,
            armor: 0,
            immortalArmor: false,
            energy: 100,
            destroyed: false,
            target: null,
            weapons: {
                laser: false,
                bombs: false,
                missile: false
            },
            currentWeapon: null,
            cargoSlots: {
                slot1: { unlocked: true, amount: 0 },
                slot2: { unlocked: false, amount: 0 },
                slot3: { unlocked: false, amount: 0 },
                slot4: { unlocked: false, amount: 0 },
                slot5: { unlocked: false, amount: 0 }
            },
            maxCargoPerSlot: 100
        };

        // Инициализация управления
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };

        // Инициализация ботов
        this.bots = [];

        // Добавляем анимацию урона
        this.damageAnimation = {
            active: false,
            startTime: 0,
            duration: 500
        };

        // Добавляем элемент для уведомлений
        this.notifications = {
            container: document.createElement('div'),
            timeout: 3000
        };
        this.notifications.container.className = 'notifications';
        this.notifications.container.style.cssText = `
            position: fixed;
            bottom: 180px;
            right: 10px;
            width: 250px;
            z-index: 1000;
        `;
        document.body.appendChild(this.notifications.container);

        // Инициализация всех игровых систем
        this.initPlanets();
        this.setupEventListeners();
        this.initGameSystems();

        // Центрируем viewport на корабле
        this.centerViewportOnShip();

        // Запускаем игровой цикл
        this.lastTime = 0;
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));

        // Отладочная информация
        console.log('Game initialized:', {
            worldSize: this.worldSize,
            viewport: this.viewport,
            playerShip: this.playerShip,
            planetsCount: this.gameState.planets.size,
            botsCount: this.bots.length,
            minimapInitialized: !!this.minimap.ctx
        });

        // Инициализация сетевого менеджера
        this.network = new NetworkManager(this);
        
        // Показываем диалог ввода имени при первом запуске
        if (!localStorage.getItem('playerName')) {
            this.showNameDialog();
        }

        // Добавляем массив для хранения сообщений игроков
        this.playerMessages = new Map();
        
        // Добавляем поле для ввода чата
        this.initChat();

        // Добавляем обработчик для успешной покупки оружия
        this.network.socket.on('weapon:purchased', (data) => {
            console.log('Оружие куплено:', data);
            this.playerShip.weapons[data.type] = true;
            this.gameState.resources.credits = data.credits;
            
            // Автоматически выбираем купленное оружие
            this.playerShip.currentWeapon = data.type;
            
            let weaponName = '';
            switch(data.type) {
                case 'laser': weaponName = 'Лазер'; break;
                case 'bombs': weaponName = 'Бомбы'; break;
                case 'missile': weaponName = 'Самонаводящаяся ракета'; break;
            }
            
            this.showNotification(`${weaponName} успешно куплен!`);
            this.updateUI();
            this.showShopMenu(); // Обновляем меню магазина
        });

        // Добавляем обработчик для неудачной покупки
        this.network.socket.on('purchase:failed', (data) => {
            this.showNotification(data.message);
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupEventListeners() {
        if (!this.isMobile) {
            // Обработка клавиш только для десктопа
            window.addEventListener('keydown', (e) => this.handleKeyDown(e));
            window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        }
        
        // Обработка кликов/тапов
        this.canvas.addEventListener(this.isMobile ? 'touchstart' : 'click', (e) => {
            const touch = e.touches ? e.touches[0] : e;
            this.handleClick(touch);
        });

        // Обработка выбора оружия
        document.querySelectorAll('.weaponSlot').forEach(slot => {
            slot.addEventListener('click', () => {
                const weapon = slot.dataset.weapon;
                if (this.playerShip.weapons[weapon]) {
                    // Убираем активный класс у всех слотов
                    document.querySelectorAll('.weaponSlot').forEach(s => s.classList.remove('active'));
                    // Добавляем активный класс выбранному слоту
                    slot.classList.add('active');
                    this.playerShip.currentWeapon = weapon;
                    this.showNotification(`Выбрано оружие: ${weapon === 'laser' ? 'Лазер' : 'Бомбы'}`);
                } else {
                    this.showNotification('Это оружие нужно сначала купить в магазине!');
                }
            });
        });

        // Закрытие меню при клике вне их области
        document.addEventListener('click', (e) => {
            // Получаем все активные меню
            const menus = document.querySelectorAll('.gameMenu, .weaponsMenu');
            
            menus.forEach(menu => {
                // Проверяем, активно ли меню и видимо ли оно
                if (menu.classList.contains('active') || getComputedStyle(menu).display !== 'none') {
                    // Проверяем, был ли клик внутри меню
                    const isClickInsideMenu = menu.contains(e.target);
                    // Проверяем, был ли клик по кнопке, открывающей меню
                    const isClickOnActionButton = e.target.closest('.actionButton, .actionBtn');
                    // Проверяем, был ли клик по планете
                    const isClickOnPlanet = e.target.closest('#gameCanvas') && this.isClickOnPlanet(e);
                    
                    // Закрываем меню только если клик был вне меню, не по кнопке и не по планете
                    if (!isClickInsideMenu && !isClickOnActionButton && !isClickOnPlanet) {
                        if (menu.classList.contains('weaponsMenu')) {
                            menu.remove(); // Удаляем временное меню оружия
                        } else {
                            menu.classList.remove('active');
                            menu.style.display = 'none';
                            
                            // Если это меню планеты, очищаем текущую планету
                            if (menu.id === 'planetMenu') {
                                this.gameState.currentPlanet = null;
                            }
                        }
                    }
                }
            });
        });

        // Предотвращаем закрытие меню при клике внутри него
        document.querySelectorAll('.gameMenu, .weaponsMenu').forEach(menu => {
            menu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // Обработка клика по мини-карте
        this.minimap.canvas?.addEventListener('click', (e) => {
            const rect = this.minimap.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.minimap.scale;
            const y = (e.clientY - rect.top) / this.minimap.scale;
            
            // Устанавливаем целевую позицию
            this.targetPosition = { x, y };
            this.playerShip.rotation = Math.atan2(
                y - this.playerShip.y,
                x - this.playerShip.x
            );
        });
    }

    isClickOnPlanet(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        // Проверяем, попадает ли клик в какую-либо планету
        for (const planet of this.gameState.planets.values()) {
            const dx = planet.x - worldPos.x;
            const dy = planet.y - worldPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < planet.radius) {
                return true;
            }
        }
        return false;
    }

    handleKeyDown(e) {
        switch(e.key.toLowerCase()) {
            case 'w': this.keys.w = true; break;
            case 'a': this.keys.a = true; break;
            case 's': this.keys.s = true; break;
            case 'd': this.keys.d = true; break;
        }

        // Стрельба только если выбрано оружие
        if (e.key === ' ' && this.playerShip.currentWeapon && !this.playerShip.destroyed) {
            if (this.playerShip.weapons[this.playerShip.currentWeapon]) {
                this.createProjectile(
                    this.playerShip.x,
                    this.playerShip.y,
                    this.playerShip.rotation,
                    this.playerShip.currentWeapon
                );
            } else {
                this.showNotification('Сначала купите это оружие!');
            }
        }
    }

    handleKeyUp(e) {
        switch(e.key.toLowerCase()) {
            case 'w': this.keys.w = false; break;
            case 'a': this.keys.a = false; break;
            case 's': this.keys.s = false; break;
            case 'd': this.keys.d = false; break;
        }
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);

        // Проверяем клик по планетам
        let clickedPlanet = false;
        this.gameState.planets.forEach((planet) => {
            const dx = planet.x - worldPos.x;
            const dy = planet.y - worldPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < planet.radius) {
                clickedPlanet = true;
                this.setTargetPlanet(planet);
            }
        });

        // Если не кликнули по планете, летим в указанную точку
        if (!clickedPlanet) {
            // Ограничиваем целевую точку границами мира
            const targetX = Math.max(0, Math.min(worldPos.x, this.worldSize.width));
            const targetY = Math.max(0, Math.min(worldPos.y, this.worldSize.height));

            // Обновляем целевую позицию только если она изменилась
            if (!this.targetPosition || this.targetPosition.x !== targetX || this.targetPosition.y !== targetY) {
                this.targetPosition = { x: targetX, y: targetY };
                this.playerShip.rotation = Math.atan2(targetY - this.playerShip.y, targetX - this.playerShip.x);
            }
        }
    }

    setTargetPlanet(planet) {
        this.gameState.currentPlanet = planet;
        const planetMenu = document.getElementById('planetMenu');
        if (!planetMenu) return;

        planetMenu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border: 2px solid #666;
            border-radius: 10px;
            z-index: 1000;
            color: white;
            min-width: 300px;
        `;

        // Подсчитываем количество разблокированных слотов и общую вместимость
        let unlockedSlots = 0;
        let totalCapacity = 0;
        let usedCapacity = 0;
        
        Object.values(this.playerShip.cargoSlots).forEach(slot => {
            if (slot.unlocked) {
                unlockedSlots++;
                totalCapacity += 100;
                usedCapacity += slot.amount;
            }
        });

        const cargoSlotsHtml = Object.entries(this.playerShip.cargoSlots)
            .map(([slotId, slot]) => `
                <div class="cargoSlot ${slot.amount > 0 ? 'filled' : ''}" style="${!slot.unlocked ? 'opacity: 0.5;' : ''}">
                    ${slotId}: ${slot.unlocked ? 
                        (slot.amount > 0 ? `Ресурсы (${slot.amount}/100)` : 'Пусто') : 
                        'Заблокирован'}
                </div>
            `).join('');

        planetMenu.innerHTML = `
            <div class="planetName" style="font-size: 20px; margin-bottom: 10px;">${planet.name}</div>
            <div class="planetType" style="margin-bottom: 15px;">${planet.type}</div>
            <div id="planetResources">
                <div class="resourceInfo">
                    <div style="margin-bottom: 10px;">Доступно карго боксов: ${unlockedSlots} (${usedCapacity}/${totalCapacity})</div>
                    ${!planet.isPlayerBase ? `
                        <div class="resourceRow" style="margin: 10px 0;">
                            <span>Доступно ресурсов: ${Math.floor(planet.resources)}</span>
                            <button class="extractButton" style="margin-left: 10px;">Добыть</button>
                        </div>
                    ` : ''}
                    <div class="cargoInfo" style="margin-top: 20px;">
                        <h4>Грузовые отсеки (${usedCapacity}/${totalCapacity}):</h4>
                        ${cargoSlotsHtml}
                        <button class="unloadButton" style="margin-top: 10px;">Продать ресурсы</button>
                    </div>
                </div>
            </div>
            <div class="actions" style="margin-top: 20px;">
                ${planet.isPlayerBase ? `
                    <button class="buildButton" style="margin-right: 10px;">Строить</button>
                    <button class="shopButton">Магазин</button>
                ` : ''}
            </div>
            <button class="closeButton" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: white; font-size: 20px; cursor: pointer;">×</button>
        `;

        // Добавляем обработчики событий
        planetMenu.querySelector('.closeButton')?.addEventListener('click', () => {
            planetMenu.style.display = 'none';
        });

        // Добавляем обработчик для кнопки добычи ресурсов
        planetMenu.querySelector('.extractButton')?.addEventListener('click', () => {
            this.extractResource();
        });

        // Добавляем обработчик для кнопки разгрузки
        planetMenu.querySelector('.unloadButton')?.addEventListener('click', () => {
            this.unloadCargo();
        });

        // Добавляем обработчик для кнопки магазина
        planetMenu.querySelector('.shopButton')?.addEventListener('click', () => {
            this.showShopMenu();
        });

        planetMenu.style.display = 'block';
    }

    showShopMenu() {
        // Удаляем старое меню, если оно существует
        const existingMenu = document.querySelector('.shopMenu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Создаем новое меню
        const shopMenu = document.createElement('div');
        shopMenu.className = 'shopMenu';
        shopMenu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border: 2px solid #666;
            border-radius: 10px;
            z-index: 1000;
            color: white;
            min-width: 300px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        const weaponItems = [
            { 
                id: 'laser', 
                name: 'Лазер', 
                price: 1000, 
                type: 'weapon', 
                description: 'Быстрое и точное оружие',
                icon: `<svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M7,2V4H8V11H7V13H8V20H7V22H17V20H16V13H17V11H16V4H17V2H7M11,4H13V7H11V4M11,8H13V10H11V8M11,11H13V13H11V11M11,14H13V16H11V14M11,17H13V20H11V17Z"/>
                </svg>`
            },
            { 
                id: 'bombs', 
                name: 'Бомбы', 
                price: 2000, 
                type: 'weapon', 
                description: 'Мощное оружие с большим уроном',
                icon: `<svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z"/>
                </svg>`
            },
            {
                id: 'missile',
                name: 'Самонаводящаяся ракета',
                price: 3000,
                type: 'weapon',
                description: 'Следует за целью и наносит большой урон',
                icon: `<svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12,2L4,12H7L5,22H11V12H13V22H19L17,12H20L12,2Z"/>
                </svg>`
            }
        ];

        // Получаем список купленного оружия
        const purchasedWeapons = weaponItems.filter(item => this.playerShip.weapons[item.id]);
        const availableWeapons = weaponItems.filter(item => !this.playerShip.weapons[item.id]);

        shopMenu.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #fff;">Магазин</h2>
            <div style="margin-bottom: 15px;">Доступно кредитов: <span class="credits">${this.gameState.resources.credits}</span></div>
            
            ${purchasedWeapons.length > 0 ? `
                <div class="shopSection">
                    <h3 style="margin: 20px 0 10px 0; color: #00ff00;">Купленное оружие</h3>
                    <div class="shopItems" style="display: flex; flex-direction: column; gap: 10px;">
                        ${purchasedWeapons.map(item => `
                            <div class="shopItem" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #00ff00; border-radius: 5px; background: rgba(0, 255, 0, 0.1);">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div class="itemIcon" style="width: 24px; height: 24px; color: #00ff00;">
                                        ${item.icon}
                                    </div>
                                    <div>
                                        <div style="font-weight: bold; color: #00ff00;">${item.name}</div>
                                        <div style="font-size: 12px; color: #aaa;">${item.description}</div>
                                    </div>
                                </div>
                                <div style="color: #00ff00;">Куплено</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${availableWeapons.length > 0 ? `
                <div class="shopSection">
                    <h3 style="margin: 20px 0 10px 0; color: #fff;">Доступное оружие</h3>
                    <div class="shopItems" style="display: flex; flex-direction: column; gap: 10px;">
                        ${availableWeapons.map(item => `
                            <div class="shopItem" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #444; border-radius: 5px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div class="itemIcon" style="width: 24px; height: 24px; color: #666;">
                                        ${item.icon}
                                    </div>
                                    <div>
                                        <div style="font-weight: bold;">${item.name}</div>
                                        <div style="font-size: 12px; color: #aaa;">${item.description}</div>
                                    </div>
                                </div>
                                <div>
                                    <span>${item.price} кредитов</span>
                                    <button class="buy-weapon" 
                                            data-weapon="${item.id}" 
                                            style="margin-left: 10px; padding: 5px 10px; background: #007bff; border: none; border-radius: 3px; color: white; cursor: pointer;">
                                        Купить
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <div class="shopSection">
                <h3 style="margin: 20px 0 10px 0; color: #fff;">Грузовые отсеки</h3>
                <div class="shopItems" style="display: flex; flex-direction: column; gap: 10px;">
                    ${Object.entries(this.playerShip.cargoSlots).map(([slotId, slot], index) => {
                        if (index === 0) return ''; // Пропускаем первый слот, он уже разблокирован
                        const price = 1000 * (index + 1); // Цена увеличивается с каждым слотом
                        return `
                            <div class="shopItem" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #444; border-radius: 5px;">
                                <div>
                                    <div style="font-weight: bold;">Грузовой отсек ${index + 1}</div>
                                    <div style="font-size: 12px; color: #aaa;">Вместимость: 100 единиц</div>
                                </div>
                                <div>
                                    <span>${price} кредитов</span>
                                    <button class="buy-cargo" 
                                            data-slot="${slotId}" 
                                            style="margin-left: 10px; padding: 5px 10px; background: ${slot.unlocked ? '#444' : '#007bff'}; border: none; border-radius: 3px; color: white; cursor: pointer;"
                                            ${slot.unlocked ? 'disabled' : ''}>
                                        ${slot.unlocked ? 'Куплено' : 'Купить'}
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <button class="closeButton" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: white; font-size: 20px; cursor: pointer;">×</button>
        `;

        // Добавляем обработчики событий
        const self = this;
        
        shopMenu.querySelector('.closeButton').addEventListener('click', () => {
            shopMenu.remove();
        });

        shopMenu.querySelectorAll('.buy-weapon').forEach(button => {
            button.addEventListener('click', () => {
                const weaponType = button.dataset.weapon;
                const weapon = weaponItems.find(w => w.id === weaponType);
                
                if (this.gameState.resources.credits >= weapon.price) {
                    // Отправляем запрос на покупку оружия
                    this.network.socket.emit('weapon:buy', { type: weaponType });
                } else {
                    this.showNotification('Недостаточно кредитов!');
                }
            });
        });

        shopMenu.querySelectorAll('.buy-cargo').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', () => {
                    const slotId = button.dataset.slot;
                    const slotIndex = parseInt(slotId.replace('slot', '')) - 1;
                    const price = 1000 * (slotIndex + 1);

                    if (this.gameState.resources.credits >= price) {
                        this.gameState.resources.credits -= price;
                        this.playerShip.cargoSlots[slotId].unlocked = true;
                        this.network.socket.emit('player:cargo_slot_purchased', {
                            slotId: slotId,
                            credits: this.gameState.resources.credits
                        });
                        this.showNotification(`Грузовой отсек ${slotIndex + 1} куплен!`);
                        this.updateUI();
                        this.showShopMenu(); // Обновляем меню магазина
                    } else {
                        this.showNotification('Недостаточно кредитов!');
                    }
                });
            }
        });

        document.body.appendChild(shopMenu);
    }

    extractResource() {
        const planet = this.gameState.currentPlanet;
        console.log('Попытка добычи ресурсов:', {
            planet,
            playerPosition: { x: this.playerShip.x, y: this.playerShip.y }
        });

        if (!planet) {
            this.showNotification('Планета не выбрана!');
            return;
        }

        if (planet.isPlayerBase) {
            this.showNotification('Нельзя добывать ресурсы с вашей планеты!');
            return;
        }

        // Проверяем расстояние до планеты
        const dx = planet.x - this.playerShip.x;
        const dy = planet.y - this.playerShip.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        console.log('Расстояние до планеты:', {
            distance,
            maxDistance: planet.radius + 265
        });

        if (distance > planet.radius + 265) {
            this.showNotification('Слишком далеко от планеты для добычи!');
            return;
        }

        // Подсчитываем доступное пространство во всех слотах
        let availableSpace = 0;
        for (const slot of Object.values(this.playerShip.cargoSlots)) {
            if (slot.unlocked) {
                availableSpace += (100 - (slot.amount || 0));
            }
        }

        console.log('Доступное пространство:', {
            availableSpace,
            cargoSlots: this.playerShip.cargoSlots
        });

        if (availableSpace <= 0) {
            this.showNotification('Нет свободных слотов для ресурсов! Сначала разгрузите корабль.');
            return;
        }

        // Отправляем запрос на добычу ресурсов на сервер
        console.log('Отправляем запрос на добычу:', {
            planetName: planet.name,
            amount: availableSpace
        });

        this.network.sendResourceExtraction(planet.name, availableSpace);
    }

    handlePlanetAction(actionId) {
        switch (actionId) {
            case 'extract':
                this.extractResource();
                break;
            case 'unload':
                this.unloadCargo();
                break;
            case 'shop':
                this.showShopMenu();
                break;
            case 'build':
                if (this.gameState.currentPlanet.isPlayerBase) {
                    this.showBuildMenu();
                } else {
                    this.showNotification('Строительство возможно только на вашей планете!');
                }
                break;
        }
    }

    unloadCargo() {
        if (!this.gameState.currentPlanet) {
            this.showNotification('Планета не выбрана!');
            return;
        }

        // Проверяем, не пытается ли игрок продать ресурсы на той же планете
        if (this.lastResourcePlanet === this.gameState.currentPlanet.name) {
            this.showNotification('Нельзя продавать ресурсы на планете, где они были добыты!');
            return;
        }

        let totalResources = 0;
        for (const slot of Object.values(this.playerShip.cargoSlots)) {
            if (slot.unlocked && slot.amount > 0) {
                totalResources += slot.amount;
            }
        }

        if (totalResources === 0) {
            this.showNotification('Нет ресурсов для разгрузки!');
            return;
        }

        // Обновляем кредиты
        this.gameState.resources.credits += totalResources * 10;

        // Отправляем событие разгрузки на сервер
        this.network.socket.emit('player:cargo_unloaded', {
            credits: this.gameState.resources.credits
        });

        // Очищаем все слоты локально
        for (const slot of Object.values(this.playerShip.cargoSlots)) {
            if (slot.unlocked) {
                slot.amount = 0;
            }
        }

        this.showNotification(`Ресурсы разгружены! Получено ${totalResources * 10} кредитов`);
        this.updateUI();
    }

    centerViewportOnShip() {
        this.viewport.x = this.playerShip.x - this.viewport.width / 2;
        this.viewport.y = this.playerShip.y - this.viewport.height / 2;

        // Ограничиваем viewport границами мира
        this.viewport.x = Math.max(0, Math.min(this.viewport.x, this.worldSize.width - this.viewport.width));
        this.viewport.y = Math.max(0, Math.min(this.viewport.y, this.worldSize.height - this.viewport.height));
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.viewport.x,
            y: worldY - this.viewport.y
        };
    }

    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.viewport.x,
            y: screenY + this.viewport.y
        };
    }

    checkGridCollision(x, y) {
        // Получаем индексы текущей и следующей клетки
        const currentCell = {
            x: Math.floor(this.playerShip.x / 1200),
            y: Math.floor(this.playerShip.y / 1200)
        };
        const nextCell = {
            x: Math.floor(x / 1200),
            y: Math.floor(y / 1200)
        };

        // Если пересекаем границу сектора
        if (currentCell.x !== nextCell.x || currentCell.y !== nextCell.y) {
            if (this.playerShip.immortalArmor) {
                return false;
            }
            
            if (this.playerShip.armor > 0) {
                this.playerShip.armor--;
                
                if (this.playerShip.armor === 4) {
                    this.playerShip.immortalArmor = true;
                    this.playerShip.armor = 5;
                    this.showNotification('Получена несгораемая броня!');
                }
                
                this.updateUI();
                return false;
            }
            
            this.playerShip.destroyed = true;
            this.showRestartDialog();
            return true;
        }
        return false;
    }

    update(deltaTime) {
        if (!this.gameState || !this.playerShip) return;

        this.updatePlayerShip(deltaTime);
        
        // Обновляем снаряды
        this.updateProjectiles();
        
        // Обновляем ресурсы
        this.updateResources(deltaTime);
        
        // Обновляем интерфейс
        this.updateUI();
        
        // Обновляем мини-карту
        this.updateMinimap();
    }

    updatePlayerShip(deltaTime) {
        if (this.playerShip.destroyed) return;

        // Регулировка скорости с помощью клавиш
        if (this.keys.w) {
            this.playerShip.speed = Math.min(this.playerShip.speed + this.playerShip.acceleration, this.playerShip.maxSpeed);
        } else if (this.keys.s) {
            this.playerShip.speed = Math.max(0, this.playerShip.speed - this.playerShip.deceleration);
        }

        // Поворот корабля
        if (this.keys.a) {
            this.playerShip.rotation -= 0.05;
        }
        if (this.keys.d) {
            this.playerShip.rotation += 0.05;
        }

        // Движение к цели или по клавишам
        let dx = 0;
        let dy = 0;

        if (this.playerShip.target) {
            dx = this.playerShip.target.x - this.playerShip.x;
            dy = this.playerShip.target.y - this.playerShip.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                // Плавное изменение скорости
                const targetSpeed = Math.min(distance / 50, this.playerShip.maxSpeed);
                this.playerShip.speed = this.playerShip.speed * 0.95 + targetSpeed * 0.05;
            } else {
                this.playerShip.speed = 0;
                this.playerShip.target = null;
            }
        }

        // Применяем движение
        if (this.playerShip.speed > 0) {
            const nextX = this.playerShip.x + Math.cos(this.playerShip.rotation) * this.playerShip.speed;
            const nextY = this.playerShip.y + Math.sin(this.playerShip.rotation) * this.playerShip.speed;

            // Проверяем границы мира
            this.playerShip.x = Math.max(0, Math.min(nextX, this.worldSize.width));
            this.playerShip.y = Math.max(0, Math.min(nextY, this.worldSize.height));

            // Если достигли границы мира, останавливаемся
            if (this.playerShip.x !== nextX || this.playerShip.y !== nextY) {
                this.playerShip.speed = 0;
                this.playerShip.target = null;
            }
        }

        // Обновляем viewport
        this.centerViewportOnShip();
    }

    updateResources(deltaTime) {
        if (!this.gameState.planets) return;

        // Регенерация ресурсов на планетах
        this.gameState.planets.forEach(planet => {
            if (!planet.isPlayerBase && planet.resources < 3000) { // Максимум 3000 ресурсов
                planet.resources = Math.min(
                    planet.resources + (planet.regeneration * deltaTime / 1000),
                    3000
                );
            }
        });

        // Обновление ресурсов базовой планеты игрока
        const playerBase = Array.from(this.gameState.planets.values()).find(p => p.isPlayerBase);
        if (playerBase) {
            // Производство ресурсов зданиями
            const production = {
                minerals: playerBase.buildings.mines * 2,
                food: playerBase.buildings.farms * 2,
                energy: playerBase.buildings.powerPlants * 2
            };

            Object.entries(production).forEach(([resource, amount]) => {
                playerBase.resources += (amount * deltaTime / 1000);
            });

            // Проверка на возможность повышения уровня
            const requiredResources = playerBase.level * 1000;
            if (playerBase.resources >= requiredResources) {
                playerBase.level++;
                playerBase.resources -= requiredResources;
                this.showNotification(`Уровень колонии повышен до ${playerBase.level}!`);
            }
        }
    }

    updateUI() {
        // Обновляем информацию о щите
        const shieldElement = document.getElementById('shield');
        if (shieldElement && this.playerShip) {
            shieldElement.textContent = `Щит: ${Math.floor(this.playerShip.shield)}%`;
        }

        // Обновляем информацию о кредитах
        const creditsElement = document.getElementById('credits');
        if (creditsElement && this.gameState && this.gameState.resources) {
            creditsElement.textContent = `Кредиты: ${this.gameState.resources.credits}`;
        }

        // Обновляем информацию о грузовых отсеках
        const cargoElement = document.getElementById('cargo');
        if (cargoElement && this.playerShip && this.playerShip.cargoSlots) {
            let totalCargo = 0;
            let totalCapacity = 0;
            let unlockedSlots = 0;

            Object.values(this.playerShip.cargoSlots).forEach(slot => {
                if (slot.unlocked) {
                    totalCargo += slot.amount || 0;
                    totalCapacity += 100;
                    unlockedSlots++;
                }
            });

            cargoElement.textContent = `Груз: ${totalCargo}/${totalCapacity}`;
        }

        // Обновляем инвентарь оружия
        const weaponsContainer = document.getElementById('weapons');
        if (weaponsContainer && this.playerShip && this.playerShip.weapons) {
            weaponsContainer.innerHTML = ''; // Очищаем контейнер перед обновлением
            
            const weaponsInventory = document.createElement('div');
            weaponsInventory.className = 'weapons-inventory';

            Object.entries(this.playerShip.weapons).forEach(([weaponType, isUnlocked]) => {
                if (!WEAPONS[weaponType]) return; // Пропускаем, если тип оружия не определен

                const weaponSlot = document.createElement('div');
                weaponSlot.className = `weapon-slot ${isUnlocked ? 'unlocked' : 'locked'}`;
                weaponSlot.innerHTML = `
                    <div class="weapon-icon">${WEAPONS[weaponType].icon || '⚔️'}</div>
                    <div class="weapon-name">${WEAPONS[weaponType].name}</div>
                    ${!isUnlocked ? `<div class="weapon-price">${WEAPONS[weaponType].price} кредитов</div>` : ''}
                `;

                if (isUnlocked) {
                    weaponSlot.addEventListener('click', () => {
                        this.playerShip.currentWeapon = weaponType;
                        this.updateUI();
                    });
                }

                weaponsInventory.appendChild(weaponSlot);
            });

            weaponsContainer.appendChild(weaponsInventory);
        }

        // Обновляем информацию о перезарядке
        const cooldownElement = document.getElementById('cooldown');
        if (cooldownElement && this.playerShip) {
            const selectedWeapon = this.playerShip.currentWeapon;
            if (selectedWeapon && this.playerShip.weapons[selectedWeapon]) {
                const lastShotTime = this.playerShip.lastShotTime?.[selectedWeapon] || 0;
                const cooldown = WEAPONS[selectedWeapon]?.cooldown || 1000;
                const now = Date.now();
                const remainingTime = Math.max(0, cooldown - (now - lastShotTime));
                
                if (remainingTime > 0) {
                    cooldownElement.textContent = `Перезарядка: ${Math.ceil(remainingTime / 1000)}с`;
                } else {
                    cooldownElement.textContent = 'Готово к стрельбе';
                }
            } else {
                cooldownElement.textContent = 'Оружие не выбрано';
            }
        }
    }

    getWeaponName(weaponType) {
        const names = {
            laser: 'Лазер',
            bombs: 'Бомбы',
            missile: 'Ракеты'
        };
        return names[weaponType] || weaponType;
    }

    render() {
        if (!this.ctx || !this.gameState) return;

        // Очищаем канвас
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Рисуем сетку
        this.renderGrid();

        // Рисуем звезды
        this.renderStars();

        // Проверяем наличие планет перед отрисовкой
        if (this.gameState.planets && this.gameState.planets.size > 0) {
            this.renderPlanets();
        } else {
            console.warn('No planets to render');
            this.initPlanets(); // Переинициализируем планеты если их нет
        }

        // Рисуем корабль игрока
        if (this.playerShip && !this.playerShip.destroyed) {
            this.renderPlayerShip();
        }

        // Рисуем ботов и снаряды
        if (this.bots && this.bots.length > 0) {
            this.renderBots();
        }
        if (this.gameState.projectiles && this.gameState.projectiles.size > 0) {
            this.renderProjectiles();
        }

        // Обновляем мини-карту
        this.updateMinimap();

        // Рендерим других игроков
        if (this.gameState.players) {
            this.gameState.players.forEach(player => {
                if (player.id !== this.network?.socket?.id) {
                    this.renderPlayer(player);
                }
            });
        }

        // Рендерим взрывы
        if (this.explosions && this.explosions.length > 0) {
            this.renderExplosions();
        }
    }

    renderGrid() {
        // Рисуем сетку секторов (1200x1200)
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 2;

        // Вертикальные линии секторов
        for (let x = Math.floor(this.viewport.x / 1200) * 1200; x <= Math.ceil((this.viewport.x + this.viewport.width) / 1200) * 1200; x += 1200) {
            const screenX = x - this.viewport.x;
            this.ctx.beginPath();
            this.ctx.moveTo(screenX, 0);
            this.ctx.lineTo(screenX, this.viewport.height);
            this.ctx.stroke();
        }

        // Горизонтальные линии секторов
        for (let y = Math.floor(this.viewport.y / 1200) * 1200; y <= Math.ceil((this.viewport.y + this.viewport.height) / 1200) * 1200; y += 1200) {
            const screenY = y - this.viewport.y;
            this.ctx.beginPath();
            this.ctx.moveTo(0, screenY);
            this.ctx.lineTo(this.viewport.width, screenY);
            this.ctx.stroke();
        }

        // Рисуем обычную сетку
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;

        // Вертикальные линии
        for (let x = Math.floor(this.viewport.x / 100) * 100; x <= Math.ceil((this.viewport.x + this.viewport.width) / 100) * 100; x += 100) {
            if (x % 800 !== 0) { // Не рисуем там, где уже есть линии секторов
                const screenX = x - this.viewport.x;
                this.ctx.beginPath();
                this.ctx.moveTo(screenX, 0);
                this.ctx.lineTo(screenX, this.viewport.height);
                this.ctx.stroke();
            }
        }

        // Горизонтальные линии
        for (let y = Math.floor(this.viewport.y / 100) * 100; y <= Math.ceil((this.viewport.y + this.viewport.height) / 100) * 100; y += 100) {
            if (y % 800 !== 0) { // Не рисуем там, где уже есть линии секторов
                const screenY = y - this.viewport.y;
                this.ctx.beginPath();
                this.ctx.moveTo(0, screenY);
                this.ctx.lineTo(this.viewport.width, screenY);
                this.ctx.stroke();
            }
        }
    }

    renderStars() {
        this.ctx.fillStyle = '#ffffff';
        // Создаем фиксированные звезды относительно viewport
        const seed = Math.floor(this.viewport.x + this.viewport.y);
        const random = (n) => {
            const x = Math.sin(n + seed) * 10000;
            return x - Math.floor(x);
        };
        
        for (let i = 0; i < 200; i++) {
            const x = random(i) * this.canvas.width;
            const y = random(i + 1000) * this.canvas.height;
            const size = random(i + 2000) > 0.9 ? 2 : 1;
            this.ctx.fillRect(x, y, size, size);
        }
    }

    renderPlanets() {
        if (!this.gameState.planets) return;
        
        this.gameState.planets.forEach(planet => {
            const screenPos = this.worldToScreen(planet.x, planet.y);
            
            if (screenPos.x + planet.radius >= 0 && 
                screenPos.x - planet.radius <= this.viewport.width &&
                screenPos.y + planet.radius >= 0 && 
                screenPos.y - planet.radius <= this.viewport.height) {
                
                const gradient = this.ctx.createRadialGradient(
                    screenPos.x, screenPos.y, planet.radius * 0.8,
                    screenPos.x, screenPos.y, planet.radius * 1.2
                );
                gradient.addColorStop(0, planet.color);
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, planet.radius * 1.2, 0, Math.PI * 2);
                this.ctx.fillStyle = gradient;
                this.ctx.fill();

                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, planet.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = planet.color;
                this.ctx.fill();
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(planet.name, screenPos.x, screenPos.y - planet.radius - 10);
                
                this.ctx.font = '14px Arial';
                this.ctx.fillText(planet.type, screenPos.x, screenPos.y - planet.radius - 30);

                // Индикатор ресурсов
                if (!planet.isPlayerBase) {
                    const resourceBarWidth = 60;
                    const resourceBarHeight = 4;
                    const resourceBarY = screenPos.y + planet.radius + 15;
                    
                    // Фон индикатора
                    this.ctx.fillStyle = '#333';
                    this.ctx.fillRect(
                        screenPos.x - resourceBarWidth/2,
                        resourceBarY,
                        resourceBarWidth,
                        resourceBarHeight
                    );

                    // Заполнение индикатора
                    const maxResources = 3000; // Максимальное количество ресурсов
                    const fillWidth = (resourceBarWidth * planet.resources / maxResources);
                    this.ctx.fillStyle = '#FFD700';
                    this.ctx.fillRect(
                        screenPos.x - resourceBarWidth/2,
                        resourceBarY,
                        fillWidth,
                        resourceBarHeight
                    );
                }
            }
        });
    }

    renderPlayerShip() {
        const screenPos = this.worldToScreen(this.playerShip.x, this.playerShip.y);

        // Проверяем, виден ли корабль в viewport
        if (screenPos.x >= -20 && screenPos.x <= this.viewport.width + 20 &&
            screenPos.y >= -20 && screenPos.y <= this.viewport.height + 20) {

            this.ctx.save();
            this.ctx.translate(screenPos.x, screenPos.y);
            this.ctx.rotate(this.playerShip.rotation);

            // Если активна анимация урона, рисуем красное свечение
            if (this.damageAnimation.active) {
                const timePassed = Date.now() - this.damageAnimation.startTime;
                if (timePassed < this.damageAnimation.duration) {
                    const alpha = 1 - (timePassed / this.damageAnimation.duration);
                    this.ctx.shadowColor = 'red';
                    this.ctx.shadowBlur = 20 * alpha;
                } else {
                    this.damageAnimation.active = false;
                }
            }

            // Рисуем корабль (треугольник)
            this.ctx.beginPath();
            this.ctx.moveTo(20, 0);
            this.ctx.lineTo(-10, -10);
            this.ctx.lineTo(-10, 10);
            this.ctx.closePath();
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fill();
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Рисуем индикатор щита
            const shieldRadius = 25;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2 * (this.playerShip.shield / 100));
            this.ctx.strokeStyle = `rgba(0, 255, 255, ${this.playerShip.shield / 100})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Рисуем индикатор брони
            if (this.playerShip.armor > 0 || this.playerShip.immortalArmor) {
                const armorColor = this.playerShip.immortalArmor ? 
                    'rgba(0, 255, 0, 0.5)' : 
                    'rgba(255, 255, 0, 0.5)';
                
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 30, 0, Math.PI * 2);
                this.ctx.strokeStyle = armorColor;
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }

            // Добавляем двигатели (если корабль движется)
            if (this.playerShip.speed > 0) {
                this.ctx.beginPath();
                this.ctx.moveTo(-10, 0);
                this.ctx.lineTo(-20 - Math.random() * 10, 0);
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }

            this.ctx.restore();
        }
    }

    gameLoop(timestamp) {
        if (!this.ctx) return;
        
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Проверяем наличие планет
        if (!this.gameState.planets || this.gameState.planets.size === 0) {
            this.initPlanets();
        }

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    initGameSystems() {
        // Инициализация игровых систем
        this.systems = {
            combat: {
                damage: 10,
                range: 100,
                cooldown: 1000
            },
            mining: {
                range: 50,
                rate: 1,
                capacity: 100
            },
            trade: {
                prices: {
                    energy: { buy: 10, sell: 8 },
                    minerals: { buy: 20, sell: 16 },
                    food: { buy: 15, sell: 12 }
                }
            },
            research: {
                points: 0,
                rate: 1
            }
        };
    }

    initPlanets() {
        // Проверяем, не инициализированы ли уже планеты
        if (!this.gameState.planets) {
            this.gameState.planets = new Map();
        }

        if (this.gameState.planets.size > 0) {
            console.log('Planets already initialized');
            return;
        }

        const planetsData = [
            { 
                name: "Alpha", 
                type: "Земная", 
                x: 1500, 
                y: 1500, 
                radius: 50, 
                color: "#4CAF50",
                resources: Math.floor(Math.random() * 1000) + 500,
                regeneration: 1
            },
            { 
                name: "Beta", 
                type: "Газовый гигант", 
                x: 3500, 
                y: 2500, 
                radius: 65, 
                color: "#2196F3",
                resources: Math.floor(Math.random() * 2000) + 1000,
                regeneration: 2
            },
            { 
                name: "Home", 
                type: "Колония", 
                x: 2500, 
                y: 2500, 
                radius: 45, 
                color: "#FFD700",
                resources: 0,
                regeneration: 0,
                isPlayerBase: true,
                level: 1,
                buildings: {
                    mines: 0,
                    farms: 0,
                    powerPlants: 0
                }
            }
        ];

        planetsData.forEach(planet => {
            this.gameState.planets.set(planet.name, planet);
        });

        console.log('Planets initialized:', {
            planetsCount: this.gameState.planets.size,
            planets: Array.from(this.gameState.planets.values())
        });
    }

    renderBots() {
        this.bots.forEach(bot => {
            const screenPos = this.worldToScreen(bot.x, bot.y);

            // Проверяем, находится ли бот в пределах viewport
            if (screenPos.x >= 0 && screenPos.x <= this.viewport.width &&
                screenPos.y >= 0 && screenPos.y <= this.viewport.height) {
                
                this.ctx.save();
                this.ctx.translate(screenPos.x, screenPos.y);
                this.ctx.rotate(bot.rotation);

                // Рисуем корпус бота
                this.ctx.beginPath();
                this.ctx.moveTo(15, 0);
                this.ctx.lineTo(-10, -10);
                this.ctx.lineTo(-10, 10);
                this.ctx.closePath();
                this.ctx.fillStyle = bot.color;
                this.ctx.fill();
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                this.ctx.restore();
            }
        });
    }

    // Система оружия
    createProjectile(x, y, rotation, type, isBot = false) {
        if (!this.projectiles) {
            this.projectiles = [];
        }

        // Проверяем, есть ли у игрока это оружие
        if (!isBot && !this.playerShip.weapons[type]) {
            this.showNotification('Это оружие не куплено!');
            return;
        }

        // Настройки урона для разных типов оружия
        const damageConfig = {
            laser: 10,
            bombs: 20,
            missile: 35
        };

        const projectile = {
            x: x + Math.cos(rotation) * 20,
            y: y + Math.sin(rotation) * 20,
            rotation: rotation,
            type: type,
            isBot: isBot,
            speed: type === 'laser' ? 10 : (type === 'missile' ? 7 : 5),
            damage: damageConfig[type] || 10,
            range: type === 'laser' ? 600 : (type === 'missile' ? 800 : 200),
            distanceTraveled: 0,
            ownerId: this.network.socket.id
        };

        this.projectiles.push(projectile);

        // Отправляем информацию о выстреле на сервер только для выстрелов игрока
        if (!isBot) {
            this.network.socket.emit('player:shoot', {
                x: projectile.x,
                y: projectile.y,
                rotation: rotation,
                type: type,
                damage: projectile.damage
            });
        }
    }

    updateProjectiles() {
        if (!this.projectiles || !Array.isArray(this.projectiles)) {
            this.projectiles = [];
            return;
        }

        const newProjectiles = [];
        
        for (const projectile of this.projectiles) {
            if (!projectile) continue;

            // Обновляем позицию снаряда
            projectile.x += Math.cos(projectile.rotation) * projectile.speed;
            projectile.y += Math.sin(projectile.rotation) * projectile.speed;
            projectile.distanceTraveled += projectile.speed;

            // Проверяем дальность
            if (projectile.distanceTraveled >= projectile.range) {
                continue;
            }

            // Для ракет - поиск цели
            if (projectile.type === 'missile' && !projectile.isBot) {
                let nearestTarget = null;
                let minDistance = 800;

                // Проверяем ботов
                if (this.bots && Array.isArray(this.bots)) {
                    for (const bot of this.bots) {
                        if (!bot) continue;
                        const distance = Math.hypot(bot.x - projectile.x, bot.y - projectile.y);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestTarget = bot;
                        }
                    }
                }

                // Проверяем игроков
                if (this.gameState.players) {
                    for (const [id, player] of this.gameState.players) {
                        if (!player || id === projectile.ownerId || player.destroyed) continue;
                        const distance = Math.hypot(player.x - projectile.x, player.y - projectile.y);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestTarget = player;
                        }
                    }
                }

                // Корректируем траекторию если есть цель
                if (nearestTarget) {
                    const targetAngle = Math.atan2(
                        nearestTarget.y - projectile.y,
                        nearestTarget.x - projectile.x
                    );
                    let angleDiff = targetAngle - projectile.rotation;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    projectile.rotation += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 0.1);
                }
            }

            // Проверка попаданий
            let hit = false;

            // Попадание в ботов
            if (!projectile.isBot && this.bots && Array.isArray(this.bots)) {
                for (let i = 0; i < this.bots.length; i++) {
                    const bot = this.bots[i];
                    if (!bot) continue;

                    const distance = Math.hypot(bot.x - projectile.x, bot.y - projectile.y);
                    if (distance < 20) {
                        // Наносим урон боту
                        bot.health -= projectile.damage;
                        
                        // Создаем взрыв при попадании
                        this.queueExplosion(projectile.x, projectile.y, projectile.type === 'missile' ? 30 : 15);

                        // Показываем урон
                        this.showDamageNumber(bot.x, bot.y, projectile.damage);

                        if (bot.health <= 0) {
                            this.bots.splice(i, 1);
                            this.queueExplosion(bot.x, bot.y, 50);
                            this.gameState.resources.credits += 100;
                            this.showNotification('Бот уничтожен! +100 кредитов');
                            this.updateUI();
                        }
                        
                        hit = true;
                        break;
                    }
                }
            }

            // Попадание в игроков
            if (!hit && !projectile.isBot && this.gameState.players) {
                for (const [id, player] of this.gameState.players) {
                    if (!player || id === projectile.ownerId || player.destroyed) continue;

                    const distance = Math.hypot(player.x - projectile.x, player.y - projectile.y);
                    if (distance < 20) {
                        // Отправляем событие попадания на сервер
                        this.network.socket.emit('player:hit', {
                            targetId: id,
                            damage: projectile.damage,
                            weaponType: projectile.type,
                            x: projectile.x,
                            y: projectile.y
                        });

                        // Создаем взрыв при попадании
                        this.queueExplosion(projectile.x, projectile.y, projectile.type === 'missile' ? 30 : 15);

                        // Показываем урон
                        this.showDamageNumber(player.x, player.y, projectile.damage);
                        
                        hit = true;
                        break;
                    }
                }
            }

            // Попадание в игрока от ботов
            if (!hit && projectile.isBot && this.playerShip && !this.playerShip.destroyed) {
                const distance = Math.hypot(this.playerShip.x - projectile.x, this.playerShip.y - projectile.y);
                if (distance < 20) {
                    // Наносим урон игроку
                    const previousShield = this.playerShip.shield;
                    this.playerShip.shield = Math.max(0, this.playerShip.shield - projectile.damage);
                    
                    // Активируем анимацию урона
                    this.damageAnimation.active = true;
                    this.damageAnimation.startTime = Date.now();

                    // Создаем взрыв при попадании
                    this.queueExplosion(projectile.x, projectile.y, projectile.type === 'missile' ? 30 : 15);

                    // Показываем урон
                    this.showDamageNumber(this.playerShip.x, this.playerShip.y, projectile.damage);

                    this.updateUI();

                    // Проверяем уничтожение корабля
                    if (previousShield > 0 && this.playerShip.shield <= 0) {
                        this.playerShip.destroyed = true;
                        window.setTimeout(() => this.showRestartDialog(), 100);
                    }
                    
                    hit = true;
                }
            }

            // Если снаряд не попал - сохраняем его
            if (!hit) {
                newProjectiles.push(projectile);
            }
        }

        this.projectiles = newProjectiles;
        this.processExplosionQueue();
    }

    showDamageNumber(x, y, damage) {
        const screenPos = this.worldToScreen(x, y);
        const damageText = document.createElement('div');
        damageText.className = 'damage-number';
        damageText.textContent = Math.round(damage);
        damageText.style.cssText = `
            position: fixed;
            left: ${screenPos.x}px;
            top: ${screenPos.y}px;
            color: red;
            font-weight: bold;
            font-size: 20px;
            text-shadow: 2px 2px 2px black;
            pointer-events: none;
            animation: fadeUp 1s ease-out forwards;
        `;
        document.body.appendChild(damageText);
        setTimeout(() => damageText.remove(), 1000);
    }

    queueExplosion(x, y, radius) {
        if (!this._explosionQueue) {
            this._explosionQueue = [];
        }
        this._explosionQueue.push({x, y, radius});
    }

    processExplosionQueue() {
        if (!this._explosionQueue || !this.explosions) return;
        
        while (this._explosionQueue.length > 0) {
            const explosion = this._explosionQueue.shift();
            this.explosions.push({
                x: explosion.x,
                y: explosion.y,
                radius: explosion.radius,
                startTime: Date.now(),
                duration: 1000
            });
        }
    }

    createExplosion(x, y, radius) {
        if (!this.explosions) {
            this.explosions = [];
        }
        this.explosions.push({
            x: x,
            y: y,
            radius: radius,
            startTime: Date.now(),
            duration: 1000
        });
    }

    renderProjectiles() {
        if (!this.projectiles) return;

        this.projectiles.forEach(projectile => {
            const screenPos = this.worldToScreen(projectile.x, projectile.y);

            this.ctx.save();
            this.ctx.translate(screenPos.x, screenPos.y);
            this.ctx.rotate(projectile.rotation);

            if (projectile.type === 'laser') {
                // Рисуем лазер
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(20, 0);
                this.ctx.strokeStyle = projectile.isBot ? '#ff0000' : '#00ff00';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            } else {
                // Рисуем бомбу
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 5, 0, Math.PI * 2);
                this.ctx.fillStyle = '#ff9900';
                this.ctx.fill();
            }

            this.ctx.restore();
        });
    }

    updateMinimap() {
        if (!this.minimap.canvas || !this.minimap.ctx) return;

        const ctx = this.minimap.ctx;
        const scale = this.minimap.scale;

        // Очищаем мини-карту
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, this.minimap.size, this.minimap.size);

        // Рисуем границы мира
        ctx.strokeStyle = '#444';
        ctx.strokeRect(0, 0, this.minimap.size, this.minimap.size);

        // Рисуем планеты
        if (this.gameState.planets) {
            this.gameState.planets.forEach(planet => {
                ctx.beginPath();
                ctx.arc(
                    planet.x * scale,
                    planet.y * scale,
                    planet.radius * scale * 2,
                    0,
                    Math.PI * 2
                );
                ctx.fillStyle = planet.color;
                ctx.fill();
            });
        }

        // Рисуем ботов
        if (this.bots) {
            this.bots.forEach(bot => {
                ctx.beginPath();
                ctx.arc(
                    bot.x * scale,
                    bot.y * scale,
                    2,
                    0,
                    Math.PI * 2
                );
                ctx.fillStyle = bot.color;
                ctx.fill();
            });
        }

        // Рисуем корабль игрока
        if (this.playerShip && !this.playerShip.destroyed) {
            ctx.beginPath();
            ctx.arc(
                this.playerShip.x * scale,
                this.playerShip.y * scale,
                3,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = '#fff';
            ctx.fill();
        }

        // Рисуем область видимости (viewport)
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(
            this.viewport.x * scale,
            this.viewport.y * scale,
            this.viewport.width * scale,
            this.viewport.height * scale
        );
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 16px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s';
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }

    renderPlayer(player) {
        const screenPos = this.worldToScreen(player.x, player.y);
        
        this.ctx.save();
        this.ctx.translate(screenPos.x, screenPos.y);
        this.ctx.rotate(player.rotation);

        // Рисуем корабль
        this.ctx.beginPath();
        this.ctx.moveTo(20, 0);
        this.ctx.lineTo(-10, -10);
        this.ctx.lineTo(-10, 10);
        this.ctx.closePath();
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Рисуем имя игрока
        this.ctx.rotate(-player.rotation);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name, 0, -20);

        // Рисуем щит
        if (player.shield > 0) {
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 25, 0, Math.PI * 2 * (player.shield / 100));
            this.ctx.strokeStyle = `rgba(0, 255, 255, ${player.shield / 100})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // Отрисовка сообщения над игроком
        const message = this.playerMessages.get(player.id);
        if (message && Date.now() - message.timestamp < 5000) {
            const [screenX, screenY] = this.worldToScreen(player.x, player.y);
            this.ctx.font = '14px Arial';
            this.ctx.fillStyle = 'white';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(message.text, screenX, screenY - 50);
        }

        this.ctx.restore();
    }

    addOtherPlayer(player) {
        this.gameState.players.set(player.id, player);
    }

    updateOtherPlayer(data) {
        const player = this.gameState.players.get(data.id);
        if (player) {
            Object.assign(player, data);
        }
    }

    removeOtherPlayer(playerId) {
        this.gameState.players.delete(playerId);
    }

    getOtherPlayer(playerId) {
        return this.gameState.players.get(playerId);
    }

    addProjectile(projectile) {
        this.gameState.projectiles.add(projectile);
    }

    updatePlanet(planetData) {
        const planet = this.gameState.planets.get(planetData.name);
        if (planet) {
            Object.assign(planet, planetData);
        } else {
            this.gameState.planets.set(planetData.name, planetData);
        }
    }

    handleShoot() {
        if (this.playerShip && !this.playerShip.destroyed) {
            const currentWeapon = this.playerShip.currentWeapon || 'laser';
            this.network.sendShot(currentWeapon);
        }
    }

    showNameDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 10px;
            border: 2px solid #666;
            z-index: 1000;
            text-align: center;
            color: white;
            min-width: 300px;
        `;

        dialog.innerHTML = `
            <h2 style="margin-bottom: 20px;">Введите ваше имя</h2>
            <input type="text" id="playerNameInput" style="
                width: 80%;
                padding: 10px;
                margin-bottom: 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid #666;
                border-radius: 5px;
                color: white;
                font-size: 16px;
            " placeholder="Имя игрока">
            <button id="startGameBtn" style="
                padding: 10px 20px;
                background: #4CAF50;
                border: none;
                border-radius: 5px;
                color: white;
                cursor: pointer;
                font-size: 16px;
            ">Начать игру</button>
        `;

        document.body.appendChild(dialog);

        const input = document.getElementById('playerNameInput');
        const button = document.getElementById('startGameBtn');

        button.addEventListener('click', () => {
            const name = input.value.trim();
            if (name) {
                localStorage.setItem('playerName', name);
                dialog.remove();
                this.network.initializePlayer(name);
            }
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                button.click();
            }
        });
    }

    showRestartDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            padding: 30px;
            border-radius: 15px;
            border: 2px solid #666;
            z-index: 1000;
            text-align: center;
            color: white;
            min-width: 400px;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        `;

        dialog.innerHTML = `
            <h2 style="margin-bottom: 30px; color: #ff3333; font-size: 24px;">Корабль уничтожен!</h2>
            <div style="margin: 20px 0; padding: 15px; border: 2px dashed #666; border-radius: 10px;">
                <a href="https://t.me/moneylover" target="_blank" style="
                    text-decoration: none;
                    color: #4CAF50;
                    font-size: 18px;
                    display: block;
                    margin-bottom: 10px;
                ">
                    Подпишись на наш Telegram канал!
                </a>
                <p style="color: #888; margin: 10px 0;">Получай новости и обновления игры первым</p>
            </div>
            <button id="restartGameBtn" style="
                padding: 15px 30px;
                background: #4CAF50;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 18px;
                margin-top: 20px;
                transition: background 0.3s;
            ">Начать заново</button>
        `;

        document.body.appendChild(dialog);

        const restartBtn = document.getElementById('restartGameBtn');
        restartBtn.addEventListener('mouseover', () => {
            restartBtn.style.background = '#45a049';
        });
        restartBtn.addEventListener('mouseout', () => {
            restartBtn.style.background = '#4CAF50';
        });
        restartBtn.addEventListener('click', () => {
            // Очищаем состояние игры
            this.playerShip = {
                x: this.worldSize.width / 2,
                y: this.worldSize.height / 2,
                rotation: 0,
                speed: 0,
                maxSpeed: 5,
                acceleration: 0.1,
                deceleration: 0.05,
                shield: 100,
                armor: 0,
                immortalArmor: false,
                energy: 100,
                destroyed: false,
                target: null,
                weapons: {
                    laser: false,
                    bombs: false,
                    missile: false
                },
                currentWeapon: null,
                cargoSlots: {
                    slot1: { unlocked: true, amount: 0 },
                    slot2: { unlocked: false, amount: 0 },
                    slot3: { unlocked: false, amount: 0 },
                    slot4: { unlocked: false, amount: 0 },
                    slot5: { unlocked: false, amount: 0 }
                },
                maxCargoPerSlot: 100
            };

            // Сбрасываем ресурсы
            this.gameState.resources.credits = 1000;
            
            // Очищаем проектилы
            this.projectiles = [];
            
            // Центрируем камеру на корабле
            this.centerViewportOnShip();
            
            // Отправляем событие перезапуска на сервер
            if (this.network && this.network.socket) {
                this.network.socket.emit('player:restart');
            }
            
            // Закрываем диалог
            dialog.remove();
            
            // Обновляем UI
            this.updateUI();
        });
    }

    setupSocketListeners() {
        // Добавляем отправку heartbeat каждые 3 секунды
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('player:heartbeat');
            }
        }, 3000);

        this.socket.on('connect', () => {
            console.log('Подключено к серверу');
            // При переподключении отправляем сохраненное состояние
            const savedState = localStorage.getItem('playerState');
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    this.socket.emit('player:init', {
                        ...state,
                        reconnect: true
                    });
                } catch (e) {
                    console.error('Ошибка при восстановлении состояния:', e);
                    localStorage.removeItem('playerState');
                }
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Отключено от сервера');
            // Сохраняем состояние при отключении
            if (this.player) {
                try {
                    localStorage.setItem('playerState', JSON.stringify({
                        name: this.player.name,
                        x: this.player.x,
                        y: this.player.y,
                        rotation: this.player.rotation,
                        weapons: this.player.weapons,
                        resources: this.player.resources,
                        cargoSlots: this.player.cargoSlots
                    }));
                } catch (e) {
                    console.error('Ошибка при сохранении состояния:', e);
                }
            }
            // Очищаем список других игроков при отключении
            this.otherPlayers.clear();
        });

        this.socket.on('game:state', (state) => {
            console.log('Получено состояние игры:', state);
            
            // Обновляем текущего игрока
            if (state.currentPlayer) {
                this.player = state.currentPlayer;
            }
            
            // Очищаем существующих игроков
            this.otherPlayers.clear();
            
            // Добавляем других игроков
            if (state.players) {
                state.players.forEach(player => {
                    if (player.id !== this.socket.id) {
                        this.addOtherPlayer(player);
                    }
                });
            }
            
            // Обновляем состояние планет
            if (state.planets) {
                this.planets = new Map(state.planets.map(planet => [planet.name, planet]));
            }
            
            // Обновляем состояние ботов
            if (state.bots) {
                this.bots = state.bots;
            }
            
            // Обновляем состояние снарядов
            if (state.projectiles) {
                this.projectiles = state.projectiles;
            }
        });

        this.socket.on('player:left', (data) => {
            console.log('Игрок отключился:', data);
            this.removeOtherPlayer(data.id);
            
            // Показываем уведомление только при обычном отключении
            if (data.wasDisconnect) {
                this.showNotification(`Игрок ${data.name} покинул игру`);
            }
        });

        this.socket.on('players:sync', (players) => {
            console.log('Синхронизация игроков:', players);
            
            // Очищаем список других игроков
            this.otherPlayers.clear();
            
            // Добавляем только актуальных игроков
            players.forEach(player => {
                if (player.id !== this.socket.id) {
                    this.addOtherPlayer(player);
                }
            });
        });

        this.socket.on('player:joined', (player) => {
            console.log('Новый игрок присоединился:', player);
            if (player.id !== this.socket.id) {
                this.addOtherPlayer(player);
            }
        });

        this.socket.on('player:updated', (data) => {
            if (data.id === this.socket.id) {
                // Обновляем состояние текущего игрока
                Object.assign(this.player, data);
            } else {
                // Обновляем состояние другого игрока
                const otherPlayer = this.otherPlayers.get(data.id);
                if (otherPlayer) {
                    Object.assign(otherPlayer, data);
                }
            }
        });

        // Добавляем обработчик для очистки состояния при уничтожении
        this.socket.on('player:destroyed', () => {
            localStorage.removeItem('playerState');
        });
    }

    // Очистка при уничтожении объекта
    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    initChat() {
        const chatInput = document.createElement('input');
        chatInput.type = 'text';
        chatInput.id = 'chatInput';
        chatInput.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 300px;
            padding: 10px;
            border: 2px solid #666;
            border-radius: 5px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 16px;
            display: none;
            z-index: 1000;
        `;
        document.body.appendChild(chatInput);

        // Обработчик открытия чата
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && chatInput.style.display === 'none') {
                e.preventDefault();
                chatInput.style.display = 'block';
                chatInput.focus();
            }
        });

        // Обработчик отправки сообщения
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const message = chatInput.value.trim();
                if (message) {
                    // Отправляем сообщение на сервер
                    this.socket.emit('player:message', { message });
                    // Очищаем поле ввода и скрываем его
                    chatInput.value = '';
                    chatInput.style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                chatInput.value = '';
                chatInput.style.display = 'none';
            }
        });
    }

    renderExplosions() {
        const now = Date.now();
        this.explosions = this.explosions.filter(explosion => {
            const age = now - explosion.startTime;
            if (age > explosion.duration) return false;

            const progress = age / explosion.duration;
            const alpha = 1 - progress;
            const screenPos = this.worldToScreen(explosion.x, explosion.y);
            
            // Внутренний круг (яркий)
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x, screenPos.y, explosion.radius * (1 - progress/2), 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 200, 0, ${alpha * 0.5})`;
            this.ctx.fill();
            
            // Внешний круг (ударная волна)
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x, screenPos.y, explosion.radius * (1 + progress/2), 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            return true;
        });
    }
}

// Экспортируем класс Game для использования в других модулях
export default Game;
