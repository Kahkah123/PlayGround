/* A self-contained, top-down football field. Yard coordinates run from 0 to 100. */
(function () {
  'use strict';

  const FIELD_HEIGHT = 53.33;
  const MID = FIELD_HEIGHT / 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, amount) => a + (b - a) * amount;

  class FootballField {
    constructor(canvas, callbacks = {}) {
      if (!canvas || !canvas.getContext) throw new TypeError('FootballField requires a canvas');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) throw new Error('FootballField requires a 2D canvas');
      this.callbacks = callbacks || {};
      this.situation = { yard: 25, down: 1, toGo: 10 };
      this.playName = 'Run';
      this.phase = 'ready';
      this.input = { up: false, down: false, left: false, right: false, sprint: false };
      this.keys = new Set();
      this.stamina = 1;
      this.clock = 0;
      this.cameraX = 0;
      this.lastTime = 0;
      this.destroyed = false;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this._boundKeyDown = event => this._key(event, true);
      this._boundKeyUp = event => this._key(event, false);
      this._boundBlur = () => { this.keys.clear(); this.input = { up: false, down: false, left: false, right: false, sprint: false }; };
      this._boundPointer = () => {};
      this._boundResize = () => this.resize();
      this._boundFrame = time => this._frame(time);
      window.addEventListener('keydown', this._boundKeyDown);
      window.addEventListener('keyup', this._boundKeyUp);
      window.addEventListener('blur', this._boundBlur);
      window.addEventListener('resize', this._boundResize);
      canvas.addEventListener('pointerdown', this._boundPointer);
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(this._boundResize);
        this.resizeObserver.observe(canvas);
      }
      this._formation();
      this.resize();
      this.frameId = requestAnimationFrame(this._boundFrame);
    }

    setSituation(situation = {}) {
      if (Number.isFinite(Number(situation.yard))) this.situation.yard = clamp(Number(situation.yard), 0, 100);
      if (Number.isFinite(Number(situation.down))) this.situation.down = clamp(Math.round(Number(situation.down)), 1, 4);
      if (Number.isFinite(Number(situation.toGo))) this.situation.toGo = clamp(Number(situation.toGo), 0, 100);
      if (this.phase !== 'playing') {
        this.phase = 'ready';
        this._formation();
        this._draw();
      }
    }

    reset() {
      this.phase = 'ready';
      this.clock = 0;
      this.stamina = 1;
      this.keys.clear();
      this.input = { up: false, down: false, left: false, right: false, sprint: false };
      this._formation();
      this._draw();
    }

    setInput(direction, active) {
      const aliases = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', shift: 'sprint' };
      const key = String(direction).toLowerCase();
      const name = aliases[key] || key;
      if (Object.prototype.hasOwnProperty.call(this.input, name)) this.input[name] = !!active;
    }

    startPlay(playName) {
      if (this.destroyed || this.phase === 'playing') return;
      if (typeof playName === 'string' && playName.trim()) this.playName = playName.trim();
      this._formation();
      if (/sweep/i.test(this.playName)) this.carrier.y -= 9;
      this.phase = 'playing';
      this.clock = 0;
      this.passCompleted = false;
      this.stamina = 1;
      this.startYard = this.situation.yard;
      this._status('Find a lane! Move with WASD or arrows. Hold Shift to sprint.');
    }

    resize() {
      if (this.destroyed) return;
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width || this.canvas.clientWidth || 800);
      this.height = Math.max(1, rect.height || this.canvas.clientHeight || 450);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(this.width * this.dpr);
      const height = Math.round(this.height * this.dpr);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this._draw();
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      cancelAnimationFrame(this.frameId);
      window.removeEventListener('keydown', this._boundKeyDown);
      window.removeEventListener('keyup', this._boundKeyUp);
      window.removeEventListener('blur', this._boundBlur);
      window.removeEventListener('resize', this._boundResize);
      this.canvas.removeEventListener('pointerdown', this._boundPointer);
      if (this.resizeObserver) this.resizeObserver.disconnect();
    }

    _status(text) {
      if (typeof this.callbacks.onStatus === 'function') this.callbacks.onStatus(text);
    }

    _key(event, active) {
      const target = event.target;
      const tag = target && target.tagName;
      const editing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tag || ''));
      const key = event.key.toLowerCase();
      if (editing && active) return;
      if (key === ' ' || key === 'spacebar') return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        if (active) this.keys.add(key); else this.keys.delete(key);
        if (!editing && key.startsWith('arrow')) event.preventDefault();
      }
    }

    _pressed(name) {
      const keyMap = { up: ['w', 'arrowup'], down: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'], sprint: ['shift'] };
      return this.input[name] || keyMap[name].some(key => this.keys.has(key));
    }

    _formation() {
      const x = this.situation.yard;
      const make = (dx, y, role, number) => ({ x: x + dx, y, homeX: x + dx, homeY: y, role, number, facing: 0 });
      this.offense = [
        make(-4.3, MID, 'carrier', 7),
        make(-0.9, MID - 4.8, 'line', 72), make(-0.9, MID - 2.4, 'line', 65),
        make(-0.9, MID, 'line', 55), make(-0.9, MID + 2.4, 'line', 68), make(-0.9, MID + 4.8, 'line', 74),
        make(-1.5, 6, 'receiver', 11), make(-1.5, FIELD_HEIGHT - 6, 'receiver', 13),
        make(-1.3, MID - 8, 'receiver', 88), make(-6.5, MID - 3.2, 'back', 22), make(-6.5, MID + 3.2, 'back', 33)
      ];
      this.defense = [
        make(2, MID - 4.8, 'rush', 90), make(2, MID - 1.6, 'rush', 94),
        make(2, MID + 1.6, 'rush', 91), make(2, MID + 4.8, 'rush', 99),
        make(6, MID - 7, 'linebacker', 51), make(6, MID, 'linebacker', 54), make(6, MID + 7, 'linebacker', 58),
        make(4, 6, 'corner', 21), make(4, FIELD_HEIGHT - 6, 'corner', 24),
        make(12, MID - 10, 'safety', 29), make(12, MID + 10, 'safety', 32)
      ];
      this.carrier = this.offense[0];
      this.carrier.x = Math.max(0.5, this.carrier.x);
      this.cameraX = this.carrier.x;
    }

    _frame(time) {
      if (this.destroyed) return;
      const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.04) : 0;
      this.lastTime = time;
      if (this.phase === 'playing') this._update(dt);
      const target = this.phase === 'playing' ? this.carrier.x : this.situation.yard;
      this.cameraX = lerp(this.cameraX, target, 1 - Math.exp(-5 * dt));
      this._draw();
      if (!this.destroyed) this.frameId = requestAnimationFrame(this._boundFrame);
    }

    _moveToward(player, tx, ty, speed, dt) {
      const dx = tx - player.x, dy = ty - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.01) return;
      const amount = Math.min(dist, speed * dt);
      player.x += dx / dist * amount;
      player.y += dy / dist * amount;
      player.facing = Math.atan2(dy, dx);
    }

    _update(dt) {
      this.clock += dt;
      let dx = Number(this._pressed('right')) - Number(this._pressed('left'));
      let dy = Number(this._pressed('down')) - Number(this._pressed('up'));
      const length = Math.hypot(dx, dy);
      const moving = length > 0;
      const sprinting = moving && this._pressed('sprint') && this.stamina > 0.03;
      this.stamina = clamp(this.stamina + (sprinting ? -0.22 : 0.12) * dt, 0, 1);
      if (moving) {
        dx /= length; dy /= length;
        const speed = sprinting ? 11.6 : 8.3;
        this.carrier.x += dx * speed * dt;
        this.carrier.y += dy * speed * dt;
        this.carrier.facing = Math.atan2(dy, dx);
      }

      // Teammates run routes or pick up the closest approaching defender.
      this.offense.forEach((player, index) => {
        if (player === this.carrier) return;
        let nearest = null, nearestDistance = Infinity;
        for (const defender of this.defense) {
          const d = distance(player, defender);
          if (d < nearestDistance) { nearest = defender; nearestDistance = d; }
        }
        const isReceiver = player.role === 'receiver';
        if (nearest && nearestDistance < (isReceiver ? 2.5 : 6.5)) {
          this._moveToward(player, nearest.x - 0.5, nearest.y, isReceiver ? 6.8 : 7.4, dt);
        } else {
          const lane = player.homeY < MID ? -1 : 1;
          const direction = /left/i.test(this.playName) ? -1 : /right/i.test(this.playName) ? 1 : lane;
          const routeY = isReceiver ? clamp(player.homeY + direction * Math.min(this.clock * 2.4, 6), 2, FIELD_HEIGHT - 2) : player.homeY + direction * Math.min(this.clock, 3);
          const advance = isReceiver ? 8.3 : player.role === 'back' ? 7 : 3.5;
          const routeX = player.homeX + Math.min(this.clock * advance, isReceiver ? 34 : 18);
          this._moveToward(player, routeX, routeY, advance, dt);
        }
        player.x = clamp(player.x, -8, 109);
        player.y = clamp(player.y, 1, FIELD_HEIGHT - 1);
      });

      // A quick pass automatically finds a receiver; the player then controls the catch.
      if (/quick pass/i.test(this.playName) && !this.passCompleted && this.clock > 1.1) {
        const receiver = this.offense.filter(p => p.role === 'receiver').sort((a, b) => Math.abs(a.y - this.carrier.y) - Math.abs(b.y - this.carrier.y))[0];
        if (receiver) {
          this.carrier.role = 'back';
          this.carrier = receiver;
          receiver.role = 'carrier';
          this.passCompleted = true;
          this._status('Pass complete! Run after the catch.');
        }
      }
      for (const defender of this.defense) {
        let engaged = false;
        for (let i = 0; i < this.offense.length; i++) {
          if (this.offense[i] !== this.carrier && distance(defender, this.offense[i]) < 1.65) { engaged = true; break; }
        }
        const delay = defender.role === 'safety' ? 0.8 : defender.role === 'corner' ? 0.6 : 0.25;
        let tx = this.carrier.x, ty = this.carrier.y;
        if (this.clock < delay) { tx = defender.homeX + 1; ty = defender.homeY; }
        else if (defender.role === 'safety' && this.clock < 2) { tx += 4; ty = lerp(defender.homeY, ty, 0.5); }
        const speed = (defender.role === 'rush' ? 7.1 : defender.role === 'safety' ? 8.4 : 7.8) * (engaged ? 0.36 : 1);
        this._moveToward(defender, tx, ty, speed, dt);
        defender.y = clamp(defender.y, 0.8, FIELD_HEIGHT - 0.8);
      }
      if (this.carrier.x >= 100) return this._endPlay(true, false, 'Touchdown!');
      if (this.carrier.y <= 0 || this.carrier.y >= FIELD_HEIGHT) return this._endPlay(false, false, 'Out of bounds');
      if (this.carrier.x <= 0) return this._endPlay(false, false, 'Stopped near your goal line');
      if (this.clock > 0.9 && this.defense.some(defender => distance(defender, this.carrier) < 1.12)) return this._endPlay(false, false, 'Tackled');
      if (this.clock > 25) this._endPlay(false, false, 'Play blown dead');
    }

    _endPlay(touchdown, turnover, message) {
      if (this.phase !== 'playing') return;
      this.phase = 'ended';
      const yards = Math.round(clamp(this.carrier.x, 0, 100) - this.startYard);
      const result = { yards, touchdown, turnover, message };
      this._status(touchdown ? 'Touchdown!' : message + ' · ' + (yards >= 0 ? '+' : '') + yards + ' yards');
      if (typeof this.callbacks.onPlayEnd === 'function') this.callbacks.onPlayEnd(result);
    }

    _draw() {
      const ctx = this.ctx;
      const w = this.width, h = this.height;
      if (!w || !h) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a2427';
      ctx.fillRect(0, 0, w, h);

      // Keep the entire field width visible while the camera follows the ball.
      const scale = h / (FIELD_HEIGHT + 9);
      const worldWidth = w / scale;
      let left = this.cameraX - worldWidth * 0.39;
      if (worldWidth < 120) left = clamp(left, -10, 110 - worldWidth);
      else left = -10 - (worldWidth - 120) / 2;
      const top = -4.5;
      ctx.save();
      ctx.translate(-left * scale, -top * scale);
      ctx.scale(scale, scale);
      this._drawField(ctx, left, worldWidth);
      if (this.phase === 'ready') this._drawRoutes(ctx);
      // Paint players back-to-front so overlapping players remain legible.
      const players = this.offense.map(p => ({ p, team: 'offense' })).concat(this.defense.map(p => ({ p, team: 'defense' })));
      players.sort ( (a, b) => a.p.y - b.p.y );
      for (const { p, team } of players) this._drawPlayer(ctx, p, team);
      ctx.restore();
      this._drawOverlay(ctx, w, h);
    }

    _drawField(ctx, left, worldWidth) {
      // Surround and alternating strips of turf.
      ctx.fillStyle = '#123b38';
      ctx.fillRect(-10, -3, 120, FIELD_HEIGHT + 6);
      ctx.fillStyle = '#23744e';
      ctx.fillRect(0, 0, 100, FIELD_HEIGHT);
      for (let x = 0; x < 100; x += 5) {
        ctx.fillStyle = (x / 5) % 2 ? '#237750' : '#1f6c49';
        ctx.fillRect(x, 0, 5, FIELD_HEIGHT);
      }
      ctx.fillStyle = '#174d68';
      ctx.fillRect(-10, 0, 10, FIELD_HEIGHT);
      ctx.fillStyle = '#174d68';
      ctx.fillRect(100, 0, 10, FIELD_HEIGHT);
      ctx.strokeStyle = 'rgba(255,255,255,.82)';
      ctx.lineWidth = 0.28;
      ctx.strokeRect(0, 0, 100, FIELD_HEIGHT);
      ctx.strokeRect(-10, 0, 120, FIELD_HEIGHT);

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.font = 'bold 4.2px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(105, MID);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('END ZONE', 0, 0);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.font = 'bold 4.2px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(-5, MID);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('END ZONE', 0, 0);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 0.12;
      const first = Math.max(0, Math.floor(left / 5) * 5);
      const last = Math.min(100, Math.ceil((left + worldWidth) / 5) * 5);
      for (let x = first; x <= last; x += 5) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD_HEIGHT); ctx.stroke();
        if (x > 0 && x < 100 && x % 10 === 0) {
          const number = Math.min(x, 100 - x);
          ctx.fillStyle = 'rgba(255,255,255,.65)';
          ctx.font = 'bold 2.8px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(number), x, 8);
          ctx.save();
          ctx.translate(x, FIELD_HEIGHT - 8); ctx.rotate(Math.PI);
          ctx.fillText(String(number), 0, 0);
          ctx.restore();
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 0.12;
      for (let x = Math.max(1, Math.floor(left)); x < Math.min(100, left + worldWidth + 1); x++) {
        if (x % 5 === 0) continue;
        ctx.beginPath();
        for (const y of [0, 17.7, FIELD_HEIGHT - 17.7, FIELD_HEIGHT]) {
          ctx.moveTo(x, y - 0.48); ctx.lineTo(x, y + 0.48);
        }
        ctx.stroke();
      }

      // Line of scrimmage and first-down line.
      const line = this.situation.yard;
      const firstDown = Math.min(100, line + this.situation.toGo);
      ctx.lineWidth = 0.25;
      ctx.strokeStyle = 'rgba(54, 185, 255, .9)';
      ctx.setLineDash([0.75, 0.45]);
      ctx.beginPath(); ctx.moveTo(line, 0); ctx.lineTo(line, FIELD_HEIGHT); ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 207, 63, .95)';
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(firstDown, 0); ctx.lineTo(firstDown, FIELD_HEIGHT); ctx.stroke();
      ctx.fillStyle = '#ffd04a';
      ctx.beginPath();
      ctx.moveTo(firstDown, -1.7); ctx.lineTo(firstDown - 0.9, -2.7); ctx.lineTo(firstDown + 0.9, -2.7); ctx.closePath(); ctx.fill();
    }

    _drawRoutes(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(133, 216, 255, .65)';
      ctx.fillStyle = 'rgba(170, 229, 255, .8)';
      ctx.lineWidth = 0.25;
      ctx.setLineDash([0.65, 0.45]);
      for (const p of this.offense) {
        if (p.role === 'line') continue;
        const sign = /left/i.test(this.playName) ? -1 : /right/i.test(this.playName) ? 1 : (p.homeY < MID ? -1 : 1);
        const endX = Math.min(105, p.x + (p.role === 'carrier' ? 12 : p.role === 'receiver' ? 17 : 10));
        const endY = clamp(p.y + sign * (p.role === 'carrier' ? 3 : 5), 2, FIELD_HEIGHT - 2);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 5, p.y); ctx.lineTo(endX, endY); ctx.stroke();
        ctx.save(); ctx.translate(endX, endY); ctx.rotate(Math.atan2(endY - p.y, endX - p.x - 5));
        ctx.beginPath(); ctx.moveTo(0.7, 0); ctx.lineTo(-0.5, -0.5); ctx.lineTo(-0.5, 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }

    _drawPlayer(ctx, p, team) {
      const isCarrier = p === this.carrier;
      ctx.save();
      ctx.translate(p.x, p.y);
      // Shadow, selection ring and a small directional cue.
      ctx.fillStyle = 'rgba(0,0,0,.24)';
      ctx.beginPath(); ctx.ellipse(0.2, 0.45, 1.18, 0.9, 0, 0, Math.PI * 2); ctx.fill();
      if (isCarrier) {
        ctx.strokeStyle = '#ffdb66'; ctx.lineWidth = 0.24;
        ctx.beginPath(); ctx.arc(0, 0, 1.48, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffdb66';
        ctx.beginPath(); ctx.moveTo(0, -2.05); ctx.lineTo(-0.55, -2.7); ctx.lineTo(0.55, -2.7); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = team === 'offense' ? '#258cf5' : '#e85856';
      ctx.strokeStyle = team === 'offense' ? '#bce6ff' : '#ffd4c7';
      ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.arc(0, 0, 1.03, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 0.86px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.number), 0, 0.04);
      if (isCarrier) {
        ctx.save(); ctx.rotate(p.facing);
        ctx.fillStyle = '#a65028'; ctx.strokeStyle = '#f1d2a7'; ctx.lineWidth = 0.12;
        ctx.beginPath(); ctx.ellipse(0.95, 0.45, 0.38, 0.24, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    _drawOverlay(ctx, w, h) {
      ctx.save();
      const compact = w < 480;
      const x = 16, y = 16;
      ctx.font = '700 ' + (compact ? 10 : 11) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const text = this.phase === 'playing' ? 'LIVE PLAY' : this.phase === 'ended' ? 'PLAY OVER' : 'PRE-SNAP';
      const badgeWidth = ctx.measureText(text).width + 30;
      ctx.fillStyle = 'rgba(7, 24, 31, .76)';
      this._roundedRect(ctx, x, y, badgeWidth, 27, 8); ctx.fill();
      ctx.fillStyle = this.phase === 'playing' ? '#ff6965' : '#7ee5bd';
      ctx.beginPath(); ctx.arc(x + 11, y + 13.5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4fffb'; ctx.fillText(text, x + 20, y + 14);
      if (this.phase === 'playing') {
        const barWidth = compact ? 75 : 112;
        const bx = w - barWidth - 16, by = 18;
        ctx.fillStyle = 'rgba(7,24,31,.78)'; this._roundedRect(ctx, bx - 8, by - 4, barWidth + 16, 29, 7); ctx.fill();
        ctx.fillStyle = '#c9e6d9'; ctx.font = '700 9px system-ui, sans-serif'; ctx.fillText('SPRINT', bx, by + 3);
        ctx.fillStyle = 'rgba(255,255,255,.2)'; this._roundedRect(ctx, bx, by + 10, barWidth, 5, 2.5); ctx.fill();
        if (this.stamina > 0) {
          ctx.fillStyle = this.stamina > 0.25 ? '#7ce4b5' : '#ffcc61';
          this._roundedRect(ctx, bx, by + 10, barWidth * this.stamina, 5, 2.5); ctx.fill();
        }
      } else {
        const hint = this.phase === 'ready' ? 'SPACE OR TAP TO SNAP' : 'READY FOR THE NEXT PLAY';
        ctx.font = '700 ' + (compact ? 9 : 10) + 'px system-ui, sans-serif';
        const tw = ctx.measureText(hint).width;
        ctx.fillStyle = 'rgba(7, 24, 31, .72)';
        this._roundedRect(ctx, w / 2 - tw / 2 - 14, h - 42, tw + 28, 27, 8); ctx.fill();
        ctx.fillStyle = '#e2f5ee'; ctx.fillText(hint, w / 2 - tw / 2, h - 28.5);
      }
      ctx.restore();
    }

    _roundedRect(ctx, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
  }

  window.FootballField = FootballField;
})();
