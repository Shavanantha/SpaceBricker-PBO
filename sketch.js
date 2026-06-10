// ============================================================
// SPACE BRICKER — Refactored with SOLID Principles + Vfx + Sfx
// ============================================================

// ===== GLOBAL P5.JS STATE =====
let bgMusic;
let hitSound, breakSound, powerSound;
let stars = [];
let buttons = [];

// ============================================================
// INTERFACES / ABSTRACTIONS
// ============================================================
const IMovable = (Base) => class extends Base {
  move() { throw new Error("move() harus diimplementasi!"); }
};

const IDisplayable = (Base) => class extends Base {
  display() { throw new Error("display() harus diimplementasi!"); }
};

const IClickable = (Base) => class extends Base {
  clicked() { throw new Error("clicked() harus diimplementasi!"); }
};

// ============================================================
// ABSTRACT BASE CLASS
// ============================================================
class GameObject {
  constructor(x, y) {
    if (this.constructor === GameObject) {
      throw new Error("Abstract class 'GameObject' tidak bisa dibuat langsung!");
    }
    this.x = x;
    this.y = y;
  }
}

// ============================================================
// VFX: Sistem Partikel Ledakan
// ============================================================
class Particle extends IMovable(IDisplayable(GameObject)) {
  constructor(x, y, pColor) {
    super(x, y);
    this.vx = random(-4, 4);
    this.vy = random(-4, 4);
    this.life = 255;
    this.color = pColor;
    this.size = random(3, 8);
  }
  
  move() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 15;
  }

  display() {
    push();
    noStroke();
    fill(red(this.color), green(this.color), blue(this.color), this.life);
    circle(this.x, this.y, this.size);
    pop();
  }

  isDead() {
    return this.life <= 0;
  }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  explode(x, y, baseColor) {
    for (let i = 0; i < 20; i++) {
      this.particles.push(new Particle(x, y, baseColor));
    }
  }

  updateAndDisplay() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      let p = this.particles[i];
      p.move();
      p.display();
      if (p.isDead()) {
        this.particles.splice(i, 1);
      }
    }
  }
}

// ============================================================
// SCORE, LEVEL, COLLISION, & RENDERER MANAGER
// ============================================================
class ScoreManager {
  constructor() {
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem("brickBreakerHighScore")) || 0;
  }
  addScore(points) {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("brickBreakerHighScore", this.highScore);
    }
  }
  reset() { this.score = 0; }
}

class LevelBuilder {
  buildBricks(level) {
    let bricks = [];
    if (level < 3) {
      let cols = floor(width / 95);
      let rows = level + 1;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          bricks.push(new Brick(i * 90 + (width % 90) / 2 + 5, j * 35 + 120));
        }
      }
    } else {
      bricks.push(new Brick(width / 2 - 150, 150, 300, 80, 50, true));
    }
    return bricks;
  }
}

// ============================================================
// OCP: PowerEffect & Trap Strategy Pattern
// ============================================================
class BigBallEffect { apply(balls, _game) { balls.forEach(b => { b.radius = 18; }); } }
class MultiBallEffect { apply(balls, game) { let p = game.paddle; game.addBall(new Ball(game.level, p.x + p.width / 2, p.y - 20)); } }
class FireBallEffect { apply(balls, _game) { balls.forEach(b => { b.isFire = true; b.isIce = false; }); } }
class IceBallEffect { apply(balls, _game) { balls.forEach(b => { b.isIce = true; b.isFire = false; }); } }
class ExtraLifeEffect { apply(_balls, game) { game.lives++; } }

// TRAP EFFECTS (PENGECUT / PENGECOH)
class TrapLifeEffect { 
    apply(_balls, game) { 
        game.lives--; 
        if (game.lives <= 0) game.gameState = "GameOver"; // Mati konyol karena trap
    } 
}
class TrapBossHealEffect { 
    apply(_balls, game) { 
        game.bricks.forEach(b => b.heal(10)); // Boss nambah darah
    } 
}

const POWER_EFFECTS = {
  1: new BigBallEffect(),
  2: new MultiBallEffect(),
  3: new FireBallEffect(),
  4: new IceBallEffect(),
  5: new ExtraLifeEffect(),
  6: new TrapLifeEffect(), // Trap Nyawa (Pengecoh)
  7: new TrapBossHealEffect() // Trap Boss Heal (Pengecoh)
};

class CollisionSystem {
  checkWall(ball) {
    if (ball.x <= ball.radius) {
        ball.x = ball.radius; 
        ball.speedX = Math.abs(ball.speedX); 
    } else if (ball.x >= width - ball.radius) {
        ball.x = width - ball.radius; 
        ball.speedX = -Math.abs(ball.speedX); 
    }
    if (ball.y <= ball.radius) {
        ball.y = ball.radius; 
        ball.speedY = Math.abs(ball.speedY); 
    }
  }
  
  checkPaddle(ball, paddle) {
    if (ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height && 
        ball.x + ball.radius >= paddle.x && ball.x - ball.radius <= paddle.x + paddle.width && 
        ball.speedY > 0) {
      
      ball.speedY = -Math.abs(ball.speedY);
      ball.y = paddle.y - ball.radius; 
      
      let hitPoint = ball.x - (paddle.x + paddle.width / 2);
      let maxSpeed = ball._baseSpeed * 1.5; 
      ball.speedX = constrain(hitPoint * 0.25, -maxSpeed, maxSpeed);
      
      if (hitSound) {
          hitSound.playMode('sustain');
          hitSound.play();
      }
    }
  }
  
  checkBricks(ball, bricks) {
    for (let b of bricks) {
      if (!b.isDestroyed()) {
        let ox = b.getOffset();
        if (ball.x + ball.radius > b.x + ox && ball.x - ball.radius < b.x + b.width + ox && 
            ball.y + ball.radius > b.y && ball.y - ball.radius < b.y + b.height) {
          
          let hitResult = b.takeHit(ball.isFire);
          
          let overlapTop = (ball.y + ball.radius) - b.y;
          let overlapBottom = (b.y + b.height) - (ball.y - ball.radius);
          let overlapLeft = (ball.x + ball.radius) - (b.x + ox);
          let overlapRight = (b.x + b.width + ox) - (ball.x - ball.radius);

          let minOverlap = Math.min(overlapTop, overlapBottom, overlapLeft, overlapRight);

          if (minOverlap === overlapTop) {
              ball.speedY = -Math.abs(ball.speedY);
              ball.y = b.y - ball.radius; 
          } else if (minOverlap === overlapBottom) {
              ball.speedY = Math.abs(ball.speedY);
              ball.y = b.y + b.height + ball.radius; 
          } else if (minOverlap === overlapLeft) {
              ball.speedX = -Math.abs(ball.speedX);
              ball.x = b.x + ox - ball.radius; 
          } else if (minOverlap === overlapRight) {
              ball.speedX = Math.abs(ball.speedX);
              ball.x = b.x + b.width + ox + ball.radius; 
          }
          
          return hitResult; 
        }
      }
    }
    return null;
  }
  
  checkPowerUpCatch(powerUp, paddle) {
    return (powerUp.y + 12.5 > paddle.y && powerUp.y - 12.5 < paddle.y + paddle.height && 
            powerUp.x + 12.5 > paddle.x && powerUp.x - 12.5 < paddle.x + paddle.width) ? powerUp : null;
  }
}

class Renderer {
  drawBackground(level) {
    let topColor = level === 1 ? color(20, 30, 80) : level === 2 ? color(60, 20, 60) : color(10, 40, 40);
    background(topColor);
    drawStars();
  }
  drawUI(score, lives, level) {
    push();
    fill(255); noStroke(); textAlign(LEFT); textSize(20); textStyle(BOLD);
    text("SCORE: " + score, 30, 45);
    text("LIVES: " + "❤️".repeat(max(0, lives)), 30, 80);
    textAlign(RIGHT); text("LEVEL: " + level, width - 30, 45);
    pop();
  }
  drawOverlay(title, subtitle) {
    fill(0, 200); rect(0, 0, width, height); fill(255); textAlign(CENTER, CENTER);
    textSize(50); textStyle(BOLD); text(title, width / 2, height / 2 - 40);
    textSize(22); textStyle(NORMAL); text(subtitle, width / 2, height / 2 + 50);
  }
  drawMenu(highScore) {
    fill(0, 180); rect(0, 0, width, height); fill(255); textAlign(CENTER);
    textSize(80); textStyle(BOLD); drawingContext.shadowBlur = 25; drawingContext.shadowColor = 'cyan';
    fill(0, 255, 255); text("SPACE BRICKER", width / 2, height / 4);
    drawingContext.shadowBlur = 0; textSize(22); fill(255);
    text("HIGH SCORE: " + highScore, width / 2, height / 4 + 65);
    buttons.forEach(btn => btn.display());
    this._drawInfoBox(width / 2 - 320, height / 2 + 100, 300, 210, "CARA BERMAIN", ["- Panah Kiri/Kanan: Gerak", "- Hancurkan bata naik level", "- Jangan biarkan bola jatuh"]);
    
    // UPDATE: Penjelasan info box untuk powerup dan Trap
    this._drawInfoBox(width / 2 + 20, height / 2 + 100, 310, 210, "PLANET ABILITIES", [
        "🟠 Api  | 🔵 Es  | 🌀 Multi-ball", 
        "💗 +1 Nyawa", 
        "⚠️ AWAS PENGECUT (Lvl 3):", 
        "💀 Ungu: Nyawa -1", 
        "👹 Merah Gelap: Boss HP +10"
    ]);
  }
  _drawInfoBox(x, y, w, h, title, lines) {
    push(); fill(255, 15); stroke(0, 255, 255, 50); rect(x, y, w, h, 15);
    fill(0, 255, 255); textAlign(LEFT); textStyle(BOLD); textSize(18); text(title, x + 20, y + 35);
    fill(230); textStyle(NORMAL); textSize(15);
    for (let i = 0; i < lines.length; i++) { text(lines[i], x + 20, y + 65 + i * 25); }
    pop();
  }
}

// ============================================================
// SUBCLASSES
// ============================================================
class PowerUp extends IMovable(IDisplayable(GameObject)) {
  // UPDATE: Tambahkan pType agar Game.js bisa mengatur tipe planetnya
  constructor(x, y, pType) {
    super(x, y);
    this.size = 25; this.speed = 3;
    this.type = pType || floor(random(1, 6));
    
    // Warna untuk power up (1-5 Baik, 6-7 Trap Pengecoh)
    this.pColor = [
        color(0, 255, 100),   // 1
        color(0, 200, 255),   // 2
        color(255, 100, 0),   // 3
        color(100, 200, 255), // 4
        color(255, 50, 100),  // 5 (+ Nyawa)
        color(128, 0, 128),   // 6 (TRAP UNGU - Nyawa)
        color(150, 0, 0)      // 7 (TRAP MERAH GELAP - Heal Boss)
    ][this.type - 1];
  }
  move() { let f = 60 / (frameRate() || 60); this.y += this.speed * f; }
  display() {
    push(); drawingContext.shadowBlur = 15; drawingContext.shadowColor = this.pColor;
    fill(this.pColor); noStroke(); circle(this.x, this.y, this.size);
    stroke(255, 150); strokeWeight(1); noFill(); this._drawTexture();
    fill(255, 180); noStroke(); circle(this.x - 4, this.y - 4, 4); pop();
  }
  _drawTexture() {
    if (this.type === 2) { 
        ellipse(this.x, this.y, this.size + 10, 5); 
    } 
    else if (this.type === 5) {
        stroke(255); strokeWeight(3);
        line(this.x - 5, this.y, this.x + 5, this.y);
        line(this.x, this.y - 5, this.x, this.y + 5);
    } 
    else if (this.type === 6) { // Tekstur Trap Nyawa (Silang/Tengkorak)
        stroke(255, 100, 100); strokeWeight(3);
        line(this.x - 5, this.y - 5, this.x + 5, this.y + 5);
        line(this.x + 5, this.y - 5, this.x - 5, this.y + 5);
    }
    else if (this.type === 7) { // Tekstur Trap Boss Heal (Panah Atas)
        stroke(255, 100, 100); strokeWeight(3);
        line(this.x, this.y + 5, this.x, this.y - 6);
        line(this.x, this.y - 6, this.x - 4, this.y - 2);
        line(this.x, this.y - 6, this.x + 4, this.y - 2);
    }
    else { 
        line(this.x - 8, this.y - 3, this.x + 8, this.y - 3); 
        line(this.x - 6, this.y + 3, this.x + 6, this.y + 3); 
    }
  }
}

class Button extends IClickable(IDisplayable(GameObject)) {
  constructor(x, y, w, h, label, callback) {
    super(x, y); this.w = w; this.h = h; this.label = label; this.callback = callback; this.isHover = false;
  }
  display() {
    this.isHover = mouseX > this.x && mouseX < this.x + this.w && mouseY > this.y && mouseY < this.y + this.h;
    push(); drawingContext.shadowBlur = this.isHover ? 30 : 10; drawingContext.shadowColor = 'cyan';
    stroke(0, 255, 255, 200); strokeWeight(this.isHover ? 3 : 1);
    fill(this.isHover ? color(0, 255, 255, 80) : color(0, 40)); rect(this.x, this.y, this.w, this.h, 15);
    noStroke(); fill(255); textAlign(CENTER, CENTER); textSize(18); textStyle(BOLD);
    text(this.label, this.x + this.w / 2, this.y + this.h / 2); pop();
  }
  clicked() { if (this.isHover) this.callback(); }
}

class Paddle extends IMovable(IDisplayable(GameObject)) {
  constructor() {
    super(width / 2 - 65, height - 70); this.width = 130; this.height = 18; this.speed = 13;
  }
  move() {
    let f = 60 / (frameRate() || 60);
    if (keyIsDown(LEFT_ARROW) && this.x > 0) this.x -= this.speed * f;
    if (keyIsDown(RIGHT_ARROW) && this.x < width - this.width) this.x += this.speed * f;
  }
  display() {
    push(); drawingContext.shadowBlur = 20; drawingContext.shadowColor = 'cyan';
    fill(255); stroke(0, 255, 255); strokeWeight(2); rect(this.x, this.y, this.width, this.height, 10);
    noStroke(); fill(255, 100); rect(this.x + 5, this.y + 3, this.width - 10, 3, 5); pop();
  }
}

class Brick extends IDisplayable(GameObject) {
  constructor(x, y, w, h, hp, isBoss) {
    super(x, y);
    this.width = w || 75; this.height = h || 25;
    this._maxHealth = hp || floor(random(1, 4)); this._health = this._maxHealth;
    this.isBoss = isBoss || false;
    
    this.baseColor = isBoss ? color(255, 0, 100) : color(random(100, 255), random(100, 255), 255);
    this._destroyed = false;
    this.craterX = random(10, 30); this.craterY = random(5, 15);
    this._level = 1;
  }
  setLevel(level) { this._level = level; }
  getOffset() { return this.isBoss ? sin(frameCount * 0.03) * 60 : (this._level === 2 ? sin(frameCount * 0.05) * 20 : 0); }
  
  // Fungsi heal baru untuk bos
  heal(amount) {
      if (this.isBoss && !this._destroyed) {
          this._health += amount;
          if (this._health > this._maxHealth) this._health = this._maxHealth; // max 50
      }
  }

  display() {
    if (!this._destroyed) {
      push(); 
      let ox = this.getOffset(); 
      let a = map(this._health, 0, this._maxHealth, 150, 255);
      
      fill(red(this.baseColor), green(this.baseColor), blue(this.baseColor), a);
      stroke(255, 80); strokeWeight(1.5); rect(this.x + ox, this.y, this.width, this.height, 5);
      fill(0, 60); noStroke(); circle(this.x + ox + this.craterX, this.y + this.craterY, 8);
      circle(this.x + ox + this.width - 15, this.y + this.height - 10, 5);
      
      if (this.isBoss) {
        fill(30); stroke(255, 50); rect(this.x + ox, this.y - 30, this.width, 12, 6);
        let barWidth = map(this._health, 0, this._maxHealth, 0, this.width);
        let barColor = lerpColor(color(255, 0, 50), color(0, 255, 100), this._health / this._maxHealth);
        fill(barColor); noStroke(); rect(this.x + ox, this.y - 30, barWidth, 12, 6);
        fill(255); textAlign(CENTER); textSize(12); textStyle(BOLD);
        text("BOSS HP: " + floor((this._health / this._maxHealth) * 100) + "%", this.x + ox + this.width / 2, this.y - 35);
      }
      pop();
    }
  }
  
  takeHit(isFire = false) {
    if (isFire) { 
        if (this.isBoss) {
            this._health -= 10;
        } else {
            this._health = 0; 
        }
    } else { 
        this._health--; 
    }
    
    if (this._health <= 0) {
        this._health = 0;
        this._destroyed = true;
    }
    
    const spawnMinion = this.isBoss && !this._destroyed && (this._health > 0 && this._health % 10 === 0);
    return { destroyed: this._destroyed, isBoss: this.isBoss, spawnMinion, brickX: this.x + this.width / 2, brickY: this.y + this.height / 2, color: this.baseColor };
  }
  
  forceDestroy() { this._health = 0; this._destroyed = true; }
  isDestroyed() { return this._destroyed; }
}

class Ball extends IMovable(IDisplayable(GameObject)) {
  constructor(level, x, y) {
    super(x || width / 2, y || height / 2);
    this.radius = 9; this.isFire = false; this.isIce = false;
    this._baseSpeed = 5 + (level * 0.5);
    this.speedX = random([-1, 1]) * this._baseSpeed;
    this.speedY = -this._baseSpeed;
  }
  move() { let f = 60 / (frameRate() || 60); this.x += this.speedX * f; this.y += this.speedY * f; }
  display() {
    push(); drawingContext.shadowBlur = 15; drawingContext.shadowColor = this.isFire ? 'orange' : this.isIce ? 'cyan' : 'white';
    fill(this.isFire ? [255, 69, 0] : this.isIce ? [0, 191, 255] : [255, 255, 255]);
    noStroke(); circle(this.x, this.y, this.radius * 2);
    stroke(0, 50); strokeWeight(1); line(this.x - this.radius + 3, this.y - 3, this.x + this.radius - 3, this.y - 3);
    line(this.x - this.radius + 2, this.y + 2, this.x + this.radius - 2, this.y + 2);
    fill(255, 150); noStroke(); circle(this.x - 3, this.y - 3, 3); pop();
  }
}

// ============================================================
// GAME MANAGER
// ============================================================
class Game {
  constructor() {
    this.scoreManager = new ScoreManager();
    this.levelBuilder = new LevelBuilder();
    this.collision = new CollisionSystem();
    this.renderer = new Renderer();
    this.particleSystem = new ParticleSystem();

    this.gameState = "Menu";
    this.level = 1;
    this.lives = 3;
    this.shake = 0;
    this.balls = [];
    this.bricks = [];
    this.powerUps = [];

    this.initLevel();
  }

  initLevel() {
    this.balls = [new Ball(this.level)];
    this.paddle = new Paddle();
    this.bricks = this.levelBuilder.buildBricks(this.level);
    this.bricks.forEach(b => b.setLevel(this.level));
    this.powerUps = [];
  }

  addBall(ball) { this.balls.push(ball); }

  spawnMinion() {
    let hpRandom = floor(random(1, 4));
    let minion = new Brick(random(100, width - 100), random(height / 2, height - 200), 75, 25, hpRandom, false);
    minion.setLevel(this.level);
    this.bricks.push(minion);
  }

  update() {
    if (this.gameState !== "Playing") return;

    if (this.shake > 0) this.shake--;
    this.paddle.move();

    for (let i = this.balls.length - 1; i >= 0; i--) {
      let b = this.balls[i];
      b.move();
      this.collision.checkWall(b);
      this.collision.checkPaddle(b, this.paddle);

      let hitResult = this.collision.checkBricks(b, this.bricks);
      if (hitResult) {
        this.scoreManager.addScore(10);
        
        if (breakSound) {
            breakSound.playMode('sustain');
            breakSound.play();
        }
        
        if (hitResult.destroyed) {
            this.particleSystem.explode(hitResult.brickX, hitResult.brickY, hitResult.color);
            
            // FIX: Drop rate normal 15%, tapi kalau Level 3 turun drastis jadi 8%
            let dropChance = this.level === 3 ? 0.08 : 0.15;
            
            if (random(1) < dropChance) { 
                let pType = floor(random(1, 6)); // Tipe 1-5
                
                // Khusus level 3, ada peluang 40% dari planet yang drop itu PENGECUT/TRAP (Tipe 6 atau 7)
                if (this.level === 3 && random(1) < 0.40) {
                    pType = floor(random(6, 8)); // Akan menghasilkan tipe 6 atau 7
                }
                
                this.powerUps.push(new PowerUp(hitResult.brickX, hitResult.brickY, pType)); 
            }
        }

        if (hitResult.isBoss) this.shake = 10;
        if (hitResult.spawnMinion) this.spawnMinion();
      }

      if (b.y > height) this.balls.splice(i, 1);
    }

    if (this.balls.length === 0) this.gameState = "LoseState";

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      let p = this.powerUps[i];
      p.move();
      if (this.collision.checkPowerUpCatch(p, this.paddle)) {
        
        if (powerSound) {
            powerSound.playMode('sustain');
            powerSound.play();
        }
        
        POWER_EFFECTS[p.type]?.apply(this.balls, this);
        this.powerUps.splice(i, 1);
      } else if (p.y > height) {
        this.powerUps.splice(i, 1);
      }
    }

    this.checkWinCondition();
  }

  render() {
    this.renderer.drawBackground(this.level);

    if (this.gameState === "Menu") {
      this.renderer.drawMenu(this.scoreManager.highScore);
    } else {
      push();
      if (this.shake > 0) translate(random(-5, 5), random(-5, 5));
      this.bricks.forEach(br => br.display());
      this.paddle.display();
      this.balls.forEach(b => b.display());
      this.powerUps.forEach(p => p.display());
      
      this.particleSystem.updateAndDisplay();
      pop();

      this.renderer.drawUI(this.scoreManager.score, this.lives, this.level);

      if (this.gameState === "LoseState") this.renderer.drawOverlay("LANJUT PERMAINAN?", "TEKAN 'C' UNTUK LANJUT | 'R' RESET");
      else if (this.gameState === "GameOver") this.renderer.drawOverlay("GAME OVER", "TEKAN 'ENTER' UNTUK KE MENU");
      else if (this.gameState === "Win") this.renderer.drawOverlay("VICTORY!", "MISSION COMPLETE\n'ENTER' KE MENU");
    }
  }

  restartGame() {
    this.level = 1; this.scoreManager.reset(); this.lives = 3; this.initLevel(); this.gameState = "Playing";
  }

  continueGame() {
    this.lives--;
    if (this.lives <= 0) this.gameState = "GameOver";
    else { this.balls = [new Ball(this.level)]; this.gameState = "Playing"; }
  }

  checkWinCondition() {
    if (this.bricks.length > 0) {
      let isWin = false;
      
      if (this.level === 3) {
          isWin = this.bricks.filter(b => b.isBoss).every(b => b.isDestroyed());
      } else {
          isWin = this.bricks.every(b => b.isDestroyed());
      }

      if (isWin) {
        if (this.level < 3) { this.level++; this.initLevel(); this.gameState = "Playing"; }
        else this.gameState = "Win";
      }
    }
  }
}

// ============================================================
// P5.JS FUNCTIONS
// ============================================================
function preload() {
  try { bgMusic = loadSound('bg.mp3'); } catch (e) {}
  try { hitSound = loadSound('hit.mp3'); } catch (e) {}
  try { breakSound = loadSound('break.mp3'); } catch (e) {}
  try { powerSound = loadSound('powerup.mp3'); } catch (e) {}
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);
  setupStars();
  game = new Game();
  createMenuButtons();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setupStars();
  createMenuButtons();
}

function createMenuButtons() {
  buttons = [];
  buttons.push(new Button(width / 2 - 100, height / 2 - 20, 200, 50, "MULAI GAME", () => {
    game.restartGame();
    if (bgMusic && !bgMusic.isPlaying()) { bgMusic.setVolume(0.3); bgMusic.loop(); }
  }));
}

function setupStars() {
  stars = [];
  for (let i = 0; i < 150; i++) {
    stars.push({ x: random(width), y: random(height), size: random(1, 3), speed: random(0.5, 2.5) });
  }
}

function drawStars() {
  fill(255, 180); noStroke();
  for (let s of stars) { 
    circle(s.x, s.y, s.size); 
    s.y += s.speed; 
    if (s.y > height) { 
        s.y = 0;
        s.x = random(width);
    }
  }
}

function draw() { game.update(); game.render(); }

function mousePressed() {
  if (game.gameState === "Menu") { buttons.forEach(btn => btn.clicked()); }
}

function keyPressed() {
  if (game.gameState === "LoseState") {
    if (key === 'c' || key === 'C') game.continueGame();
    if (key === 'r' || key === 'R') game.restartGame();
  }
  if ((game.gameState === "GameOver" || game.gameState === "Win") && keyCode === ENTER) {
    game.gameState = "Menu";
  }
}