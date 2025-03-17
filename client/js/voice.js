class VoiceControl {
    constructor(game) {
        this.game = game;
        this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        this.recognition.lang = 'ru-RU';
        this.recognition.continuous = true;
        this.recognition.interimResults = false;

        this.setupRecognition();
        this.addVoiceButton();
    }

    setupRecognition() {
        this.recognition.onresult = (event) => {
            const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
            console.log('Голосовая команда:', command);

            // Обработка команд
            if (command.includes('лететь') || command.includes('двигаться')) {
                const planets = ['альфа', 'бета', 'гамма', 'дельта'];
                for (const planetName of planets) {
                    if (command.includes(planetName)) {
                        const planet = this.game.gameState.planets.get(planetName.charAt(0).toUpperCase() + planetName.slice(1));
                        if (planet) {
                            this.game.setTargetPlanet(planet);
                            break;
                        }
                    }
                }
            }
            
            if (command.includes('торговля')) {
                document.getElementById('trade').click();
            }
            if (command.includes('навигация')) {
                document.getElementById('navigate').click();
            }
            if (command.includes('сканировать')) {
                document.getElementById('scan').click();
            }
            if (command.includes('строить')) {
                document.getElementById('build').click();
            }
            if (command.includes('банк')) {
                document.getElementById('bank').click();
            }
            if (command.includes('время')) {
                document.getElementById('time').click();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Ошибка распознавания:', event.error);
        };
    }

    addVoiceButton() {
        const button = document.createElement('button');
        button.id = 'voiceControl';
        button.innerHTML = '🎤';
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 25px;
            background: rgba(51, 51, 51, 0.9);
            border: 2px solid #666;
            color: white;
            font-size: 24px;
            cursor: pointer;
            z-index: 1000;
            transition: background 0.3s;
        `;

        let isListening = false;

        button.addEventListener('click', () => {
            if (!isListening) {
                this.recognition.start();
                button.style.background = 'rgba(255, 0, 0, 0.9)';
            } else {
                this.recognition.stop();
                button.style.background = 'rgba(51, 51, 51, 0.9)';
            }
            isListening = !isListening;
        });

        document.body.appendChild(button);
    }
} 