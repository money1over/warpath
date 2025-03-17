// Конфигурация оружия
const WEAPONS = {
    laser: {
        name: "Лазер",
        damage: 10,
        speed: 10,
        range: 600,
        cooldown: 250,
        price: 1000,
        description: "Быстрое и точное оружие"
    },
    bombs: {
        name: "Бомбы",
        damage: 20,
        speed: 5,
        range: 200,
        cooldown: 1000,
        price: 2000,
        description: "Мощное оружие с большим уроном"
    },
    missile: {
        name: "Самонаводящаяся ракета",
        damage: 30,
        speed: 7,
        range: 800,
        cooldown: 2000,
        price: 3000,
        description: "Следует за целью и наносит большой урон",
        homing: true,
        turnSpeed: 0.05
    }
};

// Конфигурация грузовых отсеков
const CARGO_SLOTS = {
    slot1: { unlocked: true, amount: 0 },
    slot2: { unlocked: false, amount: 0 },
    slot3: { unlocked: false, amount: 0 },
    slot4: { unlocked: false, amount: 0 },
    slot5: { unlocked: false, amount: 0 }
};

// Начальное состояние игрока
const INITIAL_PLAYER_STATE = {
    shield: 100,
    armor: 0,
    immortalArmor: false,
    energy: 100,
    destroyed: false,
    weapons: {
        laser: false,
        bombs: false,
        missile: false
    },
    currentWeapon: null,
    cargoSlots: CARGO_SLOTS,
    maxCargoPerSlot: 100,
    resources: {
        credits: 20000
    }
};

module.exports = {
    WEAPONS,
    CARGO_SLOTS,
    INITIAL_PLAYER_STATE
}; 