const SUITS = ['♥', '♦', '♠', '♣'];
const COLORS = { '♥': 'red', '♦': 'red', '♠': 'black', '♣': 'black' };

const CARDS = {
    HISS: { name: "哈气", type: "attack", text: "哈气", desc: "攻击牌。对一名角色哈气，目标需出【棘背龙】，否则受到1点伤害。", img: "assets/optimized/cards/hiss.jpg" },
    DODGE: { name: "棘背龙", type: "defense", text: "棘背龙", desc: "防御牌。抵消一次【哈气】，或响应【大狗叫】。", img: "assets/optimized/cards/dodge.jpg" },
    TREAT: { name: "冻干", type: "heal", text: "冻干", desc: "回复牌。出牌阶段回复1血；濒死时自救回复1血。", img: "assets/optimized/cards/treat.jpg" },
    AOE: { name: "白手套", type: "aoe", text: "白手套", desc: "锦囊牌。对所有其他角色使用，目标需打出【哈气】，否则受到1点伤害。", img: "assets/optimized/cards/aoe.jpg" },
    BARK: { name: "大狗叫", type: "bark", text: "大狗叫", desc: "锦囊牌。对所有其他角色使用，目标需打出【棘背龙】，否则受到1点伤害。", img: "assets/optimized/cards/bark.jpg" },
    CATNIP: { name: "猫薄荷", type: "buff", text: "猫薄荷", desc: "辅助牌。本回合下一张【哈气】伤害+1；濒死时可自救回复1血。", img: "assets/optimized/cards/catnip.jpg" },
    FIGHT: { name: "猫猫互殴", type: "duel", text: "互殴", desc: "锦囊牌。与目标轮流出【哈气】，输者受到1点伤害。", img: "assets/optimized/cards/fight.jpg" },
    CUP: { name: "推倒水杯", type: "dismantle", text: "推水杯", desc: "锦囊牌。弃置一名其他角色区域内的一张牌。", img: "assets/optimized/cards/cup.jpg" },
    PUNCH: { name: "这一爪", type: "steal", text: "这一爪", desc: "锦囊牌。获得一名其他角色区域内的一张牌。", img: "assets/optimized/cards/punch.jpg" },
    EARS: { name: "飞机耳", type: "nullify", text: "飞机耳", desc: "锦囊牌。抵消锦囊牌的效果。", img: "assets/optimized/cards/ears.jpg" },
    SUN: { name: "午后阳光", type: "sun", text: "阳光", desc: "锦囊牌。出牌阶段对自己使用。弃置任意张牌，然后摸等量的牌；若弃置至少两张牌，则回复1点体力。", img: "assets/optimized/cards/sun.jpg" },
    EXPLODE: { name: "猫砂盆爆炸", type: "explode", text: "爆炸", desc: "爆炸猫窝专属。摸到后立即爆炸；只有【埋屎】可以救你。", img: "assets/optimized/cards/explode.jpg" },
    DEFUSE: { name: "埋屎", type: "defuse", text: "埋屎", desc: "爆炸猫窝专属。摸到【猫砂盆爆炸】时打出，免死并把爆炸放回牌堆。", img: "assets/optimized/cards/defuse.jpg" },
    PEEK: { name: "闻一下", type: "peek", text: "闻一下", desc: "爆炸猫窝专属。查看牌堆顶3张，并可以调整它们的顺序。", img: "assets/optimized/cards/peek.jpg" }
};

const HEROES = {
    HAPPY: { id: 'HAPPY', name: '开心猫', title: '乐天派', hp: 3, desc: '【乐天】摸牌时可少摸1张回复1血。出【棘背龙】后判定红桃摸1牌。', img: "assets/optimized/heroes/happy.jpg" },
    MAODIE: { id: 'MAODIE', name: '耄耋', title: '圆头', hp: 4, desc: '【圆头】每次受伤最多1点。【连杀】可无限出【哈气】，5连哈后自扣1血（1血时不扣）。', img: "assets/optimized/heroes/maodie.jpg" },
    BANANA: { id: 'BANANA', name: '香蕉猫', title: '爱哭鬼', hp: 3, desc: '【哭哭】被【哈气】时判定黑色无效。手牌上限+1。', img: "assets/optimized/heroes/banana.jpg" },
    HUH: { id: 'HUH', name: '疑惑猫', title: '智慧眼神', hp: 3, desc: '【疑惑】仅在被【哈气】指定为目标时，可随机弃1张牌使该【哈气】无效。', img: "assets/optimized/heroes/huh.jpg" },
    LOWPOLY: { id: 'LOWPOLY', name: '丑橘', title: '没经费', hp: 4, desc: '【摸鱼】每次摸牌阶段摸3张牌。空手牌时不能被【哈气】指定。', img: "assets/optimized/heroes/lowpoly.jpg" },
    TOM: { id: 'TOM', name: 'Tom', title: '百变不死', hp: 4, desc: '【百变】出牌阶段可弃1张手牌，声明一种基本牌或锦囊牌的牌名，将另一张手牌当作声明的牌使用。【不死】濒死死亡时无限复活，每次血量上限-2；上限为0时死亡。', img: "assets/optimized/heroes/tom.jpg" },
    DUOLA: { id: 'DUOLA', name: '哆啦A梦', title: '口袋猫', hp: 4, desc: '【铜锣】你可以将一张【猫薄荷】当作【冻干】使用，也可以将一张【冻干】当作【猫薄荷】使用；出牌阶段使用【冻干】或【猫薄荷】时，额外摸一张牌。【时光机】限一次，濒死时弃置所有牌，体力回复至3，摸两张牌。', img: "assets/optimized/heroes/duola.jpg" },
    MIAOMIAO: { id: 'MIAOMIAO', name: '胖猫', title: '寄生', hp: 3, desc: '【寄生】限2次。你对其他角色造成伤害时，防止此伤害，改为令其获得1个种子标记。拥有种子标记的角色每次失去体力时，种子来源回复等量体力。', img: "assets/optimized/heroes/miaomiao.jpg" }
};

const BGM_LIST = [
    { name: "基米主旋律", file: "assets/bgm1.mp3" },
    { name: "猫猫追逐战", file: "assets/bgm2.mp3" },
    { name: "午后小憩", file: "assets/bgm3.mp3" },
];
