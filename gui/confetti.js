function confettiBurst({ count = 120, duration = 2500, x, y } = {}) {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
        position: 'fixed', inset: '0', width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '2147483647',
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);

    // default to center-ish if no origin given
    const originX = x ?? innerWidth / 2;
    const originY = y ?? innerHeight / 3;

    const colors = ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d'];
    const parts = Array.from({ length: count }, () => ({
        x: originX,
        y: originY,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -15 - 4,
        size: Math.random() * 6 + 4,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
    }));

    const start = performance.now();
    (function frame(now) {
        const t = now - start;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        for (const p of parts) {
            p.vy += 0.3;            // gravity
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vrot;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, 1 - t / duration);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
        if (t < duration) requestAnimationFrame(frame);
        else canvas.remove();
    })(start);
}

// fire N bursts, staggered, at random positions
function confettiCelebrate({ bursts = 5, gap = 250, count = 120, duration = 2500 } = {}) {
    for (let i = 0; i < bursts; i++) {
        setTimeout(() => {
            confettiBurst({
                count,
                duration,
                x: Math.random() * innerWidth,
                y: Math.random() * innerHeight * 0.6,   // keep them in the upper ~60%
            });
        }, i * gap);
    }
}