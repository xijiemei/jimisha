const Game = {
    mode: 'NONE',
    myId: 0,
    spPlayerCount: 5,
    selectedHeroId: null,
    uiState: {},
    uiSelectedCardIdx: -1,
    uiClickTimer: null,
    uiLongPressTimer: null,
    uiSuppressNextClick: false,
    uiVirtualPlay: null,
    uiBaibianDeclared: null,
    uiBaibianCardIdx: null,
    uiSunDiscard: null,
    uiPrompt: null,
    isDiscardPhase: false,
    gameState: { players: [], deck: [], turnIdx: 0, logs: [], started: false, pendingAction: null, aoeState: null, discardingPlayerId: null, gameOver: null },
    
    currentBGM: new Audio(),
    bgmIndex: 0,
    isBGMPlaying: false,
    soundSeqSeen: 0,
    audioCache: {},
    LOG_LIMIT: 50,

    init: function() { this.preloadAssets(); this.loadBGM(); },

    // 安全 UI 更新
    setTx: function(id, val) {
        let el = document.getElementById(id);
        if (el) el.innerText = val;
    },
    setDisp: function(id, val) {
        let el = document.getElementById(id);
        if (el) el.style.display = val;
    },
    escapeHTML: function(val) {
        return String(val ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    },

    // 统一更新入口
    updateAll: function() {
        if (this.mode === 'MP' && Net.isHost) Net.scheduleBroadcast();
        else this.renderGame(this.gameState);

        if (this.gameState.gameOver) return;
        
        // Bot 自动托管
        if (this.mode === 'SP' || (this.mode === 'MP' && Net.isHost)) {
            this.checkBotAutoPlay();
        }
    },

    // 判定牌逻辑
    getJudgment: function() {
        let s = SUITS[Math.floor(Math.random() * 4)];
        return { suit: s, color: COLORS[s] };
    },

    checkBotAutoPlay: function() {
        let state = this.gameState;
        if (!state || !state.players) return;

        // 1. 响应阶段
        if (state.pendingAction) {
            let target = state.players.find(p => p.id === state.pendingAction.targetId);
            if (target && target.isBot && !target.thinking) {
                target.thinking = true;
                setTimeout(() => { 
                    target.thinking = false; 
                    this.botResponse(target); 
                }, 1000);
            }
            return;
        }

        // 2. 主动出牌阶段
        let cur = state.players[state.turnIdx];
        if (cur && cur.isBot && cur.alive && !state.aoeState && !cur.thinking) {
            cur.thinking = true;
            setTimeout(() => { 
                cur.thinking = false; 
                this.botAction(cur); 
            }, 1500);
        }
    },

    // === 音乐模块 ===
    preloadAssets: function() {
        const urls = new Set();
        Object.values(HEROES).forEach(h => h.img && urls.add(h.img));
        Object.values(CARDS).forEach(c => c.img && urls.add(c.img));
        ['hiss.mp3', 'bark.mp3', 'happy.mp3', 'huh.mp3', 'banana.mp3', 'death-oh-no.mp3', 'tom.mp3']
            .forEach(file => urls.add(`assets/${file}`));
        BGM_LIST.forEach(b => urls.add(b.file));

        let box = document.getElementById('audio-preload');
        urls.forEach(url => {
            if (/\.(png|jpg|jpeg|webp)$/i.test(url)) {
                let img = new Image();
                img.decoding = 'async';
                img.loading = 'eager';
                img.src = url;
            } else if (box && /\.mp3$/i.test(url)) {
                let audio = document.createElement('audio');
                audio.preload = 'auto';
                audio.src = url;
                box.appendChild(audio);
            }
        });
    },
    loadBGM: function() {
        this.currentBGM.src = BGM_LIST[this.bgmIndex].file;
        this.currentBGM.loop = true;
        this.currentBGM.volume = 0.3;
        this.setTx('bgm-title', `BGM: ${BGM_LIST[this.bgmIndex].name}`);
    },
    toggleBGM: function() {
        if (this.isBGMPlaying) { this.currentBGM.pause(); this.isBGMPlaying = false; this.setTx('bgm-status', '播放'); } 
        else { this.currentBGM.play().then(() => { this.isBGMPlaying = true; this.setTx('bgm-status', '暂停'); }).catch(() => {}); }
    },
    nextBGM: function() {
        this.currentBGM.pause(); this.bgmIndex = (this.bgmIndex + 1) % BGM_LIST.length; this.loadBGM();
        if (this.isBGMPlaying) this.currentBGM.play().catch(()=>{});
    },
    getSoundSrc: function(type) {
        if (type === 'HISS') return 'assets/hiss.mp3';
        if (type === 'BARK') return 'assets/bark.mp3';
        if (type === 'HAPPY') return 'assets/happy.mp3';
        if (type === 'HUH') return 'assets/huh.mp3';
        if (type === 'BANANA') return 'assets/banana.mp3';
        if (type === 'DEATH') return 'assets/death-oh-no.mp3';
        if (type === 'TOM') return 'assets/tom.mp3';
        return '';
    },
    queueSound: function(type) {
        if (!this.gameState) return;
        this.gameState.soundSeq = (this.gameState.soundSeq || 0) + 1;
        this.gameState.soundType = type;
        this.soundSeqSeen = this.gameState.soundSeq;
        this.playSound(type);
    },
    playSound: function(type) {
        let src = this.getSoundSrc(type);
        if (!src) return;
        let audio = this.audioCache[type];
        if (!audio) {
            audio = new Audio(src);
            audio.preload = 'auto';
            this.audioCache[type] = audio;
        }
        audio.currentTime = 0;
        audio.volume = 0.6; audio.play().catch(()=>{
            if (type === 'DEATH') this.playFallbackDeathSound();
        });
    },
    playFallbackDeathSound: function() {
        try {
            let Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            let ctx = new Ctx();
            let gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
            gain.connect(ctx.destination);
            [520, 330].forEach((freq, i) => {
                let osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.28);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.72, ctx.currentTime + i * 0.28 + 0.25);
                osc.connect(gain);
                osc.start(ctx.currentTime + i * 0.28);
                osc.stop(ctx.currentTime + i * 0.28 + 0.32);
            });
            setTimeout(() => ctx.close().catch(()=>{}), 900);
        } catch (e) {}
    },

    // === 辅助 ===
    showScreen: function(id) {
        document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
        let el = document.getElementById(id);
        if(el) el.classList.add('active');
    },
    log: function(msg) {
        let d = document.getElementById('game-log');
        if (d) {
            d.innerHTML = `<div>&gt; ${this.escapeHTML(msg)}</div>` + d.innerHTML;
            this.gameState.logs.push(msg);
            if (this.gameState.logs.length > this.LOG_LIMIT) {
                this.gameState.logs.splice(0, this.gameState.logs.length - this.LOG_LIMIT);
            }
            while (d.children.length > this.LOG_LIMIT) d.removeChild(d.lastChild);
        }
    },
    getPlayerName: function(id) {
        let p = this.gameState.players.find(x => x.id === id);
        return p ? p.name : '神秘哈基米';
    },
    getResponseCopy: function(action, me) {
        let sourceName = this.getPlayerName(action.sourceId);
        let cardName = action.cardName || '牌';
        const copies = {
            AOE_ASK: {
                title: '全场哈基米警报',
                msg: action.promptMsg || `${sourceName} 放了大范围猫猫波，轮到你接招喵。`,
                yes: `掏出「${cardName}」顶住`,
                no: '躺平挨一下喵'
            },
            DODGE: {
                title: '有猫在哈你',
                msg: `${sourceName} 对你哈气了，快启用「脊背龙模式」把毛炸起来。`,
                yes: '启用脊背龙模式',
                no: '来不及了，扣血喵'
            },
            DUEL_HISS: {
                title: '哈气单挑',
                msg: `${sourceName} 盯着你互哈，谁先没气势谁掉毛。`,
                yes: '回哈一口',
                no: '认怂掉毛'
            },
            SKILL_HUH_HISS: {
                title: '疑惑哈基米上线',
                msg: '对面哈气太离谱了，要不要丢 1 张牌装作没听懂？',
                yes: '歪头：啊？',
                no: '正常接招'
            },
            SKILL_BANANA: {
                title: '香蕉猫要哭了',
                msg: '要不要发动哭哭判定？黑色就当这口哈气没发生喵。',
                yes: '开哭哭判定',
                no: '忍住不哭'
            },
            NULLIFY: {
                title: '飞机耳竖起来',
                msg: `${sourceName} 打出「${action.cardName || '锦囊'}」，要不要用「飞机耳」装作没听见？`,
                yes: '发动飞机耳',
                no: '让它发生喵'
            },
            SKILL_HAPPY_START: {
                title: '开心猫伸懒腰',
                msg: '少摸 1 张牌，换 1 点血量，今天也要开心喵？',
                yes: '开心回血',
                no: '多摸牌'
            },
            DYING: {
                title: '紧急吸猫救援',
                msg: `${me?.name || '这只哈基米'} 快没电了，能不能掏出「冻干」或「猫薄荷」续一口？`,
                yes: '喂一口续命',
                no: '送去喵星'
            }
        };
        return copies[action.type] || { title: '哈基米需要回应', msg: action.promptMsg || '轮到你回应喵。', yes: '回应', no: '不回应' };
    },
    showDeathBanner: function(player) {
        let banner = document.getElementById('death-banner');
        if (!banner || !player) return;
        banner.innerHTML = `<div class="death-title">喵星快讯</div><div class="death-name">${this.escapeHTML(player.name)} 去喵星占座了</div>`;
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 2600);
    },
    showJudgeBanner: function(title, message, tone) {
        let banner = document.getElementById('judge-banner');
        if (!banner) return;
        banner.className = tone || '';
        banner.innerHTML = `<div class="judge-title">${this.escapeHTML(title)}</div><div class="judge-msg">${this.escapeHTML(message)}</div>`;
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 2400);
    },
    showTurnBanner: function(player) {
        let banner = document.getElementById('turn-banner');
        if (!banner || !player) return;
        banner.innerHTML = `<div class="turn-title">现在是</div><div class="turn-name">${this.escapeHTML(player.name)} 的回合</div>`;
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 1800);
    },
    createDeck: function() {
        let deck = [];
        const add = (proto, count) => { for(let i=0; i<count; i++) { let s = SUITS[Math.floor(Math.random()*4)]; deck.push({ ...proto, suit: s, color: COLORS[s], uid: Math.random() }); }};
        add(CARDS.HISS, 24); add(CARDS.DODGE, 12); add(CARDS.TREAT, 8); add(CARDS.AOE, 2); add(CARDS.BARK, 1);
        add(CARDS.CATNIP, 4); add(CARDS.FIGHT, 3); add(CARDS.CUP, 4); add(CARDS.PUNCH, 4); add(CARDS.EARS, 3);
        add(CARDS.SUN, 3);
        return deck.sort(() => Math.random() - 0.5);
    },
    drawCards: function(p, count) {
        if (!p.alive) return;
        for (let i = 0; i < count; i++) {
            if (this.gameState.deck.length === 0) { this.gameState.deck = this.createDeck(); this.log("🎴 牌堆重新洗混了喵！"); }
            p.hand.push(this.gameState.deck.pop());
        }
    },
    getDistance: function(p1, p2) {
        if (!p1 || !p2 || p1.id === p2.id) return 0;
        let alive = this.gameState.players.filter(p => p.alive);
        let idx1 = alive.findIndex(p => p.id === p1.id);
        let idx2 = alive.findIndex(p => p.id === p2.id);
        if (idx1 === -1 || idx2 === -1) return 99;
        let dist = Math.abs(idx1 - idx2);
        return Math.min(dist, alive.length - dist);
    },
    getHandLimit: function(p) {
        if (!p) return 0;
        return Math.max(0, p.hp) + (p.hero === 'BANANA' ? 1 : 0);
    },
    getTrickTargets: function(source, card, target) {
        if (!card) return [];
        if (card.type === 'aoe' || card.type === 'bark') return this.gameState.players.filter(p => p.alive && p.id !== source.id);
        return target && target.alive ? [target] : [];
    },
    findNullifyResponder: function(source, targets) {
        let ids = (targets || []).map(p => p.id);
        return this.gameState.players.find(p => p.alive && p.id !== source.id && ids.includes(p.id) && p.hand.some(c => c.type === 'nullify')) || null;
    },
    shouldAskNullify: function(card) {
        return !!card && ['duel', 'dismantle', 'steal'].includes(card.type);
    },
    getDeclaredCard: function(name) {
        return Object.values(CARDS).find(c => c.name === name && c.type !== 'defense' && c.type !== 'nullify') || null;
    },
    showPrompt: function(title, msg, buttons) {
        this.uiPrompt = { title, msg, buttons: buttons || [] };
        this.renderGame(this.gameState);
    },
    showNotice: function(msg) {
        this.showPrompt('提示', msg, [{ text: '知道了', cls: 'primary', cb: () => { this.uiPrompt = null; this.renderGame(this.gameState); } }]);
    },
    openBaibianChoice: function() {
        let me = this.gameState.players.find(p => p.id === this.myId);
        if (!me || me.hero !== 'TOM') return;
        if (me.baibianUsed) return this.showNotice('【百变】一回合只能使用一次。');
        if (me.hand.length < 2) return this.showNotice('【百变】至少需要两张手牌：一张弃置，一张当作声明的牌使用。');
        let buttons = Object.values(CARDS)
            .filter(c => c.type !== 'defense' && c.type !== 'nullify')
            .map(c => ({ text: c.name, cls: 'primary', cb: () => this.chooseBaibianCard(c.name) }));
        buttons.push({ text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.renderGame(this.gameState); } });
        this.showPrompt('发动【百变】', '请选择要声明的牌名。', buttons);
    },
    chooseBaibianCard: function(declaredName) {
        let me = this.gameState.players.find(p => p.id === this.myId);
        let virtualCard = this.getDeclaredCard(declaredName);
        if (!me || !virtualCard) return;
        if (virtualCard.type === 'attack' && me.hasHissed && me.hero !== 'MAODIE') {
            this.uiPrompt = null;
            return this.showNotice('本回合已经哈气过了，不能再把手牌当作【哈气】使用。');
        }
        this.uiBaibianDeclared = virtualCard.name;
        this.uiBaibianCardIdx = null;
        this.uiPrompt = null;
        this.showPrompt('选择手牌', `请选择一张手牌，将它当作【${virtualCard.name}】使用；系统会再弃置你另一张手牌。`, [
            { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiBaibianDeclared = null; this.uiBaibianCardIdx = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
        ]);
    },
    chooseBaibianHandCard: function(cardIdx) {
        let me = this.gameState.players.find(p => p.id === this.myId);
        let virtualCard = this.getDeclaredCard(this.uiBaibianDeclared);
        if (!me || !virtualCard) return;
        this.uiBaibianCardIdx = cardIdx;
        this.uiSelectedCardIdx = cardIdx;
        this.showPrompt('选择弃牌', `请选择一张要弃置的手牌，然后将刚才选的手牌当作【${virtualCard.name}】使用。`, [
            { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiBaibianDeclared = null; this.uiBaibianCardIdx = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
        ]);
    },
    chooseBaibianDiscardCard: function(discardIdx) {
        let me = this.gameState.players.find(p => p.id === this.myId);
        let virtualCard = this.getDeclaredCard(this.uiBaibianDeclared);
        let cardIdx = this.uiBaibianCardIdx;
        if (!me || !virtualCard || cardIdx === null || cardIdx === undefined) return;
        if (discardIdx === cardIdx) return this.showNotice('这张牌要当作声明牌使用，请选择另一张手牌弃置。');
        let needsTarget = ['attack', 'duel', 'dismantle', 'steal'].includes(virtualCard.type);
        this.uiPrompt = null;
        this.uiBaibianDeclared = null;
        this.uiBaibianCardIdx = null;
        if (needsTarget) {
            this.uiVirtualPlay = { cardIdx, discardIdx, declaredName: virtualCard.name };
            this.uiSelectedCardIdx = cardIdx;
            this.showPrompt('选择目标', `请选择目标，将这张牌当作【${virtualCard.name}】使用。`, [
                { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiVirtualPlay = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
            ]);
        } else if (virtualCard.type === 'sun') {
            this.openBaibianSunPrompt(cardIdx, discardIdx);
        } else {
            Net.sendAction('BAIBIAN', { cardIdx, discardIdx, declaredName: virtualCard.name });
            this.uiSelectedCardIdx = -1;
        }
    },
    openBaibianSunPrompt: function(cardIdx, discardIdx) {
        let me = this.gameState.players.find(p => p.id === this.myId);
        if (!me) return;
        let available = Math.max(0, me.hand.length - 2);
        let buttons = [];
        for (let i = 0; i <= available; i++) {
            buttons.push({ text: `弃 ${i} 张`, cls: i >= 2 ? 'success' : 'primary', cb: () => this.startBaibianSunDiscardPick(cardIdx, discardIdx, i) });
        }
        buttons.push({ text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } });
        this.showPrompt('百变【午后阳光】', '请选择要额外弃置的牌数。弃至少两张会回复1点体力。', buttons);
    },
    startBaibianSunDiscardPick: function(cardIdx, discardIdx, count) {
        this.uiPrompt = null;
        if (count <= 0) {
            Net.sendAction('BAIBIAN', { cardIdx, discardIdx, declaredName: '午后阳光', sunDiscardIndexes: [] });
            this.uiSelectedCardIdx = -1;
            return;
        }
        this.uiSunDiscard = { cardIdx, count, selected: [], locked: [cardIdx, discardIdx], baibian: { cardIdx, discardIdx } };
        this.uiSelectedCardIdx = cardIdx;
        this.showPrompt('选择弃牌', `请选择 ${count} 张要因【午后阳光】弃置的手牌。`, [
            { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSunDiscard = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
        ]);
    },
    askForNullify: function(source, card, target, effect) {
        let responder = this.findNullifyResponder(source, this.getTrickTargets(source, card, target));
        if (!responder) return false;
        this.askForResponse('NULLIFY', source.id, responder.id, { cardName: card.name, effect });
        return true;
    },
    continueNullifiedEffect: function(effect) {
        if (!effect) return;
        let source = this.gameState.players.find(p => p.id === effect.sourceId);
        let target = this.gameState.players.find(p => p.id === effect.targetId);
        let card = effect.card;
        if (!source || !card) return;
        this.applyCardEffect(source, card, target);
    },

    // === 初始化 ===
    startSPSetup: function(count) {
        this.mode = 'SP';
        this.myId = 0;
        this.spPlayerCount = count === 2 ? 2 : 5;
        this.renderHeroSelect();
    },
    startSPFromMenu: function() {
        let el = document.getElementById('sp-match-size');
        this.startSPSetup(Number(el ? el.value : 5));
    },
    startSPGame: function() {
        this.showScreen('screen-game');
        let ps = [this.createPlayer(0, `玩家`, false)];
        ps[0].hero = this.selectedHeroId;
        let ks = Object.keys(HEROES).filter(k => k !== this.selectedHeroId);
        for (let i = 1; i < this.spPlayerCount; i++) {
            let h = ks[Math.floor(Math.random() * ks.length)];
            ks = ks.filter(x => x !== h);
            let b = this.createPlayer(i, `Bot${i}`, true); b.hero = h; ps.push(b);
        }
        this.initGameLogic(ps);
    },
    createPlayer: function(id, name, isBot) { return { id, name, isBot, role: '', hero: '', hp: 0, maxHp: 0, hand: [], alive: true, hasHissed: false, hissStack: 0, botAttackCount: 0, cryingUsed: false, isDrunk: false, lastAction: '', timeMachineUsed: false, seedUses: 0, seeds: {}, baibianUsed: false }; },

    initGameLogic: function(players) {
        this.gameState = { players, deck: this.createDeck(), turnIdx: 0, logs: [], started: true, pendingAction: null, aoeState: null, discardingPlayerId: null, gameOver: null, soundSeq: 0, soundType: '' };
        let roles = players.length === 2
            ? ['喵皇', '反骨喵'].sort(() => Math.random() - 0.5)
            : ['喵皇', '护驾喵', '反骨喵', '反骨喵', '老六'].sort(() => Math.random() - 0.5);
        players.forEach((p, i) => {
            p.role = roles[i];
            let baseHp = HEROES[p.hero] ? HEROES[p.hero].hp : 3;
            if (p.role === '喵皇' && players.length !== 2) baseHp += 1;
            p.hp = baseHp; p.maxHp = baseHp;
            if (p.role === '喵皇') this.gameState.turnIdx = i;
            let drawCount = (p.hero === 'LOWPOLY') ? 3 : 4;
            this.drawCards(p, drawCount);
        });
        this.log("🎮 游戏开始喵！"); this.startTurn();
    },

    startTurn: function() {
        let p = this.gameState.players[this.gameState.turnIdx];
        if (!p) return;
        this.gameState.players.forEach(pl => pl.lastAction = ''); // 清空上轮动作
        
        if (!p.alive) { this.nextTurn(); return; }
        this.log(`👉 轮到 [${p.name}] 了喵`);
        this.showTurnBanner(p);
        p.hasHissed = false; p.cryingUsed = false; p.isDrunk = false; p.botAttackCount = 0; p.baibianUsed = false;

        if (p.hero === 'HAPPY' && p.hp < p.maxHp) {
            if (p.isBot) {
                if (p.hp < p.maxHp && Math.random() > 0.3) { 
                    this.log(`🎵 ${p.name} 乐天派发作，回1血`); p.hp++; this.drawCards(p, 1); 
                    this.queueSound('HAPPY'); p.lastAction='🎵 乐天'; 
                } else this.drawCards(p, 2);
            } else {
                this.askForResponse('SKILL_HAPPY_START', -1, p.id); return;
            }
        } else { this.drawCards(p, p.hero === 'LOWPOLY' ? 3 : 2); }

        if (!this.gameState.pendingAction) {
            if (p.id === this.myId) this.isDiscardPhase = false;
            this.updateAll();
        } else { this.updateAll(); }
    },

    nextTurn: function() {
        do { this.gameState.turnIdx = (this.gameState.turnIdx + 1) % this.gameState.players.length; } 
        while (!this.gameState.players[this.gameState.turnIdx].alive);
        this.startTurn();
    },

    // === Bot 逻辑 ===
    getBotEnemy: function(bot) {
        let ps = this.gameState.players.filter(p => p.alive && p.id !== bot.id);
        let king = ps.find(p => p.role === '喵皇');
        if (bot.role === '反骨喵') return king || ps[0]; 
        if (bot.role === '护驾喵') return ps.find(p => p.role !== '喵皇') || null; 
        if (bot.role === '喵皇') return ps[0];
        if (bot.role === '老六') return ps.sort((a,b) => a.hp - b.hp)[0];
        return ps[Math.floor(Math.random() * ps.length)];
    },

    botAction: function(bot) {
        if (this.gameState.pendingAction || this.gameState.aoeState || this.gameState.turnIdx !== bot.id || !bot.alive) return;

        if (this.gameState.discardingPlayerId === bot.id) {
            this.handleActionInternal(bot, {type:'DISCARD', cardIdx: 0});
            return;
        }
        
        let actionTaken = false;
        // 1. 回血
        let hI = bot.hand.findIndex(c => c.type === 'heal');
        if (hI > -1 && bot.hp < bot.maxHp) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: hI});

        // 2. 吸薄荷
        if (!actionTaken) {
            let bI = bot.hand.findIndex(c => c.type === 'buff');
            let kI = bot.hand.findIndex(c => c.type === 'attack');
            if (bI > -1 && kI > -1 && !bot.isDrunk) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: bI});
        }

        // 3. 放 AOE
        if (!actionTaken) {
            let aI = bot.hand.findIndex(c => c.type === 'aoe' || c.type === 'bark');
            if (aI > -1) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: aI});
        }

        // 4. 锦囊：午后阳光
        if (!actionTaken) {
            let sI = bot.hand.findIndex(c => c.type === 'sun');
            if (sI > -1 && bot.hand.length >= 3) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: sI});
        }

        // 5. 锦囊：猫猫互殴
        if (!actionTaken) {
            let dI = bot.hand.findIndex(c => c.type === 'duel');
            if (dI > -1 && bot.hand.some(c => c.type === 'attack')) {
                let target = this.getBotEnemy(bot);
                if (target) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: dI, targetId: target.id});
            }
        }

        // 6. 杀
        if (!actionTaken) {
            let kI = bot.hand.findIndex(c => c.type === 'attack');
            let canBotAttack = (!bot.hasHissed || bot.hero === 'MAODIE') && !(this.gameState.players.length === 2 && bot.hero !== 'MAODIE' && bot.botAttackCount >= 1);
            if (kI > -1 && canBotAttack) {
                let target = this.getBotEnemy(bot);
                if(target) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: kI, targetId: target.id});
            }
        }

        if (actionTaken) return; // 行动过，等待下一次 checkBotAutoPlay

        this.handleActionInternal(bot, {type:'END_TURN'});
    },

    botResponse: function(bot) {
        let p = this.gameState.pendingAction;
        if (!p || p.targetId !== bot.id) return;
        
        if (p.type === 'AOE_ASK') {
            let req = p.cardType;
            if (bot.hand.some(c => c.type === req)) this.resolveResponse(bot.id, 'YES');
            else this.resolveResponse(bot.id, 'NO');
        } else if (p.type === 'DODGE') {
            if (bot.hand.some(c => c.type === 'defense')) this.resolveResponse(bot.id, 'YES');
            else this.resolveResponse(bot.id, 'NO');
        } else if (p.type === 'DUEL_HISS') {
            if (bot.hand.some(c => c.type === 'attack')) this.resolveResponse(bot.id, 'YES');
            else this.resolveResponse(bot.id, 'NO');
        } else if (p.type === 'DYING') {
            if (bot.hand.some(c => c.type === 'heal' || c.type === 'buff')) this.resolveResponse(bot.id, 'YES');
            else this.resolveResponse(bot.id, 'NO');
        } else if (p.type === 'SKILL_HUH_HISS') {
            if (bot.hand.length > 0) this.resolveResponse(bot.id, 'YES');
            else this.resolveResponse(bot.id, 'NO');
        } else {
            this.resolveResponse(bot.id, 'YES');
        }
    },

    askForResponse: function(type, sourceId, targetId, extra) {
        this.gameState.pendingAction = { type, sourceId, targetId, ...extra };
        this.updateAll();
    },

    // === 核心交互逻辑 ===
    handleActionInternal: function(p, action) {
        action = action || {};
        if (!p || !p.alive || this.gameState.gameOver) return false;
        if (this.gameState.turnIdx !== p.id) return false;
        if (this.gameState.pendingAction || this.gameState.aoeState) return false;
        let done = false;

        if (action.type === 'END_TURN') { 
            let limit = this.getHandLimit(p);
            if (p.hand.length > limit) {
                this.gameState.discardingPlayerId = p.id;
                if (p.id === this.myId) this.isDiscardPhase = true;
                this.uiSelectedCardIdx = -1;
                this.updateAll();
                return true;
            }
            this.gameState.discardingPlayerId = null;
            if (p.id === this.myId) this.isDiscardPhase = false;
            p.isDrunk = false; 
            this.nextTurn(); return true; 
        }
        
        if (action.type === 'DISCARD') {
            if (this.gameState.discardingPlayerId !== p.id) return false;
            let limit = this.getHandLimit(p);
            if (p.hand.length <= limit) {
                this.gameState.discardingPlayerId = null;
                if (p.id === this.myId) this.isDiscardPhase = false;
                p.isDrunk = false;
                this.nextTurn();
                return true;
            }
            if(p.hand[action.cardIdx]) {
                let c = p.hand.splice(action.cardIdx, 1)[0];
                this.log(`${p.name} 弃牌`);
                p.lastAction = `🗑️ ${c.name}`;
                if (p.hand.length <= limit) {
                    this.gameState.discardingPlayerId = null;
                    if (p.id === this.myId) this.isDiscardPhase = false;
                    p.isDrunk = false;
                    this.updateAll();
                    this.nextTurn();
                    return true;
                }
                this.updateAll(); return true;
            }
            return false;
        }

        if (action.type === 'BAIBIAN') {
            if (p.hero !== 'TOM' || this.gameState.discardingPlayerId === p.id) return false;
            if (p.baibianUsed) return false;
            let cardIdx = Number(action.cardIdx);
            let discardIdx = Number(action.discardIdx);
            if (!Number.isInteger(cardIdx) || !Number.isInteger(discardIdx) || cardIdx === discardIdx) return false;
            if (cardIdx < 0 || discardIdx < 0 || cardIdx >= p.hand.length || discardIdx >= p.hand.length) return false;
            let virtualCard = this.getDeclaredCard(action.declaredName);
            if (!virtualCard) return false;
            let rawSunDiscardIndexes = Array.isArray(action.sunDiscardIndexes) ? action.sunDiscardIndexes.map(Number) : [];
            let targetId = action.targetId !== undefined && action.targetId !== null ? Number(action.targetId) : null;
            let target = Number.isInteger(targetId) ? this.gameState.players.find(pl => pl.id === targetId) : null;
            let needsTarget = ['attack', 'duel', 'dismantle', 'steal'].includes(virtualCard.type);
            if (needsTarget && (!target || !target.alive || target.id === p.id)) return false;
            if (virtualCard.type === 'steal' && this.getDistance(p, target) > 1) return false;
            if ((virtualCard.type === 'dismantle' || virtualCard.type === 'steal') && target.hand.length === 0) return false;
            if (virtualCard.type === 'attack' && p.hasHissed) return false;
            if (virtualCard.type === 'heal' && p.hp >= p.maxHp) return false;
            if (target && target.hero === 'LOWPOLY' && target.hand.length === 0 && virtualCard.type === 'attack') return false;

            let removed = [cardIdx, discardIdx].sort((a, b) => a - b);
            let sunDiscardIndexes = rawSunDiscardIndexes
                .filter(i => Number.isInteger(i) && i >= 0 && i < p.hand.length && !removed.includes(i))
                .map(i => i - removed.filter(r => r < i).length);
            [cardIdx, discardIdx].sort((a, b) => b - a).forEach(i => p.hand.splice(i, 1));
            let card = { ...virtualCard, uid: Math.random(), suit: '百', color: 'red', fromBaibian: true };
            if (card.type === 'sun') card.sunDiscardIndexes = sunDiscardIndexes;
            p.baibianUsed = true;
            p.lastAction = target ? `🎭 百变【${card.name}】→${target.name}` : `🎭 百变【${card.name}】`;
            this.log(`🎭 ${p.name} 发动百变，声明【${card.name}】`);
            if (card.type === 'heal') {
                if (p.hp < p.maxHp) p.hp++;
                this.updateAll();
                return true;
            }
            if (this.shouldAskNullify(card) && this.askForNullify(p, card, target, { sourceId: p.id, targetId: target ? target.id : null, card })) return true;
            this.applyCardEffect(p, card, target);
            this.updateAll();
            return true;
        }

        if (action.type === 'PLAY_CARD') {
            if (this.gameState.discardingPlayerId === p.id) return false;
            let cardIdx = Number(action.cardIdx);
            if (!Number.isInteger(cardIdx) || cardIdx < 0 || cardIdx >= p.hand.length) return false;
            let card = p.hand[cardIdx]; if (!card) return false;
            let targetId = action.targetId !== undefined && action.targetId !== null ? Number(action.targetId) : null;
            let target = targetId !== null && Number.isInteger(targetId) ? this.gameState.players.find(pl=>pl.id===targetId) : null;
            let needsTarget = ['attack', 'duel', 'dismantle', 'steal'].includes(card.type);
            let effectiveCard = card;
            if (p.hero === 'DUOLA' && action.playAs === 'heal' && card.type === 'buff') {
                effectiveCard = { ...CARDS.TREAT, uid: card.uid, suit: card.suit, color: card.color, fromCopper: true };
            } else if (p.hero === 'DUOLA' && action.playAs === 'buff' && card.type === 'heal') {
                effectiveCard = { ...CARDS.CATNIP, uid: card.uid, suit: card.suit, color: card.color, fromCopper: true };
            } else if (card.type === 'sun') {
                let raw = Array.isArray(action.discardIndexes) ? action.discardIndexes.map(Number) : [];
                effectiveCard = { ...card, sunDiscardIndexes: raw.filter(i => i !== cardIdx).map(i => i > cardIdx ? i - 1 : i) };
            }

            if (card.type === 'defense' || card.type === 'nullify') {
                if (p.id === this.myId) this.showNotice(`【${card.name}】是被动牌，无法主动打出。`);
                return false;
            }

            if (needsTarget && (!target || !target.alive || target.id === p.id)) {
                if (p.id === this.myId) this.showNotice('请选择一个有效目标。');
                return false;
            }

            if (effectiveCard.type === 'attack' && p.hasHissed && p.hero !== 'MAODIE') {
                if (p.id === this.myId) this.showNotice('本回合已经哈气过了。');
                return false;
            }

            if (target && target.hero === 'LOWPOLY' && target.hand.length === 0 && effectiveCard.type === 'attack') {
                if (p.id === this.myId) this.showNotice("对方丑橘空手牌，无法被【哈气】指定。");
                return false;
            }

            if (effectiveCard.type === 'steal' && this.getDistance(p, target) > 1) {
                if (p.id === this.myId) this.showNotice('【这一爪】只能对距离为 1 的目标使用。');
                return false;
            }

            if ((effectiveCard.type === 'dismantle' || effectiveCard.type === 'steal') && target.hand.length === 0) {
                if (p.id === this.myId) this.showNotice('目标没有可以操作的牌。');
                return false;
            }
            
            p.lastAction = target ? `⚔️ 对 ${target.name} ${card.name}` : `🎴 ${card.name}`;

            if (effectiveCard.type === 'heal') {
                if (p.hp >= p.maxHp) { if (p.id === this.myId) this.showNotice("已经满血，不能这样使用【冻干】。"); return false; }
                p.hand.splice(cardIdx, 1); p.hp++; this.log(`💊 ${p.name} 回血`); done = true;
                if (p.hero === 'DUOLA') {
                    this.drawCards(p, 1);
                    this.log(`🔔 ${p.name} 发动铜锣，额外摸1张牌`);
                }
            } else {
                if(card.type==='buff'||card.type==='aoe'||card.type==='bark'||card.type==='sun'||target) { 
                    p.hand.splice(cardIdx, 1); done = true; 
                } else return false;
            }

            if (done) {
                if (this.shouldAskNullify(effectiveCard) && this.askForNullify(p, effectiveCard, target, { sourceId: p.id, targetId: target ? target.id : null, card: effectiveCard })) return true;
                this.applyCardEffect(p, effectiveCard, target);
                this.updateAll(); return true;
            }
        }
        return false;
    },

    applyCardEffect: function(p, card, target) {
        if (card.type === 'attack') {
            this.queueSound('HISS');
            let dmg = p.isDrunk ? 2 : 1;
            if (p.isDrunk) { p.isDrunk = false; this.log("💨 猫薄荷上头，哈气+1"); }
            
            if (p.hero === 'MAODIE') { 
                p.hissStack++; 
                if(p.hissStack >= 5) { 
                    if (p.hp > 1) { this.resolveDamage(p, 1, p); this.log("🦁 耄耋连哈累得掉血！"); }
                    p.hissStack=0; 
                }
            }
            if (p.isBot) p.botAttackCount = (p.botAttackCount || 0) + 1;
            if (p.hero !== 'MAODIE') p.hasHissed = true;
            
            this.log(`⚔️ ${p.name} 对 ${target.name} 哈气`);
            if (target.hero === 'HUH' && target.hand.length > 0) {
                this.askForResponse('SKILL_HUH_HISS', p.id, target.id, {damage: dmg});
            } else if (target.hero === 'BANANA' && !target.cryingUsed) {
                this.askForResponse('SKILL_BANANA', p.id, target.id, {damage: dmg}); 
            } else {
                this.askForResponse('DODGE', p.id, target.id, {damage: dmg});
            }
        } 
        else if (card.type === 'buff') {
            p.isDrunk = true;
            this.log(`🌿 ${p.name} 吸猫薄荷`);
            p.lastAction = `🌿 吸猫薄荷`;
            if (p.hero === 'DUOLA') {
                this.drawCards(p, 1);
                this.log(`🔔 ${p.name} 发动铜锣，额外摸1张牌`);
            }
        }
        else if (card.type === 'sun') {
            let discardIndexes = Array.isArray(card.sunDiscardIndexes) ? card.sunDiscardIndexes.filter(i => Number.isInteger(i) && i >= 0 && i < p.hand.length) : [];
            if (p.isBot && discardIndexes.length === 0) {
                discardIndexes = p.hand.map((_, i) => i).slice(0, Math.min(2, p.hand.length));
            }
            discardIndexes = Array.from(new Set(discardIndexes)).sort((a, b) => b - a);
            let discardCount = discardIndexes.length;
            if (p.hand.length > 0) {
                discardIndexes.forEach(i => p.hand.splice(i, 1));
            }
            this.drawCards(p, discardCount);
            if (discardCount >= 2 && p.hp < p.maxHp) p.hp++;
            this.log(`☀️ ${p.name} 使用午后阳光，弃${discardCount}摸${discardCount}${discardCount >= 2 ? '，回复1血' : ''}`);
            p.lastAction = '☀️ 午后阳光';
        }
        else if (card.type === 'aoe' || card.type === 'bark') { 
            this.log(`📢 ${p.name} 放AOE`); this.startAOE(p, card.type); 
        }
        else if (card.type === 'dismantle' || card.type === 'steal') {
            if (target.hand.length > 0) {
                let r = Math.floor(Math.random()*target.hand.length);
                if (card.type === 'steal') p.hand.push(target.hand.splice(r,1)[0]);
                else target.hand.splice(r,1);
                this.log(`🖐 ${p.name} 对 ${target.name} ${card.name}成功`);
            }
        }
        else if (card.type === 'duel') {
            this.log(`⚔️ ${p.name} 决斗 ${target.name}`);
            this.askForResponse('DUEL_HISS', p.id, target.id, { extraSourceId: p.id });
        }
    },

    resolveResponse: function(pid, choice) {
        choice = choice === 'NULLIFY' ? 'NULLIFY' : (choice === 'YES' ? 'YES' : 'NO');
        if (this.gameState.gameOver) return;
        let pending = this.gameState.pendingAction;
        if (!pending || pending.targetId !== pid) return;
        
        let t = this.gameState.players.find(p => p.id === pid);
        let s = this.gameState.players.find(p => p.id === pending.sourceId);
        if (!t) return;

        if (pending.type === 'NULLIFY') {
            this.gameState.pendingAction = null;
            let idx = t.hand.findIndex(c => c.type === 'nullify');
            if (choice === 'YES' && idx > -1) {
                t.hand.splice(idx, 1);
                this.log(`✈️ ${t.name} 飞机耳发动，${pending.cardName || '锦囊'} 被装作没听见`);
                t.lastAction = '✈️ 飞机耳';
                this.updateAll();
                if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
            } else {
                this.continueNullifiedEffect(pending.effect);
                this.updateAll();
            }
            return;
        }

        if (pending.type === 'AOE_ASK') {
            let req = pending.cardType;
            this.gameState.pendingAction = null;
            if (choice === 'NULLIFY') {
                let nidx = t.hand.findIndex(c => c.type === 'nullify');
                if (nidx > -1) {
                    t.hand.splice(nidx, 1);
                    this.log(`✈️ ${t.name} 发动飞机耳，只抵消了${pending.cardName || '锦囊'}对自己的效果`);
                    t.lastAction = '✈️ 飞机耳';
                } else {
                    this.resolveDamage(t, 1, s);
                }
            } else if (choice === 'YES') {
                let idx = t.hand.findIndex(c => c.type === req);
                if (idx > -1) { 
                    t.hand.splice(idx, 1); 
                    this.log(`✅ ${t.name} 响应成功`); 
                    t.lastAction = (req==='attack' ? '💨 哈气' : '🛡️ 棘背龙');
                } else this.resolveDamage(t, 1, s);
            } else {
                this.resolveDamage(t, 1, s);
            }
            
            // 关键修复：AOE 队列必须强制流转，不能因为濒死或其他原因停滞
            if (this.gameState.pendingAction && this.gameState.pendingAction.type === 'DYING') return;

            if (this.gameState.aoeState) {
                this.gameState.aoeState.queue.shift(); // 移除当前
                setTimeout(() => this.processAOEQueue(), 500); // 延时递归下一个
            }
            return;
        }

        if (pending.type === 'SKILL_HUH_HISS') {
            if (choice === 'YES' && t.hand.length > 0) {
                let randIdx = Math.floor(Math.random() * t.hand.length);
                t.hand.splice(randIdx, 1); this.log(`❓ ${t.name} 发动疑惑，哈气无效！`);
                this.queueSound('HUH'); t.lastAction = "❓ 疑惑成功";
                this.gameState.pendingAction = null; this.updateAll();
                if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
                return;
            } else {
                let dmg = pending.damage || 1;
                if (t.hero === 'BANANA' && !t.cryingUsed) this.askForResponse('SKILL_BANANA', s.id, t.id, {damage: dmg});
                else this.askForResponse('DODGE', s.id, t.id, {damage: dmg});
                return;
            }
        }

        if (pending.type === 'SKILL_BANANA') {
            if (choice === 'YES') {
                let j = this.getJudgment(); this.log(`🍌 判定: ${j.color}`);
                if (j.color === 'black') { 
                    this.showJudgeBanner('香蕉猫哭哭成功', '黑爪爪落地，这口哈气被喵喵擦掉了！', 'success');
                    this.log(`🍌 ${t.name} 哭哭成功，免疫伤害`); this.queueSound('BANANA'); t.lastAction='😭 哭哭成功'; 
                    this.gameState.pendingAction = null; this.updateAll();
                    if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
                    return; 
                } else {
                    this.showJudgeBanner('香蕉猫哭哭失败', '红爪爪翻出来了，没哭赢喵。快决定要不要启用脊背龙模式！', 'fail');
                }
            }
            let dmg = pending.damage || 1;
            this.askForResponse('DODGE', s.id, t.id, {damage: dmg});
            return;
        }

        if (pending.type === 'DUEL_HISS') {
            this.gameState.pendingAction = null;
            let idx = t.hand.findIndex(c => c.type === 'attack');
            if (choice === 'YES' && idx > -1) {
                t.hand.splice(idx, 1); this.log(`⚔️ ${t.name} 反击`); t.lastAction = '⚔️ 哈气反击';
                this.askForResponse('DUEL_HISS', t.id, s.id, { extraSourceId: t.id });
            } else {
                let sourceDmg = this.gameState.players.find(p => p.id === pending.extraSourceId);
                this.log(`🤕 ${t.name} 决斗失败`);
                this.resolveDamage(t, 1, sourceDmg);
                if(!this.gameState.pendingAction) this.resumeTurn(this.gameState.players[this.gameState.turnIdx]);
            }
            return;
        }

        if (pending.type === 'DODGE') {
            this.gameState.pendingAction = null;
            let idx = t.hand.findIndex(c => c.type === 'defense');
            if (choice === 'YES' && idx > -1) {
                t.hand.splice(idx, 1); this.log(`🛡️ ${t.name} 闪避`); t.lastAction = '🛡️ 棘背龙';
            } else {
                let dmg = pending.damage || 1;
                this.resolveDamage(t, dmg, s);
            }
            if (this.gameState.pendingAction && this.gameState.pendingAction.type === 'DYING') return;
            this.updateAll();
            if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
            return;
        }

        if (pending.type === 'SKILL_HAPPY_START') {
            if (choice === 'YES') { t.hp++; this.drawCards(t, 1); this.queueSound('HAPPY'); t.lastAction='🎵 乐天回血'; }
            else this.drawCards(t, 2);
            this.gameState.pendingAction = null;
            this.updateAll();
            this.resumeTurn(t);
            return;
        }
        
        if (pending.type === 'DYING') {
            this.gameState.pendingAction = null;
            let idx = t.hand.findIndex(c=>c.type==='heal'||c.type==='buff');
            if (choice === 'YES' && idx > -1) { 
                t.hand.splice(idx,1);
                t.hp++;
                this.log(`💊 ${t.name} 自救，回复1血`);
                t.lastAction='💊 冻干';
                if (t.hp <= 0) this.processDeath(t, s);
            } else this.processDeath(t, s);

            if (this.gameState.gameOver) return;
            
            if (this.gameState.aoeState) {
                if (this.gameState.aoeState.queue.length > 0 && this.gameState.aoeState.queue[0] === t.id) {
                    this.gameState.aoeState.queue.shift();
                }
                setTimeout(() => this.processAOEQueue(), 500);
            } else {
                this.updateAll();
                if(s) this.resumeTurn(s);
            }
            return;
        }

        this.gameState.pendingAction = null;
        this.updateAll();
        if(s) this.resumeTurn(s);
    },

    resolveDamage: function(t, n, s) {
        if(t.hero==='MAODIE' && n>1) n=1;
        if (s && s.hero === 'MIAOMIAO' && s.id !== t.id && (s.seedUses || 0) < 2) {
            s.seedUses = (s.seedUses || 0) + 1;
            t.seeds = t.seeds || {};
            t.seeds[s.id] = (t.seeds[s.id] || 0) + 1;
            this.log(`🌱 ${s.name} 发动寄生，${t.name} 获得1个种子标记`);
            s.lastAction = `🌱 寄生 ${s.seedUses}/2`;
            t.lastAction = `🌱 种子 x${Object.values(t.seeds).reduce((a, b) => a + b, 0)}`;
            this.updateAll();
            return;
        }
        t.hp -= n; 
        this.log(`💥 ${t.name} 受到 ${n}点伤害`);
        t.lastAction = `💥 扣血(-${n})`;
        if (t.hero === 'TOM') this.queueSound('TOM');
        Object.entries(t.seeds || {}).forEach(([ownerId, count]) => {
            let owner = this.gameState.players.find(p => p.id === Number(ownerId));
            if (owner && owner.alive && count > 0) {
                owner.hp = Math.min(owner.maxHp, owner.hp + Number(count));
                this.log(`🌱 ${owner.name} 因种子回复 ${count} 点体力`);
            }
        });
        if (t.hero === 'DUOLA' && t.hp <= 0 && !t.timeMachineUsed) {
            t.timeMachineUsed = true;
            t.hand = [];
            t.hp = Math.min(3, t.maxHp);
            this.drawCards(t, 2);
            this.log(`⏱️ ${t.name} 发动时光机，回复至${t.hp}血并摸两张牌`);
            t.lastAction = '⏱️ 时光机';
            return;
        }
        if (t.hp <= 0) this.askForResponse('DYING', s?s.id:-1, t.id);
    },
    
    processDeath: function(v, s) {
        if (v.hero === 'TOM') {
            v.maxHp = Math.max(0, v.maxHp - 2);
            if (v.maxHp > 0) {
                v.hp = v.maxHp;
                v.alive = true;
                v.hand = [];
                this.drawCards(v, 2);
                this.queueSound('TOM');
                this.log(`🧪 ${v.name} 发动不死，血量上限降至 ${v.maxHp} 并复活`);
                v.lastAction = `🧪 不死(${v.maxHp})`;
                this.updateAll();
                return;
            }
        }
        v.alive = false; this.log(`🌙 ${v.name} 去喵星占座了`); v.lastAction = '🌙 去喵星';
        this.queueSound('DEATH');
        this.showDeathBanner(v);
        
        if (this.gameState.aoeState) {
            let current = this.gameState.aoeState.queue[0];
            this.gameState.aoeState.queue = this.gameState.aoeState.queue.filter((id, idx) => idx === 0 ? id === current : id !== v.id);
        }
        
        if (this.gameState.pendingAction && this.gameState.pendingAction.targetId === v.id) this.gameState.pendingAction = null;
        
        if (s && s.alive && s.id !== v.id) {
            if (v.role === '反骨喵') { this.log(`💰 击杀反骨喵，摸 2 张牌！`); this.drawCards(s, 2); }
            else if (v.role === '护驾喵' && s.role === '喵皇') { this.log(`🚫 喵皇误杀护驾喵，弃光手牌！`); s.hand = []; }
        }
        
        let k = this.gameState.players.find(x => x.role === '喵皇');
        let r = this.gameState.players.filter(x => x.role === '反骨喵' && x.alive).length;
        let spy = this.gameState.players.filter(x => x.role === '老六' && x.alive).length;
        
        if (!k || !k.alive) { this.finishGame("喵皇驾崩！反骨喵阵营胜利！"); return; }
        if (r === 0 && spy === 0) { this.finishGame("反骨喵与老六全部退场，喵皇阵营胜利！"); return; }
        
        this.updateAll();
        if (this.gameState.turnIdx === v.id) this.nextTurn();
    },

    finishGame: function(message) {
        this.gameState.pendingAction = null;
        this.gameState.aoeState = null;
        this.gameState.gameOver = { message };
        this.log(`🏁 ${message}`);
        this.updateAll();
    },

    resumeTurn: function(p) {
        if (!p) return;
        if (p.isBot && p.alive && !this.gameState.pendingAction && !this.gameState.aoeState) {
            if (this.gameState.turnIdx === p.id) setTimeout(() => this.botAction(p), 1500);
        }
    },

    startAOE: function(source, type) {
        let q = [];
        let count = this.gameState.players.length;
        for (let i = 1; i < count; i++) {
            let idx = (source.id + i) % count;
            if (this.gameState.players[idx].alive) q.push(this.gameState.players[idx].id);
        }
        this.gameState.aoeState = { sourceId: source.id, type: type, queue: q };
        this.queueSound(type === 'aoe' ? 'HISS' : 'BARK');
        this.processAOEQueue();
    },

    processAOEQueue: function() {
        if (!this.gameState.aoeState || this.gameState.aoeState.queue.length === 0) {
            this.gameState.aoeState = null;
            this.updateAll();
            this.resumeTurn(this.gameState.players[this.gameState.turnIdx]);
            return;
        }
        let tid = this.gameState.aoeState.queue[0];
        let t = this.gameState.players.find(p => p.id === tid);
        let s = this.gameState.players.find(p => p.id === this.gameState.aoeState.sourceId);
        
        if (!t || !s) { this.gameState.aoeState.queue.shift(); this.processAOEQueue(); return; }

        // 疑惑猫 AOE 无效，只响应哈气
        
        if (!this.gameState.pendingAction) {
            let cType = this.gameState.aoeState.type === 'aoe' ? 'attack' : 'defense';
            let cName = cType === 'attack' ? '哈气' : '棘背龙';
            let msg = this.gameState.aoeState.type === 'bark' ? `【大狗叫】来了！快出【棘背龙】` : `【白手套】群殴！快出【哈气】`;
            this.askForResponse('AOE_ASK', s.id, t.id, { cardType: cType, cardName: cName, promptMsg: msg });
        }
    },

    confirmHero: function() {
        if (!this.selectedHeroId) return;
        document.getElementById('btn-confirm-hero').disabled = true;
        if (this.mode === 'SP') this.startSPGame();
        else {
            document.getElementById('wait-msg').innerText = "等待队友...";
            Net.sendSelectHero(this.selectedHeroId);
        }
    },

    renderHeroSelect: function() {
        this.closePopups();
        this.selectedHeroId = null;
        let confirmBtn = document.getElementById('btn-confirm-hero');
        if (confirmBtn) confirmBtn.disabled = true;
        this.setTx('ready-target-count', this.mode === 'SP' ? this.spPlayerCount : Net.targetPlayers);
        this.setTx('ready-count-disp', 0);
        this.setTx('wait-msg', '');
        let c = document.getElementById('hero-list'); c.innerHTML = '';
        Object.values(HEROES).forEach(h => {
            let d = document.createElement('div'); d.className = 'hero-card';
            d.onclick = () => {
                document.querySelectorAll('.hero-card').forEach(e => e.classList.remove('selected'));
                d.classList.add('selected');
                this.selectedHeroId = h.id;
                document.getElementById('btn-confirm-hero').disabled = false;
            };
            d.innerHTML = `<img src="${h.img}"><div class="hero-name">${h.name}</div><div class="hero-desc">${h.desc}</div>`;
            c.appendChild(d);
        });
        this.showScreen('screen-select');
    },

    handleEndTurnClick: function() {
        let me = this.gameState.players.find(p => p.id === this.myId);
        if (!me || me.isBot) return;
        Net.sendAction('END_TURN', {});
    },

    renderGame: function(state) {
        this.gameState = state; 
        if (this.mode === 'MP' && !Net.isHost && Net.peer && Net.peer.id) {
            let checkMe = state.players.find(p => p.peerId === Net.peer.id);
            if(checkMe) this.myId = checkMe.id;
        }

        let me = state.players.find(p => p.id === this.myId);
        if (!me) return;
        if ((state.soundSeq || 0) > this.soundSeqSeen) {
            this.soundSeqSeen = state.soundSeq || 0;
            this.playSound(state.soundType);
        }

        this.setTx('ui-my-role', me.role);
        this.setTx('ui-my-hero', HEROES[me.hero]?.name || '');
        this.setTx('ui-my-hp', `${"♥".repeat(Math.max(0, me.hp)) || "💀"} / ${me.maxHp}`);
        this.setTx('ui-my-hand-count', me.hand.length);
        this.setTx('ui-maodie-stack', me.hero === 'MAODIE' ? `🐾 耄耋哈气 ${me.hissStack || 0}/5` : '');
        let mySeedTotal = Object.values(me.seeds || {}).reduce((a, b) => a + Number(b || 0), 0);
        this.setTx('ui-seed-stack', mySeedTotal ? `🌱 种子 x${mySeedTotal}` : '');
        
        let ds = document.getElementById('drunk-status');
        if(ds) ds.style.display = me.isDrunk ? 'inline' : 'none';

        let limit = this.getHandLimit(me);
        let excess = me.hand.length - limit;
        let phaseBar = document.getElementById('phase-bar');
        let isMyDiscardTurn = state.discardingPlayerId === this.myId && state.turnIdx === this.myId && excess > 0;
        this.isDiscardPhase = isMyDiscardTurn;
        
        if (isMyDiscardTurn) {
            this.setDisp('phase-bar', 'block');
            this.setTx('discard-count', excess);
            let tip = `爪子拿不下了！快扔掉 ${excess} 张牌喵！`;
            phaseBar.innerText = tip;
        } else {
            this.setDisp('phase-bar', 'none');
        }

        const board = document.getElementById('game-board'); board.innerHTML = '';
        const pCount = state.players.length;
        const sortedIds = [];
        for (let i = 1; i < pCount; i++) sortedIds.push((this.myId + i) % pCount);
        const positions = pCount === 2 ? ['pos-top-center'] : ['pos-left-mid', 'pos-top-left', 'pos-top-right', 'pos-right-mid'];

        sortedIds.forEach((pid, idx) => {
            let p = state.players.find(x => x.id === pid);
            if (p) {
                let div = document.createElement('div');
                div.className = `player-pos ${positions[idx]}`;
                this.renderPlayerCard(p, div, false, p.id === state.turnIdx);
                board.appendChild(div);
            }
        });

        let handDiv = document.getElementById('hand-container'); handDiv.innerHTML = '';
        this.renderHandSkillControls(handDiv, me, state);
        me.hand.forEach((c, idx) => {
            let el = document.createElement('div');
            let sunSelected = this.uiSunDiscard && this.uiSunDiscard.selected.includes(idx);
            let sunLocked = this.uiSunDiscard && (this.uiSunDiscard.locked || [this.uiSunDiscard.cardIdx]).includes(idx);
            let baibianDiscardPick = this.uiBaibianCardIdx !== null && this.uiBaibianCardIdx !== undefined && idx !== this.uiBaibianCardIdx;
            el.className = `card-hand ${idx === this.uiSelectedCardIdx || sunSelected ? 'selected' : ''} ${this.isDiscardPhase || baibianDiscardPick || (this.uiSunDiscard && !sunLocked) ? 'discard-mode' : ''}`;
            el.style.backgroundImage = c.img ? `url('${c.img}')` : 'none';
            el.innerHTML = `<span class="card-suit ${this.escapeHTML(c.color)}">${this.escapeHTML(c.suit)}</span><div class="card-text-overlay">${this.escapeHTML(c.name)}</div>`;
            el.onpointerdown = () => {
                clearTimeout(this.uiLongPressTimer);
                this.uiLongPressTimer = setTimeout(() => {
                    this.uiSuppressNextClick = true;
                    this.showCardDetail(c);
                }, 550);
            };
            el.onpointerup = el.onpointercancel = el.onpointerleave = () => {
                clearTimeout(this.uiLongPressTimer);
            };
            el.ondblclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                clearTimeout(this.uiClickTimer);
                clearTimeout(this.uiLongPressTimer);
                this.uiSuppressNextClick = true;
                this.showCardDetail(c);
            };
            el.onclick = () => {
                if (this.uiSuppressNextClick) {
                    this.uiSuppressNextClick = false;
                    return;
                }
                clearTimeout(this.uiClickTimer);
                this.uiClickTimer = setTimeout(() => this.handleHandCardClick(c, idx, state), 180);
            };
            handDiv.appendChild(el);
        });

        if (state.gameOver) {
            this.setDisp('response-panel', 'block');
            this.setTx('resp-title', '游戏结束');
            this.setTx('resp-msg', state.gameOver.message);
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            this.addBtn(btns, '回到主菜单', true, 'primary', () => location.reload());
            return;
        }

        let panel = document.getElementById('response-panel');
        if (this.uiPrompt) {
            this.setDisp('response-panel', 'block');
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            this.setTx('resp-title', this.uiPrompt.title);
            this.setTx('resp-msg', this.uiPrompt.msg);
            this.uiPrompt.buttons.forEach(item => this.addBtn(btns, item.text, item.enable !== false, item.cls || 'primary', item.cb));
        } else if (state.pendingAction && state.pendingAction.targetId === this.myId) {
            this.setDisp('response-panel', 'block');
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            let copy = this.getResponseCopy(state.pendingAction, me);
            this.setTx('resp-title', copy.title);
            this.setTx('resp-msg', copy.msg);
            
            let yesText = copy.yes;

            let hasCard = false;
            if (state.pendingAction.type === 'DODGE') hasCard = me.hand.some(c => c.type === 'defense');
            else if (state.pendingAction.type === 'DUEL_HISS') hasCard = me.hand.some(c => c.type === 'attack');
            else if (state.pendingAction.type === 'AOE_ASK') hasCard = me.hand.some(c => c.type === state.pendingAction.cardType);
            else if (state.pendingAction.type === 'SKILL_HUH_HISS') hasCard = me.hand.length > 0;
            else if (state.pendingAction.type === 'NULLIFY') hasCard = me.hand.some(c => c.type === 'nullify');
            else if (state.pendingAction.type === 'DYING') hasCard = me.hand.some(c => c.type === 'heal' || c.type === 'buff');
            else hasCard = true;

            if (state.pendingAction.type === 'AOE_ASK' && me.hand.some(c => c.type === 'nullify')) {
                this.addBtn(btns, '发动飞机耳，只抵消对自己', true, 'warn', () => Net.sendResp('NULLIFY'));
            }
            this.addBtn(btns, yesText, hasCard, 'success', () => Net.sendResp('YES'));
            this.addBtn(btns, copy.no, true, 'danger', () => Net.sendResp('NO'));
        } else {
            this.setDisp('response-panel', 'none');
        }
    },

    handleHandCardClick: function(c, idx, state) {
                if (state.turnIdx !== this.myId) return;
                let me = state.players.find(p => p.id === this.myId);
                let limit = this.getHandLimit(me);
                if (state.discardingPlayerId === this.myId) {
                    if (me && me.hand.length > limit) Net.sendAction('DISCARD', { cardIdx: idx });
                    return;
                }
                if (this.uiBaibianDeclared) {
                    if (this.uiBaibianCardIdx === null || this.uiBaibianCardIdx === undefined) this.chooseBaibianHandCard(idx);
                    else this.chooseBaibianDiscardCard(idx);
                    return;
                }
                if (this.uiSunDiscard) {
                    this.toggleSunDiscard(idx);
                    return;
                }
                if (this.uiSelectedCardIdx === idx) { this.uiSelectedCardIdx = -1; this.uiVirtualPlay = null; }
                else {
                    this.uiSelectedCardIdx = idx;
                    if (['heal','buff','aoe','bark','sun'].includes(c.type)) {
                        this.openUseCardPrompt(me, c, idx);
                    }
                }
                this.renderGame(state);
    },

    openUseCardPrompt: function(me, card, idx) {
        if (!me || !card) return;
        if (me.hero === 'DUOLA' && (card.type === 'heal' || card.type === 'buff')) {
            let buttons = [];
            if (card.type === 'heal') {
                buttons.push({ text: '当作【冻干】使用', cls: 'success', enable: me.hp < me.maxHp, cb: () => this.confirmPlayCard(idx, { playAs: 'heal' }) });
                buttons.push({ text: '当作【猫薄荷】使用', cls: 'warn', cb: () => this.confirmPlayCard(idx, { playAs: 'buff' }) });
            } else {
                buttons.push({ text: '当作【猫薄荷】使用', cls: 'warn', cb: () => this.confirmPlayCard(idx, { playAs: 'buff' }) });
                buttons.push({ text: '当作【冻干】使用', cls: 'success', enable: me.hp < me.maxHp, cb: () => this.confirmPlayCard(idx, { playAs: 'heal' }) });
            }
            buttons.push({ text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } });
            this.showPrompt('发动【铜锣】', `你要怎样使用【${card.name}】？`, buttons);
            return;
        }
        if (card.type === 'sun') {
            let buttons = [];
            for (let i = 0; i <= me.hand.length - 1; i++) {
                buttons.push({ text: `弃 ${i} 张`, cls: i >= 2 ? 'success' : 'primary', cb: () => this.startSunDiscardPick(idx, i) });
            }
            buttons.push({ text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } });
            this.showPrompt('使用【午后阳光】', '请选择要弃置的牌数。弃至少两张会回复1点体力。', buttons);
            return;
        }
        this.showPrompt('使用卡牌', `确定使用【${card.name}】吗？`, [
            { text: '使用', cls: 'success', cb: () => this.confirmPlayCard(idx, {}) },
            { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
        ]);
    },

    confirmPlayCard: function(idx, extra) {
        this.uiPrompt = null;
        Net.sendAction('PLAY_CARD', { cardIdx: idx, ...(extra || {}) });
        this.uiSelectedCardIdx = -1;
    },

    startSunDiscardPick: function(cardIdx, count) {
        this.uiPrompt = null;
        if (count <= 0) {
            this.confirmPlayCard(cardIdx, { discardIndexes: [] });
            return;
        }
        this.uiSunDiscard = { cardIdx, count, selected: [] };
        this.uiSelectedCardIdx = cardIdx;
        this.showPrompt('选择弃牌', `请选择 ${count} 张要弃置的手牌。`, [
            { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSunDiscard = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
        ]);
    },

    toggleSunDiscard: function(idx) {
        if (!this.uiSunDiscard || (this.uiSunDiscard.locked || [this.uiSunDiscard.cardIdx]).includes(idx)) return;
        let selected = this.uiSunDiscard.selected;
        if (selected.includes(idx)) {
            this.uiSunDiscard.selected = selected.filter(i => i !== idx);
        } else if (selected.length < this.uiSunDiscard.count) {
            selected.push(idx);
        }
        if (this.uiSunDiscard.selected.length >= this.uiSunDiscard.count) {
            let data = this.uiSunDiscard;
            this.uiSunDiscard = null;
            this.uiPrompt = null;
            if (data.baibian) {
                Net.sendAction('BAIBIAN', { cardIdx: data.baibian.cardIdx, discardIdx: data.baibian.discardIdx, declaredName: '午后阳光', sunDiscardIndexes: data.selected });
                this.uiSelectedCardIdx = -1;
            } else {
                this.confirmPlayCard(data.cardIdx, { discardIndexes: data.selected });
            }
        } else {
            this.showPrompt('选择弃牌', `还需要选择 ${this.uiSunDiscard.count - this.uiSunDiscard.selected.length} 张要弃置的手牌。`, [
                { text: '取消', cls: 'danger', cb: () => { this.uiPrompt = null; this.uiSunDiscard = null; this.uiSelectedCardIdx = -1; this.renderGame(this.gameState); } }
            ]);
        }
    },

    showCardDetail: function(card) {
        if (!card || card.type === 'unknown') return;
        this.setTx('card-popup-name', card.name || '未知牌');
        this.setTx('card-popup-type', `类型：${this.getCardTypeLabel(card.type)}`);
        this.setTx('card-popup-desc', card.desc || card.text || '暂无说明');
        this.setDisp('card-detail-popup', 'flex');
    },

    getCardTypeLabel: function(type) {
        const labels = {
            attack: '攻击牌',
            defense: '防御牌',
            heal: '回复牌',
            aoe: '锦囊牌',
            bark: '锦囊牌',
            buff: '辅助牌',
            duel: '锦囊牌',
            dismantle: '锦囊牌',
            steal: '锦囊牌',
            nullify: '锦囊牌',
            sun: '锦囊牌'
        };
        return labels[type] || type || '未知';
    },

    renderHandSkillControls: function(parent, me, state) {
        if (me.hero !== 'TOM') return;
        if (state.turnIdx !== this.myId || state.pendingAction || state.aoeState || state.discardingPlayerId === this.myId) return;
        let slot = document.createElement('div');
        slot.className = 'hand-skill-slot';
        this.addBtn(slot, `百变${me.baibianUsed ? '已用' : ''}`, !me.baibianUsed && me.hand.length >= 2, 'warn', () => this.openBaibianChoice());
        parent.appendChild(slot);
    },

    renderPlayerCard: function(p, container, isMain, isTurn) {
        let el = document.createElement('div');
        el.className = `card-player ${isTurn ? 'active-turn' : ''} ${!p.alive ? 'dead' : ''} ${this.uiSelectedCardIdx !== -1 && !isMain ? 'selectable' : ''}`;
        
        if (!isMain) {
            el.onclick = () => {
                if (this.gameState.turnIdx === this.myId && this.uiSelectedCardIdx !== -1 && this.gameState.discardingPlayerId !== this.myId) {
                    if (this.uiVirtualPlay) {
                        Net.sendAction('BAIBIAN', { ...this.uiVirtualPlay, targetId: p.id });
                        this.uiVirtualPlay = null;
                        this.uiPrompt = null;
                        this.uiBaibianDeclared = null;
                    } else {
                        Net.sendAction('PLAY_CARD', { cardIdx: this.uiSelectedCardIdx, targetId: p.id });
                    }
                    this.uiSelectedCardIdx = -1;
                }
            };
        }

        let heroImg = HEROES[p.hero] ? `<img src="${this.escapeHTML(HEROES[p.hero].img)}" class="card-player-img">` : '';
        let safeName = this.escapeHTML(p.name);
        let safeRole = this.escapeHTML(p.role === '喵皇' || !p.alive ? p.role : '???');
        let safeAction = this.escapeHTML(p.lastAction);
        let netStatus = this.mode === 'MP' && !p.isBot ? `<span class="online-dot ${p.disconnected ? 'offline' : 'online'}">${p.disconnected ? '离线' : '在线'}</span>` : '';
        // 强制内联样式，修复非房主看不见黑框问题
        let act = p.lastAction ? `<div class="last-action" style="position:absolute; top:-35px; left:50%; transform:translate(-50%,0); background:rgba(0,0,0,0.9); color:#FFEB3B; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:12px; border:1px solid orange; white-space:nowrap; z-index:999;">${safeAction}</div>` : '';
        
        if (!p.isBot && this.gameState.pendingAction && this.gameState.pendingAction.targetId === p.id) {
            act = `<div class="last-action" style="position:absolute; top:-35px; left:50%; transform:translate(-50%,0); background:orange; color:white; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:12px; z-index:999;">⏳ 等待响应...</div>`;
        }

        let maodieBadge = p.hero === 'MAODIE' ? `<div class="maodie-stack">🐾 哈气 ${p.hissStack || 0}/5</div>` : '';
        let seedTotal = Object.values(p.seeds || {}).reduce((a, b) => a + Number(b || 0), 0);
        let seedBadge = seedTotal ? `<div class="seed-stack">🌱 种子 x${seedTotal}</div>` : '';
        el.innerHTML = `${act}<div>${safeName} ${netStatus}</div><div class="role-badge">${safeRole}</div>${heroImg}<div class="hp-display">♥ ${Math.max(0, p.hp)}/${p.maxHp}</div>${maodieBadge}${seedBadge}<div>🎴 ${p.hand.length}</div>`;
        container.appendChild(el);
    },

    addBtn: function(parent, text, enable, cls, cb) {
        let b = document.createElement('button'); b.className = `btn btn-${cls}`; b.innerText = text;
        b.disabled = !enable;
        b.onclick = () => { this.closePopups(); cb(); }; parent.appendChild(b);
    },
    
    closePopups: function() { document.querySelectorAll('.card-popup').forEach(e => e.style.display = 'none'); }
};

window.onload = function() { Game.init(); }
