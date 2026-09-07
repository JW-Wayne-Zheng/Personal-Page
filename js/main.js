import { initAnalytics } from './analytics.js';

// The page uses native anchor navigation and stays readable without JavaScript.
initAnalytics();

// A restrained spring follows scroll velocity without changing native scrolling.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const sheets = [...document.querySelectorAll('main > section.container, .project-details > .container')];
let stopPaperMotion = () => {};

function configurePaperMotion() {
    stopPaperMotion();
    if (motionPreference.matches || !sheets.length) return;

    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
        entries.forEach(({ target, isIntersecting }) => {
            if (isIntersecting) visible.add(target);
            else {
                visible.delete(target);
                target.style.removeProperty('--paper-tilt');
                target.style.removeProperty('--paper-lift');
                target.style.removeProperty('--paper-shadow');
            }
        });
    });
    sheets.forEach(sheet => {
        sheet.classList.add('paper-sheet');
        observer.observe(sheet);
    });

    let frame = 0;
    let lastY = window.scrollY;
    let lastScroll = performance.now();
    let previousFrame = 0;
    let target = 0;
    let bend = 0;

    function render(now) {
        const dt = Math.min(now - (previousFrame || now - 16), 40);
        previousFrame = now;
        if (now - lastScroll > 110) target *= Math.exp(-dt / 180);
        bend += (target - bend) * (1 - Math.exp(-dt / 70));
        const settled = Math.abs(bend) < 0.005 && Math.abs(target) < 0.005;
        if (settled) bend = target = 0;
        visible.forEach(sheet => {
            sheet.style.setProperty('--paper-tilt', `${(bend * 2.2).toFixed(3)}deg`);
            sheet.style.setProperty('--paper-lift', `${(-bend * 6).toFixed(3)}px`);
            sheet.style.setProperty('--paper-shadow', (Math.abs(bend) * 0.24).toFixed(4));
        });
        frame = settled ? 0 : requestAnimationFrame(render);
        if (settled) previousFrame = 0;
    }

    function onScroll() {
        const now = performance.now();
        const y = window.scrollY;
        const velocity = (y - lastY) / Math.max(now - lastScroll, 16);
        lastY = y;
        lastScroll = now;
        target = Math.max(-1, Math.min(1, velocity / 1.2));
        if (!frame) frame = requestAnimationFrame(render);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    stopPaperMotion = () => {
        window.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(frame);
        observer.disconnect();
        sheets.forEach(sheet => {
            sheet.classList.remove('paper-sheet');
            ['--paper-tilt', '--paper-lift', '--paper-shadow'].forEach(name => sheet.style.removeProperty(name));
        });
    };
}
configurePaperMotion();
motionPreference.addEventListener('change', configurePaperMotion);
