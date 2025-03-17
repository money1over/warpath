class IconGenerator {
    static createIcon(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 30;
        canvas.height = 30;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        
        switch(name) {
            case 'trade':
                this.drawTradeIcon(ctx);
                break;
            case 'navigate':
                this.drawNavigateIcon(ctx);
                break;
            case 'scan':
                this.drawScanIcon(ctx);
                break;
            case 'build':
                this.drawBuildIcon(ctx);
                break;
            case 'bank':
                this.drawBankIcon(ctx);
                break;
            case 'time':
                this.drawTimeIcon(ctx);
                break;
        }
        
        return canvas.toDataURL();
    }
    
    static drawTradeIcon(ctx) {
        // Символ обмена
        ctx.beginPath();
        ctx.moveTo(5, 10);
        ctx.lineTo(25, 10);
        ctx.moveTo(20, 5);
        ctx.lineTo(25, 10);
        ctx.lineTo(20, 15);
        ctx.moveTo(5, 20);
        ctx.lineTo(25, 20);
        ctx.moveTo(10, 15);
        ctx.lineTo(5, 20);
        ctx.lineTo(10, 25);
        ctx.stroke();
    }
    
    static drawNavigateIcon(ctx) {
        // Компас
        ctx.beginPath();
        ctx.arc(15, 15, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(15, 5);
        ctx.lineTo(15, 25);
        ctx.moveTo(5, 15);
        ctx.lineTo(25, 15);
        ctx.stroke();
    }
    
    static drawScanIcon(ctx) {
        // Радар
        ctx.beginPath();
        ctx.arc(15, 15, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(15, 15, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(15, 3);
        ctx.lineTo(15, 27);
        ctx.stroke();
    }
    
    static drawBuildIcon(ctx) {
        // Гаечный ключ
        ctx.beginPath();
        ctx.moveTo(5, 5);
        ctx.lineTo(25, 25);
        ctx.moveTo(10, 10);
        ctx.lineTo(20, 20);
        ctx.moveTo(5, 25);
        ctx.lineTo(25, 5);
        ctx.stroke();
    }
    
    static drawBankIcon(ctx) {
        // Символ банка
        ctx.beginPath();
        ctx.moveTo(5, 20);
        ctx.lineTo(25, 20);
        ctx.moveTo(15, 5);
        ctx.lineTo(5, 15);
        ctx.lineTo(25, 15);
        ctx.lineTo(15, 5);
        ctx.stroke();
        ctx.fillRect(13, 20, 4, 5);
    }
    
    static drawTimeIcon(ctx) {
        // Часы
        ctx.beginPath();
        ctx.arc(15, 15, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(15, 15);
        ctx.lineTo(15, 8);
        ctx.moveTo(15, 15);
        ctx.lineTo(20, 15);
        ctx.stroke();
    }
}

// Создаем иконки при загрузке страницы
window.addEventListener('load', () => {
    const icons = ['trade', 'navigate', 'scan', 'build', 'bank', 'time'];
    icons.forEach(name => {
        const img = document.querySelector(`#${name} img`);
        if (img) {
            img.src = IconGenerator.createIcon(name);
        }
    });
}); 