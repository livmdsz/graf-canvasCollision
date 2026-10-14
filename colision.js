(() => {
    /* ============================================================
       SETUP INICIAL
       ============================================================ */
    const canvas = document.getElementById('canvas'),
        ctx = canvas.getContext('2d'),
        W = canvas.width,
        H = canvas.height;

    const countEl = document.getElementById('collisions'),
        statusEl = document.getElementById('status'),
        toggleBtn = document.getElementById('toggleBtn'),
        fpsEl = document.getElementById('fps');

    const palette = ['#45f4ff', '#ff45ce', '#b9ff67', '#a78bfa', '#ff9d42', '#4d9dff', '#ff667a'];

    let circles = [],
        particles = [],
        rings = [],
        running = true,
        raf = 0,
        last = 0,
        collisions = 0,
        mode = 'classic',
        infiniteTrail = false,
        shake = 0,
        screenFlash = 0,
        fpsTime = 0,
        fpsCount = 0;

    const labels = {
        classic: 'REBOTE DIRECCIONAL',
        flash: 'REBOTE + FLASH AZUL',
        elastic: 'COLISIÓN ELÁSTICA',
        gravity: 'GRAVEDAD CENTRAL'
    };

    /* ============================================================
       CLASE CIRCLE
       ============================================================ */
    class Circle {
        constructor(x, y, r, color, label, speed, angle) {
            Object.assign(this, {
                x, y, r, color, label, speed,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                flash: 0,
                trail: [],
                trailMax: 18,
                cooldowns: new Map()
            });
        }

        draw() {
            const col = this.flash > 0 ? '#168cff' : this.color;

            /* --- Estela larga con gradiente --- */
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailMax) this.trail.shift();

            this.trail.forEach((p, i) => {
                const t = (i + 1) / this.trail.length;
                ctx.globalAlpha = t * 0.35;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.r * t * 0.85, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            /* --- Cuerpo de la esfera --- */
            ctx.save();
            ctx.shadowBlur = this.flash > 0 ? 32 : 18;
            ctx.shadowColor = col;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            /* --- Etiqueta --- */
            ctx.fillStyle = '#07101e';
            ctx.font = `700 ${Math.max(9, this.r * 0.62)}px Orbitron, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.label, this.x, this.y);
            ctx.restore();
        }

        move(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.flash = Math.max(0, this.flash - dt);

            if (this.x - this.r < 0) {
                this.x = this.r;
                this.vx = Math.abs(this.vx);
                wallEffect(this.x, this.y, this.color);
            }
            if (this.x + this.r > W) {
                this.x = W - this.r;
                this.vx = -Math.abs(this.vx);
                wallEffect(this.x, this.y, this.color);
            }
            if (this.y - this.r < 0) {
                this.y = this.r;
                this.vy = Math.abs(this.vy);
                wallEffect(this.x, this.y, this.color);
            }
            if (this.y + this.r > H) {
                this.y = H - this.r;
                this.vy = -Math.abs(this.vy);
                wallEffect(this.x, this.y, this.color);
            }
        }
    }

    /* ============================================================
       CREACIÓN DE ESFERAS
       ============================================================ */
    function createCircles() {
        circles = [];
        particles = [];
        rings = [];
        collisions = 0;
        shake = 0;
        screenFlash = 0;
        countEl.textContent = '000';

        for (let i = 0; i < 12; i++) {
            let r = 17 + Math.random() * 19,
                x, y,
                tries = 0;

            do {
                x = r + Math.random() * (W - 2 * r);
                y = r + Math.random() * (H - 2 * r);
                tries++;
            } while (
                tries < 120 &&
                circles.some(c => Math.hypot(c.x - x, c.y - y) < c.r + r + 7)
            );

            const speed = 65 + Math.random() * 100;
            circles.push(
                new Circle(
                    x, y, r,
                    palette[i % palette.length],
                    `C${i + 1}`,
                    speed,
                    Math.random() * Math.PI * 2
                )
            );
        }
    }

    /* ============================================================
       EFECTOS (partículas, anillos)
       ============================================================ */
    function effect(x, y, color, amount = 13) {
        /* Doble anillo: uno del color, uno blanco interior */
        rings.push({ x, y, r: 3, a: 1, color, w: 2 });
        rings.push({ x, y, r: 3, a: 0.6, color: '#ffffff', w: 1 });

        for (let i = 0; i < amount; i++) {
            const a = Math.random() * Math.PI * 2,
                s = 35 + Math.random() * 170;

            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 0.3 + Math.random() * 0.35,
                max: 0.65,
                color,
                size: 1 + Math.random() * 3
            });
        }
    }

    function wallEffect(x, y, color) {
        effect(x, y, color, 5);
        shake = Math.min(shake + 1.5, 6);
    }

    function countCollision(x, y) {
        collisions++;
        countEl.textContent = String(collisions).padStart(3, '0');
        effect(x, y, mode === 'flash' ? '#168cff' : '#e6fbff', 18);

        /* Screen shake + flash de pantalla */
        shake = Math.min(shake + 6, 14);
        screenFlash = 0.35;
    }

    /* ============================================================
       GRAVEDAD CENTRAL (modo 04)
       ============================================================ */
    function applyGravity(dt) {
        const cx = W / 2,
            cy = H / 2;

        circles.forEach(c => {
            const dx = cx - c.x,
                dy = cy - c.y,
                d = Math.hypot(dx, dy) || 1;

            /* Fuerza inversa: cerca = más atracción */
            const force = 220 / (d * 0.06 + 1);

            c.vx += (dx / d) * force * dt;
            c.vy += (dy / d) * force * dt;

            /* Límite de velocidad */
            const sp = Math.hypot(c.vx, c.vy),
                max = 340;

            if (sp > max) {
                c.vx = c.vx / sp * max;
                c.vy = c.vy / sp * max;
            }
        });
    }

    /* ============================================================
       COLISIONES
       ============================================================ */
    function simpleCollision(a, b, flash) {
        /* Modo flash: sin rebote, solo efecto visual */
        if (flash) {
            a.flash = b.flash = 0.24;
            countCollision((a.x + b.x) / 2, (a.y + b.y) / 2);
            return;
        }

        /* Modo clásico: rebote direccional */
        let dx = b.x - a.x,
            dy = b.y - a.y,
            dist = Math.hypot(dx, dy) || 0.001,
            min = a.r + b.r,
            nx = dx / dist,
            ny = dy / dist,
            overlap = min - dist;

        if (overlap > 0) {
            a.x -= nx * overlap / 2;
            b.x += nx * overlap / 2;
            a.y -= ny * overlap / 2;
            b.y += ny * overlap / 2;
        }

        a.vx = -a.vx;
        a.vy = -a.vy;
        b.vx = -b.vx;
        b.vy = -b.vy;

        countCollision((a.x + b.x) / 2, (a.y + b.y) / 2);
    }

    function elasticCollision(a, b) {
        let dx = b.x - a.x,
            dy = b.y - a.y,
            dist = Math.hypot(dx, dy) || 0.001,
            min = a.r + b.r,
            nx = dx / dist,
            ny = dy / dist,
            overlap = min - dist;

        if (overlap > 0) {
            const total = a.r * a.r + b.r * b.r;
            a.x -= nx * overlap * (b.r * b.r / total);
            a.y -= ny * overlap * (b.r * b.r / total);
            b.x += nx * overlap * (a.r * a.r / total);
            b.y += ny * overlap * (a.r * a.r / total);
        }

        const rvx = b.vx - a.vx,
            rvy = b.vy - a.vy,
            along = rvx * nx + rvy * ny;

        if (along < 0) {
            const ma = a.r * a.r,
                mb = b.r * b.r,
                impulse = -2 * along / (1 / ma + 1 / mb);

            a.vx -= impulse * nx / ma;
            a.vy -= impulse * ny / ma;
            b.vx += impulse * nx / mb;
            b.vy += impulse * ny / mb;
        }

        a.flash = b.flash = 0.18;
        countCollision((a.x + b.x) / 2, (a.y + b.y) / 2);
    }

    /* ============================================================
       UPDATE (lógica por frame)
       ============================================================ */
    function update(dt) {
        /* Gravedad antes de mover */
        if (mode === 'gravity') applyGravity(dt);

        circles.forEach(c => c.move(dt));

        const now = performance.now();

        for (let i = 0; i < circles.length; i++) {
            for (let j = i + 1; j < circles.length; j++) {
                const a = circles[i],
                    b = circles[j],
                    dist = Math.hypot(b.x - a.x, b.y - a.y),
                    touch = dist < a.r + b.r,
                    cooling = (a.cooldowns.get(j) || 0) > now;

                if (touch && !cooling) {
                    if (mode === 'elastic') elasticCollision(a, b);
                    else simpleCollision(a, b, mode === 'flash');

                    a.cooldowns.set(j, now + 150);
                    b.cooldowns.set(i, now + 150);
                }

                if (!touch) {
                    a.cooldowns.delete(j);
                    b.cooldowns.delete(i);
                }
            }
        }

        /* Partículas */
        particles = particles.filter(p => (p.life -= dt) > 0);
        particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.98;
            p.vy *= 0.98;
        });

        /* Anillos */
        rings = rings.filter(r => (r.a -= dt * 2.2) > 0);
        rings.forEach(r => r.r += 90 * dt);

        /* Decaimiento de efectos globales */
        shake *= 0.88;
        if (shake < 0.1) shake = 0;
        screenFlash = Math.max(0, screenFlash - dt * 2);
    }

    /* ============================================================
       DRAW (render por frame)
       ============================================================ */
    function draw() {
        /* Fondo: normal o modo estela infinita */
        ctx.fillStyle = infiniteTrail ? 'rgba(8, 13, 27, 0.09)' : '#080d1b';
        ctx.fillRect(0, 0, W, H);

        /* Aplicar screen shake */
        ctx.save();
        if (shake > 0.1) {
            ctx.translate(
                (Math.random() - 0.5) * shake,
                (Math.random() - 0.5) * shake
            );
        }

        /* Rejilla */
        ctx.strokeStyle = 'rgba(69,244,255,.055)';
        ctx.lineWidth = 1;

        for (let x = 0; x < W; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y < H; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        /* Marco punteado */
        ctx.setLineDash([3, 9]);
        ctx.strokeStyle = 'rgba(125,157,201,.11)';
        ctx.strokeRect(12, 12, W - 24, H - 24);
        ctx.setLineDash([]);

        /* Esferas */
        circles.forEach(c => c.draw());

        /* Anillos (shockwaves) */
        rings.forEach(r => {
            ctx.save();
            ctx.globalAlpha = r.a;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = r.w || 2;
            ctx.shadowBlur = 22;
            ctx.shadowColor = r.color;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });

        /* Partículas en modo aditivo (glow real) */
        ctx.globalCompositeOperation = 'lighter';
        particles.forEach(p => {
            const alpha = Math.max(0, p.life / p.max);
            ctx.save();
            ctx.globalAlpha = alpha;

            const grad = ctx.createRadialGradient(
                p.x, p.y, 0,
                p.x, p.y, p.size * 4
            );
            grad.addColorStop(0, p.color);
            grad.addColorStop(1, 'transparent');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        ctx.globalCompositeOperation = 'source-over';

        ctx.restore(); // fin screen shake

        /* Flash blanco de pantalla */
        if (screenFlash > 0) {
            ctx.fillStyle = `rgba(230, 251, 255, ${screenFlash})`;
            ctx.fillRect(0, 0, W, H);
        }
    }

    /* ============================================================
       LOOP DE ANIMACIÓN
       ============================================================ */
    function frame(t) {
        let dt = Math.min((t - last) / 1000 || 0, 0.025);
        last = t;

        if (running) update(dt);
        draw();

        /* FPS */
        fpsCount++;
        fpsTime += dt;
        if (fpsTime >= 0.5) {
            if (fpsEl) fpsEl.textContent = Math.round(fpsCount / fpsTime);
            fpsTime = 0;
            fpsCount = 0;
        }

        if (running || particles.length || rings.length)
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
       CAMBIO DE MODO
       ============================================================ */
    function setMode(next) {
        mode = next;
        document.getElementById('modeLabel').textContent = labels[mode];
    }

    document.querySelectorAll('input[name="algorithm"]').forEach(i =>
        i.addEventListener('change', () => setMode(i.value))
    );

    /* ============================================================
       BOTONES
       ============================================================ */
    toggleBtn.addEventListener('click', () => {
        running = !running;
        toggleBtn.textContent = running ? 'PAUSAR' : 'CONTINUAR';
        statusEl.textContent = running ? 'EN EJECUCIÓN' : 'PAUSADO';
        if (running) runFrame();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        running = true;
        toggleBtn.textContent = 'PAUSAR';
        statusEl.textContent = 'EN EJECUCIÓN';
        createCircles();
        runFrame();
    });

    /* Modo estela infinita */
    const trailBtn = document.getElementById('trailBtn');
    if (trailBtn) {
        trailBtn.addEventListener('click', () => {
            infiniteTrail = !infiniteTrail;
            trailBtn.classList.toggle('active', infiniteTrail);
            trailBtn.textContent = infiniteTrail ? 'ESTELA ∞ ON' : 'ESTELA ∞';
        });
    }

    /* Atajo SPACE */
    window.addEventListener('keydown', e => {
        if (e.code === 'Space') {
            e.preventDefault();
            toggleBtn.click();
        }
    });

    /* ============================================================
       FECHA / AÑO
       ============================================================ */
    const now = new Date();
    document.getElementById('year').textContent = now.getFullYear();
    document.getElementById('date').textContent = now.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
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
            setTimeout(() => b.remove(), 800);
        }
    }, 1300);

    /* ============================================================
       ARRANQUE
       ============================================================ */
    createCircles();
    runFrame();
})();

/*
C)
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Configuración del canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.background = "#ffffff";

const COLLISION_COLOR = "#0000FF";
const TOTAL_CIRCLES = 20;

// Clase Circle: representa cada círculo
class Circle {
    constructor(x, y, radius, color, text, speed) {
        this.posX = x;
        this.posY = y;
        this.radius = radius;

        this.originalColor = color;
        this.color = color;
        this.text = text;
        this.speed = speed;

        // Dirección inicial aleatoria
        const angle = Math.random() * Math.PI * 2;

        this.dx = Math.cos(angle) * speed;
        this.dy = Math.sin(angle) * speed;

        this.isColliding = false;
    }

    // Dibujar el círculo
    draw(context) {
        context.beginPath();

        context.strokeStyle = this.color;
        context.lineWidth = 2;

        context.arc(
            this.posX,
            this.posY,
            this.radius,
            0,
            Math.PI * 2
        );

        context.stroke();

        // Etiqueta del círculo
        context.fillStyle = "#222222";
        context.font = "12px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(this.text, this.posX, this.posY);

        context.closePath();
    }

    // Actualizar posición y controlar rebotes en los bordes
    update() {
        this.posX += this.dx;
        this.posY += this.dy;

        // Rebote horizontal
        if (this.posX + this.radius >= canvas.width) {
            this.posX = canvas.width - this.radius;
            this.dx = -Math.abs(this.dx);
        } else if (this.posX - this.radius <= 0) {
            this.posX = this.radius;
            this.dx = Math.abs(this.dx);
        }

        // Rebote vertical
        if (this.posY + this.radius >= canvas.height) {
            this.posY = canvas.height - this.radius;
            this.dy = -Math.abs(this.dy);
        } else if (this.posY - this.radius <= 0) {
            this.posY = this.radius;
            this.dy = Math.abs(this.dy);
        }
    }

    // Calcular distancia entre los centros
    calculateDistance(other) {
        const dx = other.posX - this.posX;
        const dy = other.posY - this.posY;

        return Math.sqrt(dx * dx + dy * dy);
    }

    // Detectar colisión entre dos círculos
    checkCollision(other) {
        return this.calculateDistance(other) <=
            this.radius + other.radius;
    }

    // Cambiar color durante la colisión
    updateCollisionColor() {
        this.color = this.isColliding
            ? COLLISION_COLOR
            : this.originalColor;
    }

    // Resolver la colisión y cambiar las velocidades
    resolveCollision(other) {
        let dx = other.posX - this.posX;
        let dy = other.posY - this.posY;

        let distance = Math.sqrt(dx * dx + dy * dy);

        // Evitar división entre cero si los centros coinciden
        if (distance === 0) {
            dx = 1;
            dy = 0;
            distance = 1;
        }

        // Vector normal de la colisión
        const nx = dx / distance;
        const ny = dy / distance;

        // Corregir el solapamiento entre los círculos
        const overlap = this.radius + other.radius - distance;

        if (overlap > 0) {
            const separation = overlap / 2 + 0.01;

            this.posX -= nx * separation;
            this.posY -= ny * separation;

            other.posX += nx * separation;
            other.posY += ny * separation;
        }

        // Velocidad relativa sobre el eje de colisión
        const relativeVelocityX = other.dx - this.dx;
        const relativeVelocityY = other.dy - this.dy;

        const velocityAlongNormal =
            relativeVelocityX * nx +
            relativeVelocityY * ny;

        // Si se separan, no aplicar otro impulso
        if (velocityAlongNormal >= 0) {
            return;
        }

        // Colisión elástica entre círculos de igual masa
        const restitution = 1;

        const impulse =
            -(1 + restitution) * velocityAlongNormal / 2;

        // Aplicar el impulso en sentidos opuestos
        this.dx -= impulse * nx;
        this.dy -= impulse * ny;

        other.dx += impulse * nx;
        other.dy += impulse * ny;

        // Mantener velocidades dentro del intervalo 1 a 5
        this.limitSpeed();
        other.limitSpeed();
    }

    // Limitar la magnitud de la velocidad
    limitSpeed() {
        let currentSpeed = Math.sqrt(
            this.dx * this.dx + this.dy * this.dy
        );

        if (currentSpeed === 0) {
            this.dx = 1;
            this.dy = 0;
            currentSpeed = 1;
        }

        const targetSpeed = Math.max(
            1,
            Math.min(5, currentSpeed)
        );

        const factor = targetSpeed / currentSpeed;

        this.dx *= factor;
        this.dy *= factor;

        this.speed = targetSpeed;
    }
}

// Arreglo de círculos
const circles = [];

// Generar círculos aleatorios
function generateCircles(n) {
    circles.length = 0;

    for (let i = 0; i < n; i++) {
        const radius = Math.random() * 25 + 15;

        const x = radius + Math.random() *
            Math.max(1, canvas.width - 2 * radius);

        const y = radius + Math.random() *
            Math.max(1, canvas.height - 2 * radius);

        const color = "#" +
            Math.floor(Math.random() * 16777216)
                .toString(16)
                .padStart(6, "0");

        const speed = Math.random() * 4 + 1;
        const text = `C${i + 1}`;

        circles.push(
            new Circle(x, y, radius, color, text, speed)
        );
    }
}

// Detectar y resolver las colisiones colectivas
function detectCollisions() {
    // Restablecer el estado antes de comprobar los pares
    circles.forEach(circle => {
        circle.isColliding = false;
    });

    // Comparar cada círculo con los demás
    for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
            const circleA = circles[i];
            const circleB = circles[j];

            if (circleA.checkCollision(circleB)) {
                // Activar el color azul en ambos círculos
                circleA.isColliding = true;
                circleB.isColliding = true;

                // Cambiar las direcciones del movimiento
                circleA.resolveCollision(circleB);
            }
        }
    }

    // Aplicar el color correspondiente
    circles.forEach(circle => {
        circle.updateCollisionColor();
    });
}

// Animación principal
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Actualizar posiciones
    circles.forEach(circle => {
        circle.update();
    });

    // 2. Detectar y resolver colisiones
    detectCollisions();

    // 3. Dibujar con los colores actualizados
    circles.forEach(circle => {
        circle.draw(ctx);
    });

    requestAnimationFrame(animate);
}

// Adaptar el canvas al tamaño de la ventana
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    circles.forEach(circle => {
        circle.posX = Math.max(
            circle.radius,
            Math.min(
                canvas.width - circle.radius,
                circle.posX
            )
        );

        circle.posY = Math.max(
            circle.radius,
            Math.min(
                canvas.height - circle.radius,
                circle.posY
            )
        );
    });
});

// Iniciar la simulación
generateCircles(TOTAL_CIRCLES);
animate();*/

/*
B)
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Configuración del canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.background = "#ffffff";

// Clase Circle: representa cada círculo en movimiento
class Circle {
    constructor(x, y, radius, color, text, speed) {
        this.posX = x;
        this.posY = y;
        this.radius = radius;

        // Conservar el color original
        this.originalColor = color;
        this.color = color;

        this.text = text;
        this.speed = speed;

        // Dirección aleatoria con velocidad entre 1 y 5
        const angle = Math.random() * Math.PI * 2;
        this.dx = Math.cos(angle) * speed;
        this.dy = Math.sin(angle) * speed;

        // Indica si el círculo está en colisión
        this.isColliding = false;
    }

    // Dibujar el círculo
    draw(context) {
        context.beginPath();

        context.strokeStyle = this.color;
        context.lineWidth = 2;

        context.arc(
            this.posX,
            this.posY,
            this.radius,
            0,
            Math.PI * 2
        );

        context.stroke();

        // Etiqueta del círculo
        context.fillStyle = "#222222";
        context.font = "12px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(this.text, this.posX, this.posY);

        context.closePath();
    }

    // Actualizar posición y controlar los rebotes
    update() {
        this.posX += this.dx;
        this.posY += this.dy;

        // Rebote en los bordes horizontales
        if (this.posX + this.radius >= canvas.width) {
            this.posX = canvas.width - this.radius;
            this.dx = -Math.abs(this.dx);
        } else if (this.posX - this.radius <= 0) {
            this.posX = this.radius;
            this.dx = Math.abs(this.dx);
        }

        // Rebote en los bordes verticales
        if (this.posY + this.radius >= canvas.height) {
            this.posY = canvas.height - this.radius;
            this.dy = -Math.abs(this.dy);
        } else if (this.posY - this.radius <= 0) {
            this.posY = this.radius;
            this.dy = Math.abs(this.dy);
        }
    }

    // Calcular la distancia entre los centros de dos círculos
    calculateDistance(other) {
        const dx = other.posX - this.posX;
        const dy = other.posY - this.posY;

        return Math.sqrt(dx * dx + dy * dy);
    }

    // Comprobar si dos círculos están en colisión
    checkCollision(other) {
        const distance = this.calculateDistance(other);

        return distance <= this.radius + other.radius;
    }

    // Cambiar el color según el estado de colisión
    updateCollisionColor() {
        this.color = this.isColliding
            ? "#0000FF"
            : this.originalColor;
    }
}

// Arreglo que almacena los 20 círculos
const circles = [];

// Generar círculos con propiedades aleatorias
function generateCircles(n) {
    circles.length = 0;

    for (let i = 0; i < n; i++) {
        const radius = Math.random() * 25 + 15;

        // Posición inicial dentro del canvas
        const x = radius +
            Math.random() * Math.max(1, canvas.width - radius * 2);

        const y = radius +
            Math.random() * Math.max(1, canvas.height - radius * 2);

        // Color original aleatorio
        const color = "#" +
            Math.floor(Math.random() * 16777216)
                .toString(16)
                .padStart(6, "0");

        // Velocidad entre 1 y 5 unidades
        const speed = Math.random() * 4 + 1;

        const text = `C${i + 1}`;

        circles.push(
            new Circle(x, y, radius, color, text, speed)
        );
    }
}

// Detectar las colisiones entre todos los pares de círculos
function detectCollisions() {
    // Reiniciar el estado de colisión de todos los círculos
    circles.forEach(circle => {
        circle.isColliding = false;
    });

    // Comparar cada círculo con los siguientes
    for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
            const circleA = circles[i];
            const circleB = circles[j];

            if (circleA.checkCollision(circleB)) {
                circleA.isColliding = true;
                circleB.isColliding = true;
            }
        }
    }

    // Actualizar el color de todos los círculos
    circles.forEach(circle => {
        circle.updateCollisionColor();
    });
}

// Animación principal
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Primero, actualizar el movimiento
    circles.forEach(circle => {
        circle.update();
    });

    // Después, comprobar las colisiones
    detectCollisions();

    // Finalmente, dibujar los círculos con sus colores actuales
    circles.forEach(circle => {
        circle.draw(ctx);
    });

    requestAnimationFrame(animate);
}

// Adaptar el canvas al tamaño de la ventana
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Mantener los círculos dentro de los nuevos límites
    circles.forEach(circle => {
        circle.posX = Math.max(
            circle.radius,
            Math.min(canvas.width - circle.radius, circle.posX)
        );

        circle.posY = Math.max(
            circle.radius,
            Math.min(canvas.height - circle.radius, circle.posY)
        );
    });
});

// Crear 20 círculos e iniciar la animación
generateCircles(20);
animate();*/

/*
A)
const canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
//Obtiene las dimensiones de la pantalla actual
const window_height = window.innerHeight;
const window_width = window.innerWidth;
canvas.height = window_height;
canvas.width = window_width;
canvas.style.background = "#ff8";
class Circle {
    constructor(x, y, radius, color, text, speed) {
        this.posX = x;
        this.posY = y;
        this.radius = radius;
        this.color = color;
        this.text = text;
        this.speed = speed;
        this.dx = 1 * this.speed;
        this.dy = 1 * this.speed;
    }
    draw(context) {
        context.beginPath();
        context.strokeStyle = this.color;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "20px Arial";
        context.fillText(this.text, this.posX, this.posY);
        context.lineWidth = 2;
        context.arc(this.posX, this.posY, this.radius, 0, Math.PI * 2, false);
        context.stroke();
        context.closePath();
    }
    update(context) {
        this.draw(context);
        // Actualizar la posición X
        this.posX += this.dx;
        // Cambiar la dirección si el círculo llega al borde del canvas en X
        if (this.posX + this.radius > window_width || this.posX - this.radius < 0) {
            this.dx = -this.dx;
        }
        // Actualizar la posición Y
        this.posY += this.dy;
        // Cambiar la dirección si el círculo llega al borde del canvas en Y
        if (this.posY + this.radius > window_height || this.posY - this.radius < 0) {
            this.dy = -this.dy;
        }
    }
}
// Crear un array para almacenar N círculos
let circles = [];
// Función para generar círculos aleatorios
function generateCircles(n) {
    for (let i = 0; i < n; i++) {
        let radius = Math.random() * 30 + 20; // Radio entre 20 y 50
        let x = Math.random() * (window_width - radius * 2) + radius;
        let y = Math.random() * (window_height - radius * 2) + radius;
        let color = `#${Math.floor(Math.random() * 16777215).toString(16)}`; // Color aleatorio
        let speed = Math.random() * 2 + 1; // Velocidad entre 1 y 3
        let text = `C${i + 1}`; // Etiqueta del círculo
        circles.push(new Circle(x, y, radius, color, text, speed));
    }
}
// Función para animar los círculos
function animate() {
    ctx.clearRect(0, 0, window_width, window_height); // Limpiar el canvas
    circles.forEach(circle => {
        circle.update(ctx); // Actualizar cada círculo
    });
    requestAnimationFrame(animate); // Repetir la animación
}
// Generar N círculos y comenzar la animación
generateCircles(5); // Puedes cambiar el número de círculos aquí
animate();*/
