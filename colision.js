(() => {
    /* ============================================================
       SETUP
       ============================================================ */
    const canvas = document.getElementById('canvas'),
        ctx = canvas.getContext('2d'),
        W = canvas.width,
        H = canvas.height;

    const countEl = document.getElementById('scoreVal'),
        speedEl = document.getElementById('speedVal'),
        levelEl = document.getElementById('levelVal'),
        comboEl = document.getElementById('comboVal'),
        bestEl = document.getElementById('bestVal'),
        activeEl = document.getElementById('activeVal'),
        bonusEl = document.getElementById('bonusVal'),
        accEl = document.getElementById('accVal'),
        bouncesEl = document.getElementById('bounces'),
        statusEl = document.getElementById('status'),
        toggleBtn = document.getElementById('toggleBtn'),
        soundBtn = document.getElementById('soundBtn'),
        fpsEl = document.getElementById('fps'),
        rushBar = document.getElementById('rushBar'),
        rushPct = document.getElementById('rushPct'),
        rushBarContainer = document.getElementById('rushBarContainer'),
        flashOverlay = document.getElementById('flashOverlay');

    const palette = ['#f5c96b', '#ff9dc9', '#a78bfa', '#45f4ff', '#ff667a', '#b9ff67'];
    const TOTAL_STARS = 25;

    let stars = [],
        particles = [],
        rings = [],
        floatingTexts = [],
        comets = [],
        running = true,
        raf = 0,
        last = 0,
        score = 0,
        bounces = 0,
        fpsTime = 0,
        fpsCount = 0,
        screenFlash = 0,
        shake = 0,
        soundOn = true,
        rushEnergy = 0,
        rushActive = false,
        rushTimer = 0,
        comboCount = 0,
        comboTimer = 0,
        bonusCount = 0,
        clicksTotal = 0,
        clicksHit = 0,
        mouseX = W / 2,
        mouseY = H / 2,
        mousePulse = 0;

    /* localStorage récord */
    let best = parseInt(localStorage.getItem('cosmic_best') || '0', 10);
    bestEl.textContent = best;

    /* Velocidad */
    let speedTier = 0;
    const SPEED_TIERS = [
        { name: 'MEDIA', mult: 1.00, gravity: 480, bounce: 0.68 },
        { name: 'ALTA', mult: 1.45, gravity: 620, bounce: 0.72 },
        { name: 'EXTREMA', mult: 1.95, gravity: 780, bounce: 0.76 }
    ];

    /* Estrellas de fondo parallax */
    const bgStars = Array.from({ length: 140 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.3,
        a: Math.random() * 0.7 + 0.2,
        tw: Math.random() * Math.PI * 2,
        depth: Math.random() * 0.6 + 0.2
    }));

    /* Nebulosas */
    const nebulas = [
        { x: W * 0.2, y: H * 0.3, r: 340, c1: '#a78bfa40', c2: 'transparent' },
        { x: W * 0.8, y: H * 0.5, r: 380, c1: '#ff45ce30', c2: 'transparent' },
        { x: W * 0.5, y: H * 0.85, r: 420, c1: '#45f4ff22', c2: 'transparent' }
    ];

    /* ============================================================
       WEB AUDIO (sonidos sintetizados)
       ============================================================ */
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { audioCtx = null; }
        }
    }
    function playTone(freq, dur = 0.15, type = 'sine', vol = 0.15) {
        if (!soundOn || !audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + dur);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
    }
    function sfxHit() {
        playTone(880, 0.18, 'triangle', 0.18);
        setTimeout(() => playTone(1320, 0.14, 'sine', 0.12), 40);
    }
    function sfxBonus() {
        playTone(1200, 0.15, 'square', 0.14);
        setTimeout(() => playTone(1600, 0.18, 'triangle', 0.16), 60);
        setTimeout(() => playTone(2000, 0.22, 'sine', 0.14), 120);
    }
    function sfxMiss() {
        playTone(180, 0.18, 'sawtooth', 0.1);
    }
    function sfxLevelUp() {
        [523, 659, 784, 1047].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.25, 'triangle', 0.14), i * 80);
        });
    }
    function sfxRush() {
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.3, 'sine', 0.16), i * 60);
        });
    }

    /* ============================================================
       ESTRELLA
       ============================================================ */
    class Star {
        constructor() { this.reset(true); }

        reset(initial = false) {
            /* 15% de probabilidad de estrella bonus (dorada y grande) */
            this.isBonus = !initial && Math.random() < 0.15;

            this.r = this.isBonus
                ? 26 + Math.random() * 10
                : 18 + Math.random() * 14;

            this.x = this.r + Math.random() * (W - 2 * this.r);
            this.y = initial
                ? this.r + Math.random() * (H * 0.6)
                : -this.r - Math.random() * 80;

            const baseVy = 40 + Math.random() * 90;
            this.vy = baseVy * SPEED_TIERS[speedTier].mult;
            this.vx = (Math.random() - 0.5) * 40;

            this.spin = Math.random() * Math.PI * 2;
            this.spinSpeed = (Math.random() - 0.5) * 2.2;
            this.color = this.isBonus ? '#f5c96b' : palette[Math.floor(Math.random() * palette.length)];
            this.pulse = Math.random() * Math.PI * 2;
            this.alive = true;
            this.bounceCount = 0;
            this.trail = [];
        }

        update(dt) {
            if (!this.alive) return;

            const tier = SPEED_TIERS[speedTier];
            this.vy += tier.gravity * dt;
            this.y += this.vy * dt;
            this.x += this.vx * dt;

            this.spin += this.spinSpeed * dt;
            this.pulse += dt * 3;

            /* Estela de cometa */
            this.trail.push({ x: this.x, y: this.y, a: 1 });
            if (this.trail.length > 10) this.trail.shift();
            this.trail.forEach(t => t.a -= dt * 3);

            /* Rebote inferior */
            if (this.y + this.r >= H) {
                this.y = H - this.r;

                if (Math.abs(this.vy) > 70) {
                    this.vy = -Math.abs(this.vy) * tier.bounce;
                    this.vx *= 0.92;
                    this.bounceCount++;
                    bounces++;
                    bouncesEl.textContent = String(bounces).padStart(3, '0');

                    spawnRing(this.x, H - 4, this.color, 1.0);
                    spawnParticles(this.x, H - 4, this.color, 6);
                } else {
                    this.fadeAndRespawn();
                }
            }

            if (this.x - this.r < 0) {
                this.x = this.r;
                this.vx = Math.abs(this.vx) * 0.8;
            }
            if (this.x + this.r > W) {
                this.x = W - this.r;
                this.vx = -Math.abs(this.vx) * 0.8;
            }
        }

        fadeAndRespawn() {
            spawnParticles(this.x, this.y, this.color, 10);
            spawnRing(this.x, this.y, this.color, 0.7);
            this.reset(false);
        }

        draw() {
            if (!this.alive) return;

            /* Estela de cometa */
            this.trail.forEach((t, i) => {
                const a = Math.max(0, t.a);
                const rr = this.r * (i / this.trail.length) * 0.7;
                ctx.globalAlpha = a * 0.35;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(t.x, t.y, rr, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            const pulse = 1 + Math.sin(this.pulse) * 0.08;
            const R = this.r * pulse;
            const r = R * 0.45;
            const spikes = this.isBonus ? 6 : 5;
            const rot = this.spin - Math.PI / 2;

            /* Halo */
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const halo = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, R * 3);
            halo.addColorStop(0, this.color + 'dd');
            halo.addColorStop(0.4, this.color + '55');
            halo.addColorStop(1, 'transparent');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(this.x, this.y, R * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            /* Estrella */
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(rot);
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? R : r;
                const angle = (Math.PI / spikes) * i;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();

            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, this.color);
            grad.addColorStop(1, this.color + '88');
            ctx.fillStyle = grad;
            ctx.shadowBlur = this.isBonus ? 34 : 22;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ffffffcc';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            /* Marca bonus: anillo interior */
            if (this.isBonus) {
                ctx.beginPath();
                ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }

        hitTest(mx, my) {
            const dx = mx - this.x;
            const dy = my - this.y;
            return Math.hypot(dx, dy) <= this.r * 1.4;
        }
    }

    /* ============================================================
       PARTÍCULAS / ANILLOS / TEXTOS
       ============================================================ */
    function spawnParticles(x, y, color, amount = 14) {
        for (let i = 0; i < amount; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 40 + Math.random() * 220;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 60,
                life: 0.5 + Math.random() * 0.5,
                max: 1.0,
                color,
                size: 1.5 + Math.random() * 3
            });
        }
    }

    function spawnRing(x, y, color, scale = 1) {
        rings.push({ x, y, r: 6 * scale, a: 1, color, w: 2, maxR: 90 * scale });
    }

    /* Cometa cruzando el fondo */
    function spawnComet() {
        const fromLeft = Math.random() < 0.5;
        comets.push({
            x: fromLeft ? -60 : W + 60,
            y: Math.random() * H * 0.5,
            vx: (fromLeft ? 1 : -1) * (220 + Math.random() * 180),
            vy: 60 + Math.random() * 80,
            life: 1,
            max: 1,
            color: Math.random() < 0.5 ? '#45f4ff' : '#f5c96b'
        });
    }

    /* ============================================================
       CREAR ESTRELLAS
       ============================================================ */
    function createStars() {
        stars = [];
        for (let i = 0; i < TOTAL_STARS; i++) stars.push(new Star());
        activeEl.textContent = TOTAL_STARS;
        document.getElementById('ballTotal').textContent = TOTAL_STARS;
    }

    /* ============================================================
       UPDATE
       ============================================================ */
    function update(dt) {
        stars.forEach(s => s.update(dt));

        /* Combo timer */
        if (comboTimer > 0) {
            comboTimer -= dt;
            if (comboTimer <= 0) {
                comboCount = 0;
                comboEl.textContent = 'x1';
            }
        }

        /* Rush timer */
        if (rushActive) {
            rushTimer -= dt;
            rushEnergy = Math.max(0, (rushTimer / 6) * 100);
            rushBar.style.width = rushEnergy + '%';
            rushPct.textContent = Math.round(rushEnergy) + '%';
            if (rushTimer <= 0) {
                rushActive = false;
                rushEnergy = 0;
                rushBar.style.width = '0%';
                rushPct.textContent = '0%';
                rushBarContainer.classList.remove('rush-active');
            }
        }

        /* Partículas */
        particles = particles.filter(p => (p.life -= dt) > 0);
        particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 220 * dt;
            p.vx *= 0.985;
            p.vy *= 0.985;
        });

        /* Anillos */
        rings = rings.filter(r => (r.a -= dt * 2.0) > 0);
        rings.forEach(r => r.r += (r.maxR - r.r) * dt * 4);

        /* Textos */
        floatingTexts = floatingTexts.filter(t => (t.life -= dt) > 0);
        floatingTexts.forEach(t => {
            t.y -= 55 * dt;
            t.scale = 1 + (1 - t.life / t.max) * 0.7;
        });

        /* Cometas */
        comets = comets.filter(c => (c.life -= dt * 0.35) > 0);
        comets.forEach(c => {
            c.x += c.vx * dt;
            c.y += c.vy * dt;
        });

        /* Estrellas de fondo twinkle */
        bgStars.forEach(s => s.tw += dt * 2);

        /* Efectos pantalla */
        shake *= 0.86;
        if (shake < 0.1) shake = 0;
        screenFlash = Math.max(0, screenFlash - dt * 2.2);

        /* Spawn cometa ocasional */
        if (Math.random() < dt * 0.35) spawnComet();

        /* Cursor pulse */
        mousePulse += dt * 6;
    }

    /* ============================================================
       DRAW
       ============================================================ */
    function drawBackground() {
        /* Gradiente de fondo */
        const isRush = rushActive;
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        if (isRush) {
            bg.addColorStop(0, '#3a1a08');
            bg.addColorStop(0.5, '#1a0a1a');
            bg.addColorStop(1, '#0a0418');
        } else {
            bg.addColorStop(0, '#1a0a3a');
            bg.addColorStop(0.5, '#0d0522');
            bg.addColorStop(1, '#06021a');
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* Nebulosas */
        nebulas.forEach((n, i) => {
            const offsetX = Math.sin(performance.now() * 0.0003 + i) * 30;
            const offsetY = Math.cos(performance.now() * 0.0004 + i) * 20;
            const g = ctx.createRadialGradient(
                n.x + offsetX, n.y + offsetY, 0,
                n.x + offsetX, n.y + offsetY, n.r
            );
            g.addColorStop(0, isRush ? '#f5c96b40' : n.c1);
            g.addColorStop(1, n.c2);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        });

        /* Estrellas fondo con parallax al mouse */
        const px = (mouseX - W / 2) / W * 30;
        const py = (mouseY - H / 2) / H * 30;
        bgStars.forEach(s => {
            const a = s.a * (0.6 + 0.4 * Math.sin(s.tw));
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(s.x + px * s.depth, s.y + py * s.depth, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        /* Luna con fases */
        const moonX = W * 0.82, moonY = H * 0.28, moonR = 90;
        const phase = (performance.now() * 0.00008) % (Math.PI * 2);
        const moonGrad = ctx.createRadialGradient(
            moonX - 20, moonY - 20, 10,
            moonX, moonY, moonR
        );
        moonGrad.addColorStop(0, isRush ? '#fff5d0' : '#e8e0ff');
        moonGrad.addColorStop(0.5, isRush ? '#f5c96b' : '#a78bfa');
        moonGrad.addColorStop(1, isRush ? '#a85a1a' : '#4a2a7a');
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = moonGrad;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        /* Sombra de fase */
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#06021a';
        ctx.beginPath();
        const shift = Math.sin(phase) * moonR * 1.4;
        ctx.arc(moonX + shift, moonY, moonR * 0.98, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function draw() {
        drawBackground();

        ctx.save();
        if (shake > 0.1) {
            ctx.translate(
                (Math.random() - 0.5) * shake,
                (Math.random() - 0.5) * shake
            );
        }

        /* Cometas */
        comets.forEach(c => {
            ctx.save();
            ctx.globalAlpha = c.life * 0.7;
            const grad = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * 0.15, c.y - c.vy * 0.15);
            grad.addColorStop(0, c.color);
            grad.addColorStop(1, 'transparent');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 18;
            ctx.shadowColor = c.color;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x - c.vx * 0.15, c.y - c.vy * 0.15);
            ctx.stroke();
            ctx.restore();
        });

        /* Marco superior e inferior */
        ctx.strokeStyle = 'rgba(245,201,107,.15)';
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.lineTo(W, 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = rushActive ? '#f5c96b' : 'rgba(245,201,107,.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, H - 1);
        ctx.lineTo(W, H - 1);
        ctx.stroke();

        /* Anillos */
        rings.forEach(r => {
            ctx.save();
            ctx.globalAlpha = r.a;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = r.w;
            ctx.shadowBlur = 22;
            ctx.shadowColor = r.color;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });

        /* Estrellas */
        stars.forEach(s => s.draw());

        /* Partículas aditivas */
        ctx.globalCompositeOperation = 'lighter';
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life / p.max);
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
            grad.addColorStop(0, p.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        ctx.globalCompositeOperation = 'source-over';

        /* Textos flotantes (solo CRASH al hacer clic) */
        floatingTexts.forEach(t => {
            const a = Math.min(1, t.life / t.max * 1.5);
            const scale = t.scale || 1;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.translate(t.x, t.y);
            ctx.scale(scale, scale);
            ctx.font = `900 ${t.size}px Orbitron, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 30;
            ctx.shadowColor = t.color;
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(t.text, 0, 0);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
        });

        ctx.restore();

        /* Flash pantalla */
        if (screenFlash > 0) {
            ctx.fillStyle = `rgba(245, 201, 107, ${screenFlash * 0.7})`;
            ctx.fillRect(0, 0, W, H);
        }

        /* Cursor personalizado: retícula */
        drawCursor();
    }

    function drawCursor() {
        const x = mouseX, y = mouseY;
        const pulse = 1 + Math.sin(mousePulse) * 0.15;
        const R = 14 * pulse;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(x, y, 0, x, y, R * 2.5);
        grad.addColorStop(0, rushActive ? '#f5c96bcc' : '#45f4ffcc');
        grad.addColorStop(0.5, rushActive ? '#f5c96b55' : '#45f4ff55');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, R * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = rushActive ? '#f5c96b' : '#45f4ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.stroke();

        /* Cruz */
        ctx.beginPath();
        ctx.moveTo(x - R * 1.6, y); ctx.lineTo(x - R * 0.7, y);
        ctx.moveTo(x + R * 0.7, y); ctx.lineTo(x + R * 1.6, y);
        ctx.moveTo(x, y - R * 1.6); ctx.lineTo(x, y - R * 0.7);
        ctx.moveTo(x, y + R * 0.7); ctx.lineTo(x, y + R * 1.6);
        ctx.stroke();

        /* Punto central */
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /* ============================================================
       MOUSE
       ============================================================ */
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) * (W / rect.width);
        mouseY = (e.clientY - rect.top) * (H / rect.height);
    });

    canvas.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        initAudio();

        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width);
        const my = (e.clientY - rect.top) * (H / rect.height);

        clicksTotal++;

        /* Buscar estrella bajo el cursor */
        let hit = null;
        for (let i = stars.length - 1; i >= 0; i--) {
            if (stars[i].alive && stars[i].hitTest(mx, my)) {
                hit = stars[i];
                break;
            }
        }

        if (!hit) {
            sfxMiss();
            spawnRing(mx, my, '#5a4a7a', 0.5);
            updateAccuracy();
            return;
        }

        clicksHit++;
        updateAccuracy();

        /* Puntaje con bonus y combo */
        const basePoints = hit.isBonus ? 5 : 1;
        comboCount++;
        comboTimer = 1.5;

        const multiplier = Math.min(comboCount, 9);
        const earned = basePoints * multiplier;
        score += earned;

        if (hit.isBonus) {
            bonusCount++;
            bonusEl.textContent = bonusCount;
            bonusEl.classList.remove('bump');
            void bonusEl.offsetWidth;
            bonusEl.classList.add('bump');
            sfxBonus();
        } else {
            sfxHit();
        }

        countEl.textContent = score;
        countEl.classList.remove('bump');
        void countEl.offsetWidth;
        countEl.classList.add('bump');

        comboEl.textContent = 'x' + multiplier;
        comboEl.classList.remove('bump');
        void comboEl.offsetWidth;
        comboEl.classList.add('bump');

        /* Efectos visuales */
        spawnParticles(hit.x, hit.y, hit.color, hit.isBonus ? 40 : 26);
        spawnRing(hit.x, hit.y, hit.color, hit.isBonus ? 1.8 : 1.4);
        spawnRing(hit.x, hit.y, '#ffffff', 1.0);
        screenFlash = hit.isBonus ? 0.7 : 0.45;
        shake = hit.isBonus ? 14 : 8;
        flashOverlay.classList.remove('on');
        void flashOverlay.offsetWidth;
        flashOverlay.classList.add('on');
        setTimeout(() => flashOverlay.classList.remove('on'), 150);

        /* Texto CRASH - único texto permitido */
        floatingTexts.push({
            x: hit.x,
            y: hit.y - 20,
            text: 'CRASH!',
            color: hit.isBonus ? '#f5c96b' : hit.color,
            life: 1.0,
            max: 1.0,
            size: hit.isBonus ? 48 : 38,
            scale: 1
        });

        /* Bonus adicional: segundo texto con puntos */
        if (hit.isBonus || multiplier > 2) {
            floatingTexts.push({
                x: hit.x,
                y: hit.y - 70,
                text: '+' + earned,
                color: '#ffffff',
                life: 1.2,
                max: 1.2,
                size: 26,
                scale: 1
            });
        }

        /* Energía rush */
        if (!rushActive) {
            rushEnergy = Math.min(100, rushEnergy + (hit.isBonus ? 20 : 10));
            rushBar.style.width = rushEnergy + '%';
            rushPct.textContent = Math.round(rushEnergy) + '%';

            if (rushEnergy >= 100) {
                activateRush();
            }
        }

        /* Subida de velocidad */
        if (score > 20 && speedTier < 2) {
            speedTier = 2;
            speedEl.textContent = SPEED_TIERS[2].name;
            levelEl.textContent = 'III';
            triggerLevelUp('¡VELOCIDAD EXTREMA!');
        } else if (score > 10 && speedTier < 1) {
            speedTier = 1;
            speedEl.textContent = SPEED_TIERS[1].name;
            levelEl.textContent = 'II';
            triggerLevelUp('¡VELOCIDAD ALTA!');
        }

        /* Récord */
        if (score > best) {
            best = score;
            bestEl.textContent = best;
            localStorage.setItem('cosmic_best', best);
        }

        /* Reaparecer estrella */
        hit.reset(false);
    });

    function updateAccuracy() {
        const acc = clicksTotal > 0 ? Math.round((clicksHit / clicksTotal) * 100) : 100;
        accEl.textContent = acc + '%';
    }

    function triggerLevelUp(text) {
        screenFlash = 0.7;
        shake = 18;
        sfxLevelUp();

        floatingTexts.push({
            x: W / 2, y: H / 2 - 40,
            text,
            color: '#f5c96b',
            life: 1.8, max: 1.8, size: 46, scale: 1
        });

        for (let i = 0; i < 70; i++) {
            const a = (Math.PI * 2 / 70) * i;
            const s = 200 + Math.random() * 240;
            particles.push({
                x: W / 2, y: H / 2,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1.2, max: 1.2,
                color: i % 2 ? '#f5c96b' : '#ff45ce',
                size: 2 + Math.random() * 3
            });
        }
    }

    function activateRush() {
        rushActive = true;
        rushTimer = 6;
        rushBarContainer.classList.add('rush-active');
        sfxRush();
        screenFlash = 0.9;
        shake = 22;

        floatingTexts.push({
            x: W / 2, y: H / 2,
            text: '¡FRENESÍ!',
            color: '#f5c96b',
            life: 2.2, max: 2.2, size: 60, scale: 1
        });

        /* Lluvia de partículas doradas */
        for (let i = 0; i < 120; i++) {
            particles.push({
                x: Math.random() * W,
                y: -20,
                vx: (Math.random() - 0.5) * 120,
                vy: 100 + Math.random() * 300,
                life: 2.5, max: 2.5,
                color: '#f5c96b',
                size: 2 + Math.random() * 3
            });
        }
    }

    /* ============================================================
       LOOP
       ============================================================ */
    function frame(t) {
        const dt = Math.min((t - last) / 1000 || 0, 0.025);
        last = t;

        if (running) update(dt);
        draw();

        fpsCount++;
        fpsTime += dt;
        if (fpsTime >= 0.5) {
            if (fpsEl) fpsEl.textContent = Math.round(fpsCount / fpsTime);
            fpsTime = 0;
            fpsCount = 0;
        }

        if (running || particles.length || rings.length || floatingTexts.length || comets.length)
            raf = requestAnimationFrame(frame);
        else
            raf = 0;
    }

    function runFrame() {
        if (!raf) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }
    }

    /* ============================================================
       BOTONES
       ============================================================ */
    toggleBtn.addEventListener('click', () => {
        running = !running;
        toggleBtn.textContent = running ? 'PAUSAR' : 'CONTINUAR';
        statusEl.textContent = running ? 'EN EJECUCIÓN' : 'PAUSADO';
        if (running) runFrame();
    });

    soundBtn.addEventListener('click', () => {
        soundOn = !soundOn;
        soundBtn.classList.toggle('active', soundOn);
        soundBtn.textContent = soundOn ? '🔊 SONIDO' : '🔇 MUDO';
        if (soundOn) initAudio();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        running = true;
        toggleBtn.textContent = 'PAUSAR';
        statusEl.textContent = 'EN EJECUCIÓN';
        score = 0;
        bounces = 0;
        speedTier = 0;
        bonusCount = 0;
        clicksHit = 0;
        clicksTotal = 0;
        comboCount = 0;
        rushEnergy = 0;
        rushActive = false;
        rushTimer = 0;
        countEl.textContent = '0';
        bouncesEl.textContent = '000';
        speedEl.textContent = 'MEDIA';
        levelEl.textContent = 'I';
        comboEl.textContent = 'x1';
        bonusEl.textContent = '0';
        accEl.textContent = '100%';
        rushBar.style.width = '0%';
        rushPct.textContent = '0%';
        rushBarContainer.classList.remove('rush-active');
        particles = [];
        rings = [];
        floatingTexts = [];
        comets = [];
        screenFlash = 0;
        shake = 0;
        createStars();
        runFrame();
    });

    window.addEventListener('keydown', e => {
        if (e.code === 'Space') {
            e.preventDefault();
            toggleBtn.click();
        }
    });

    /* ============================================================
       FECHA
       ============================================================ */
    const now = new Date();
    document.getElementById('year').textContent = now.getFullYear();
    document.getElementById('date').textContent = now.toLocaleDateString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    /* ============================================================
       BOOT SCREEN
       ============================================================ */
    setTimeout(() => {
        const bar = document.getElementById('bootBar');
        if (bar) bar.style.width = '100%';
    }, 100);

    setTimeout(() => {
        const b = document.getElementById('bootScreen');
        if (b) {
            b.classList.add('hide');
            setTimeout(() => b.remove(), 900);
        }
    }, 1400);

    /* ============================================================
       ARRANQUE
       ============================================================ */
    createStars();
    runFrame();
})();