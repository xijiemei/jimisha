const Game = {
    mode: 'NONE',
    myId: 0,
    myTeamId: 0,
    spPlayerCount: 5,
    battleMode: 'classic',
    selectedHeroId: null,
    selectedHeroIds: [],
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
    explosionSeqSeen: 0,
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
            if (state.pendingAction.type === 'BOT_EXPLOSION_DEATH') return;
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
    openPlayModeSelect: function(mode) {
        this.pendingLaunchMode = mode === 'MP' ? 'MP' : 'SP';
        this.showScreen('screen-mode-select');
    },
    showExplosionPlayerSelect: function() {
        this.showScreen('screen-explosion-count');
    },
    choosePlayMode: function(value) {
        if (this.pendingLaunchMode === 'MP') {
            let mp = document.getElementById('mp-match-size');
            if (mp) mp.value = value;
            Net.setupMP();
            return;
        }
        let sp = document.getElementById('sp-match-size');
        if (sp) sp.value = value;
        this.startSPSetup(value === 'team3' || String(value).startsWith('boom') ? value : Number(value));
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
    isExplosionMode: function(state) {
        state = state || this.gameState;
        return !!state && state.battleMode === 'explosion';
    },
    getModeLabel: function() {
        if (this.battleMode === 'explosion' || this.isExplosionMode()) return '爆炸猫窝';
        if (this.battleMode === 'team3') return '1v1 至尊猫王对决';
        return this.gameState?.players?.length === 2 ? '1v1 极速喵斗' : '经典五猫争霸';
    },
    isToolCard: function(card) {
        return !!card && ['heal', 'buff', 'aoe', 'bark', 'sun', 'duel', 'dismantle', 'steal', 'peek'].includes(card.type);
    },
    ensureStats: function(p) {
        if (!p.stats) p.stats = { damage: 0, taken: 0, kills: 0, heals: 0, dodges: 0, cardsPlayed: 0, firstBlood: false, survivedDying: 0 };
        return p.stats;
    },
    recordCardPlayed: function(p, card) {
        if (!p || !card) return;
        this.ensureStats(p).cardsPlayed++;
    },
    recordHeal: function(p, amount) {
        if (!p || !amount) return;
        this.ensureStats(p).heals += amount;
    },
    recordDamage: function(source, target, amount) {
        if (source && source.id !== target?.id) {
            let s = this.ensureStats(source);
            s.damage += amount;
            if (!this.gameState.firstBloodDone) { this.gameState.firstBloodDone = true; s.firstBlood = true; }
        }
        if (target) this.ensureStats(target).taken += amount;
    },
    getRecommendation: function(me, card, state) {
        if (!me || !card || state.turnIdx !== this.myId || state.pendingAction || state.aoeState) return null;
        if (state.discardingPlayerId === this.myId) return { text: '可弃', tone: 'discard', reason: '手牌超上限，先丢不关键的牌。' };
        if (card.type === 'heal' && me.hp < me.maxHp) return { text: '先回血', tone: 'heal', reason: '你不是满血，冻干很稳。' };
        if (card.type === 'buff' && me.hand.some(c => c.type === 'attack') && !me.isDrunk) return { text: '先上头', tone: 'power', reason: '配合哈气可以打出更高伤害。' };
        if (card.type === 'attack') {
            let dmg = me.isDrunk ? 2 : 1;
            let target = state.players.find(p => p.alive && p.id !== me.id && p.hp <= dmg);
            if (target) return { text: '可收割', tone: 'danger', reason: `${target.name} 血量很低，可以考虑点他。` };
            if (!me.hasHissed || me.hero === 'MAODIE') return { text: '能开哈', tone: 'attack', reason: '选一名对手作为目标。' };
        }
        if ((card.type === 'aoe' || card.type === 'bark') && state.players.filter(p => p.alive && p.id !== me.id).length >= 2) return { text: '全场搞事', tone: 'danger', reason: '会让所有其他玩家都要响应。' };
        if (card.type === 'duel' && me.hand.some(c => c.type === 'attack')) return { text: '逼对哈', tone: 'attack', reason: '你手里有哈气，互殴更有底气。' };
        if (card.type === 'steal' || card.type === 'dismantle') return { text: '拆节奏', tone: 'power', reason: '适合打断手牌多的人。' };
        if (card.type === 'sun' && me.hand.length >= 3) return { text: '换手牌', tone: 'heal', reason: '弃两张还能回血。' };
        if (card.type === 'defense' || card.type === 'nullify') return { text: '留着防', tone: 'keep', reason: '这是响应牌，关键时刻保命。' };
        return null;
    },
    getActionHint: function(me, state) {
        if (!me || state.gameOver) return '';
        let deckInfo = this.getExplosionDeckInfo(state);
        if (state.teamMode && state.initialActivePick) {
            let team = (state.teams || []).find(t => t.id === this.myTeamId);
            return team && team.activeId === null ? '请选择首发猫，双方都选好后才开始第一回合。' : '等待对方选择首发猫。';
        }
        if (state.teamMode && state.awaitTeamPick) return state.turnTeamId === this.myTeamId ? '请选择本回合出战猫。' : '等待对方选择出战猫。';
        if (state.pendingAction && state.pendingAction.targetId === this.myId) return '轮到你响应：看弹窗决定要不要交牌。';
        if (state.turnIdx !== this.myId) return `等待 ${state.players[state.turnIdx]?.name || '对手'} 行动。`;
        if (state.discardingPlayerId === this.myId) return '手牌超过上限，点击要弃掉的牌。';
        let best = me.hand.map(c => this.getRecommendation(me, c, state)).find(Boolean);
        let hint = best ? `${best.text}：${best.reason}` : '没有明显好牌可出，可以结束回合保留手牌。';
        return deckInfo ? `${hint} ${deckInfo}` : hint;
    },
    getExplosionDeckInfo: function(state) {
        state = state || this.gameState;
        if (!this.isExplosionMode(state) || !Array.isArray(state.deck)) return '';
        let total = state.deck.length;
        let bombs = state.deck.filter(c => c.type === 'explode').length;
        let pct = total > 0 ? Math.round((bombs / total) * 100) : 0;
        return `牌堆 ${total} 张｜爆炸 ${bombs} 张｜下摸爆炸约 ${pct}%`;
    },
    getExplosionDrawRisk: function(count, state) {
        state = state || this.gameState;
        if (!this.isExplosionMode(state) || !Array.isArray(state.deck)) return 0;
        let total = state.deck.length;
        let bombs = state.deck.filter(c => c.type === 'explode').length;
        let safe = total - bombs;
        let n = Math.min(Math.max(1, count), total);
        if (total <= 0 || bombs <= 0) return 0;
        if (n > safe) return 100;
        let noBomb = 1;
        for (let i = 0; i < n; i++) noBomb *= (safe - i) / (total - i);
        return Math.round((1 - noBomb) * 100);
    },
    getHeroMeta: function(id) {
        const meta = {
            HAPPY: { level: '简单', vibe: '稳扎稳打', tags: ['回血', '容错高'], hook: '少摸一张换回血，适合第一次上桌。' },
            MAODIE: { level: '中等', vibe: '连哈压制', tags: ['进攻', '连击'], hook: '可以连续哈气，节奏凶，但要注意自己掉血。' },
            BANANA: { level: '简单', vibe: '哭掉伤害', tags: ['防守', '运气'], hook: '被哈气时有机会直接哭没伤害，很适合整活。' },
            HUH: { level: '简单', vibe: '装作没听懂', tags: ['防守', '干扰'], hook: '被点名时弃牌躲哈气，手牌越多越安心。' },
            LOWPOLY: { level: '中等', vibe: '牌多任性', tags: ['摸牌', '发育'], hook: '摸牌多，空手时还不怕哈气，适合慢慢攒优势。' },
            TOM: { level: '进阶', vibe: '什么都能变', tags: ['百变', '复活'], hook: '手牌可以变成别的牌，还能多次复活，操作空间最大。' },
            DUOLA: { level: '中等', vibe: '口袋续航', tags: ['转换', '复活'], hook: '冻干和猫薄荷互换，濒死还能开一次时光机。' },
            MIAOMIAO: { level: '进阶', vibe: '种子吸血', tags: ['布局', '反转'], hook: '把伤害改成种子，之后别人掉血会给你回血。' }
        };
        return meta[id] || { level: '普通', vibe: HEROES[id]?.title || '', tags: [], hook: HEROES[id]?.desc || '' };
    },
    createDeck: function() {
        let deck = [];
        const add = (proto, count) => { for(let i=0; i<count; i++) { let s = SUITS[Math.floor(Math.random()*4)]; deck.push({ ...proto, suit: s, color: COLORS[s], uid: Math.random() }); }};
        add(CARDS.HISS, 24); add(CARDS.DODGE, 12); add(CARDS.TREAT, 8); add(CARDS.AOE, 2); add(CARDS.BARK, 1);
        add(CARDS.CATNIP, 4); add(CARDS.FIGHT, 3); add(CARDS.CUP, 4); add(CARDS.PUNCH, 4); add(CARDS.EARS, 3);
        add(CARDS.SUN, 3);
        return deck.sort(() => Math.random() - 0.5);
    },
    createExplosionDeck: function(playerCount, includeBombs) {
        let deck = [];
        const configs = {
            2: { HISS: 8, DODGE: 5, CATNIP: 2, FIGHT: 2, CUP: 2, PUNCH: 2, EARS: 1, BARK: 0, AOE: 1, PEEK: 3, EXPLODE: 1 },
            3: { HISS: 10, DODGE: 7, CATNIP: 3, FIGHT: 2, CUP: 3, PUNCH: 3, EARS: 2, BARK: 1, AOE: 1, PEEK: 4, EXPLODE: 2 },
            4: { HISS: 12, DODGE: 8, CATNIP: 4, FIGHT: 3, CUP: 4, PUNCH: 4, EARS: 2, BARK: 1, AOE: 2, PEEK: 5, EXPLODE: 3 }
        };
        let cfg = configs[playerCount] || configs[4];
        const add = (proto, count) => {
            for (let i = 0; i < count; i++) {
                let s = SUITS[Math.floor(Math.random() * 4)];
                deck.push({ ...proto, suit: s, color: COLORS[s], uid: Math.random() });
            }
        };
        Object.keys(cfg).forEach(key => {
            if (key === 'EXPLODE' && !includeBombs) return;
            add(CARDS[key], cfg[key]);
        });
        return deck.sort(() => Math.random() - 0.5);
    },
    insertExplosionBombs: function() {
        let state = this.gameState;
        if (!this.isExplosionMode(state) || !state.explosion || state.explosion.bombsInserted) return;
        let count = state.explosion.bombCount || Math.max(1, state.players.filter(p => p.alive).length - 1);
        for (let i = 0; i < count; i++) {
            let s = SUITS[Math.floor(Math.random() * 4)];
            state.deck.push({ ...CARDS.EXPLODE, suit: s, color: COLORS[s], uid: Math.random() });
        }
        state.deck.sort(() => Math.random() - 0.5);
        state.explosion.bombsInserted = true;
        this.log('💥 猫砂盆爆炸已经混入牌堆！');
    },
    drawCards: function(p, count, opts) {
        if (!p.alive) return;
        opts = opts || {};
        this.syncTeamHands();
        for (let i = 0; i < count; i++) {
            if (this.gameState.deck.length === 0) {
                this.gameState.deck = this.isExplosionMode() ? this.createExplosionDeck(this.gameState.players.length, false) : this.createDeck();
                this.log("🎴 牌堆重新洗混了喵！");
            }
            let card = this.gameState.deck.pop();
            if (this.isExplosionMode() && card && card.type === 'explode' && !opts.safe) {
                this.handleExplosionDraw(p, card);
                return;
            } else {
                p.hand.push(card);
            }
        }
    },
    drawSafeNonBomb: function(p) {
        if (!p || !p.alive) return;
        for (let i = this.gameState.deck.length - 1; i >= 0; i--) {
            if (this.gameState.deck[i].type !== 'explode') {
                p.hand.push(this.gameState.deck.splice(i, 1)[0]);
                this.log(`🎁 ${p.name} 击杀求生猫，摸到1张安全牌`);
                return;
            }
        }
        this.log('🎁 牌堆里没有安全牌，击杀奖励跳过。');
    },
    showExplosionBanner: function(player) {
        let banner = document.getElementById('explosion-banner');
        if (!banner) return;
        banner.innerHTML = `
            <div class="explosion-flash"></div>
            <div class="explosion-card">
                <div class="explosion-title">猫砂盆爆炸！</div>
                <div class="explosion-name">${this.escapeHTML(player?.name || '求生猫')} 踩中了大危机</div>
            </div>`;
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 2600);
    },
    handleExplosionDraw: function(p, bombCard) {
        this.gameState.explosionFxSeq = (this.gameState.explosionFxSeq || 0) + 1;
        this.gameState.explosionFxPlayerName = p.name;
        this.explosionSeqSeen = this.gameState.explosionFxSeq;
        this.showExplosionBanner(p);
        this.log(`💥 ${p.name} 摸到了【猫砂盆爆炸】！`);
        p.lastAction = '💥 猫砂盆爆炸';
        let defuseIdx = p.hand.findIndex(c => c.type === 'defuse');
        if (defuseIdx < 0) {
            this.log(`💀 ${p.name} 没有【埋屎】，直接出局！`);
            if (p.isBot) {
                this.gameState.pendingAction = { type: 'BOT_EXPLOSION_DEATH', sourceId: p.id, targetId: p.id, aoeResume: !!(this.gameState.aoeState && this.gameState.aoeState.queue && this.gameState.aoeState.queue[0] === p.id) };
                this.updateAll();
                setTimeout(() => {
                    if (this.gameState.pendingAction && this.gameState.pendingAction.type === 'BOT_EXPLOSION_DEATH' && this.gameState.pendingAction.targetId === p.id) {
                        this.gameState.pendingAction = null;
                        this.processExplosionDeath(p);
                    }
                }, 1800);
            } else {
                this.processExplosionDeath(p);
            }
            return;
        }
        p.hand.splice(defuseIdx, 1);
        this.log(`🧻 ${p.name} 打出【埋屎】，把危机埋回去`);
        this.askForResponse('EXPLOSION', p.id, p.id, { bomb: bombCard, resumeId: this.gameState.turnIdx, aoeResume: !!(this.gameState.aoeState && this.gameState.aoeState.queue && this.gameState.aoeState.queue[0] === p.id) });
    },
    insertBombAtChoice: function(bombCard, choice) {
        let deck = this.gameState.deck;
        let card = bombCard || { ...CARDS.EXPLODE, uid: Math.random() };
        let fromTop = choice === 'TOP1' ? 1 : (choice === 'TOP3' ? 3 : (choice === 'TOP5' ? 5 : 0));
        if (!fromTop) {
            deck.unshift(card);
            return;
        }
        let idx = Math.max(0, deck.length - fromTop + 1);
        deck.splice(idx, 0, card);
    },
    processExplosionDeath: function(p) {
        let shouldResumeAOE = !!(this.gameState.aoeState && this.gameState.aoeState.queue && this.gameState.aoeState.queue[0] === p.id);
        p.explosionKilled = true;
        this.processDeath(p, null);
        p.explosionKilled = false;
        if (shouldResumeAOE && !this.gameState.gameOver && this.gameState.aoeState) {
            if (this.gameState.aoeState.queue[0] === p.id) this.gameState.aoeState.queue.shift();
            setTimeout(() => {
                if (!this.gameState.gameOver && this.gameState.aoeState) this.processAOEQueue();
            }, 2200);
        }
    },
    openPeekPrompt: function(cardIdx) {
        let top = this.gameState.deck.slice(-3).reverse();
        if (!top.length) return this.showNotice('牌堆已经空了，什么也闻不到。');
        let names = top.map((c, i) => `${i + 1}. ${c.name}`).join(' / ');
        let perms = top.length === 1 ? [[0]] : (top.length === 2 ? [[0, 1], [1, 0]] : [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]);
        let buttons = perms.map(order => ({
            text: `按 ${order.map(i => String(i + 1)).join('-')} 放回`,
            cls: order.every((v, i) => v === i) ? 'primary' : 'warn',
            cb: () => this.confirmPlayCard(cardIdx, { peekOrder: order })
        }));
        this.showPrompt('闻一下', `牌堆顶是：${names}。按钮数字表示把上面第几张牌放回第1、第2、第3的位置。`, buttons);
    },
    applyPeekOrder: function(order) {
        let count = Math.min(3, this.gameState.deck.length);
        let top = this.gameState.deck.splice(this.gameState.deck.length - count, count).reverse();
        let clean = (Array.isArray(order) ? order : [0, 1, 2]).filter(i => Number.isInteger(i) && i >= 0 && i < count);
        if (new Set(clean).size !== count) clean = Array.from({ length: count }, (_, i) => i);
        let arrangedTopFirst = clean.map(i => top[i]);
        this.gameState.deck.push(...arrangedTopFirst.reverse());
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
        if (this.isExplosionMode()) return Infinity;
        if (!p) return 0;
        return Math.max(0, p.hp) + (p.hero === 'BANANA' ? 1 : 0);
    },
    isTeamMode: function() {
        return this.gameState && this.gameState.teamMode;
    },
    getTeam: function(teamId) {
        return (this.gameState.teams || []).find(t => t.id === teamId);
    },
    syncTeamHands: function(state) {
        state = state || this.gameState;
        if (!state || !state.teamMode || !Array.isArray(state.teams)) return;
        state.players.forEach(p => {
            let team = state.teams.find(t => t.id === p.teamId);
            if (team) p.hand = team.hand = team.hand || [];
        });
    },
    getControlledPlayer: function(state) {
        state = state || this.gameState;
        if (!state.teamMode) return state.players.find(p => p.id === this.myId);
        let teamId = this.myTeamId || 0;
        if (this.mode === 'MP' && Net.peer && Net.peer.id) {
            let team = (state.teams || []).find(t => t.peerId === Net.peer.id);
            if (team) teamId = this.myTeamId = team.id;
        }
        let pendingTarget = state.pendingAction ? state.players.find(p => p.id === state.pendingAction.targetId) : null;
        if (pendingTarget && pendingTarget.teamId === teamId) return pendingTarget;
        let team = (state.teams || []).find(t => t.id === teamId);
        return state.players.find(p => p.id === team?.activeId) || state.players.find(p => p.teamId === teamId && p.alive);
    },
    getTeamAlive: function(teamId) {
        return this.gameState.players.filter(p => p.teamId === teamId && p.alive);
    },
    getOpponentActive: function(teamId) {
        let enemy = (this.gameState.teams || []).find(t => t.id !== teamId);
        return this.gameState.players.find(p => p.id === enemy?.activeId && p.alive) || null;
    },
    isActiveTeamCat: function(p) {
        let team = this.getTeam(p?.teamId);
        return !!p && !!team && team.activeId === p.id;
    },
    getTrickTargets: function(source, card, target) {
        if (!card) return [];
        if (this.gameState.teamMode) {
            let activeEnemy = this.getOpponentActive(source.teamId);
            if (card.type === 'aoe' || card.type === 'bark') return activeEnemy ? [activeEnemy] : [];
        }
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
        return Object.values(CARDS).find(c => c.name === name && !['defense', 'nullify', 'explode', 'defuse'].includes(c.type) && !(this.isExplosionMode() && ['sun', 'heal'].includes(c.type))) || null;
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
            .filter(c => !['defense', 'nullify', 'explode', 'defuse'].includes(c.type) && !(this.isExplosionMode() && ['sun', 'heal'].includes(c.type)))
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
        this.myTeamId = 0;
        this.battleMode = String(count).startsWith('boom') ? 'explosion' : (count === 'team3' ? 'team3' : 'classic');
        this.spPlayerCount = this.battleMode === 'explosion' ? Math.max(2, Math.min(4, Number(String(count).replace('boom', '')) || 2)) : (count === 2 ? 2 : 5);
        this.renderHeroSelect();
    },
    startSPFromMenu: function() {
        let el = document.getElementById('sp-match-size');
        let val = el ? el.value : '5';
        this.startSPSetup(val === 'team3' || String(val).startsWith('boom') ? val : Number(val));
    },
    startSPGame: function() {
        this.showScreen('screen-game');
        if (this.battleMode === 'team3') {
            let chosen = this.selectedHeroIds.slice(0, 3);
            let pool = Object.keys(HEROES).filter(k => !chosen.includes(k)).sort(() => Math.random() - 0.5).slice(0, 3);
            let setup = this.createTeamBattlePlayers([
                { id: 0, name: '玩家', isBot: false, hero: chosen, peerId: 'sp-human' },
                { id: 1, name: 'Bot队', isBot: true, hero: pool, peerId: 'sp-bot' }
            ]);
            this.initTeamBattleLogic(setup.players, setup.teams);
            return;
        }
        let ps = [this.createPlayer(0, `玩家`, false)];
        ps[0].hero = this.selectedHeroId;
        let ks = Object.keys(HEROES).filter(k => k !== this.selectedHeroId);
        for (let i = 1; i < this.spPlayerCount; i++) {
            let h = ks[Math.floor(Math.random() * ks.length)];
            ks = ks.filter(x => x !== h);
            let b = this.createPlayer(i, `Bot${i}`, true); b.hero = h; ps.push(b);
        }
        if (this.battleMode === 'explosion') this.initExplosionLogic(ps);
        else this.initGameLogic(ps);
    },
    createPlayer: function(id, name, isBot) { return { id, name, isBot, role: '', hero: '', hp: 0, maxHp: 0, hand: [], alive: true, hasHissed: false, hissStack: 0, botAttackCount: 0, turnAttackUsed: false, turnToolUsed: false, cryingUsed: false, isDrunk: false, lastAction: '', timeMachineUsed: false, seedUses: 0, seeds: {}, baibianUsed: false, stats: { damage: 0, taken: 0, kills: 0, heals: 0, dodges: 0, cardsPlayed: 0, firstBlood: false, survivedDying: 0 } }; },

    createTeamBattlePlayers: function(lobbyPlayers) {
        let players = [];
        let teams = lobbyPlayers.slice(0, 2).map((lp, teamId) => ({ id: teamId, name: lp.name, peerId: lp.peerId, isBot: !!lp.isBot, hand: [], activeId: null }));
        lobbyPlayers.slice(0, 2).forEach((lp, teamId) => {
            (lp.hero || []).slice(0, 3).forEach((heroId, slot) => {
                let p = this.createPlayer(players.length, `${lp.name}-${slot + 1}`, !!lp.isBot);
                p.peerId = lp.peerId;
                p.teamId = teamId;
                p.teamSlot = slot;
                p.hero = heroId;
                p.hand = teams[teamId].hand;
                p.role = teamId === 0 ? '蓝队' : '红队';
                players.push(p);
            });
        });
        teams.forEach(t => t.activeId = null);
        return { players, teams };
    },

    initGameLogic: function(players) {
        this.battleMode = 'classic';
        this.gameState = { players, deck: this.createDeck(), turnIdx: 0, logs: [], started: true, battleMode: 'classic', firstBloodDone: false, pendingAction: null, aoeState: null, discardingPlayerId: null, gameOver: null, soundSeq: 0, soundType: '' };
        let roles = players.length === 2
            ? ['喵皇', '反骨喵'].sort(() => Math.random() - 0.5)
            : ['喵皇', '护驾喵', '反骨喵', '反骨喵', '老六'].sort(() => Math.random() - 0.5);
        players.forEach((p, i) => {
            p.role = roles[i];
            let baseHp = HEROES[p.hero] ? HEROES[p.hero].hp : 3;
            if (p.role === '喵皇' && players.length !== 2) baseHp += 1;
            p.hp = baseHp; p.maxHp = baseHp;
            p.turnAttackUsed = false; p.turnToolUsed = false;
            p.stats = { damage: 0, taken: 0, kills: 0, heals: 0, dodges: 0, cardsPlayed: 0, firstBlood: false, survivedDying: 0 };
            if (p.role === '喵皇') this.gameState.turnIdx = i;
            let drawCount = (p.hero === 'LOWPOLY') ? 3 : 4;
            this.drawCards(p, drawCount);
        });
        this.log(`🎮 ${this.getModeLabel()}开始喵！`); this.startTurn();
    },

    initExplosionLogic: function(players) {
        this.battleMode = 'explosion';
        let bombCount = Math.max(1, players.length - 1);
        this.gameState = { players, deck: this.createExplosionDeck(players.length, false), turnIdx: 0, logs: [], started: true, battleMode: 'explosion', firstBloodDone: false, pendingAction: null, aoeState: null, discardingPlayerId: null, gameOver: null, soundSeq: 0, soundType: '', explosion: { initialTurns: 0, turnsCompleted: 0, bombsInserted: false, bombCount, noStartDrawRemaining: players.length } };
        players.forEach(p => {
            p.role = '求生猫';
            let baseHp = 1;
            p.hp = baseHp; p.maxHp = baseHp;
            p.turnAttackUsed = false; p.turnToolUsed = false;
            p.stats = { damage: 0, taken: 0, kills: 0, heals: 0, dodges: 0, cardsPlayed: 0, firstBlood: false, survivedDying: 0 };
            this.drawCards(p, 6, { safe: true });
            p.hand.push({ ...CARDS.DEFUSE, suit: '猫', color: 'black', uid: Math.random() });
        });
        this.insertExplosionBombs();
        this.gameState.turnIdx = 0;
        this.log(`💣 爆炸猫窝开始：${players.length} 只求生猫，猫砂盆爆炸已经混入牌堆。`);
        this.startTurn();
    },

    initTeamBattleLogic: function(players, teams) {
        this.battleMode = 'team3';
        this.myTeamId = 0;
        this.gameState = { players, teams, deck: this.createDeck(), turnIdx: players.find(p => p.teamId === 0)?.id ?? 0, turnTeamId: 0, initialActivePick: true, awaitTeamPick: false, logs: [], started: true, teamMode: true, battleMode: 'team3', firstBloodDone: false, pendingAction: null, aoeState: null, discardingPlayerId: null, gameOver: null, soundSeq: 0, soundType: '' };
        this.syncTeamHands();
        players.forEach(p => {
            let baseHp = HEROES[p.hero] ? HEROES[p.hero].hp : 3;
            p.hp = baseHp; p.maxHp = baseHp;
            p.stats = { damage: 0, taken: 0, kills: 0, heals: 0, dodges: 0, cardsPlayed: 0, firstBlood: false, survivedDying: 0 };
        });
        teams.forEach(t => this.drawCards(players.find(p => p.teamId === t.id), 4));
        this.log('🎮 3v3 猫队战准备开始！双方先选择首发猫。');
        this.startTurn();
    },

    startTurn: function() {
        this.syncTeamHands();
        if (this.gameState.teamMode && this.gameState.initialActivePick) {
            this.startInitialTeamPick();
            return;
        }
        if (this.gameState.teamMode && this.gameState.awaitTeamPick) {
            this.startTeamPick();
            return;
        }
        let p = this.gameState.players[this.gameState.turnIdx];
        if (!p) return;
        this.gameState.players.forEach(pl => pl.lastAction = ''); // 清空上轮动作
        
        if (!p.alive) { this.nextTurn(); return; }
        this.log(`👉 轮到 [${p.name}] 了喵`);
        this.showTurnBanner(p);
        p.hasHissed = false; p.cryingUsed = false; p.isDrunk = false; p.botAttackCount = 0; p.turnAttackUsed = false; p.turnToolUsed = false; p.baibianUsed = false;

        if (this.isExplosionMode()) {
            if ((this.gameState.explosion?.noStartDrawRemaining || 0) > 0) {
                this.gameState.explosion.noStartDrawRemaining--;
                this.log(`🐾 ${p.name} 第一回合不用摸牌`);
                this.updateAll();
                this.resumeTurn(p);
                return;
            }
            this.askForResponse('DRAW_CHOICE', p.id, p.id);
            return;
        }

        if (p.hero === 'HAPPY' && p.hp < p.maxHp) {
            if (p.isBot) {
                if (p.hp < p.maxHp && Math.random() > 0.3) { 
                    this.log(`🎵 ${p.name} 乐天派发作，回1血`); p.hp++; this.recordHeal(p, 1); this.drawCards(p, 1); 
                    this.queueSound('HAPPY'); p.lastAction='🎵 乐天'; 
                } else this.drawCards(p, 2);
            } else {
                this.askForResponse('SKILL_HAPPY_START', -1, p.id); return;
            }
        } else { this.drawCards(p, p.hero === 'LOWPOLY' ? 3 : 2); }

        if (!p.alive || this.gameState.gameOver) return;
        if (!this.gameState.pendingAction) {
            if (p.id === this.myId) this.isDiscardPhase = false;
            this.updateAll();
        } else { this.updateAll(); }
    },

    nextTurn: function() {
        if (this.gameState.teamMode) {
            let nextTeam = this.gameState.turnTeamId === 0 ? 1 : 0;
            if (this.getTeamAlive(nextTeam).length === 0) {
                this.finishGame(`${this.getTeam(this.gameState.turnTeamId)?.name || '当前队伍'} 获胜！`);
                return;
            }
            this.gameState.turnTeamId = nextTeam;
            this.gameState.awaitTeamPick = true;
            this.gameState.turnIdx = this.getTeam(nextTeam)?.activeId ?? this.getTeamAlive(nextTeam)[0]?.id ?? this.gameState.turnIdx;
            this.startTurn();
            return;
        }
        if (this.isExplosionMode() && this.gameState.explosion && !this.gameState.explosion.bombsInserted && (this.gameState.explosion.turnsCompleted || 0) >= Math.min(this.gameState.explosion.initialTurns || this.gameState.players.length, this.gameState.players.filter(p => p.alive).length)) {
            this.insertExplosionBombs();
        }
        do { this.gameState.turnIdx = (this.gameState.turnIdx + 1) % this.gameState.players.length; } 
        while (!this.gameState.players[this.gameState.turnIdx].alive);
        this.startTurn();
    },

    startInitialTeamPick: function() {
        (this.gameState.teams || []).forEach(team => {
            if (team.activeId === null || team.activeId === undefined || !this.gameState.players.find(p => p.id === team.activeId && p.alive)) {
                team.activeId = null;
            }
            if (team.isBot && team.activeId === null) {
                let alive = this.getTeamAlive(team.id);
                team.activeId = alive[Math.floor(Math.random() * alive.length)]?.id ?? null;
            }
        });
        let waiting = (this.gameState.teams || []).filter(t => t.activeId === null || t.activeId === undefined);
        if (!waiting.length) {
            this.gameState.initialActivePick = false;
            this.gameState.turnTeamId = 0;
            this.gameState.turnIdx = this.getTeam(0)?.activeId ?? this.getTeamAlive(0)[0]?.id ?? 0;
            this.log('🐾 双方首发猫已上场，第一回合开始！');
            this.startTurn();
            return;
        }
        this.updateAll();
    },

    startTeamPick: function() {
        let team = this.getTeam(this.gameState.turnTeamId);
        let alive = this.getTeamAlive(team.id);
        if (!alive.length) {
            let winner = this.getTeam(team.id === 0 ? 1 : 0);
            this.finishGame(`${winner?.name || '对方'} 获胜！`);
            return;
        }
        if (team.isBot) {
            let pick = alive.find(p => p.hp < p.maxHp && p.hand.some(c => c.type === 'heal')) || alive[Math.floor(Math.random() * alive.length)];
            this.chooseTeamActiveCat(pick.id);
            return;
        }
        if (team.id !== this.myTeamId) {
            this.gameState.turnIdx = team.activeId ?? alive[0].id;
            if (this.gameState.pendingAction) return;
            this.updateAll();
            return;
        }
        let buttons = alive.map(p => ({ text: `${HEROES[p.hero]?.name || p.name} ${p.hp}/${p.maxHp}`, cls: 'primary', cb: () => this.chooseTeamActiveCat(p.id) }));
        this.showPrompt('选择出战猫', '本回合选择一只猫上场行动。只能攻击对方当前上场猫。', buttons);
    },

    chooseTeamActiveCat: function(playerId) {
        let p = this.gameState.players.find(x => x.id === playerId && x.alive);
        if (!p || !this.gameState.teamMode || p.teamId !== this.gameState.turnTeamId) return;
        let team = this.getTeam(p.teamId);
        team.activeId = p.id;
        this.gameState.turnIdx = p.id;
        this.gameState.awaitTeamPick = false;
        this.uiPrompt = null;
        this.myId = p.teamId === this.myTeamId ? p.id : this.myId;
        this.startTurn();
    },

    // === Bot 逻辑 ===
    getBotEnemy: function(bot) {
        if (this.gameState.teamMode) {
            return this.getOpponentActive(bot.teamId);
        }
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
        
        if (p.type === 'DRAW_CHOICE') {
            let bombs = this.gameState.deck.filter(c => c.type === 'explode').length;
            let total = Math.max(1, this.gameState.deck.length);
            let risk = bombs / total;
            this.resolveResponse(bot.id, risk > 0.18 ? 'DRAW1' : (Math.random() > 0.45 ? 'DRAW2' : 'DRAW3'));
        } else if (p.type === 'BOT_EXPLOSION_DEATH') {
            return;
        } else if (p.type === 'EXPLOSION') {
            this.resolveResponse(bot.id, ['TOP3', 'TOP5', 'BOTTOM', 'TOP1'][Math.floor(Math.random() * 4)]);
        } else if (p.type === 'AOE_ASK') {
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
        if (action.type === 'CHOOSE_ACTIVE') {
            let pick = this.gameState.players.find(x => x.id === Number(action.playerId) && x.alive);
            if (!this.gameState.teamMode || !pick) return false;
            if (this.gameState.initialActivePick) {
                if (!p || pick.teamId !== p.teamId) return false;
                let team = this.getTeam(pick.teamId);
                team.activeId = pick.id;
                if (pick.teamId === this.myTeamId) this.myId = pick.id;
                this.log(`🐾 ${team.name} 首发 ${HEROES[pick.hero]?.name || pick.name}`);
                this.startInitialTeamPick();
                return true;
            }
            if (pick.teamId !== this.gameState.turnTeamId) return false;
            this.chooseTeamActiveCat(pick.id);
            return true;
        }
        if (!p || !p.alive || this.gameState.gameOver) return false;
        if (action.type === 'SURRENDER') {
            this.gameState.pendingAction = null;
            this.gameState.aoeState = null;
            this.gameState.discardingPlayerId = null;
            this.log(`🏳️ ${p.name} 投降了`);
            p.lastAction = '🏳️ 投降';
            p.explosionKilled = true;
            this.processDeath(p, null);
            p.explosionKilled = false;
            if (p.id === this.myId) this.showAfterSurrenderPrompt();
            return true;
        }
        if (this.gameState.turnIdx !== p.id) return false;
        if (this.gameState.pendingAction || this.gameState.aoeState) return false;
        let done = false;

        if (action.type === 'END_TURN') { 
            if (this.isExplosionMode()) {
                if (this.gameState.explosion && !this.gameState.explosion.bombsInserted) {
                    this.gameState.explosion.turnsCompleted = (this.gameState.explosion.turnsCompleted || 0) + 1;
                }
                p.isDrunk = false;
                this.nextTurn();
                return true;
            }
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
            if (needsTarget && this.gameState.teamMode && target.teamId === p.teamId) return false;
            if (needsTarget && this.gameState.teamMode && target.id !== this.getOpponentActive(p.teamId)?.id) return false;
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
            this.recordCardPlayed(p, card);
            p.lastAction = target ? `🎭 百变【${card.name}】→${target.name}` : `🎭 百变【${card.name}】`;
            this.log(`🎭 ${p.name} 发动百变，声明【${card.name}】`);
            if (card.type === 'heal') {
                if (p.hp < p.maxHp) p.hp++;
                this.recordHeal(p, 1);
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
            if (this.isExplosionMode() && card.type === 'heal') {
                if (p.id === this.myId) this.showNotice('爆炸猫窝里没有【冻干】规则，这张牌不能使用。');
                return false;
            }
            if (p.hero === 'DUOLA' && action.playAs === 'heal' && card.type === 'buff') {
                effectiveCard = { ...CARDS.TREAT, uid: card.uid, suit: card.suit, color: card.color, fromCopper: true };
            } else if (p.hero === 'DUOLA' && action.playAs === 'buff' && card.type === 'heal') {
                effectiveCard = { ...CARDS.CATNIP, uid: card.uid, suit: card.suit, color: card.color, fromCopper: true };
            } else if (card.type === 'sun') {
                let raw = Array.isArray(action.discardIndexes) ? action.discardIndexes.map(Number) : [];
                effectiveCard = { ...card, sunDiscardIndexes: raw.filter(i => i !== cardIdx).map(i => i > cardIdx ? i - 1 : i) };
            } else if (card.type === 'peek') {
                effectiveCard = { ...card, peekOrder: Array.isArray(action.peekOrder) ? action.peekOrder.map(Number) : [0, 1, 2] };
            }

            if (['defense', 'nullify', 'defuse', 'explode'].includes(card.type)) {
                if (p.id === this.myId) this.showNotice(`【${card.name}】是被动牌，无法主动打出。`);
                return false;
            }

            if (needsTarget && (!target || !target.alive || target.id === p.id)) {
                if (p.id === this.myId) this.showNotice('请选择一个有效目标。');
                return false;
            }
            if (needsTarget && this.gameState.teamMode && target.teamId === p.teamId) {
                if (p.id === this.myId) this.showNotice('3v3 猫队战只能选择对方猫队作为目标。');
                return false;
            }
            if (needsTarget && this.gameState.teamMode && target.id !== this.getOpponentActive(p.teamId)?.id) {
                if (p.id === this.myId) this.showNotice('只能攻击对方当前上场猫。');
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

            if ((effectiveCard.type === 'dismantle' || effectiveCard.type === 'steal') && target.hand.length === 0) {
                if (p.id === this.myId) this.showNotice('目标没有可以操作的牌。');
                return false;
            }
            
            p.lastAction = target ? `⚔️ 对 ${target.name} ${card.name}` : `🎴 ${card.name}`;

            if (effectiveCard.type === 'heal') {
                if (p.hp >= p.maxHp) { if (p.id === this.myId) this.showNotice("已经满血，不能这样使用【冻干】。"); return false; }
                p.hand.splice(cardIdx, 1); p.hp++; this.log(`💊 ${p.name} 回血`); done = true;
                this.recordHeal(p, 1);
                if (p.hero === 'DUOLA') {
                    this.drawCards(p, 1);
                    this.log(`🔔 ${p.name} 发动铜锣，额外摸1张牌`);
                }
            } else {
                if(card.type==='buff'||card.type==='aoe'||card.type==='bark'||card.type==='sun'||card.type==='peek'||target) { 
                    p.hand.splice(cardIdx, 1); done = true; 
                } else return false;
            }

            if (done) {
                this.recordCardPlayed(p, effectiveCard);
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
        else if (card.type === 'peek') {
            this.applyPeekOrder(card.peekOrder);
            this.log(`👃 ${p.name} 使用【闻一下】，调整了牌堆顶的味道`);
            p.lastAction = '👃 闻一下';
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
        if (this.gameState.gameOver) return;
        let pending = this.gameState.pendingAction;
        if (!pending || pending.targetId !== pid) return;
        if (!['EXPLOSION', 'DRAW_CHOICE'].includes(pending.type)) choice = choice === 'NULLIFY' ? 'NULLIFY' : (choice === 'YES' ? 'YES' : 'NO');
        
        let t = this.gameState.players.find(p => p.id === pid);
        let s = this.gameState.players.find(p => p.id === pending.sourceId);
        if (!t) return;

        if (pending.type === 'DRAW_CHOICE') {
            this.gameState.pendingAction = null;
            let n = choice === 'DRAW3' ? 3 : (choice === 'DRAW2' ? 2 : 1);
            this.log(`🎴 ${t.name} 选择摸 ${n} 张牌`);
            this.drawCards(t, n);
            if (this.gameState.pendingAction || this.gameState.gameOver || !t.alive) {
                this.updateAll();
                return;
            }
            this.updateAll();
            this.resumeTurn(t);
            return;
        }

        if (pending.type === 'EXPLOSION') {
            this.gameState.pendingAction = null;
            this.insertBombAtChoice(pending.bomb, choice);
            t.lastAction = '🧻 埋好爆炸';
            this.log(`🧻 ${t.name} 把爆炸秘密埋回了牌堆`);
            this.updateAll();
            if (pending.aoeResume && this.gameState.aoeState) {
                if (this.gameState.aoeState.queue[0] === t.id) this.gameState.aoeState.queue.shift();
                setTimeout(() => this.processAOEQueue(), 500);
                return;
            }
            let resume = this.gameState.players.find(p => p.id === pending.resumeId && p.alive);
            if (resume && !this.gameState.gameOver && this.gameState.turnIdx === resume.id) this.resumeTurn(resume);
            return;
        }

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

            if (this.gameState.pendingAction) return;
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
                this.ensureStats(t).dodges++;
            } else {
                let dmg = pending.damage || 1;
                this.resolveDamage(t, dmg, s);
            }
            if (this.gameState.pendingAction && this.gameState.pendingAction.type === 'DYING') return;
            if (this.gameState.pendingAction) return;
            this.updateAll();
            if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
            return;
        }

        if (pending.type === 'SKILL_HAPPY_START') {
            this.gameState.pendingAction = null;
            if (choice === 'YES') { t.hp++; this.recordHeal(t, 1); this.drawCards(t, 1); this.queueSound('HAPPY'); t.lastAction='🎵 乐天回血'; }
            else this.drawCards(t, 2);
            if (this.gameState.pendingAction) { this.updateAll(); return; }
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
                this.ensureStats(t).survivedDying++;
                this.recordHeal(t, 1);
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
        if (this.isExplosionMode()) {
            if (!t || !t.alive) return;
            this.log(`🎴 ${t.name} 避开扣血，改为摸 2 张牌`);
            t.lastAction = '🎴 受压摸2';
            this.drawCards(t, 2);
            return;
        }
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
        this.recordDamage(s, t, n);
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
            this.recordHeal(t, t.hp);
            this.drawCards(t, 2);
            this.log(`⏱️ ${t.name} 发动时光机，回复至${t.hp}血并摸两张牌`);
            t.lastAction = '⏱️ 时光机';
            return;
        }
        if (t.hp <= 0) this.askForResponse('DYING', s?s.id:-1, t.id);
    },
    
    processDeath: function(v, s) {
        if (v.hero === 'TOM' && !v.explosionKilled) {
            v.maxHp = Math.max(0, v.maxHp - 2);
            if (v.maxHp > 0) {
                v.hp = v.maxHp;
                v.alive = true;
                if (this.gameState.teamMode) {
                    let team = this.getTeam(v.teamId);
                    if (team) team.hand = [];
                    this.syncTeamHands();
                } else {
                    v.hand = [];
                }
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
            this.ensureStats(s).kills++;
            if (this.isExplosionMode()) {
                this.drawSafeNonBomb(s);
            }
            else if (v.role === '反骨喵') { this.log(`💰 击杀反骨喵，摸 2 张牌！`); this.drawCards(s, 2); }
            else if (v.role === '护驾喵' && s.role === '喵皇') { this.log(`🚫 喵皇误杀护驾喵，弃光手牌！`); s.hand = []; }
        }

        if (this.isExplosionMode()) {
            const finishExplosionDeath = () => {
                if (this.gameState.gameOver) return;
                let alive = this.gameState.players.filter(x => x.alive);
                if (alive.length <= 1) {
                    this.finishGame(`${alive[0]?.name || '最后一只求生猫'} 活到了最后，爆炸猫窝获胜！`);
                    return;
                }
                this.updateAll();
                if (this.gameState.turnIdx === v.id) this.nextTurn();
            };
            if (v.explosionKilled) {
                this.updateAll();
                setTimeout(finishExplosionDeath, 2200);
                return;
            }
            finishExplosionDeath();
            return;
        }

        if (this.gameState.teamMode) {
            let loserTeam = v.teamId;
            if (this.getTeamAlive(loserTeam).length === 0) {
                let winner = this.getTeam(loserTeam === 0 ? 1 : 0);
                this.finishGame(`${winner?.name || '对方猫队'} 全灭对手，3v3 获胜！`);
                return;
            }
            this.updateAll();
            if (this.gameState.turnIdx === v.id) this.nextTurn();
            return;
        }
        
        let k = this.gameState.players.find(x => x.role === '喵皇');
        let r = this.gameState.players.filter(x => x.role === '反骨喵' && x.alive).length;
        let spy = this.gameState.players.filter(x => x.role === '老六' && x.alive).length;
        
        if (!k || !k.alive) { this.finishGame("喵皇驾崩！反骨喵阵营胜利！"); return; }
        if (r === 0 && spy === 0) { this.finishGame("反骨喵与老六全部退场，喵皇阵营胜利！"); return; }
        
        this.updateAll();
        if (this.gameState.turnIdx === v.id) this.nextTurn();
    },

    buildEndAwards: function(message) {
        let players = this.gameState.players || [];
        let liveNames = players.filter(p => p.alive).map(p => p.name).join('、') || '无人';
        const best = (label, pick, format) => {
            let sorted = players
                .map(p => ({ p, value: pick(this.ensureStats(p), p) || 0 }))
                .sort((a, b) => b.value - a.value);
            let top = sorted[0];
            if (!top || top.value <= 0) return '';
            return `<div class="award-row"><span>${this.escapeHTML(label)}</span><strong>${this.escapeHTML(format(top.p, top.value))}</strong></div>`;
        };
        let rows = [
            best('最会哈气', s => s.damage, (p, v) => `${p.name} 造成${v}点伤害`),
            best('最能苟', s => s.taken, (p, v) => `${p.name} 扛了${v}点伤害`),
            best('保命大师', s => s.dodges, (p, v) => `${p.name} 闪了${v}次`),
            best('全场最佳背刺', s => s.kills, (p, v) => `${p.name} 带走${v}只猫`),
            best('回血担当', s => s.heals, (p, v) => `${p.name} 回了${v}点血`),
            best('首哈猫', s => s.firstBlood ? 1 : 0, p => `${p.name} 抢到第一滴血`)
        ].filter(Boolean).join('');
        return `
            <div class="end-summary">
                <div class="end-result">${this.escapeHTML(message)}</div>
                <div class="end-mode">${this.escapeHTML(this.getModeLabel())} · 存活：${this.escapeHTML(liveNames)}</div>
                <div class="award-list">${rows || '<div class="award-row"><span>本局很和平</span><strong>大家都很克制</strong></div>'}</div>
            </div>`;
    },

    finishGame: function(message) {
        this.gameState.pendingAction = null;
        this.gameState.aoeState = null;
        this.gameState.gameOver = { message, awardsHTML: this.buildEndAwards(message) };
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
        if (this.gameState.teamMode) {
            let activeEnemy = this.getOpponentActive(source.teamId);
            if (activeEnemy) q.push(activeEnemy.id);
            this.gameState.aoeState = { sourceId: source.id, type: type, queue: q };
            this.queueSound(type === 'aoe' ? 'HISS' : 'BARK');
            this.processAOEQueue();
            return;
        }
        for (let i = 1; i < count; i++) {
            let idx = (source.id + i) % count;
            let target = this.gameState.players[idx];
            if (target.alive && (!this.gameState.teamMode || target.teamId !== source.teamId)) q.push(target.id);
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
        if (this.battleMode === 'team3') {
            if (this.selectedHeroIds.length !== 3) return;
        } else if (!this.selectedHeroId) return;
        document.getElementById('btn-confirm-hero').disabled = true;
        if (this.mode === 'SP') this.startSPGame();
        else {
            document.getElementById('wait-msg').innerText = "等待队友...";
            Net.sendSelectHero(this.battleMode === 'team3' ? this.selectedHeroIds.slice(0, 3) : this.selectedHeroId);
        }
    },

    renderHeroSelect: function() {
        this.closePopups();
        this.selectedHeroId = null;
        this.selectedHeroIds = [];
        let confirmBtn = document.getElementById('btn-confirm-hero');
        if (confirmBtn) confirmBtn.disabled = true;
        this.setTx('ready-target-count', this.mode === 'SP' ? (this.battleMode === 'team3' ? 3 : this.spPlayerCount) : (this.battleMode === 'team3' ? 3 : Net.targetPlayers));
        this.setTx('ready-count-disp', this.mode === 'SP' && this.battleMode !== 'team3' ? Math.max(0, this.spPlayerCount - 1) : 0);
        let title = document.querySelector('#screen-select h3');
        if (title) title.innerText = this.battleMode === 'team3' ? '选择三只猫将' : '选择猫将';
        let confirmText = document.getElementById('btn-confirm-hero');
        if (confirmText) confirmText.innerText = this.battleMode === 'team3' ? '确认猫队' : '确认领养';
        this.setTx('wait-msg', '');
        let c = document.getElementById('hero-list'); c.innerHTML = '';
        Object.values(HEROES).forEach(h => {
            let meta = this.getHeroMeta(h.id);
            let d = document.createElement('div'); d.className = 'hero-card';
            d.onclick = () => {
                if (this.battleMode === 'team3') {
                    if (this.selectedHeroIds.includes(h.id)) {
                        this.selectedHeroIds = this.selectedHeroIds.filter(id => id !== h.id);
                        d.classList.remove('selected');
                    } else if (this.selectedHeroIds.length < 3) {
                        this.selectedHeroIds.push(h.id);
                        d.classList.add('selected');
                    } else {
                        this.showNotice('猫队已经满三只了，先取消一只再换。');
                    }
                    this.setTx('ready-count-disp', this.selectedHeroIds.length);
                    document.getElementById('btn-confirm-hero').disabled = this.selectedHeroIds.length !== 3;
                } else {
                    document.querySelectorAll('.hero-card').forEach(e => e.classList.remove('selected'));
                    d.classList.add('selected');
                    this.selectedHeroId = h.id;
                    if (this.mode === 'SP') this.setTx('ready-count-disp', this.spPlayerCount);
                    document.getElementById('btn-confirm-hero').disabled = false;
                }
            };
            d.innerHTML = `
                <img src="${this.escapeHTML(h.img)}">
                <div class="hero-name">${this.escapeHTML(h.name)}</div>
                <div class="hero-title">${this.escapeHTML(meta.vibe)}</div>
                <div class="hero-tags">
                    <span>${this.escapeHTML(meta.level)}</span>
                    ${meta.tags.map(tag => `<span>${this.escapeHTML(tag)}</span>`).join('')}
                </div>
                <div class="hero-hook">${this.escapeHTML(meta.hook)}</div>
                <div class="hero-desc">${this.escapeHTML(h.desc)}</div>`;
            c.appendChild(d);
        });
        this.showScreen('screen-select');
    },

    handleEndTurnClick: function() {
        let me = this.gameState.players.find(p => p.id === this.myId);
        if (!me || me.isBot) return;
        Net.sendAction('END_TURN', {});
    },

    handleSurrenderClick: function() {
        let me = this.gameState.players.find(p => p.id === this.myId);
        if (this.gameState.teamMode) me = this.getControlledPlayer(this.gameState);
        if (!me || me.isBot || !me.alive || this.gameState.gameOver) return;
        if (!confirm('确定要投降吗？这只猫会直接退场。')) return;
        this.uiPrompt = null;
        this.awaitingSurrenderChoice = true;
        Net.sendAction('SURRENDER', {});
        if (this.mode !== 'MP' || Net.isHost) this.awaitingSurrenderChoice = false;
    },

    showAfterSurrenderPrompt: function() {
        this.showPrompt('投降成功', '要留下观战，还是直接退出？', [
            { text: '观战', cls: 'primary', cb: () => this.enterSpectatorMode() },
            { text: '退出', cls: 'danger', cb: () => location.reload() }
        ]);
    },

    enterSpectatorMode: function() {
        this.isSpectating = true;
        this.uiPrompt = null;
        let me = this.gameState.players.find(p => p.id === this.myId);
        if (me) me.hand = [];
        this.renderGame(this.gameState);
    },

    renderGame: function(state) {
        this.gameState = state; 
        this.battleMode = state.battleMode || (state.teamMode ? 'team3' : 'classic');
        this.syncTeamHands(state);
        if (this.mode === 'MP' && !Net.isHost && Net.peer && Net.peer.id) {
            if (state.teamMode) {
                let team = (state.teams || []).find(t => t.peerId === Net.peer.id);
                if (team) this.myTeamId = team.id;
            } else {
                let checkMe = state.players.find(p => p.peerId === Net.peer.id);
                if(checkMe) this.myId = checkMe.id;
            }
        }

        let me = state.players.find(p => p.id === this.myId);
        if (state.teamMode) me = this.getControlledPlayer(state);
        if (!me) return;
        this.myId = me.id;
        if (this.awaitingSurrenderChoice && !me.alive && !state.gameOver) {
            this.awaitingSurrenderChoice = false;
            this.uiPrompt = {
                title: '投降成功',
                msg: '要留下观战，还是直接退出？',
                buttons: [
                    { text: '观战', cls: 'primary', cb: () => this.enterSpectatorMode() },
                    { text: '退出', cls: 'danger', cb: () => location.reload() }
                ]
            };
        }
        if ((state.soundSeq || 0) > this.soundSeqSeen) {
            this.soundSeqSeen = state.soundSeq || 0;
            this.playSound(state.soundType);
        }
        if ((state.explosionFxSeq || 0) > this.explosionSeqSeen) {
            this.explosionSeqSeen = state.explosionFxSeq || 0;
            this.showExplosionBanner({ name: state.explosionFxPlayerName || '求生猫' });
        }

        this.setTx('ui-my-role', me.role);
        this.setTx('ui-my-role', state.teamMode ? `${this.getTeam(me.teamId)?.name || '猫队'} · ${me.role}` : me.role);
        this.setTx('ui-my-hero', state.teamMode ? `${HEROES[me.hero]?.name || ''}（共享手牌）` : (HEROES[me.hero]?.name || ''));
        this.setTx('ui-my-hp', `${"♥".repeat(Math.max(0, me.hp)) || "💀"} / ${me.maxHp}`);
        this.setTx('ui-my-hand-count', me.hand.length);
        this.setTx('ui-maodie-stack', me.hero === 'MAODIE' ? `🐾 耄耋哈气 ${me.hissStack || 0}/5` : '');
        let mySeedTotal = Object.values(me.seeds || {}).reduce((a, b) => a + Number(b || 0), 0);
        this.setTx('ui-seed-stack', mySeedTotal ? `🌱 种子 x${mySeedTotal}` : '');
        let actionHint = this.getActionHint(me, state);
        let deckInfo = this.getExplosionDeckInfo(state);
        if (deckInfo && !actionHint.includes('牌堆')) actionHint = `${actionHint} ${deckInfo}`;
        this.setTx('ui-action-hint', actionHint);
        
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
        const positions = pCount === 2
            ? ['pos-top-center']
            : (pCount === 6 ? ['pos-left-mid', 'pos-top-left', 'pos-top-center', 'pos-top-right', 'pos-right-mid'] : ['pos-left-mid', 'pos-top-left', 'pos-top-right', 'pos-right-mid']);

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
        let hideHandForSpectator = this.isSpectating && (!me.alive || state.gameOver);
        handDiv.style.display = hideHandForSpectator ? 'none' : 'flex';
        if (!hideHandForSpectator) this.renderHandSkillControls(handDiv, me, state);
        if (!hideHandForSpectator) me.hand.forEach((c, idx) => {
            let el = document.createElement('div');
            let sunSelected = this.uiSunDiscard && this.uiSunDiscard.selected.includes(idx);
            let sunLocked = this.uiSunDiscard && (this.uiSunDiscard.locked || [this.uiSunDiscard.cardIdx]).includes(idx);
            let baibianDiscardPick = this.uiBaibianCardIdx !== null && this.uiBaibianCardIdx !== undefined && idx !== this.uiBaibianCardIdx;
            let rec = this.getRecommendation(me, c, state);
            el.className = `card-hand ${rec ? 'recommended' : ''} ${idx === this.uiSelectedCardIdx || sunSelected ? 'selected' : ''} ${this.isDiscardPhase || baibianDiscardPick || (this.uiSunDiscard && !sunLocked) ? 'discard-mode' : ''}`;
            el.style.backgroundImage = c.img ? `url('${c.img}')` : 'none';
            el.innerHTML = `<span class="card-suit ${this.escapeHTML(c.color)}">${this.escapeHTML(c.suit)}</span>${rec ? `<div class="recommend-badge ${this.escapeHTML(rec.tone)}">${this.escapeHTML(rec.text)}</div>` : ''}<div class="card-text-overlay">${this.escapeHTML(c.name)}</div>`;
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
            let msg = document.getElementById('resp-msg');
            if (msg) msg.innerHTML = state.gameOver.awardsHTML || this.escapeHTML(state.gameOver.message);
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            this.addBtn(btns, '回到主菜单', true, 'primary', () => location.reload());
            return;
        }

        if (state.teamMode && state.initialActivePick) {
            let team = (state.teams || []).find(t => t.id === this.myTeamId);
            if (team && (team.activeId === null || team.activeId === undefined)) {
                let alive = state.players.filter(p => p.teamId === this.myTeamId && p.alive);
                this.setDisp('response-panel', 'block');
                this.setTx('resp-title', '选择首发猫');
                this.setTx('resp-msg', '双方都选好首发猫后，第一回合才会开始。');
                let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
                alive.forEach(p => this.addBtn(btns, `${HEROES[p.hero]?.name || p.name} ${p.hp}/${p.maxHp}`, true, 'primary', () => Net.sendAction('CHOOSE_ACTIVE', { playerId: p.id })));
                return;
            }
            this.setDisp('response-panel', 'block');
            this.setTx('resp-title', '等待首发');
            this.setTx('resp-msg', '你已选好首发猫，等待对方选择。');
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            return;
        }

        if (state.teamMode && state.awaitTeamPick && state.turnTeamId === this.myTeamId && !this.uiPrompt) {
            let alive = state.players.filter(p => p.teamId === this.myTeamId && p.alive);
            this.setDisp('response-panel', 'block');
            this.setTx('resp-title', '选择出战猫');
            this.setTx('resp-msg', '本回合选择一只猫上场行动。只能攻击对方当前上场猫。');
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            alive.forEach(p => this.addBtn(btns, `${HEROES[p.hero]?.name || p.name} ${p.hp}/${p.maxHp}`, true, 'primary', () => Net.sendAction('CHOOSE_ACTIVE', { playerId: p.id })));
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
            if (state.pendingAction.type === 'DRAW_CHOICE') {
                this.setTx('resp-title', '选择摸牌');
                this.setTx('resp-msg', `${this.getExplosionDeckInfo(state)}。你要冒多大风险？`);
                this.addBtn(btns, `摸 1 张（爆炸 ${this.getExplosionDrawRisk(1, state)}%）`, true, 'success', () => Net.sendResp('DRAW1'));
                this.addBtn(btns, `摸 2 张（爆炸 ${this.getExplosionDrawRisk(2, state)}%）`, true, 'primary', () => Net.sendResp('DRAW2'));
                this.addBtn(btns, `摸 3 张（爆炸 ${this.getExplosionDrawRisk(3, state)}%）`, true, 'danger', () => Net.sendResp('DRAW3'));
                return;
            }
            if (state.pendingAction.type === 'EXPLOSION') {
                this.setTx('resp-title', '猫砂盆爆炸！');
                this.setTx('resp-msg', '你已经打出【埋屎】免死。选择把爆炸埋回哪里。');
                this.addBtn(btns, '放回第一张', true, 'danger', () => Net.sendResp('TOP1'));
                this.addBtn(btns, '放回第三张', true, 'warn', () => Net.sendResp('TOP3'));
                this.addBtn(btns, '放回第五张', true, 'primary', () => Net.sendResp('TOP5'));
                this.addBtn(btns, '放到牌底', true, 'success', () => Net.sendResp('BOTTOM'));
                return;
            }
            if (state.pendingAction.type === 'BOT_EXPLOSION_DEATH') {
                this.setTx('resp-title', '猫砂盆爆炸！');
                this.setTx('resp-msg', `${me.name} 没有【埋屎】，正在退场...`);
                return;
            }
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
                    if (['heal','buff','aoe','bark','sun','peek'].includes(c.type)) {
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
        if (card.type === 'peek') {
            this.openPeekPrompt(idx);
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
            sun: '锦囊牌',
            peek: '爆炸猫窝',
            defuse: '爆炸猫窝',
            explode: '爆炸猫窝'
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
        let activeTeamCat = this.gameState.teamMode && this.isActiveTeamCat(p);
        el.className = `card-player ${isTurn ? 'active-turn' : ''} ${activeTeamCat ? 'active-team-cat' : ''} ${!p.alive ? 'dead' : ''} ${this.uiSelectedCardIdx !== -1 && !isMain ? 'selectable' : ''}`;
        
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
        let safeRole = this.escapeHTML(this.isExplosionMode() ? p.role : (this.gameState.teamMode ? p.role : (p.role === '喵皇' || !p.alive ? p.role : '???')));
        let safeAction = this.escapeHTML(p.lastAction);
        let netStatus = this.mode === 'MP' && !p.isBot ? `<span class="online-dot ${p.disconnected ? 'offline' : 'online'}">${p.disconnected ? '离线' : '在线'}</span>` : '';
        // 强制内联样式，修复非房主看不见黑框问题
        let act = p.lastAction ? `<div class="last-action" style="position:absolute; top:-35px; left:50%; transform:translate(-50%,0); background:rgba(0,0,0,0.9); color:#FFEB3B; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:12px; border:1px solid orange; white-space:nowrap; z-index:999;">${safeAction}</div>` : '';
        
        if (!p.isBot && this.gameState.pendingAction && this.gameState.pendingAction.targetId === p.id) {
            act = `<div class="last-action" style="position:absolute; top:-35px; left:50%; transform:translate(-50%,0); background:orange; color:white; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:12px; z-index:999;">⏳ 等待响应...</div>`;
        }

        let teamBadge = this.gameState.teamMode ? `<div class="team-badge team-${p.teamId}">${this.escapeHTML(this.getTeam(p.teamId)?.name || '')}${activeTeamCat ? ' · 出战中' : ''}</div>` : '';
        let maodieBadge = p.hero === 'MAODIE' ? `<div class="maodie-stack">🐾 哈气 ${p.hissStack || 0}/5</div>` : '';
        let seedTotal = Object.values(p.seeds || {}).reduce((a, b) => a + Number(b || 0), 0);
        let seedBadge = seedTotal ? `<div class="seed-stack">🌱 种子 x${seedTotal}</div>` : '';
        el.innerHTML = `${act}<div>${safeName} ${netStatus}</div><div class="role-badge">${safeRole}</div>${teamBadge}${heroImg}<div class="hp-display">♥ ${Math.max(0, p.hp)}/${p.maxHp}</div>${maodieBadge}${seedBadge}<div>🎴 ${p.hand.length}</div>`;
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
