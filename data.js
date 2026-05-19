const SUITS = ['♥', '♦', '♠', '♣'];
const COLORS = { '♥':'red', '♦':'red', '♠':'black', '♣':'black' };

const CARDS = {
    HISS: { name: "哈气", type: "attack", text: "哈气", desc: "攻击牌。对一名角色哈气，目标需出【棘背龙】，否则受1点伤害。", img: "assets/cards/hiss.png" },
    DODGE: { name: "棘背龙", type: "defense", text: "棘背龙", desc: "防御牌。抵消一次【哈气】，或响应【大狗叫】。", img: "assets/cards/dodge.png" },
    TREAT: { name: "冻干", type: "heal", text: "冻干", desc: "回复牌。出牌阶段回复1血；濒死时自救回复1血。", img: "assets/cards/treat.png" },
    AOE: { name: "白手套", type: "aoe", text: "白手套", desc: "锦囊牌。对所有其他角色使用，目标需打出【哈气】，否则受到1点伤害。", img: "assets/cards/aoe.png" },
    BARK: { name: "大狗叫", type: "bark", text: "大狗叫", desc: "锦囊牌。对所有其他角色使用，目标需打出【棘背龙】，否则受到1点伤害。", img: "assets/cards/bark.png" },
    CATNIP: { name: "猫薄荷", type: "buff", text: "猫薄荷", desc: "辅助牌。本回合下一张【哈气】伤害+1；濒死时可自救回1血。", img: "assets/cards/catnip.png" },
    FIGHT: { name: "猫猫互殴", type: "duel", text: "互殴", desc: "锦囊牌。与目标轮流出【哈气】，输者受1点伤害。", img: "assets/cards/fight.png" },
    CUP: { name: "推倒水杯", type: "dismantle", text: "推水杯", desc: "锦囊牌。弃置一名其他角色区域内的一张牌。", img: "assets/cards/cup.png" },
    PUNCH: { name: "这一拳", type: "steal", text: "这一拳", desc: "锦囊牌。获得距离为1的一名其他角色区域内的一张牌。", img: "assets/cards/punch.png" },
    EARS: { name: "飞机耳", type: "nullify", text: "飞机耳", desc: "锦囊牌。抵消锦囊牌的效果。", img: "assets/cards/ears.png" }
};

const HEROES = {
    HAPPY: { id: 'HAPPY', name: '开心猫', title: '乐天派', hp: 3, desc: '【乐天】: 摸牌时可少摸1张回1血。出【棘背龙】后判定红桃摸1牌。', img: "assets/heroes/happy.png" },
    MAODIE: { id: 'MAODIE', name: '耄耋', title: '圆头', hp: 4, desc: '【圆头】: 每次受伤最多1点。【连杀】: 可无限出【哈气】，5连杀后自扣1血（1血时不扣）。', img: "assets/heroes/maodie.png" },
    BANANA: { id: 'BANANA', name: '香蕉猫', title: '爱哭鬼', hp: 3, desc: '【哭哭】: 被【哈气】时判定黑色无效。手牌上限+1。', img: "assets/heroes/banana.png" },
    HUH: { id: 'HUH', name: '疑惑猫', title: '智慧眼神', hp: 3, desc: '【疑惑】: 仅在被【哈气】指定为目标时，可随机弃1张牌使该【哈气】无效。', img: "assets/heroes/huh.png" },
    LOWPOLY: { id: 'LOWPOLY', name: '丑橘', title: '没经济', hp: 4, desc: '【摸鱼】: 开局3牌。空手牌时不能被【哈气】指定。', img: "assets/heroes/lowpoly.png" }
};

const BGM_LIST = [
    { name: "基米主旋律", file: "assets/bgm1.mp3" },
    { name: "猫猫追逐战", file: "assets/bgm2.mp3" },
    { name: "午后小憩", file: "assets/bgm3.mp3" },
];
