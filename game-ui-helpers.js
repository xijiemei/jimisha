Object.assign(Game, {
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
        if (!this.isExplosionMode(state)) return '';
        let total = state.deckMeta?.total ?? (Array.isArray(state.deck) ? state.deck.length : 0);
        let bombs = state.deckMeta?.bombs ?? (Array.isArray(state.deck) ? state.deck.filter(c => c.type === 'explode').length : 0);
        let pct = total > 0 ? Math.round((bombs / total) * 100) : 0;
        return `牌堆 ${total} 张｜爆炸 ${bombs} 张｜下摸爆炸约 ${pct}%`;
    },

    getExplosionDrawRisk: function(count, state) {
        state = state || this.gameState;
        if (!this.isExplosionMode(state)) return 0;
        let total = state.deckMeta?.total ?? (Array.isArray(state.deck) ? state.deck.length : 0);
        let bombs = state.deckMeta?.bombs ?? (Array.isArray(state.deck) ? state.deck.filter(c => c.type === 'explode').length : 0);
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
    }
});
