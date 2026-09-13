import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import {
  clamp,
  levelConfig,
  rectsOverlap,
  safeStoredNumber,
  scoreForHit,
  TOTAL_LEVELS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './game/logic.js';

const INITIAL_HUD = { score: 0, lives: 3, level: 1, progress: 0, goal: 11, combo: 1, shield: 0 };

function makeGame() {
  return {
    player: { x: WORLD_WIDTH / 2 - 28, y: WORLD_HEIGHT - 78, width: 56, height: 48, invincible: 0 },
    bullets: [], enemyBullets: [], enemies: [], pickups: [], particles: [],
    score: 0, lives: 3, level: 1, kills: 0, combo: 1, comboClock: 0,
    shootClock: 0, spawnClock: 0, shieldClock: 0, rapidClock: 0,
    transitionClock: 0, bossSpawned: false, nextId: 1, elapsed: 0,
  };
}

function seededStars(count) {
  let seed = 7219;
  return Array.from({ length: count }, (_, index) => {
    seed = (seed * 16807) % 2147483647;
    const x = (seed % 10000) / 10000;
    seed = (seed * 16807) % 2147483647;
    return { x, y: (seed % 10000) / 10000, size: 0.7 + (index % 4) * 0.45, alpha: 0.28 + (index % 5) * 0.12 };
  });
}

const STARS = seededStars(110);

function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(makeGame());
  const screenRef = useRef('menu');
  const keysRef = useRef(new Set());
  const touchRef = useRef({ left: false, right: false, up: false, down: false, shoot: false });
  const pointerRef = useRef(false);
  const audioRef = useRef(null);
  const mutedRef = useRef(false);
  const [screen, setScreen] = useState('menu');
  const [hud, setHud] = useState(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [highScore, setHighScore] = useState(() => {
    try { return safeStoredNumber(localStorage.getItem('peleja-recorde')); } catch { return 0; }
  });

  const changeScreen = useCallback((next) => {
    screenRef.current = next;
    setScreen(next);
  }, []);

  const tone = useCallback((kind) => {
    if (mutedRef.current) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = audioRef.current || new AudioContext();
      audioRef.current = context;
      if (context.state === 'suspended') context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      const sounds = {
        shoot: [440, 170, 0.055, 'square', 0.025], hit: [120, 62, 0.11, 'sawtooth', 0.05],
        pickup: [410, 920, 0.18, 'sine', 0.055], damage: [95, 38, 0.22, 'sawtooth', 0.075],
        level: [330, 660, 0.32, 'triangle', 0.06], victory: [523, 1046, 0.5, 'triangle', 0.07],
      };
      const [from, to, duration, wave, volume] = sounds[kind] || sounds.hit;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // O jogo continua normalmente se o navegador bloquear Web Audio.
    }
  }, []);

  const saveRecord = useCallback((score) => {
    setHighScore((current) => {
      const next = Math.max(current, score);
      try { localStorage.setItem('peleja-recorde', String(next)); } catch { /* modo privado */ }
      return next;
    });
  }, []);

  const startGame = useCallback(() => {
    gameRef.current = makeGame();
    setHud(INITIAL_HUD);
    changeScreen('playing');
    tone('level');
    canvasRef.current?.focus();
  }, [changeScreen, tone]);

  const togglePause = useCallback(() => {
    if (screenRef.current === 'playing') changeScreen('paused');
    else if (screenRef.current === 'paused') changeScreen('playing');
  }, [changeScreen]);

  const toggleMute = useCallback(() => {
    setMuted((current) => { mutedRef.current = !current; return !current; });
  }, []);

  useEffect(() => {
    const down = (event) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'enter'].includes(key)) event.preventDefault();
      if ((key === 'p' || key === 'escape') && ['playing', 'paused'].includes(screenRef.current)) { togglePause(); return; }
      if (key === 'm') toggleMute();
      if ((key === 'enter' || key === ' ') && ['menu', 'gameover', 'victory'].includes(screenRef.current)) { startGame(); return; }
      keysRef.current.add(key);
    };
    const up = (event) => keysRef.current.delete(event.key.toLowerCase());
    const pauseWhenHidden = () => { if (document.hidden && screenRef.current === 'playing') changeScreen('paused'); };
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [changeScreen, startGame, toggleMute, togglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d', { alpha: false });
    let animationFrame = 0;
    let previousTime = performance.now();
    let hudClock = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = WORLD_WIDTH * ratio;
      canvas.height = WORLD_HEIGHT * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const burst = (game, x, y, color, amount = 9) => {
      for (let i = 0; i < amount; i += 1) {
        const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.5;
        const speed = 35 + Math.random() * 90;
        game.particles.push({ id: game.nextId++, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35 + Math.random() * 0.5, size: 2 + Math.random() * 4, color });
      }
    };

    const damagePlayer = (game, x, y) => {
      if (game.player.invincible > 0) return;
      if (game.shieldClock > 0) {
        game.shieldClock = Math.max(0, game.shieldClock - 2.5);
        burst(game, x, y, '#72d9d0', 12);
        return;
      }
      game.lives = Math.max(0, game.lives - 1);
      game.combo = 1;
      game.player.invincible = 1.5;
      burst(game, x, y, '#ff9a4d', 16);
      tone('damage');
      if (game.lives === 0) { saveRecord(game.score); changeScreen('gameover'); }
    };

    const spawnEnemy = (game) => {
      const config = levelConfig(game.level);
      const roll = Math.random();
      const type = roll > 0.83 && game.level >= 3 ? 'fast' : roll > 0.58 && game.level >= 2 ? 'bandit' : 'rock';
      const sizes = { rock: [42, 42], bandit: [50, 38], fast: [34, 42] };
      const [width, height] = sizes[type];
      game.enemies.push({
        id: game.nextId++, type, x: 24 + Math.random() * (WORLD_WIDTH - width - 48), y: -height,
        width, height, vx: type === 'fast' ? (Math.random() > 0.5 ? 76 : -76) : 0,
        vy: config.enemySpeed * ({ rock: 0.82, bandit: 1, fast: 1.42 }[type]),
        hp: type === 'bandit' ? 2 : 1, maxHp: type === 'bandit' ? 2 : 1,
        phase: Math.random() * Math.PI * 2, shootClock: 1.2 + Math.random() * 2,
      });
    };

    const spawnBoss = (game) => {
      const hp = 46;
      game.enemies.push({ id: game.nextId++, type: 'boss', x: WORLD_WIDTH / 2 - 82, y: 48, width: 164, height: 90, vx: 92, vy: 0, hp, maxHp: hp, phase: 0, shootClock: 1.1 });
      game.bossSpawned = true;
    };

    const finishEnemy = (game, enemy) => {
      game.score += scoreForHit(enemy.type, game.combo);
      game.combo = clamp(game.combo + 1, 1, 5);
      game.comboClock = 2.4;
      burst(game, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.type === 'boss' ? '#ffd067' : '#d87a3e', enemy.type === 'boss' ? 42 : 12);
      tone(enemy.type === 'boss' ? 'victory' : 'hit');
      if (enemy.type === 'boss') {
        game.kills = 1;
        saveRecord(game.score);
        changeScreen('victory');
        return;
      }
      game.kills += 1;
      if (Math.random() < 0.14) {
        const roll = Math.random();
        const type = roll > 0.7 ? 'shield' : roll > 0.38 ? 'rapid' : 'water';
        game.pickups.push({ id: game.nextId++, type, x: enemy.x + 8, y: enemy.y, width: 30, height: 34, vy: 75 });
      }
    };

    const update = (dt) => {
      if (screenRef.current !== 'playing') return;
      const game = gameRef.current;
      const config = levelConfig(game.level);
      game.elapsed += dt;
      game.shootClock = Math.max(0, game.shootClock - dt);
      game.spawnClock -= dt;
      game.comboClock = Math.max(0, game.comboClock - dt);
      game.shieldClock = Math.max(0, game.shieldClock - dt);
      game.rapidClock = Math.max(0, game.rapidClock - dt);
      game.player.invincible = Math.max(0, game.player.invincible - dt);
      if (game.comboClock === 0) game.combo = 1;

      const keys = keysRef.current;
      const touch = touchRef.current;
      const horizontal = (keys.has('arrowright') || keys.has('d') || touch.right ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') || touch.left ? 1 : 0);
      const vertical = (keys.has('arrowdown') || keys.has('s') || touch.down ? 1 : 0) - (keys.has('arrowup') || keys.has('w') || touch.up ? 1 : 0);
      const magnitude = Math.hypot(horizontal, vertical) || 1;
      game.player.x = clamp(game.player.x + (horizontal / magnitude) * 300 * dt, 12, WORLD_WIDTH - game.player.width - 12);
      game.player.y = clamp(game.player.y + (vertical / magnitude) * 250 * dt, WORLD_HEIGHT * 0.49, WORLD_HEIGHT - game.player.height - 12);

      const wantsToShoot = keys.has(' ') || keys.has('enter') || touch.shoot;
      if (wantsToShoot && game.shootClock === 0) {
        const rapid = game.rapidClock > 0;
        const offsets = rapid ? [8, game.player.width - 8] : [game.player.width / 2];
        offsets.forEach((offset) => game.bullets.push({ id: game.nextId++, x: game.player.x + offset - 3, y: game.player.y - 10, width: 6, height: 18, vy: -480 }));
        game.shootClock = rapid ? 0.12 : 0.24;
        tone('shoot');
      }

      if (game.transitionClock > 0) {
        game.transitionClock -= dt;
        if (game.transitionClock <= 0) { game.level += 1; game.kills = 0; game.spawnClock = 1.1; game.bossSpawned = false; tone('level'); }
      } else if (game.level === TOTAL_LEVELS) {
        if (!game.bossSpawned) spawnBoss(game);
      } else if (game.kills >= config.goal) {
        game.enemies = []; game.enemyBullets = []; game.transitionClock = 2.2;
      } else if (game.spawnClock <= 0) {
        spawnEnemy(game); game.spawnClock = config.spawnEvery * (0.78 + Math.random() * 0.5);
      }

      game.bullets.forEach((bullet) => { bullet.y += bullet.vy * dt; });
      game.enemyBullets.forEach((bullet) => { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; });
      game.pickups.forEach((pickup) => { pickup.y += pickup.vy * dt; });
      game.particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 45 * dt; particle.life -= dt; });

      game.enemies.forEach((enemy) => {
        enemy.phase += dt;
        if (enemy.type === 'boss') {
          enemy.x += enemy.vx * dt;
          if (enemy.x < 24 || enemy.x + enemy.width > WORLD_WIDTH - 24) enemy.vx *= -1;
          enemy.shootClock -= dt;
          if (enemy.shootClock <= 0) {
            [-0.34, 0, 0.34].forEach((spread) => game.enemyBullets.push({ id: game.nextId++, x: enemy.x + enemy.width / 2 - 7, y: enemy.y + enemy.height - 5, width: 14, height: 14, vx: spread * 210, vy: 190 }));
            enemy.shootClock = 0.72;
          }
        } else {
          enemy.y += enemy.vy * dt;
          if (enemy.type === 'bandit') enemy.x += Math.sin(enemy.phase * 3.2) * 82 * dt;
          if (enemy.type === 'fast') { enemy.x += enemy.vx * dt; if (enemy.x < 8 || enemy.x + enemy.width > WORLD_WIDTH - 8) enemy.vx *= -1; }
        }
      });

      const spentBullets = new Set();
      const defeatedEnemies = new Set();
      for (const bullet of game.bullets) {
        if (spentBullets.has(bullet.id)) continue;
        const enemy = game.enemies.find((item) => !defeatedEnemies.has(item.id) && rectsOverlap(bullet, item, item.type === 'boss' ? 7 : 4));
        if (!enemy) continue;
        spentBullets.add(bullet.id);
        enemy.hp -= 1;
        burst(game, bullet.x, bullet.y, '#ffd067', 4);
        if (enemy.hp <= 0) { defeatedEnemies.add(enemy.id); finishEnemy(game, enemy); }
      }
      game.bullets = game.bullets.filter((item) => !spentBullets.has(item.id) && item.y + item.height > -20);
      game.enemies = game.enemies.filter((item) => !defeatedEnemies.has(item.id));

      for (const enemy of game.enemies) {
        if (enemy.type !== 'boss' && enemy.y > WORLD_HEIGHT + 20) { defeatedEnemies.add(enemy.id); damagePlayer(game, enemy.x, WORLD_HEIGHT - 30); }
        else if (rectsOverlap(game.player, enemy, 8)) { if (enemy.type !== 'boss') defeatedEnemies.add(enemy.id); damagePlayer(game, game.player.x + 28, game.player.y + 20); }
      }
      game.enemies = game.enemies.filter((item) => !defeatedEnemies.has(item.id));

      const spentEnemyBullets = new Set();
      for (const bullet of game.enemyBullets) {
        if (rectsOverlap(game.player, bullet, 4)) { spentEnemyBullets.add(bullet.id); damagePlayer(game, bullet.x, bullet.y); }
      }
      game.enemyBullets = game.enemyBullets.filter((item) => !spentEnemyBullets.has(item.id) && item.y < WORLD_HEIGHT + 30 && item.x > -30 && item.x < WORLD_WIDTH + 30);

      const collected = new Set();
      for (const pickup of game.pickups) {
        if (!rectsOverlap(game.player, pickup, 3)) continue;
        collected.add(pickup.id);
        if (pickup.type === 'water') game.lives = Math.min(5, game.lives + 1);
        if (pickup.type === 'shield') game.shieldClock = 8;
        if (pickup.type === 'rapid') game.rapidClock = 8;
        game.score += 250;
        burst(game, pickup.x + 15, pickup.y + 17, '#72d9d0', 16);
        tone('pickup');
      }
      game.pickups = game.pickups.filter((item) => !collected.has(item.id) && item.y < WORLD_HEIGHT + 40);
      game.particles = game.particles.filter((item) => item.life > 0);

      hudClock -= dt;
      if (hudClock <= 0) {
        hudClock = 0.08;
        const freshConfig = levelConfig(game.level);
        setHud({ score: game.score, lives: game.lives, level: game.level, progress: game.kills, goal: freshConfig.goal, combo: game.combo, shield: Math.ceil(game.shieldClock), rapid: Math.ceil(game.rapidClock) });
      }
    };

    const roundedRect = (ctx, x, y, width, height, radius) => { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.closePath(); };

    const drawBackground = (ctx, time) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
      gradient.addColorStop(0, '#130e1b'); gradient.addColorStop(0.58, '#37202a'); gradient.addColorStop(1, '#b0522e');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      STARS.forEach((star, index) => {
        const twinkle = 0.68 + Math.sin(time * 0.0016 + index) * 0.32;
        ctx.globalAlpha = star.alpha * twinkle; ctx.fillStyle = index % 9 === 0 ? '#f2c675' : '#fff1d0';
        ctx.beginPath(); ctx.arc(star.x * WORLD_WIDTH, star.y * 360, star.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      const moon = ctx.createRadialGradient(785, 98, 5, 785, 98, 63);
      moon.addColorStop(0, 'rgba(255,226,158,.95)'); moon.addColorStop(0.5, 'rgba(218,153,87,.34)'); moon.addColorStop(1, 'rgba(218,153,87,0)');
      ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(785, 98, 63, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b970'; ctx.beginPath(); ctx.arc(785, 98, 27, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c98a55'; ctx.beginPath(); ctx.arc(774, 90, 7, 0, Math.PI * 2); ctx.arc(794, 107, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#25151e'; ctx.beginPath(); ctx.moveTo(0, 402); ctx.quadraticCurveTo(165, 320, 340, 410); ctx.quadraticCurveTo(530, 332, 700, 406); ctx.quadraticCurveTo(835, 342, 960, 397); ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
      ctx.fillStyle = '#160f16'; ctx.beginPath(); ctx.moveTo(0, 457); ctx.quadraticCurveTo(185, 386, 370, 465); ctx.quadraticCurveTo(590, 404, 960, 468); ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
      const cactus = (x, y, scale) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = '#171218';
        roundedRect(ctx, -5, -55, 10, 60, 5); ctx.fill(); roundedRect(ctx, -25, -38, 22, 9, 5); ctx.fill(); roundedRect(ctx, -25, -52, 9, 22, 5); ctx.fill(); roundedRect(ctx, 3, -27, 22, 9, 5); ctx.fill(); roundedRect(ctx, 16, -41, 9, 22, 5); ctx.fill(); ctx.restore();
      };
      cactus(95, 470, 0.78); cactus(875, 465, 1.05); cactus(670, 462, 0.55);
    };

    const drawPlayer = (ctx, player, game) => {
      if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) return;
      ctx.save(); ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
      if (game.shieldClock > 0) { ctx.strokeStyle = 'rgba(114,217,208,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 39, 34, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#f19a45'; ctx.beginPath(); ctx.moveTo(-15, 20); ctx.lineTo(-5, 36 + Math.random() * 7); ctx.lineTo(0, 20); ctx.fill(); ctx.beginPath(); ctx.moveTo(5, 20); ctx.lineTo(15, 36 + Math.random() * 7); ctx.lineTo(20, 20); ctx.fill();
      ctx.fillStyle = '#6e3429'; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(27, 19); ctx.lineTo(10, 14); ctx.lineTo(0, 22); ctx.lineTo(-10, 14); ctx.lineTo(-27, 19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9a352'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(17, 10); ctx.lineTo(0, 4); ctx.lineTo(-17, 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4d184';
      for (let i = 0; i < 8; i += 1) { const angle = (Math.PI * 2 * i) / 8; ctx.beginPath(); ctx.arc(Math.cos(angle) * 17, Math.sin(angle) * 9 + 7, 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#79d8d1'; ctx.beginPath(); ctx.arc(0, -1, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };

    const drawEnemy = (ctx, enemy) => {
      ctx.save(); ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
      if (enemy.type === 'rock') {
        ctx.rotate(enemy.phase * 0.7); ctx.fillStyle = '#7d4c3c'; ctx.strokeStyle = '#bf7950'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-19, -8); ctx.lineTo(-7, -21); ctx.lineTo(14, -16); ctx.lineTo(21, 2); ctx.lineTo(10, 20); ctx.lineTo(-14, 17); ctx.lineTo(-22, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3d2730'; ctx.beginPath(); ctx.arc(-8, -5, 5, 0, Math.PI * 2); ctx.arc(8, 8, 4, 0, Math.PI * 2); ctx.fill();
      } else if (enemy.type === 'bandit') {
        ctx.fillStyle = '#2b1921'; roundedRect(ctx, -22, -11, 44, 24, 8); ctx.fill(); ctx.fillStyle = '#b65b38';
        ctx.beginPath(); ctx.moveTo(-25, -4); ctx.lineTo(0, -19); ctx.lineTo(25, -4); ctx.lineTo(15, 1); ctx.lineTo(-15, 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f2c675'; ctx.fillRect(-17, 2, 34, 4); ctx.fillStyle = '#ef7951'; ctx.beginPath(); ctx.arc(-9, 9, 3, 0, Math.PI * 2); ctx.arc(9, 9, 3, 0, Math.PI * 2); ctx.fill();
      } else if (enemy.type === 'fast') {
        ctx.rotate(Math.sin(enemy.phase * 7) * 0.18); ctx.fillStyle = '#c26c3e'; ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(17, 15); ctx.lineTo(0, 8); ctx.lineTo(-17, 15); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd067'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(9, -3); ctx.stroke();
      } else {
        ctx.fillStyle = '#25151e'; roundedRect(ctx, -80, -28, 160, 56, 22); ctx.fill(); ctx.fillStyle = '#8d432e';
        ctx.beginPath(); ctx.moveTo(-78, -5); ctx.lineTo(-43, -39); ctx.lineTo(0, -25); ctx.lineTo(43, -39); ctx.lineTo(78, -5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d7a052'; ctx.fillRect(-58, 2, 116, 8); ctx.fillStyle = '#e7794e';
        for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.arc(i * 23, 17, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#f2d28a'; ctx.font = 'bold 18px Georgia'; ctx.textAlign = 'center'; ctx.fillText('★', 0, -5);
        ctx.fillStyle = 'rgba(0,0,0,.48)'; ctx.fillRect(-70, -46, 140, 7); ctx.fillStyle = '#e7ad54'; ctx.fillRect(-70, -46, 140 * (enemy.hp / enemy.maxHp), 7);
      }
      ctx.restore();
    };

    const drawPickup = (ctx, pickup, time) => {
      ctx.save(); ctx.translate(pickup.x + 15, pickup.y + 17); ctx.rotate(Math.sin(time * 0.004 + pickup.id) * 0.15);
      ctx.shadowColor = '#72d9d0'; ctx.shadowBlur = 14; ctx.fillStyle = '#183b42'; roundedRect(ctx, -11, -14, 22, 28, 6); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#90e5dc'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#f4d184'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pickup.type === 'water' ? '+' : pickup.type === 'shield' ? '◆' : '»', 0, 1); ctx.restore();
    };

    const render = (time) => {
      drawBackground(context, time);
      const game = gameRef.current;
      game.particles.forEach((particle) => { context.globalAlpha = clamp(particle.life * 2, 0, 1); context.fillStyle = particle.color; context.beginPath(); context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); context.fill(); });
      context.globalAlpha = 1;
      game.bullets.forEach((bullet) => { context.shadowColor = '#ffd067'; context.shadowBlur = 10; context.fillStyle = '#ffe49a'; roundedRect(context, bullet.x, bullet.y, bullet.width, bullet.height, 3); context.fill(); context.shadowBlur = 0; });
      game.enemyBullets.forEach((bullet) => { context.fillStyle = '#ef6b4c'; context.beginPath(); context.arc(bullet.x + 7, bullet.y + 7, 7, 0, Math.PI * 2); context.fill(); });
      game.pickups.forEach((pickup) => drawPickup(context, pickup, time)); game.enemies.forEach((enemy) => drawEnemy(context, enemy)); drawPlayer(context, game.player, game);
      if (game.transitionClock > 0) {
        context.fillStyle = 'rgba(20,12,18,.58)'; roundedRect(context, WORLD_WIDTH / 2 - 190, WORLD_HEIGHT / 2 - 42, 380, 84, 16); context.fill();
        context.fillStyle = '#f4d184'; context.textAlign = 'center'; context.font = '700 30px Georgia'; context.fillText(`Rumo à peleja ${game.level + 1}`, WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 10);
      }
    };

    const loop = (time) => {
      const dt = Math.min((time - previousTime) / 1000, 0.034);
      previousTime = time; update(dt); render(time); animationFrame = requestAnimationFrame(loop);
    };
    resize();
    window.addEventListener('resize', resize);
    animationFrame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animationFrame); window.removeEventListener('resize', resize); };
  }, [changeScreen, saveRecord, tone]);

  const updatePointer = (event) => {
    if (!pointerRef.current || screenRef.current !== 'playing') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const game = gameRef.current;
    game.player.x = clamp(((event.clientX - rect.left) / rect.width) * WORLD_WIDTH - game.player.width / 2, 12, WORLD_WIDTH - game.player.width - 12);
    game.player.y = clamp(((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT - game.player.height / 2, WORLD_HEIGHT * 0.49, WORLD_HEIGHT - game.player.height - 12);
  };

  const bindTouch = (control) => ({
    onPointerDown: (event) => { event.preventDefault(); touchRef.current[control] = true; event.currentTarget.setPointerCapture?.(event.pointerId); },
    onPointerUp: () => { touchRef.current[control] = false; },
    onPointerCancel: () => { touchRef.current[control] = false; },
    onPointerLeave: () => { touchRef.current[control] = false; },
  });

  const config = levelConfig(hud.level);
  const progress = hud.level === TOTAL_LEVELS ? 100 : Math.min(100, (hud.progress / hud.goal) * 100);

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <div className="brand-lockup"><span className="brand-star">✦</span><div><strong>Peleja nas Estrelas</strong><span>Uma jornada pelo sertão cósmico</span></div></div>
        <div className="top-actions">
          <span className="record">Recorde <b>{highScore.toLocaleString('pt-BR')}</b></span>
          <button className="icon-button" type="button" onClick={toggleMute} aria-label={muted ? 'Ativar som' : 'Desativar som'} title="Som (M)">{muted ? '◌' : '♪'}</button>
          <button className="icon-button" type="button" onClick={togglePause} disabled={!['playing', 'paused'].includes(screen)} aria-label={screen === 'paused' ? 'Continuar jogo' : 'Pausar jogo'} title="Pausar (P)">{screen === 'paused' ? '▶' : 'Ⅱ'}</button>
        </div>
      </header>

      <section className="game-frame" aria-label="Área do jogo">
        <canvas ref={canvasRef} width={WORLD_WIDTH} height={WORLD_HEIGHT} tabIndex="0" aria-label="Nave Carcará enfrentando inimigos no sertão cósmico"
          onPointerDown={(event) => { pointerRef.current = true; updatePointer(event); }} onPointerMove={updatePointer}
          onPointerUp={() => { pointerRef.current = false; }} onPointerCancel={() => { pointerRef.current = false; }} />

        {screen === 'playing' && (
          <div className="hud" aria-live="polite">
            <div className="hud-block"><span>Pontos</span><strong>{hud.score.toLocaleString('pt-BR')}</strong></div>
            <div className="hud-center"><div><span>Peleja {hud.level}/{TOTAL_LEVELS}</span><strong>{config.title}</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
            <div className="hud-block hud-right"><span>Fôlego</span><strong aria-label={`${hud.lives} vidas`}>{'♥'.repeat(hud.lives)}<i>{'♥'.repeat(Math.max(0, 5 - hud.lives))}</i></strong></div>
            {hud.combo > 1 && <div className="combo">x{hud.combo} COMBO</div>}
            {(hud.shield > 0 || hud.rapid > 0) && <div className="buffs">{hud.shield > 0 && <span>◆ Escudo {hud.shield}s</span>}{hud.rapid > 0 && <span>» Rajada {hud.rapid}s</span>}</div>}
          </div>
        )}

        {screen === 'menu' && (
          <div className="overlay intro-overlay">
            <div className="eyebrow">CORDEL INTERESTELAR</div><h1>O céu do sertão<br /><em>chamou pra peleja.</em></h1>
            <p>Pilote a nave Carcará, atravesse cinco jornadas e enfrente o Coronel do Vazio antes que a noite engula a caatinga.</p>
            <button className="primary-button" type="button" onClick={startGame}>Começar a peleja <span>→</span></button>
            <div className="instructions"><span><kbd>WASD</kbd><kbd>↑↓←→</kbd> mover</span><span><kbd>ESPAÇO</kbd> atirar</span><span><kbd>P</kbd> pausar</span></div>
          </div>
        )}

        {screen === 'paused' && <div className="overlay compact-overlay"><div className="eyebrow">UMA PROSA RÁPIDA</div><h2>Peleja pausada</h2><p>Respire. O sertão cósmico espera.</p><button className="primary-button" type="button" onClick={togglePause}>Continuar <span>→</span></button></div>}
        {screen === 'gameover' && <div className="overlay compact-overlay"><div className="eyebrow">A NOITE FOI VALENTE</div><h2>Fim da jornada</h2><p>Você marcou <b>{hud.score.toLocaleString('pt-BR')}</b> pontos e chegou à peleja {hud.level}.</p><button className="primary-button" type="button" onClick={startGame}>Tentar novamente <span>↻</span></button></div>}
        {screen === 'victory' && <div className="overlay compact-overlay victory"><div className="eyebrow">O DIA CLAREOU</div><h2>Vitória no sertão!</h2><p>O Coronel do Vazio tombou. Pontuação final: <b>{hud.score.toLocaleString('pt-BR')}</b>.</p><button className="primary-button" type="button" onClick={startGame}>Nova jornada <span>↻</span></button></div>}

        <div className={`mobile-controls ${screen !== 'playing' ? 'hidden' : ''}`} aria-label="Controles de toque">
          <div className="d-pad"><button type="button" {...bindTouch('left')} aria-label="Mover para esquerda">←</button><div><button type="button" {...bindTouch('up')} aria-label="Mover para cima">↑</button><button type="button" {...bindTouch('down')} aria-label="Mover para baixo">↓</button></div><button type="button" {...bindTouch('right')} aria-label="Mover para direita">→</button></div>
          <button className="fire-button" type="button" {...bindTouch('shoot')} aria-label="Atirar">FOGO</button>
        </div>
      </section>

      <footer><span>Nave Carcará • Mova, mire e resista</span><span>Feito no RN por Roberto F. Rocha</span></footer>
    </main>
  );
}

export default App;
