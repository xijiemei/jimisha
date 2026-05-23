(function() {
    const results = [];

    function test(name, fn) {
        try {
            fn();
            results.push({ name, ok: true });
        } catch (error) {
            results.push({ name, ok: false, error: error.message || String(error) });
        }
    }

    function assert(condition, message) {
        if (!condition) throw new Error(message);
    }

    test('classic deck has cards and suits', () => {
        const deck = Game.createDeck();
        assert(deck.length > 0, 'deck should not be empty');
        assert(deck.every(card => card.name && card.type), 'every card should have name and type');
        assert(deck.some(card => card.type === 'attack'), 'deck should contain attack cards');
    });

    test('explosion deck can hide bombs before insertion', () => {
        const deck = Game.createExplosionDeck(3, false);
        assert(deck.length > 0, 'explosion setup deck should not be empty');
        assert(!deck.some(card => card.type === 'explode'), 'initial explosion deck should not contain bombs');
    });

    test('explosion deck includes bombs when requested', () => {
        const deck = Game.createExplosionDeck(4, true);
        assert(deck.filter(card => card.type === 'explode').length === 3, '4-player explosion deck should include 3 bombs');
    });

    test('room id sanitization is stable', () => {
        assert(Net.sanitizeRoomId(' Kimi Room!! ') === 'kimi-room', 'room id should be normalized');
        assert(Net.sanitizeRoomId('abcDEF_12') === 'abcdef_12', 'room id should be lowercase and keep underscore');
    });

    test('client id sanitization removes unsafe chars', () => {
        assert(Net.sanitizeClientId('abc<>DEF--12').includes('<') === false, 'client id should remove angle brackets');
    });

    test('message size estimator returns a positive number', () => {
        assert(Net.estimateMessageBytes({ type: 'GAME', state: { players: [] } }) > 0, 'message size should be positive');
    });

    test('asset references point to optimized images', () => {
        const imgs = [
            ...Object.values(CARDS).map(card => card.img).filter(Boolean),
            ...Object.values(HEROES).map(hero => hero.img).filter(Boolean)
        ];
        assert(imgs.length > 0, 'should have image references');
        assert(imgs.every(src => src.includes('assets/optimized/')), 'all gameplay images should use optimized assets');
    });

    const passed = results.filter(r => r.ok).length;
    const summary = document.getElementById('summary');
    const box = document.getElementById('results');
    summary.textContent = `${passed}/${results.length} passed`;
    summary.style.fontWeight = '800';
    summary.style.color = passed === results.length ? '#2e7d32' : '#d32f2f';

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = `result ${result.ok ? 'pass' : 'fail'}`;
        div.innerHTML = result.ok
            ? `<strong>PASS</strong> ${result.name}`
            : `<strong>FAIL</strong> ${result.name}<br><code>${result.error}</code>`;
        box.appendChild(div);
    });
})();

