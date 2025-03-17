import Game from './game.js';

class MainMenu {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'mainMenu';
        document.body.appendChild(this.container);

        this.options = [
            { id: 'newGame', text: 'Новая игра', action: () => this.startNewGame() },
            { id: 'loadGame', text: 'Загрузить игру', action: () => this.loadGame() },
            { id: 'settings', text: 'Настройки', action: () => this.openSettings() },
            { id: 'multiplayer', text: 'Мультиплеер', action: () => this.startMultiplayer() }
        ];

        this.createMenu();
    }

    createMenu() {
        // Заголовок
        const title = document.createElement('h1');
        title.textContent = 'Warpath 97';
        this.container.appendChild(title);

        // Подзаголовок
        const subtitle = document.createElement('p');
        subtitle.textContent = 'Космическая стратегия';
        subtitle.className = 'subtitle';
        this.container.appendChild(subtitle);

        // Создаем кнопки меню
        const menuList = document.createElement('div');
        menuList.className = 'menuList';

        this.options.forEach(option => {
            const button = document.createElement('button');
            button.id = option.id;
            button.textContent = option.text;
            button.className = 'menuButton';
            button.addEventListener('click', option.action);
            menuList.appendChild(button);
        });

        this.container.appendChild(menuList);
    }

    startNewGame() {
        // Скрываем меню
        this.container.style.display = 'none';
        
        // Создаем начальное состояние игры
        const initialState = {
            resources: {
                energy: 1000,
                minerals: 500,
                food: 200,
                credits: 20000
            },
            station: {
                level: 1,
                hp: 1000,
                shield: 500,
                position: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
            },
            research: {
                weapons: 0,
                shields: 0,
                propulsion: 0,
                mining: 0,
                construction: 0
            }
        };

        // Запускаем игру
        window.game = new Game(initialState);
    }

    loadGame() {
        // Загрузка сохраненной игры
        const savedGame = localStorage.getItem('warpath97_save');
        if (savedGame) {
            this.container.style.display = 'none';
            window.game = new Game(JSON.parse(savedGame));
        } else {
            alert('Сохранённые игры не найдены');
        }
    }

    openSettings() {
        const settings = {
            sound: {
                enabled: true,
                volume: 0.7
            },
            graphics: {
                quality: 'high',
                particles: true
            },
            controls: {
                mouseInvert: false,
                sensitivity: 1.0
            }
        };

        // Создаем окно настроек
        const settingsWindow = document.createElement('div');
        settingsWindow.id = 'settingsWindow';
        settingsWindow.className = 'modalWindow';

        const title = document.createElement('h2');
        title.textContent = 'Настройки';
        settingsWindow.appendChild(title);

        // Добавляем настройки
        Object.entries(settings).forEach(([category, options]) => {
            const section = document.createElement('div');
            section.className = 'settingsSection';
            
            const categoryTitle = document.createElement('h3');
            categoryTitle.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            section.appendChild(categoryTitle);

            Object.entries(options).forEach(([option, value]) => {
                const control = document.createElement('div');
                control.className = 'settingControl';

                const label = document.createElement('label');
                label.textContent = option;

                const input = typeof value === 'boolean' 
                    ? document.createElement('input')
                    : document.createElement('select');

                if (typeof value === 'boolean') {
                    input.type = 'checkbox';
                    input.checked = value;
                } else if (typeof value === 'number') {
                    input.type = 'range';
                    input.min = 0;
                    input.max = 1;
                    input.step = 0.1;
                    input.value = value;
                }

                control.appendChild(label);
                control.appendChild(input);
                section.appendChild(control);
            });

            settingsWindow.appendChild(section);
        });

        // Кнопка закрытия
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Сохранить';
        closeButton.onclick = () => settingsWindow.remove();
        settingsWindow.appendChild(closeButton);

        document.body.appendChild(settingsWindow);
    }

    startMultiplayer() {
        // Создаем окно мультиплеера
        const multiplayerWindow = document.createElement('div');
        multiplayerWindow.id = 'multiplayerWindow';
        multiplayerWindow.className = 'modalWindow';

        const title = document.createElement('h2');
        title.textContent = 'Мультиплеер';
        multiplayerWindow.appendChild(title);

        // Список серверов
        const serverList = document.createElement('div');
        serverList.className = 'serverList';

        // Добавляем тестовые серверы
        const servers = [
            { name: 'Сервер 1', players: '2/8', ping: '45ms' },
            { name: 'Сервер 2', players: '5/8', ping: '60ms' },
            { name: 'Сервер 3', players: '1/8', ping: '30ms' }
        ];

        servers.forEach(server => {
            const serverItem = document.createElement('div');
            serverItem.className = 'serverItem';
            serverItem.innerHTML = `
                <span>${server.name}</span>
                <span>${server.players}</span>
                <span>${server.ping}</span>
                <button>Подключиться</button>
            `;
            serverList.appendChild(serverItem);
        });

        multiplayerWindow.appendChild(serverList);

        // Кнопка создания сервера
        const createServerButton = document.createElement('button');
        createServerButton.textContent = 'Создать сервер';
        createServerButton.onclick = () => alert('Функция создания сервера в разработке');
        multiplayerWindow.appendChild(createServerButton);

        // Кнопка закрытия
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Закрыть';
        closeButton.onclick = () => multiplayerWindow.remove();
        multiplayerWindow.appendChild(closeButton);

        document.body.appendChild(multiplayerWindow);
    }
}

export default MainMenu;

// Создаем стили для меню
const style = document.createElement('style');
style.textContent = `
    #mainMenu {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: Arial, sans-serif;
    }

    #mainMenu h1 {
        font-size: 48px;
        margin-bottom: 10px;
        text-shadow: 0 0 10px #00ff00;
    }

    .subtitle {
        font-size: 24px;
        margin-bottom: 40px;
        color: #888;
    }

    .menuList {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .menuButton {
        padding: 15px 30px;
        font-size: 20px;
        background: rgba(0, 255, 0, 0.1);
        border: 1px solid #00ff00;
        color: #00ff00;
        cursor: pointer;
        transition: all 0.3s;
        width: 250px;
    }

    .menuButton:hover {
        background: rgba(0, 255, 0, 0.2);
        transform: scale(1.05);
    }

    .modalWindow {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid #00ff00;
        padding: 20px;
        color: white;
        min-width: 400px;
    }

    .settingsSection {
        margin: 20px 0;
    }

    .settingControl {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 10px 0;
    }

    .serverList {
        margin: 20px 0;
    }

    .serverItem {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #333;
    }

    .serverItem button {
        padding: 5px 10px;
        background: rgba(0, 255, 0, 0.1);
        border: 1px solid #00ff00;
        color: #00ff00;
        cursor: pointer;
    }
`;

document.head.appendChild(style);

// Создаем экземпляр меню при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    window.mainMenu = new MainMenu();
}); 