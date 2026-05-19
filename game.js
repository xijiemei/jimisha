const Game = {
    mode: 'NONE',
    myId: 0,
    selectedHeroId: null,
    uiState: {},
    uiSelectedCardIdx: -1,
    uiClickTimer: null,
    uiLongPressTimer: null,
    uiSuppressNextClick: false,
    isDiscardPhase: false,
    gameState: { players: [], deck: [], turnIdx: 0, logs: [], started: false, pendingAction: null, aoeState: null, gameOver: null },
    
    currentBGM: new Audio(),
    bgmIndex: 0,
    isBGMPlaying: false,

    init: function() { this.loadBGM(); },

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
        if (this.mode === 'MP' && Net.isHost) Net.broadcast();
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
    playSound: function(type) {
        let audio = new Audio();
        if (type === 'HISS') audio.src = 'assets/hiss.mp3';
        else if (type === 'BARK') audio.src = 'assets/bark.mp3';
        else if (type === 'HAPPY') audio.src = 'assets/happy.mp3';
        else if (type === 'HUH') audio.src = 'assets/huh.mp3';
        else if (type === 'BANANA') audio.src = 'assets/banana.mp3';
        else return;
        audio.volume = 0.6; audio.play().catch(()=>{});
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
        }
    },
    createDeck: function() {
        let deck = [];
        const add = (proto, count) => { for(let i=0; i<count; i++) { let s = SUITS[Math.floor(Math.random()*4)]; deck.push({ ...proto, suit: s, color: COLORS[s], uid: Math.random() }); }};
        add(CARDS.HISS, 24); add(CARDS.DODGE, 12); add(CARDS.TREAT, 8); add(CARDS.AOE, 2); add(CARDS.BARK, 1);
        add(CARDS.CATNIP, 4); add(CARDS.FIGHT, 3); add(CARDS.CUP, 4); add(CARDS.PUNCH, 4); add(CARDS.EARS, 3);
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

    // === 初始化 ===
    startSPSetup: function() { this.mode = 'SP'; this.myId = 0; this.renderHeroSelect(); },
    startSPGame: function() {
        this.showScreen('screen-game');
        let ps = [this.createPlayer(0, `玩家`, false)];
        ps[0].hero = this.selectedHeroId;
        let ks = Object.keys(HEROES).filter(k => k !== this.selectedHeroId);
        for (let i = 1; i < 5; i++) {
            let h = ks[Math.floor(Math.random() * ks.length)];
            ks = ks.filter(x => x !== h);
            let b = this.createPlayer(i, `Bot${i}`, true); b.hero = h; ps.push(b);
        }
        this.initGameLogic(ps);
    },
    createPlayer: function(id, name, isBot) { return { id, name, isBot, role: '', hero: '', hp: 0, maxHp: 0, hand: [], alive: true, hasHissed: false, hissStack: 0, cryingUsed: false, isDrunk: false, lastAction: '' }; },

    initGameLogic: function(players) {
        this.gameState = { players, deck: this.createDeck(), turnIdx: 0, logs: [], started: true, pendingAction: null, aoeState: null, gameOver: null };
        let roles = ['喵皇', '护驾喵', '反骨喵', '反骨喵', '老六'].sort(() => Math.random() - 0.5);
        players.forEach((p, i) => {
            p.role = roles[i];
            let baseHp = HEROES[p.hero] ? HEROES[p.hero].hp : 3;
            if (p.role === '喵皇') baseHp += 1;
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
        p.hasHissed = false; p.cryingUsed = false; p.isDrunk = false;

        if (p.hero === 'HAPPY' && p.hp < p.maxHp) {
            if (p.isBot) {
                if (p.hp < p.maxHp && Math.random() > 0.3) { 
                    this.log(`🎵 ${p.name} 乐天派发作，回1血`); p.hp++; this.drawCards(p, 1); 
                    this.playSound('HAPPY'); p.lastAction='🎵 乐天'; 
                } else this.drawCards(p, 2);
            } else {
                this.askForResponse('SKILL_HAPPY_START', -1, p.id); return;
            }
        } else { this.drawCards(p, 2); }

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

        // 4. 杀
        if (!actionTaken) {
            let kI = bot.hand.findIndex(c => c.type === 'attack');
            if (kI > -1 && (!bot.hasHissed || bot.hero === 'MAODIE')) {
                let target = this.getBotEnemy(bot);
                if(target) actionTaken = this.handleActionInternal(bot, {type:'PLAY_CARD', cardIdx: kI, targetId: target.id});
            }
        }

        if (actionTaken) return; // 行动过，等待下一次 checkBotAutoPlay

        // 5. 弃牌
        let limit = bot.hp + (bot.hero === 'BANANA' ? 1 : 0);
        if (bot.hand.length > limit) {
            this.handleActionInternal(bot, {type:'DISCARD', cardIdx: 0});
            return; 
        }
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
            p.isDrunk = false; 
            this.nextTurn(); return true; 
        }
        
        if (action.type === 'DISCARD') {
            if(p.hand[action.cardIdx]) {
                let c = p.hand.splice(action.cardIdx, 1)[0];
                this.log(`${p.name} 弃牌`);
                p.lastAction = `🗑️ ${c.name}`; this.updateAll(); return true;
            }
            return false;
        }

        if (action.type === 'PLAY_CARD') {
            let cardIdx = Number(action.cardIdx);
            if (!Number.isInteger(cardIdx) || cardIdx < 0 || cardIdx >= p.hand.length) return false;
            let card = p.hand[cardIdx]; if (!card) return false;
            let targetId = action.targetId !== undefined && action.targetId !== null ? Number(action.targetId) : null;
            let target = targetId !== null && Number.isInteger(targetId) ? this.gameState.players.find(pl=>pl.id===targetId) : null;
            let needsTarget = ['attack', 'duel', 'dismantle', 'steal'].includes(card.type);

            if (card.type === 'defense' || card.type === 'nullify') {
                if (p.id === this.myId) alert(`【${card.name}】是被动牌，无法主动打出！`);
                return false;
            }

            if (needsTarget && (!target || !target.alive || target.id === p.id)) {
                if (p.id === this.myId) alert('请选择一个有效目标');
                return false;
            }

            if (card.type === 'attack' && p.hasHissed && p.hero !== 'MAODIE') {
                if (p.id === this.myId) alert('本回合已经哈气过了');
                return false;
            }

            if (target && target.hero === 'LOWPOLY' && target.hand.length === 0 && card.type === 'attack') {
                if (p.id === this.myId) alert("对方没建模（空手牌），无法指定！");
                return false;
            }

            if (card.type === 'steal' && this.getDistance(p, target) > 1) {
                if (p.id === this.myId) alert('【这一拳】只能对距离为 1 的目标使用');
                return false;
            }

            if ((card.type === 'dismantle' || card.type === 'steal') && target.hand.length === 0) {
                if (p.id === this.myId) alert('目标没有可以操作的牌');
                return false;
            }
            
            p.lastAction = target ? `⚔️ 对 ${target.name} ${card.name}` : `🎴 ${card.name}`;

            if (card.type === 'heal') {
                if (p.hp >= p.maxHp) { if (p.id === this.myId) alert("满血"); return false; }
                p.hand.splice(cardIdx, 1); p.hp++; this.log(`💊 ${p.name} 回血`); done = true;
            } else {
                if(card.type==='buff'||card.type==='aoe'||card.type==='bark'||target) { 
                    p.hand.splice(cardIdx, 1); done = true; 
                } else return false;
            }

            if (done) {
                if (card.type === 'attack') {
                    this.playSound('HISS');
                    let dmg = p.isDrunk ? 2 : 1;
                    if (p.isDrunk) { p.isDrunk = false; this.log("💨 酒劲过了"); }
                    
                    if (p.hero === 'MAODIE') { 
                        p.hissStack++; 
                        if(p.hissStack >= 5) { 
                            if (p.hp > 1) { this.resolveDamage(p, 1, p); this.log("🦁 耄耋连杀累得掉血！"); }
                            p.hissStack=0; 
                        }
                    } else p.hasHissed = true;
                    
                    this.log(`⚔️ ${p.name} 对 ${target.name} 哈气`);
                    if (target.hero === 'HUH' && target.hand.length > 0) {
                        this.askForResponse('SKILL_HUH_HISS', p.id, target.id, {damage: dmg});
                    } else if (target.hero === 'BANANA' && !target.cryingUsed) {
                        this.askForResponse('SKILL_BANANA', p.id, target.id, {damage: dmg}); 
                    } else {
                        this.askForResponse('DODGE', p.id, target.id, {damage: dmg});
                    }
                } 
                else if (card.type === 'buff') { p.isDrunk = true; this.log(`🌿 ${p.name} 吸猫薄荷`); p.lastAction = `🌿 吸猫薄荷`; }
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
                this.updateAll(); return true;
            }
        }
        return false;
    },

    resolveResponse: function(pid, choice) {
        choice = choice === 'YES' ? 'YES' : 'NO';
        if (this.gameState.gameOver) return;
        let pending = this.gameState.pendingAction;
        if (!pending || pending.targetId !== pid) return;
        
        let t = this.gameState.players.find(p => p.id === pid);
        let s = this.gameState.players.find(p => p.id === pending.sourceId);
        if (!t) return;

        if (pending.type === 'AOE_ASK') {
            let req = pending.cardType;
            if (choice === 'YES') {
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

            this.gameState.pendingAction = null;
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
                this.playSound('HUH'); t.lastAction = "❓ 疑惑成功";
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
                    this.log(`🍌 ${t.name} 哭哭成功，免疫伤害`); this.playSound('BANANA'); t.lastAction='😭 哭哭成功'; 
                    this.gameState.pendingAction = null; this.updateAll();
                    if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
                    return; 
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
            this.updateAll();
            if (s && s.id === this.gameState.turnIdx) this.resumeTurn(s);
            return;
        }

        if (pending.type === 'SKILL_HAPPY_START') {
            if (choice === 'YES') { t.hp++; this.drawCards(t, 1); this.playSound('HAPPY'); t.lastAction='🎵 乐天回血'; }
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
        t.hp -= n; 
        this.log(`💥 ${t.name} 受到 ${n}点伤害`);
        t.lastAction = `💥 扣血(-${n})`;
        if (t.hp <= 0) this.askForResponse('DYING', s?s.id:-1, t.id);
    },
    
    processDeath: function(v, s) {
        v.alive = false; this.log(`💀 ${v.name} 阵亡`); v.lastAction = '💀 挂了';
        
        if (this.gameState.aoeState) {
            this.gameState.aoeState.queue = this.gameState.aoeState.queue.filter(id => id !== v.id);
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
        this.playSound(type === 'aoe' ? 'HISS' : 'BARK');
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
        let limit = me.hp + (me.hero === 'BANANA' ? 1 : 0);
        if (me.hand.length > limit) { this.isDiscardPhase = true; this.renderGame(this.gameState); }
        else { this.isDiscardPhase = false; Net.sendAction('END_TURN', {}); }
    },

    renderGame: function(state) {
        this.gameState = state; 
        if (this.mode === 'MP' && !Net.isHost && Net.peer && Net.peer.id) {
            let checkMe = state.players.find(p => p.peerId === Net.peer.id);
            if(checkMe) this.myId = checkMe.id;
        }

        let me = state.players.find(p => p.id === this.myId);
        if (!me) return;

        this.setTx('ui-my-role', me.role);
        this.setTx('ui-my-hero', HEROES[me.hero]?.name || '');
        this.setTx('ui-my-hp', "♥".repeat(Math.max(0, me.hp)) || "💀");
        this.setTx('ui-my-hand-count', me.hand.length);
        
        let ds = document.getElementById('drunk-status');
        if(ds) ds.style.display = me.isDrunk ? 'inline' : 'none';

        let limit = me.hp + (me.hero === 'BANANA' ? 1 : 0);
        let excess = me.hand.length - limit;
        let phaseBar = document.getElementById('phase-bar');
        
        if (state.turnIdx === this.myId && this.isDiscardPhase && excess > 0) {
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
        const positions = ['pos-left-mid', 'pos-top-left', 'pos-top-right', 'pos-right-mid'];

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
        me.hand.forEach((c, idx) => {
            let el = document.createElement('div');
            el.className = `card-hand ${idx === this.uiSelectedCardIdx ? 'selected' : ''}`;
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
        if (state.pendingAction && state.pendingAction.targetId === this.myId) {
            this.setDisp('response-panel', 'block');
            let btns = document.getElementById('resp-btns'); btns.innerHTML = '';
            this.setTx('resp-msg', state.pendingAction.promptMsg || "请选择");
            
            let yesText = "✅ 确认";
            if (state.pendingAction.type === 'AOE_ASK') yesText = `🃏 出【${state.pendingAction.cardName}】`;
            if (state.pendingAction.type === 'DODGE') yesText = "⚡ 出【棘背龙】";
            if (state.pendingAction.type === 'DUEL_HISS') yesText = "⚔️ 出【哈气】";
            if (state.pendingAction.type === 'SKILL_HUH_HISS') yesText = "❓ 弃牌无效";

            let hasCard = false;
            if (state.pendingAction.type === 'DODGE') hasCard = me.hand.some(c => c.type === 'defense');
            else if (state.pendingAction.type === 'DUEL_HISS') hasCard = me.hand.some(c => c.type === 'attack');
            else if (state.pendingAction.type === 'AOE_ASK') hasCard = me.hand.some(c => c.type === state.pendingAction.cardType);
            else if (state.pendingAction.type === 'SKILL_HUH_HISS') hasCard = me.hand.length > 0;
            else if (state.pendingAction.type === 'DYING') hasCard = me.hand.some(c => c.type === 'heal' || c.type === 'buff');
            else hasCard = true;

            this.addBtn(btns, yesText, hasCard, 'success', () => Net.sendResp('YES'));
            this.addBtn(btns, "❌ 拒绝/扣血", true, 'danger', () => Net.sendResp('NO'));
        } else {
            this.setDisp('response-panel', 'none');
        }
    },

    handleHandCardClick: function(c, idx, state) {
                if (state.turnIdx !== this.myId) return;
                if (this.isDiscardPhase) { Net.sendAction('DISCARD', { cardIdx: idx }); return; }
                if (this.uiSelectedCardIdx === idx) this.uiSelectedCardIdx = -1;
                else {
                    this.uiSelectedCardIdx = idx;
                    if (['heal','buff','aoe','bark'].includes(c.type)) {
                        if (confirm(`使用【${c.name}】?`)) {
                            Net.sendAction('PLAY_CARD', { cardIdx: idx });
                            this.uiSelectedCardIdx = -1;
                        }
                    }
                }
                this.renderGame(state);
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
            nullify: '锦囊牌'
        };
        return labels[type] || type || '未知';
    },

    renderPlayerCard: function(p, container, isMain, isTurn) {
        let el = document.createElement('div');
        el.className = `card-player ${isTurn ? 'active-turn' : ''} ${!p.alive ? 'dead' : ''} ${this.uiSelectedCardIdx !== -1 && !isMain ? 'selectable' : ''}`;
        
        if (!isMain) {
            el.onclick = () => {
                if (this.gameState.turnIdx === this.myId && this.uiSelectedCardIdx !== -1 && !this.isDiscardPhase) {
                    Net.sendAction('PLAY_CARD', { cardIdx: this.uiSelectedCardIdx, targetId: p.id });
                    this.uiSelectedCardIdx = -1;
                }
            };
        }

        let heroImg = HEROES[p.hero] ? `<img src="${this.escapeHTML(HEROES[p.hero].img)}" class="card-player-img">` : '';
        let safeName = this.escapeHTML(p.name);
        let safeRole = this.escapeHTML(p.role === '喵皇' || !p.alive ? p.role : '???');
        let safeAction = this.escapeHTML(p.lastAction);
        // 强制内联样式，修复非房主看不见黑框问题
        let act = p.lastAction ? `<div class="last-action" style="position:absolute; top:-35px; left:50%; transform:translate(-50%,0); background:rgba(0,0,0,0.9); color:#FFEB3B; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:12px; border:1px solid orange; white-space:nowrap; z-index:999;">${safeAction}</div>` : '';
        
        if (!p.isBot && this.gameState.pendingAction && this.gameState.pendingAction.targetId === p.id) {
            act = `<div class="last-action" style="position:absolute; top:-35px; left:50%; transform:translate(-50%,0); background:orange; color:white; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:12px; z-index:999;">⏳ 等待响应...</div>`;
        }

        el.innerHTML = `${act}<div>${safeName}</div><div class="role-badge">${safeRole}</div>${heroImg}<div class="hp-display">♥ ${Math.max(0, p.hp)}</div><div>🎴 ${p.hand.length}</div>`;
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
