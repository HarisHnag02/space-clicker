(function() {
    'use strict';

    // =============================================
    // GAME CONFIGURATION
    // =============================================
    const CONFIG = {
        SAVE_KEY: 'spaceClickerSave',
        SAVE_VERSION: 1,
        SAVE_INTERVAL: 10000, // 10 seconds
        TICK_INTERVAL: 1000, // 1 second for economy calculations
        UI_UPDATE_INTERVAL: 100, // 10 FPS for UI
        MAX_OFFLINE_TIME: 86400, // 24 hours in seconds

        OBJECTS: {
            // Human-only collectibles (player must click) - EASY EARLY, HARD LATER
            smallRock: { baseYield: 1, spawnRate: 400, maxOnScreen: 12, size: 18, unlockTier: 0, humanOnly: true, color: '#8B7355' },
            comet: { baseYield: 8, spawnRate: 3000, maxOnScreen: 3, size: 28, unlockTier: 1, humanOnly: true, speed: 2, color: '#87CEEB' },
            nebula: { baseYield: 35, spawnRate: 10000, maxOnScreen: 2, size: 45, unlockTier: 2, humanOnly: true, color: '#DA70D6' },
            
            // Drone collectibles (automated collection) - ABUNDANT EARLY
            asteroid: { baseYield: 5, spawnRate: 600, maxOnScreen: 15, size: 30, unlockTier: 0, droneType: 'drone', color: '#A0826D' },
            spaceDebris: { baseYield: 3, spawnRate: 1000, maxOnScreen: 10, size: 22, unlockTier: 1, droneType: 'drone', color: '#696969' },
            crystalAsteroid: { baseYield: 20, spawnRate: 6000, maxOnScreen: 3, size: 32, unlockTier: 2, droneType: 'any', color: '#00CED1', rare: true },
            
            // Mining Ship targets - GENEROUS EARLY
            planet: { baseYield: 20, spawnRate: 2500, maxOnScreen: 6, size: 50, unlockTier: 0, droneType: 'miningShip', color: '#4A9EFF' },
            
            // Warp Probe targets - RARE LATE GAME
            star: { baseYield: 100, spawnRate: 15000, maxOnScreen: 2, size: 70, unlockTier: 3, droneType: 'warpProbe', color: '#FFD700' },
            
            // Bonus (both can collect)
            satellite: { baseYield: 3, spawnRate: 0, maxOnScreen: 1, size: 25, unlockTier: 0, multiplier: 2, droneType: 'any', color: '#C0C0C0' }
        },

        HARVESTERS: {
            drone: { pps: 1, baseCost: 50, unlockTier: 1, name: 'Drone', maxOwned: 10, description: 'Collects asteroids and debris' },
            miningShip: { pps: 10, baseCost: 600, unlockTier: 2, name: 'Mining Ship', maxOwned: 8, description: 'Mines planets for resources' },
            warpProbe: { pps: 100, baseCost: 8000, unlockTier: 3, name: 'Warp Probe', maxOwned: 5, description: 'Harvests energy from stars' }
        },

        UPGRADES: {
            clickPower: { baseCost: 100, scale: 1.5, effect: 1, name: 'Click Power' },
            efficiency: { baseCost: 250, scale: 2.0, effect: 1.5, name: 'Efficiency' },
            autoClicker: { baseCost: 1000, scale: 1.9, effect: 1, name: 'Auto-Clicker' }
        },

        TIERS: [
            { name: 'Sol System', cost: 0, multiplier: 1.0, spawnPenalty: 1.0 },
            { name: 'Asteroid Belt', cost: 10000, multiplier: 1.2, spawnPenalty: 1.3 },
            { name: 'Outer Planets', cost: 100000, multiplier: 1.5, spawnPenalty: 1.8 },
            { name: 'Galaxy', cost: 1000000, multiplier: 2.0, spawnPenalty: 2.5 }
        ],

        ACHIEVEMENTS: {
            firstAsteroid: { condition: () => gameState.stats.totalClicks >= 10, reward: 0.05, name: 'First Asteroid', description: 'Click 10 times' },
            stellarEngineer: { condition: () => gameState.stats.starsClicked >= 1, reward: 0, name: 'Stellar Engineer', description: 'Click your first star' },
            millionaire: { condition: () => gameState.stats.lifetimeParticles >= 1000000, reward: 0, name: 'Millionaire', description: 'Earn 1 million particles' }
        }
    };

    // =============================================
    // GAME STATE
    // =============================================
    let gameState = {
        version: CONFIG.SAVE_VERSION,
        particles: 0,
        warpShards: 0,
        harvesters: { drone: 0, miningShip: 0, warpProbe: 0 },
        upgrades: { clickPower: 0, efficiency: 0, autoClicker: 0 },
        tier: 0,
        prestigeCount: 0,
        achievements: [],
        stats: {
            totalClicks: 0,
            starsClicked: 0,
            lifetimeParticles: 0,
            objectsDestroyed: 0,
            playtime: 0
        },
        difficulty: {
            spawnRateMultiplier: 1.0, // Increases spawn time as game progresses
            yieldDiminishing: 1.0 // Reduces effectiveness at high levels
        },
        tutorialStep: 0,
        showHelp: true,
        lastPlayed: Date.now()
    };

    // =============================================
    // CANVAS & RENDERING
    // =============================================
    let canvas, ctx;
    let canvasWidth, canvasHeight;
    let objectPool = [];
    let particleEffects = [];
    let lastSpawnTimes = {};
    let droneAnimations = [];
    
    // Ad System State
    let adState = {
        rewardedAdCooldown: 0,
        bonusActive: false,
        bonusTimeLeft: 0,
        interstitialCounter: 0,
        lastInterstitialTime: 0
    };

    class SpaceObject {
        constructor(type) {
            this.type = type;
            this.active = false;
            this.x = 0;
            this.y = 0;
            this.size = CONFIG.OBJECTS[type].size;
            this.rotation = 0;
            this.rotationSpeed = (Math.random() - 0.5) * 0.02;
            this.pulsePhase = Math.random() * Math.PI * 2;
            this.maxHealth = type === 'planet' ? 100 : (type === 'asteroid' ? 50 : 1);
            this.health = this.maxHealth;
            this.isBeingMined = false;
            this.craterPattern = Math.random(); // Unique pattern for each object
        }

        spawn() {
            this.active = true;
            
            // Try to find a position that doesn't overlap with other objects
            let attempts = 0;
            let validPosition = false;
            
            while (!validPosition && attempts < 20) {
                this.x = Math.random() * (canvasWidth - this.size * 2) + this.size;
                this.y = Math.random() * (canvasHeight - this.size * 2) + this.size;
                
                // Check if this position overlaps with any active object
                validPosition = true;
                for (let other of objectPool) {
                    if (other === this || !other.active) continue;
                    
                    const dx = this.x - other.x;
                    const dy = this.y - other.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const minDistance = this.size + other.size + 20; // 20px padding
                    
                    if (distance < minDistance) {
                        validPosition = false;
                        break;
                    }
                }
                
                attempts++;
            }
            
            this.rotation = Math.random() * Math.PI * 2;
            this.maxHealth = this.type === 'planet' ? 100 : (this.type === 'asteroid' ? 50 : 1);
            this.health = this.maxHealth;
            this.isBeingMined = false;
        }

        despawn() {
            this.active = false;
            this.isBeingMined = false;
        }

        takeDamage(amount) {
            this.health -= amount;
            if (this.health <= 0) {
                return true; // Object destroyed
            }
            return false;
        }

        update() {
            this.rotation += this.rotationSpeed;
            this.pulsePhase += 0.05;
            
            // Move comets across the screen
            if (this.type === 'comet' && this.active) {
                const config = CONFIG.OBJECTS[this.type];
                const speed = config.speed || 0;
                this.x -= speed; // Move left
                
                // Respawn on right side when it goes off screen
                if (this.x < -this.size) {
                    this.x = canvasWidth + this.size;
                    this.y = Math.random() * (canvasHeight - this.size * 2) + this.size;
                }
            }
        }

        draw() {
            if (!this.active) return;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);

            const pulse = Math.sin(this.pulsePhase) * 0.1 + 1;

            switch (this.type) {
                case 'smallRock':
                    this.drawSmallRock(pulse);
                    break;
                case 'asteroid':
                    this.drawAsteroid(pulse);
                    break;
                case 'comet':
                    this.drawComet(pulse);
                    break;
                case 'spaceDebris':
                    this.drawSpaceDebris(pulse);
                    break;
                case 'crystalAsteroid':
                    this.drawCrystalAsteroid(pulse);
                    break;
                case 'nebula':
                    this.drawNebula(pulse);
                    break;
                case 'planet':
                    this.drawPlanet(pulse);
                    break;
                case 'star':
                    this.drawStar(pulse);
                    break;
                case 'satellite':
                    this.drawSatellite(pulse);
                    break;
            }

            ctx.restore();
        }

        drawAsteroid(pulse) {
            const size = this.size * pulse;
            const healthPercent = this.health / this.maxHealth;
            
            // Main body with texture
            const gradient = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.1, 0, 0, size);
            gradient.addColorStop(0, '#a0826d');
            gradient.addColorStop(0.6, '#7a6050');
            gradient.addColorStop(1, '#5a4535');
            ctx.fillStyle = gradient;
            
            // Irregular shape
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const variance = 0.8 + Math.sin(this.craterPattern * 10 + i) * 0.2;
                const r = size * variance;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Craters with variation
            ctx.fillStyle = 'rgba(50, 40, 30, 0.6)';
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5 + this.craterPattern) * Math.PI * 2;
                const distance = size * 0.3 + Math.sin(this.craterPattern * 5 + i) * size * 0.2;
                const cx = Math.cos(angle) * distance;
                const cy = Math.sin(angle) * distance;
                const craterSize = size * (0.15 + Math.sin(this.craterPattern * 7 + i) * 0.1);
                ctx.beginPath();
                ctx.arc(cx, cy, craterSize, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Health indicator when damaged
            if (healthPercent < 1) {
                ctx.strokeStyle = healthPercent > 0.5 ? '#ffff00' : '#ff0000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2 * healthPercent);
                ctx.stroke();
            }
        }

        drawPlanet(pulse) {
            const size = this.size * pulse;
            const healthPercent = this.health / this.maxHealth;
            
            // Planet body with better gradient
            const gradient = ctx.createRadialGradient(-size * 0.4, -size * 0.4, size * 0.1, 0, 0, size * 1.2);
            
            // Vary planet colors based on pattern
            if (this.craterPattern > 0.66) {
                gradient.addColorStop(0, '#7cb3ff');
                gradient.addColorStop(0.5, '#4a9eff');
                gradient.addColorStop(1, '#1a5fb4');
            } else if (this.craterPattern > 0.33) {
                gradient.addColorStop(0, '#ffb366');
                gradient.addColorStop(0.5, '#ff8533');
                gradient.addColorStop(1, '#cc5500');
            } else {
                gradient.addColorStop(0, '#66ff99');
                gradient.addColorStop(0.5, '#33cc66');
                gradient.addColorStop(1, '#008844');
            }
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Atmospheric glow
            ctx.shadowBlur = 15;
            ctx.shadowColor = gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            
            // Surface features (continents/clouds)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4 + this.craterPattern) * Math.PI * 2;
                const cx = Math.cos(angle + this.rotation) * size * 0.4;
                const cy = Math.sin(angle + this.rotation) * size * 0.4;
                ctx.beginPath();
                ctx.ellipse(cx, cy, size * 0.3, size * 0.2, angle, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Rings
            ctx.strokeStyle = 'rgba(200, 200, 150, 0.7)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 1.5, size * 0.3, 0.3, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(180, 180, 130, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 1.7, size * 0.35, 0.3, 0, Math.PI * 2);
            ctx.stroke();
            
            // Health indicator
            if (healthPercent < 1) {
                ctx.strokeStyle = healthPercent > 0.3 ? '#00ff00' : '#ff0000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(0, -size - 10, size * 0.8, Math.PI, Math.PI + Math.PI * 2 * healthPercent);
                ctx.stroke();
            }
        }

        drawStar(pulse) {
            const size = this.size * pulse;
            const spikes = 8;
            
            // Outer glow
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
            gradient.addColorStop(0, 'rgba(255, 255, 100, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 150, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Core
            const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
            coreGradient.addColorStop(0, '#ffffcc');
            coreGradient.addColorStop(0.4, '#ffff00');
            coreGradient.addColorStop(0.7, '#ffaa00');
            coreGradient.addColorStop(1, '#ff6600');
            ctx.fillStyle = coreGradient;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Spikes
            ctx.fillStyle = '#ffff88';
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? size * 1.3 : size * 0.7;
                const angle = (i * Math.PI) / spikes + this.rotation;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Flares
            ctx.strokeStyle = 'rgba(255, 255, 200, 0.6)';
            ctx.lineWidth = 3;
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2 + this.rotation * 0.5;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * size * 1.8, Math.sin(angle) * size * 1.8);
                ctx.stroke();
            }
            
            // Achievement glow
            const hasAchievement = gameState.achievements.includes('stellarEngineer');
            if (hasAchievement) {
                ctx.shadowBlur = 40;
                ctx.shadowColor = '#ffff00';
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(0, 0, size * 1.4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        drawSatellite(pulse) {
            const size = this.size * pulse;
            
            // Main body with metallic gradient
            const bodyGrad = ctx.createLinearGradient(-size * 0.5, 0, size * 0.5, 0);
            bodyGrad.addColorStop(0, '#a0a0a0');
            bodyGrad.addColorStop(0.5, '#e0e0e0');
            bodyGrad.addColorStop(1, '#a0a0a0');
            ctx.fillStyle = bodyGrad;
            ctx.fillRect(-size * 0.5, -size * 0.5, size, size);
            
            // Body details
            ctx.fillStyle = '#707070';
            ctx.fillRect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.15);
            ctx.fillRect(-size * 0.4, size * 0.25, size * 0.8, size * 0.15);
            
            // Solar panels (left)
            const panelGrad1 = ctx.createLinearGradient(-size * 1.4, 0, -size * 0.9, 0);
            panelGrad1.addColorStop(0, '#1a3a8a');
            panelGrad1.addColorStop(0.5, '#3a5aff');
            panelGrad1.addColorStop(1, '#1a3a8a');
            ctx.fillStyle = panelGrad1;
            ctx.fillRect(-size * 1.4, -size * 0.4, size * 0.5, size * 0.8);
            
            // Panel grid
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(-size * 1.4 + i * (size * 0.5 / 4), -size * 0.4);
                ctx.lineTo(-size * 1.4 + i * (size * 0.5 / 4), size * 0.4);
                ctx.stroke();
            }
            
            // Solar panels (right)
            const panelGrad2 = ctx.createLinearGradient(size * 0.9, 0, size * 1.4, 0);
            panelGrad2.addColorStop(0, '#1a3a8a');
            panelGrad2.addColorStop(0.5, '#3a5aff');
            panelGrad2.addColorStop(1, '#1a3a8a');
            ctx.fillStyle = panelGrad2;
            ctx.fillRect(size * 0.9, -size * 0.4, size * 0.5, size * 0.8);
            
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(size * 0.9 + i * (size * 0.5 / 4), -size * 0.4);
                ctx.lineTo(size * 0.9 + i * (size * 0.5 / 4), size * 0.4);
                ctx.stroke();
            }
            
            // Antenna
            ctx.strokeStyle = '#909090';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -size * 0.5);
            ctx.lineTo(0, -size * 1.3);
            ctx.stroke();
            
            // Antenna dish
            ctx.fillStyle = '#b0b0b0';
            ctx.beginPath();
            ctx.ellipse(0, -size * 1.3, size * 0.2, size * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Blinking light
            const blink = Math.sin(Date.now() / 200) > 0;
            if (blink) {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(size * 0.3, -size * 0.3, size * 0.1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        drawSmallRock(pulse) {
            const size = this.size * pulse;
            // Simple gray rock
            ctx.fillStyle = '#6B5345';
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const r = size * (0.7 + Math.sin(this.craterPattern * 5 + i) * 0.3);
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Highlight to show it's clickable
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        drawComet(pulse) {
            const size = this.size * pulse;
            
            // Comet tail (only visible when moving)
            const tailLength = size * 3;
            const tailGrad = ctx.createLinearGradient(0, 0, -tailLength, 0);
            tailGrad.addColorStop(0, 'rgba(135, 206, 235, 0.8)');
            tailGrad.addColorStop(0.5, 'rgba(135, 206, 235, 0.3)');
            tailGrad.addColorStop(1, 'rgba(135, 206, 235, 0)');
            ctx.fillStyle = tailGrad;
            ctx.fillRect(-tailLength, -size * 0.3, tailLength, size * 0.6);
            
            // Comet head
            const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
            coreGrad.addColorStop(0, '#FFFFFF');
            coreGrad.addColorStop(0.5, '#87CEEB');
            coreGrad.addColorStop(1, '#4682B4');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Glow effect for human-clickable indicator
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, size * 1.1, 0, Math.PI * 2);
            ctx.stroke();
        }

        drawSpaceDebris(pulse) {
            const size = this.size * pulse;
            
            // Irregular metallic debris
            ctx.fillStyle = '#696969';
            ctx.beginPath();
            ctx.moveTo(size, 0);
            ctx.lineTo(size * 0.5, size * 0.7);
            ctx.lineTo(-size * 0.3, size * 0.4);
            ctx.lineTo(-size * 0.8, 0);
            ctx.lineTo(-size * 0.3, -size * 0.6);
            ctx.lineTo(size * 0.5, -size * 0.5);
            ctx.closePath();
            ctx.fill();
            
            // Metallic shine
            ctx.fillStyle = 'rgba(192, 192, 192, 0.3)';
            ctx.fillRect(-size * 0.4, -size * 0.2, size * 0.6, size * 0.4);
        }

        drawCrystalAsteroid(pulse) {
            const size = this.size * pulse;
            const healthPercent = this.health / this.maxHealth;
            
            // Crystal core - glowing cyan
            const crystalGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
            crystalGrad.addColorStop(0, '#00FFFF');
            crystalGrad.addColorStop(0.5, '#00CED1');
            crystalGrad.addColorStop(1, '#008B8B');
            ctx.fillStyle = crystalGrad;
            
            // Crystal shape (geometric)
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const r = size * (i % 2 === 0 ? 1 : 0.7);
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Glow effect for rare item
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00CED1';
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            
            // Health indicator
            if (healthPercent < 1) {
                ctx.strokeStyle = '#00FF00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, size * 1.3, 0, Math.PI * 2 * healthPercent);
                ctx.stroke();
            }
        }

        drawNebula(pulse) {
            const size = this.size * pulse;
            
            // Cloud-like nebula effect
            const nebulaGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
            nebulaGrad.addColorStop(0, 'rgba(218, 112, 214, 0.8)');
            nebulaGrad.addColorStop(0.4, 'rgba(186, 85, 211, 0.6)');
            nebulaGrad.addColorStop(0.7, 'rgba(147, 112, 219, 0.3)');
            nebulaGrad.addColorStop(1, 'rgba(138, 43, 226, 0)');
            
            ctx.fillStyle = nebulaGrad;
            ctx.beginPath();
            ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner bright core
            const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.6);
            coreGrad.addColorStop(0, 'rgba(255, 182, 193, 0.9)');
            coreGrad.addColorStop(1, 'rgba(218, 112, 214, 0.4)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
            
            // Sparkles
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + this.rotation;
                const dist = size * 0.8;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Highlight for human-only
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2);
            ctx.stroke();
        }

        contains(x, y) {
            const dx = x - this.x;
            const dy = y - this.y;
            return Math.sqrt(dx * dx + dy * dy) < this.size;
        }
    }

    class ParticleEffect {
        constructor(x, y, color = '#00d4ff', count = 8, size = 2) {
            this.x = x;
            this.y = y;
            this.particles = [];
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const speed = 2 + Math.random() * 2;
                this.particles.push({
                    x: 0,
                    y: 0,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1,
                    size: size
                });
            }
            this.color = color;
        }

        update() {
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.1; // Gravity
                p.life -= 0.05;
            });
            return this.particles.some(p => p.life > 0);
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            this.particles.forEach(p => {
                if (p.life > 0) {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    class ExplosionEffect {
        constructor(x, y, size = 30) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.life = 1;
            this.particles = [];
            
            // Create explosion particles
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 4;
                this.particles.push({
                    x: 0,
                    y: 0,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 2 + Math.random() * 3,
                    life: 1,
                    color: ['#ff6600', '#ff9900', '#ffcc00', '#ff3300'][Math.floor(Math.random() * 4)]
                });
            }
        }

        update() {
            this.life -= 0.03;
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.95;
                p.vy *= 0.95;
                p.life -= 0.04;
            });
            return this.life > 0;
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            // Flash
            if (this.life > 0.7) {
                ctx.globalAlpha = (this.life - 0.7) * 3;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, 0, this.size * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Expanding ring
            ctx.globalAlpha = this.life * 0.5;
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * (1 - this.life) * 3, 0, Math.PI * 2);
            ctx.stroke();
            
            // Particles
            this.particles.forEach(p => {
                if (p.life > 0) {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    class DroneAnimation {
        constructor(type = 'drone') {
            this.type = type; // 'drone', 'miningShip', 'warpProbe'
            // Use canvas dimensions, fallback to reasonable defaults if not set yet
            const width = canvasWidth || 800;
            const height = canvasHeight || 600;
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.target = null;
            this.size = type === 'miningShip' ? 25 : (type === 'warpProbe' ? 30 : 18);
            this.angle = 0;
            this.speed = type === 'warpProbe' ? 4 : (type === 'miningShip' ? 2.5 : 3);
            this.trail = [];
            this.miningTimer = 0;
            this.isAttached = false;
            this.miningRate = type === 'warpProbe' ? 2 : (type === 'miningShip' ? 0.5 : 1);
        }

        findTarget() {
            // Find appropriate target based on drone type
            let validTargets = [];
            
            validTargets = objectPool.filter(obj => {
                if (!obj.active || obj.isBeingMined) return false;
                
                const objConfig = CONFIG.OBJECTS[obj.type];
                if (!objConfig) return false;
                
                // Skip human-only objects
                if (objConfig.humanOnly) return false;
                
                // Check if this drone type can collect this object
                if (objConfig.droneType === 'any') return true;
                if (objConfig.droneType === this.type) return true;
                
                return false;
            });
            
            if (validTargets.length > 0) {
                // Find closest target
                let closest = null;
                let minDist = Infinity;
                validTargets.forEach(obj => {
                    const dx = obj.x - this.x;
                    const dy = obj.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = obj;
                    }
                });
                this.target = closest;
                if (this.target) {
                    this.target.isBeingMined = true;
                }
            }
        }

        update() {
            // Keep drones within canvas bounds
            const width = canvasWidth || 800;
            const height = canvasHeight || 600;
            this.x = Math.max(this.size, Math.min(width - this.size, this.x));
            this.y = Math.max(this.size, Math.min(height - this.size, this.y));
            
            // Find target if we don't have one
            if (!this.target || !this.target.active) {
                this.isAttached = false;
                this.findTarget();
            }
            
            if (this.target && this.target.active) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Point towards target
                this.angle = Math.atan2(dy, dx);
                
                if (distance < this.target.size + 10) {
                    // Reached target - mine it
                    this.isAttached = true;
                    this.miningTimer++;
                    
                    if (this.miningTimer % 30 === 0) { // Every 30 frames (~0.5 seconds)
                        const destroyed = this.target.takeDamage(this.miningRate);
                        
                        // Create mining particle effect - smaller and positioned at contact point
                        const contactX = this.x + (this.target.x - this.x) * 0.7;
                        const contactY = this.y + (this.target.y - this.y) * 0.7;
                        particleEffects.push(new ParticleEffect(
                            contactX,
                            contactY,
                            '#00ff88',
                            3,
                            0.8
                        ));
                        
                        if (destroyed) {
                            // Create explosion
                            particleEffects.push(new ExplosionEffect(this.target.x, this.target.y, this.target.size));
                            gameState.stats.objectsDestroyed++;
                            this.target.despawn();
                            this.target = null;
                            this.isAttached = false;
                            this.miningTimer = 0;
                        }
                    }
                } else {
                    // Move towards target
                    this.isAttached = false;
                    this.x += (dx / distance) * this.speed;
                    this.y += (dy / distance) * this.speed;
                }
            } else {
                // No target - idle movement
                this.angle += 0.02;
                this.isAttached = false;
            }
            
            // Trail effect
            if (!this.isAttached) {
                this.trail.push({ x: this.x, y: this.y, life: 1 });
                if (this.trail.length > 8) this.trail.shift();
                this.trail.forEach(t => t.life -= 0.15);
            }
        }

        draw() {
            ctx.save();
            
            // Draw mining beam if attached
            if (this.isAttached && this.target) {
                ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.target.x, this.target.y);
                ctx.stroke();
                
                // Beam particles
                for (let i = 0; i < 3; i++) {
                    const t = (this.miningTimer % 30 + i * 10) / 30;
                    const bx = this.x + (this.target.x - this.x) * t;
                    const by = this.y + (this.target.y - this.y) * t;
                    ctx.fillStyle = 'rgba(0, 255, 136, ' + (1 - t) + ')';
                    ctx.beginPath();
                    ctx.arc(bx, by, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            // Draw trail
            this.trail.forEach(t => {
                if (t.life > 0) {
                    ctx.globalAlpha = t.life * 0.4;
                    const color = this.type === 'warpProbe' ? '#ff00ff' : 
                                  (this.type === 'miningShip' ? '#ffaa00' : '#00d4ff');
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;

            // Draw drone
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);

            // Add glow/highlight to make drones visible
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.type === 'warpProbe' ? '#ff00ff' : 
                              (this.type === 'miningShip' ? '#ff8800' : '#00d4ff');

            // Different visuals based on type
            if (this.type === 'miningShip') {
                // Mining Ship - larger with drill
                ctx.fillStyle = '#ff8800';
                ctx.fillRect(-this.size * 0.6, -this.size * 0.3, this.size, this.size * 0.6);
                
                // Drill
                ctx.fillStyle = '#cccccc';
                ctx.fillRect(this.size * 0.4, -this.size * 0.15, this.size * 0.4, this.size * 0.3);
                
                // Engine glow
                ctx.fillStyle = this.isAttached ? '#00ff88' : '#00aaff';
                ctx.beginPath();
                ctx.arc(-this.size * 0.4, 0, this.size * 0.2, 0, Math.PI * 2);
                ctx.fill();
                
                // Outline for visibility
                ctx.strokeStyle = '#ffaa00';
                ctx.lineWidth = 2;
                ctx.strokeRect(-this.size * 0.6, -this.size * 0.3, this.size, this.size * 0.6);
                
            } else if (this.type === 'warpProbe') {
                // Warp Probe - sleek and fast
                ctx.fillStyle = '#aa00ff';
                ctx.beginPath();
                ctx.moveTo(this.size * 0.6, 0);
                ctx.lineTo(-this.size * 0.4, -this.size * 0.4);
                ctx.lineTo(-this.size * 0.6, 0);
                ctx.lineTo(-this.size * 0.4, this.size * 0.4);
                ctx.closePath();
                ctx.fill();
                
                // Warp field
                ctx.strokeStyle = '#ff00ff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.ellipse(0, 0, this.size * 0.8, this.size * 0.5, 0, 0, Math.PI * 2);
                ctx.stroke();
                
            } else {
                // Basic Drone - make more visible
                ctx.fillStyle = '#4a9eff';
                ctx.fillRect(-this.size * 0.5, -this.size * 0.3, this.size, this.size * 0.6);
                
                // Wings
                ctx.fillStyle = '#00d4ff';
                ctx.fillRect(-this.size * 0.7, -this.size * 0.2, this.size * 0.2, this.size * 0.4);
                ctx.fillRect(this.size * 0.5, -this.size * 0.2, this.size * 0.2, this.size * 0.4);
                
                // Core - brighter
                ctx.fillStyle = this.isAttached ? '#00ff88' : '#00ffff';
                ctx.beginPath();
                ctx.arc(0, 0, this.size * 0.2, 0, Math.PI * 2);
                ctx.fill();
                
                // Outline
                ctx.strokeStyle = '#00d4ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(-this.size * 0.5, -this.size * 0.3, this.size, this.size * 0.6);
            }

            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    function initCanvas() {
        canvas = document.getElementById('game-canvas');
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Initialize object pool
        for (let type in CONFIG.OBJECTS) {
            const config = CONFIG.OBJECTS[type];
            for (let i = 0; i < config.maxOnScreen; i++) {
                objectPool.push(new SpaceObject(type));
            }
            lastSpawnTimes[type] = 0;
        }

        // Spawn initial objects immediately
        const satellite = objectPool.find(obj => obj.type === 'satellite');
        if (satellite) satellite.spawn();
        
        // Spawn variety of objects at start
        objectPool.filter(obj => obj.type === 'smallRock').slice(0, 5).forEach(obj => obj.spawn());
        objectPool.filter(obj => obj.type === 'asteroid').slice(0, 3).forEach(obj => obj.spawn());
        objectPool.filter(obj => obj.type === 'planet').slice(0, 2).forEach(obj => obj.spawn());

        // Event listeners
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });
    }

    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
    }

    function handleCanvasClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        handleClick(x, y);
    }

    function handleCanvasTouch(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        handleClick(x, y);
    }

    function handleClick(x, y) {
        // Check if any object was clicked
        for (let obj of objectPool) {
            if (obj.active && obj.contains(x, y)) {
                const particleYield = calculateClickYield(obj.type);
                addParticles(particleYield);
                gameState.stats.totalClicks++;
                if (obj.type === 'star') gameState.stats.starsClicked++;
                
                // Create particle effect
                particleEffects.push(new ParticleEffect(obj.x, obj.y, '#00d4ff', 12, 2));
                
                // Create explosion and despawn
                particleEffects.push(new ExplosionEffect(obj.x, obj.y, obj.size));
                gameState.stats.objectsDestroyed++;
                obj.despawn();
                
                // Tutorial progress
                if (gameState.tutorialStep === 0) gameState.tutorialStep = 1;
                
                checkAchievements();
                return;
            }
        }
    }

    function spawnObjects(timestamp) {
        for (let type in CONFIG.OBJECTS) {
            const config = CONFIG.OBJECTS[type];
            
            // Check tier unlock
            if (config.unlockTier > gameState.tier) continue;
            
            // Skip satellite (always on screen) and check spawn rate
            if (type === 'satellite') continue;
            
            // Apply tier-based spawn penalty (gets harder each tier!)
            const tierPenalty = CONFIG.TIERS[gameState.tier].spawnPenalty || 1.0;
            
            // Also apply time-based difficulty
            const adjustedSpawnRate = config.spawnRate * gameState.difficulty.spawnRateMultiplier * tierPenalty;
            
            if (timestamp - lastSpawnTimes[type] < adjustedSpawnRate) continue;
            
            // Reduce max objects at higher tiers
            const tierReduction = Math.max(1, Math.floor(config.maxOnScreen * (1 - gameState.tier * 0.15)));
            const maxAllowed = Math.min(config.maxOnScreen, tierReduction);
            
            // Count active objects of this type
            const activeCount = objectPool.filter(obj => obj.type === type && obj.active).length;
            if (activeCount >= maxAllowed) continue;
            
            // Find inactive object and spawn it
            const obj = objectPool.find(obj => obj.type === type && !obj.active);
            if (obj) {
                obj.spawn();
                lastSpawnTimes[type] = timestamp;
            }
        }
    }

    function updateDroneAnimations() {
        // Calculate desired drone counts
        const desiredCounts = {
            drone: Math.min(gameState.harvesters.drone, 5),
            miningShip: Math.min(gameState.harvesters.miningShip, 4),
            warpProbe: Math.min(gameState.harvesters.warpProbe, 3)
        };
        
        const totalDesired = desiredCounts.drone + desiredCounts.miningShip + desiredCounts.warpProbe;
        
        // Count current drones by type
        const currentCounts = {
            drone: droneAnimations.filter(d => d.type === 'drone').length,
            miningShip: droneAnimations.filter(d => d.type === 'miningShip').length,
            warpProbe: droneAnimations.filter(d => d.type === 'warpProbe').length
        };
        
        // Add missing drones
        for (let type in desiredCounts) {
            while (currentCounts[type] < desiredCounts[type]) {
                const newDrone = new DroneAnimation(type);
                droneAnimations.push(newDrone);
                currentCounts[type]++;
                console.log(`Added ${type} at position (${newDrone.x.toFixed(0)}, ${newDrone.y.toFixed(0)}). Total drones: ${droneAnimations.length}`);
            }
        }
        
        // Remove excess drones (remove basic drones first)
        for (let type of ['drone', 'miningShip', 'warpProbe']) {
            while (currentCounts[type] > desiredCounts[type]) {
                const index = droneAnimations.findIndex(d => d.type === type);
                if (index !== -1) {
                    droneAnimations.splice(index, 1);
                    currentCounts[type]--;
                    console.log(`Removed ${type}. Total drones: ${droneAnimations.length}`);
                }
            }
        }
    }

    function renderFrame(timestamp) {
        // Clear canvas with background
        ctx.fillStyle = '#0a0e27';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw starfield
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 50; i++) {
            const x = (i * 123.456) % canvasWidth;
            const y = (i * 789.012) % canvasHeight;
            const size = (i % 3) * 0.5 + 0.5;
            ctx.fillRect(x, y, size, size);
        }

        // Spawn and update objects
        spawnObjects(timestamp);
        objectPool.forEach(obj => {
            if (obj.active) {
                obj.update();
                obj.draw();
            }
        });

        // Update and draw drone animations
        updateDroneAnimations();
        droneAnimations.forEach(drone => {
            drone.update();
            drone.draw();
        });

        // Update and draw particle effects
        particleEffects = particleEffects.filter(effect => {
            const alive = effect.update();
            if (alive) effect.draw();
            return alive;
        });

        requestAnimationFrame(renderFrame);
    }

    // =============================================
    // ECONOMY CALCULATIONS
    // =============================================
    function calculateClickYield(objectType) {
        const baseYield = CONFIG.OBJECTS[objectType].baseYield;
        const clickPower = 1 + gameState.upgrades.clickPower;
        const efficiency = Math.pow(CONFIG.UPGRADES.efficiency.effect, gameState.upgrades.efficiency);
        const tierMultiplier = CONFIG.TIERS[gameState.tier].multiplier;
        const prestigeMultiplier = 1 + (gameState.warpShards * 0.01);
        
        // Achievement bonus
        let achievementBonus = 1;
        if (gameState.achievements.includes('firstAsteroid')) {
            achievementBonus += CONFIG.ACHIEVEMENTS.firstAsteroid.reward;
        }

        const multiplier = objectType === 'satellite' ? 
            (CONFIG.OBJECTS.satellite.multiplier || 1) : 1;

        return Math.floor(baseYield * clickPower * efficiency * tierMultiplier * 
                         prestigeMultiplier * achievementBonus * multiplier);
    }

    function calculatePPS() {
        let pps = 0;
        
        // Harvester income
        for (let harvester in CONFIG.HARVESTERS) {
            const owned = gameState.harvesters[harvester];
            const baseIncome = CONFIG.HARVESTERS[harvester].pps;
            pps += owned * baseIncome;
        }
        
        // Auto-clicker (virtual clicks per second)
        const autoClickerLevel = gameState.upgrades.autoClicker;
        if (autoClickerLevel > 0) {
            // Auto-clicker clicks asteroids virtually
            const asteroidYield = calculateClickYield('asteroid');
            pps += autoClickerLevel * asteroidYield;
        }
        
        // Apply multipliers
        const tierMultiplier = CONFIG.TIERS[gameState.tier].multiplier;
        const prestigeMultiplier = 1 + (gameState.warpShards * 0.01);
        
        return pps * tierMultiplier * prestigeMultiplier;
    }

    function calculateHarvesterCost(harvester) {
        const baseCost = CONFIG.HARVESTERS[harvester].baseCost;
        const owned = gameState.harvesters[harvester];
        
        // Cost scaling increases with tier (harder late game)
        const tierScaling = 1.15 + (gameState.tier * 0.02); // 1.15, 1.17, 1.19, 1.21
        
        return Math.floor(baseCost * Math.pow(tierScaling, owned));
    }

    function calculateUpgradeCost(upgrade) {
        const baseCost = CONFIG.UPGRADES[upgrade].baseCost;
        const scale = CONFIG.UPGRADES[upgrade].scale;
        const level = gameState.upgrades[upgrade];
        
        // Higher tiers make upgrades more expensive
        const tierMultiplier = 1 + (gameState.tier * 0.3); // +30% per tier
        
        return Math.floor(baseCost * Math.pow(scale, level) * tierMultiplier);
    }

    function addParticles(amount) {
        gameState.particles += amount;
        gameState.stats.lifetimeParticles += amount;
    }

    function economyTick() {
        let pps = calculatePPS();
        
        // Apply ad bonus if active
        if (adState.bonusActive) {
            pps *= 3; // 200% bonus = 3x total
            adState.bonusTimeLeft--;
            
            if (adState.bonusTimeLeft <= 0) {
                adState.bonusActive = false;
                document.getElementById('ad-bonus-timer').style.display = 'none';
                showNotification('Ad bonus expired!');
            }
        }
        
        // Update rewarded ad cooldown
        if (adState.rewardedAdCooldown > 0) {
            adState.rewardedAdCooldown--;
        }
        
        // Progressive difficulty (increases faster at higher tiers)
        gameState.stats.playtime++;
        
        // Difficulty scales with tier: Tier 0 = every 5min, Tier 3 = every 2min
        const difficultyInterval = Math.max(120, 300 - (gameState.tier * 60));
        const difficultyIncrease = 1.02 + (gameState.tier * 0.01); // 2-5% based on tier
        
        if (gameState.stats.playtime % difficultyInterval === 0) {
            gameState.difficulty.spawnRateMultiplier *= difficultyIncrease;
            console.log(`Difficulty increased (Tier ${gameState.tier}): spawn rate x${gameState.difficulty.spawnRateMultiplier.toFixed(2)}`);
        }
        
        addParticles(pps);
        checkAchievements();
    }

    // =============================================
    // SHOP & PURCHASES
    // =============================================
    function buyHarvester(harvester) {
        const config = CONFIG.HARVESTERS[harvester];
        const owned = gameState.harvesters[harvester];
        const maxOwned = config.maxOwned;
        
        // Check limit
        if (owned >= maxOwned) {
            showNotification(`Max ${config.name} reached! (${maxOwned}/${maxOwned})`);
            return false;
        }
        
        const cost = calculateHarvesterCost(harvester);
        if (gameState.particles >= cost) {
            gameState.particles -= cost;
            gameState.harvesters[harvester]++;
            showNotification(`Purchased ${config.name}! (${owned + 1}/${maxOwned})`);
            
            // Tutorial progress
            if (gameState.tutorialStep === 1) gameState.tutorialStep = 2;
            
            return true;
        }
        return false;
    }

    function buyUpgrade(upgrade) {
        const cost = calculateUpgradeCost(upgrade);
        if (gameState.particles >= cost) {
            gameState.particles -= cost;
            gameState.upgrades[upgrade]++;
            showNotification(`Upgraded ${CONFIG.UPGRADES[upgrade].name}!`);
            return true;
        }
        return false;
    }

    function unlockTier() {
        const nextTier = gameState.tier + 1;
        if (nextTier >= CONFIG.TIERS.length) return false;
        
        const cost = CONFIG.TIERS[nextTier].cost;
        if (gameState.particles >= cost) {
            gameState.particles -= cost;
            gameState.tier = nextTier;
            
            // Show tier unlock notification with warning about difficulty
            showNotification(`Unlocked ${CONFIG.TIERS[nextTier].name}!`);
            
            if (nextTier > 0) {
                setTimeout(() => {
                    showNotification(`⚠️ Difficulty increased! Objects spawn slower.`);
                }, 1500);
            }
            
            checkInterstitialTrigger(); // Trigger interstitial ad
            return true;
        }
        return false;
    }

    function performPrestige() {
        const shardsGained = Math.floor(gameState.particles / 100000);
        if (shardsGained === 0 || gameState.tier < 3) return false;

        gameState.warpShards += shardsGained;
        gameState.prestigeCount++;
        
        // Reset
        gameState.particles = 0;
        gameState.harvesters = { drone: 0, miningShip: 0, warpProbe: 0 };
        gameState.upgrades = { clickPower: 0, efficiency: 0, autoClicker: 0 };
        gameState.tier = 0;
        gameState.stats.totalClicks = 0;
        gameState.stats.starsClicked = 0;
        // Keep lifetimeParticles and achievements
        
        showNotification(`Prestige! Gained ${shardsGained} Warp Shards!`, true);
        checkInterstitialTrigger(); // Trigger interstitial ad
        return true;
    }

    // =============================================
    // ACHIEVEMENTS
    // =============================================
    function checkAchievements() {
        for (let key in CONFIG.ACHIEVEMENTS) {
            if (!gameState.achievements.includes(key)) {
                const achievement = CONFIG.ACHIEVEMENTS[key];
                if (achievement.condition()) {
                    gameState.achievements.push(key);
                    showNotification(`Achievement: ${achievement.name}!`, true);
                }
            }
        }
    }

    // =============================================
    // UI UPDATES
    // =============================================
    function formatNumber(num) {
        if (num >= 1e6) {
            return num.toExponential(2);
        } else if (num >= 1000) {
            return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
        }
        return Math.floor(num).toString();
    }

    function updateUI() {
        // Top bar
        document.getElementById('particles-display').textContent = formatNumber(gameState.particles);
        document.getElementById('pps-display').textContent = formatNumber(calculatePPS());
        document.getElementById('tier-display').textContent = CONFIG.TIERS[gameState.tier].name;
        document.getElementById('objects-destroyed-display').textContent = formatNumber(gameState.stats.objectsDestroyed);
        document.getElementById('active-drones-display').textContent = droneAnimations.length;

        // Click stats
        const clickPower = 1 + gameState.upgrades.clickPower;
        const efficiency = Math.pow(CONFIG.UPGRADES.efficiency.effect, gameState.upgrades.efficiency);
        const tierMult = CONFIG.TIERS[gameState.tier].multiplier;
        const prestigeMult = 1 + (gameState.warpShards * 0.01);
        let totalMult = efficiency * tierMult * prestigeMult;
        
        if (gameState.achievements.includes('firstAsteroid')) {
            totalMult *= (1 + CONFIG.ACHIEVEMENTS.firstAsteroid.reward);
        }

        document.getElementById('click-power-display').textContent = formatNumber(clickPower * totalMult);
        document.getElementById('total-clicks-display').textContent = formatNumber(gameState.stats.totalClicks);
        document.getElementById('multiplier-display').textContent = totalMult.toFixed(2) + 'x';

        // Object counts for all types
        ['smallRock', 'asteroid', 'comet', 'spaceDebris', 'crystalAsteroid', 
         'nebula', 'planet', 'star'].forEach(type => {
            const element = document.getElementById(`${type}-count`);
            if (element) {
                element.textContent = objectPool.filter(obj => obj.type === type && obj.active).length;
            }
        });

        // Harvesters
        for (let harvester in CONFIG.HARVESTERS) {
            const config = CONFIG.HARVESTERS[harvester];
            const owned = gameState.harvesters[harvester];
            const maxOwned = config.maxOwned;
            const cost = calculateHarvesterCost(harvester);
            const canAfford = gameState.particles >= cost;
            const atLimit = owned >= maxOwned;
            
            const shopItem = document.getElementById(`shop-${harvester}`);
            if (shopItem) {
                shopItem.querySelector('.item-owned').textContent = `${owned}/${maxOwned}`;
                shopItem.querySelector('.item-description').textContent = config.description;
                const button = shopItem.querySelector('.buy-button');
                button.querySelector('.cost').textContent = formatNumber(cost);
                button.disabled = !canAfford || atLimit;
                
                if (atLimit) {
                    button.innerHTML = '<span style="color: #ff6600;">MAX REACHED</span>';
                }
            }
        }

        // Upgrades
        for (let upgrade in CONFIG.UPGRADES) {
            const level = gameState.upgrades[upgrade];
            const cost = calculateUpgradeCost(upgrade);
            const canAfford = gameState.particles >= cost;
            
            const shopItem = document.getElementById(`shop-${upgrade}`);
            if (shopItem) {
                shopItem.querySelector('.item-level').textContent = `Lv. ${level}`;
                const button = shopItem.querySelector('.buy-button');
                button.querySelector('.cost').textContent = formatNumber(cost);
                button.disabled = !canAfford;
            }
        }

        // Tier progression
        const nextTier = gameState.tier + 1;
        const tierButton = document.getElementById('unlock-tier-button');
        if (nextTier < CONFIG.TIERS.length) {
            const cost = CONFIG.TIERS[nextTier].cost;
            document.getElementById('next-tier-cost').textContent = formatNumber(cost);
            tierButton.disabled = gameState.particles < cost;
        } else {
            tierButton.textContent = 'Max Tier Reached';
            tierButton.disabled = true;
        }

        // Prestige
        const shardsGain = Math.floor(gameState.particles / 100000);
        const prestigeBonus = (gameState.warpShards * 0.01 * 100).toFixed(0);
        document.getElementById('warp-shards-display').textContent = gameState.warpShards;
        document.getElementById('prestige-bonus-display').textContent = `+${prestigeBonus}%`;
        document.getElementById('shards-gain-display').textContent = shardsGain;
        
        const prestigeButton = document.getElementById('prestige-button');
        if (gameState.tier >= 3 && shardsGain > 0) {
            prestigeButton.disabled = false;
            prestigeButton.textContent = `Prestige for ${shardsGain} Warp Shards`;
        } else if (gameState.tier < 3) {
            prestigeButton.disabled = true;
            prestigeButton.textContent = 'Unlock at Galaxy Tier';
        } else {
            prestigeButton.disabled = true;
            prestigeButton.textContent = 'Need 100k Particles';
        }

        // Update Ad UI
        const watchAdButton = document.getElementById('watch-ad-button');
        const bonusTimerDisplay = document.getElementById('bonus-time-left');
        
        if (adState.bonusActive) {
            bonusTimerDisplay.textContent = adState.bonusTimeLeft;
        }
        
        if (adState.rewardedAdCooldown > 0) {
            watchAdButton.disabled = true;
            watchAdButton.innerHTML = `<span>📺 Cooldown</span><small>${adState.rewardedAdCooldown}s remaining</small>`;
        } else if (adState.bonusActive) {
            watchAdButton.disabled = true;
            watchAdButton.innerHTML = '<span>✅ Bonus Active</span>';
        } else {
            watchAdButton.disabled = false;
            watchAdButton.innerHTML = '<span>📺 Watch Ad</span><small>+200% Particles for 60s</small>';
        }
    }

    function showNotification(message, isAchievement = false) {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = 'notification' + (isAchievement ? ' achievement' : '');
        notification.textContent = message;
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // =============================================
    // AD MONETIZATION SYSTEM
    // =============================================
    
    /**
     * INTEGRATION GUIDE FOR REAL ADS:
     * 
     * 1. GOOGLE ADSENSE:
     *    - Replace .ad-placeholder divs with AdSense code
     *    - Use responsive ad units for better mobile support
     * 
     * 2. UNITY ADS (for games):
     *    - Initialize: UnityAds.initialize(gameId, testMode)
     *    - Rewarded: UnityAds.show(placementId, {onComplete: showRewardedAdCallback})
     *    - Interstitial: UnityAds.show(placementId)
     * 
     * 3. ADMOB (mobile web):
     *    - Add AdMob script to index.html
     *    - Replace placeholders with AdMob banner units
     * 
     * 4. OTHER NETWORKS:
     *    - AdColony, AppLovin, IronSource, Vungle
     *    - Follow their SDK integration guides
     */

    function showRewardedAd() {
        // Check cooldown
        if (adState.rewardedAdCooldown > 0) {
            showNotification(`Ad cooldown: ${adState.rewardedAdCooldown}s remaining`);
            return;
        }

        console.log('🎬 Showing Rewarded Video Ad...');
        
        const button = document.getElementById('watch-ad-button');
        button.disabled = true;
        button.innerHTML = '<span>📺 Loading Ad...</span>';
        
        // Mock ad experience (3 second delay)
        // REAL AD INTEGRATION: Replace this with actual ad SDK call
        // See AD_SDK_SETUP.md for instructions
        setTimeout(() => {
            grantAdReward();
            button.innerHTML = '<span>📺 Watch Ad</span><small>+200% Particles for 60s</small>';
        }, 3000);
    }

    function grantAdReward() {
        console.log('✅ Ad watched! Granting reward...');
        
        // Activate bonus
        adState.bonusActive = true;
        adState.bonusTimeLeft = 60; // 60 seconds
        adState.rewardedAdCooldown = 120; // 2 minute cooldown
        
        // Update UI
        document.getElementById('ad-bonus-timer').style.display = 'block';
        showNotification('🎁 Ad Bonus Active! +200% Particles for 60s!', true);
        
        // Analytics tracking point
        console.log('📊 Analytics: Rewarded ad completed');
    }


    function checkInterstitialTrigger() {
        adState.interstitialCounter++;
        
        // Show interstitial every 5 tier unlocks or prestige
        if (adState.interstitialCounter >= 5) {
            adState.interstitialCounter = 0;
            setTimeout(() => showInterstitialAd(), 1000);
        }
    }

    // =============================================
    // SAVE/LOAD SYSTEM
    // =============================================
    function saveGame() {
        gameState.lastPlayed = Date.now();
        try {
            localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(gameState));
        } catch (e) {
            console.error('Failed to save game:', e);
        }
    }

    function loadGame() {
        try {
            const saved = localStorage.getItem(CONFIG.SAVE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                
                // Validate version
                if (data.version === CONFIG.SAVE_VERSION) {
                    gameState = { ...gameState, ...data };
                    
                    // Calculate offline progress
                    const now = Date.now();
                    const offlineSeconds = Math.min((now - gameState.lastPlayed) / 1000, CONFIG.MAX_OFFLINE_TIME);
                    if (offlineSeconds > 60) {
                        const offlinePPS = calculatePPS();
                        const offlineGain = Math.floor(offlineSeconds * offlinePPS);
                        addParticles(offlineGain);
                        showNotification(`Welcome back! Earned ${formatNumber(offlineGain)} particles offline.`);
                    }
                    
                    return true;
                }
            }
        } catch (e) {
            console.error('Failed to load game:', e);
        }
        return false;
    }

    // =============================================
    // EVENT HANDLERS
    // =============================================
    function setupEventHandlers() {
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;
                
                // Update buttons
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                
                // Update content
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`${tab}-tab`).classList.add('active');
            });
        });

        // Buy harvesters
        document.querySelectorAll('[data-item]').forEach(button => {
            button.addEventListener('click', () => {
                const harvester = button.dataset.item;
                buyHarvester(harvester);
            });
        });

        // Buy upgrades
        document.querySelectorAll('[data-upgrade]').forEach(button => {
            button.addEventListener('click', () => {
                const upgrade = button.dataset.upgrade;
                buyUpgrade(upgrade);
            });
        });

        // Tier unlock
        document.getElementById('unlock-tier-button').addEventListener('click', () => {
            unlockTier();
        });

        // Prestige
        document.getElementById('prestige-button').addEventListener('click', () => {
            if (confirm('Are you sure you want to prestige? This will reset your progress but grant permanent bonuses.')) {
                performPrestige();
            }
        });

        // Rewarded Ad Button
        document.getElementById('watch-ad-button').addEventListener('click', () => {
            showRewardedAd();
        });

        // Close Interstitial
        document.getElementById('close-interstitial').addEventListener('click', () => {
            if (!document.getElementById('close-interstitial').disabled) {
                closeInterstitialAd();
            }
        });

        // Help System - Bottom right button
        document.getElementById('help-button').addEventListener('click', () => {
            showHelpOverlay();
        });

        // Help System - Top bar button
        document.getElementById('top-help-button').addEventListener('click', () => {
            showHelpOverlay();
        });

        // Close button already set up in setupHelpOverlay()
        
        // Don't auto-show help popup on game start
        // User can click the guide button when ready

        // Privacy Settings
        document.getElementById('privacy-settings-link').addEventListener('click', (e) => {
            e.preventDefault();
            showPrivacySettings();
        });

        document.getElementById('close-privacy-settings').addEventListener('click', () => {
            hidePrivacySettings();
        });

        document.getElementById('export-data-btn').addEventListener('click', exportSaveData);
        document.getElementById('delete-data-btn').addEventListener('click', deleteAllData);
        document.getElementById('save-privacy-settings').addEventListener('click', savePrivacySettings);
    }

    // =============================================
    // PRIVACY SETTINGS SYSTEM
    // =============================================
    function showPrivacySettings() {
        const modal = document.getElementById('privacy-settings-modal');
        modal.classList.add('show');
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });

        // Update data info
        updatePrivacyInfo();
    }

    function hidePrivacySettings() {
        const modal = document.getElementById('privacy-settings-modal');
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.remove('show');
        }, 300);
    }

    function updatePrivacyInfo() {
        // Calculate save data size
        try {
            const saveData = localStorage.getItem(CONFIG.SAVE_KEY);
            if (saveData) {
                const sizeKB = (saveData.length / 1024).toFixed(2);
                document.getElementById('data-size').textContent = `~${sizeKB} KB`;
                
                const saveObj = JSON.parse(saveData);
                const lastSaved = new Date(saveObj.lastPlayed);
                document.getElementById('last-save-time').textContent = lastSaved.toLocaleString();
            }
        } catch (e) {
            console.error('Error reading save data:', e);
        }

        // Load privacy preferences
        const preferences = JSON.parse(localStorage.getItem('privacyPreferences') || '{"analytics":true,"ads":true}');
        document.getElementById('analytics-cookies').checked = preferences.analytics;
        document.getElementById('ad-cookies').checked = preferences.ads;
    }

    function savePrivacySettings() {
        const preferences = {
            analytics: document.getElementById('analytics-cookies').checked,
            ads: document.getElementById('ad-cookies').checked
        };
        
        localStorage.setItem('privacyPreferences', JSON.stringify(preferences));
        showNotification('Privacy settings saved!');
        hidePrivacySettings();
        
        console.log('Privacy preferences updated:', preferences);
    }

    function exportSaveData() {
        try {
            const saveData = localStorage.getItem(CONFIG.SAVE_KEY);
            if (saveData) {
                // Create downloadable file
                const blob = new Blob([saveData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `space-clicker-save-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                
                showNotification('Save data exported successfully!');
                console.log('✅ Save data exported');
            } else {
                showNotification('No save data found!');
            }
        } catch (e) {
            console.error('Error exporting data:', e);
            showNotification('Failed to export data');
        }
    }

    function deleteAllData() {
        if (confirm('⚠️ WARNING: This will delete ALL your game progress!\n\nAre you absolutely sure?')) {
            if (confirm('This action cannot be undone. Delete everything?')) {
                try {
                    localStorage.removeItem(CONFIG.SAVE_KEY);
                    localStorage.removeItem('privacyPreferences');
                    showNotification('All data deleted. Refreshing game...');
                    
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                } catch (e) {
                    console.error('Error deleting data:', e);
                }
            }
        }
    }

    // =============================================
    // SPLASH SCREEN & LOADING
    // =============================================
    function showSplashScreen() {
        console.log('Showing splash screen...');
        const splashScreen = document.getElementById('splash-screen');
        const playButton = document.getElementById('play-button');
        const helpButton = document.getElementById('splash-help-button');
        const loadingText = document.querySelector('.loading-text');
        
        // Simulate loading
        setTimeout(() => {
            loadingText.textContent = 'Loading Assets...';
        }, 500);
        
        setTimeout(() => {
            loadingText.textContent = 'Initializing Drones...';
        }, 1000);
        
        setTimeout(() => {
            loadingText.textContent = 'Preparing Universe...';
        }, 1500);
        
        // Show play button after loading
        setTimeout(() => {
            document.querySelector('.loading-container').style.display = 'none';
            playButton.style.display = 'inline-flex';
            helpButton.style.display = 'inline-flex';
            
            console.log('Buttons displayed, setting up handlers...');
            
            // Add event listeners immediately
            let transitioning = false;
            
            // PLAY BUTTON
            playButton.onclick = function(e) {
                console.log('PLAY BUTTON CLICKED!');
                if (transitioning) return;
                transitioning = true;
                
                // Start showing game container first (behind splash)
                const gameContainer = document.getElementById('game-container');
                gameContainer.classList.add('visible');
                
                // Then fade out splash screen
                setTimeout(() => {
                    splashScreen.classList.add('fade-out');
                }, 100);
                
                // Hide splash and initialize game
                setTimeout(() => {
                    splashScreen.classList.add('hidden');
                    initGame();
                }, 900);
            };
            
            // Also handle touch
            playButton.ontouchstart = function(e) {
                e.preventDefault();
                console.log('PLAY BUTTON TOUCHED!');
                playButton.onclick(e);
            };
            
            // HELP BUTTON
            helpButton.onclick = function(e) {
                console.log('HELP BUTTON CLICKED!');
                showHelpOverlay();
            };
            
            helpButton.ontouchstart = function(e) {
                e.preventDefault();
                console.log('HELP BUTTON TOUCHED!');
                helpButton.onclick(e);
            };
            
            console.log('Splash buttons are ready!');
            console.log('Play button element:', playButton);
            console.log('Help button element:', helpButton);
        }, 2000);
    }

    // =============================================
    // HELP OVERLAY WITH SMOOTH TRANSITIONS
    // =============================================
    function showHelpOverlay() {
        const overlay = document.getElementById('help-overlay');
        overlay.classList.add('show');
        // Trigger reflow for animation
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }

    function hideHelpOverlay() {
        const overlay = document.getElementById('help-overlay');
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.remove('show');
        }, 300);
    }

    // =============================================
    // INTERSTITIAL AD WITH SMOOTH TRANSITIONS
    // =============================================
    function showInterstitialAd() {
        const now = Date.now();
        
        // Don't show interstitials too frequently (minimum 2 minutes)
        if (now - adState.lastInterstitialTime < 120000) {
            return;
        }
        
        console.log('📢 Showing Interstitial Ad...');
        
        const overlay = document.getElementById('interstitial-ad-overlay');
        const closeButton = document.getElementById('close-interstitial');
        const skipTimer = document.getElementById('skip-timer');
        
        overlay.classList.add('show');
        // Trigger reflow
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
        
        closeButton.classList.remove('active');
        closeButton.disabled = true;
        
        // 5 second countdown
        let countdown = 5;
        skipTimer.textContent = countdown;
        
        const countdownInterval = setInterval(() => {
            countdown--;
            skipTimer.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                closeButton.classList.add('active');
                closeButton.disabled = false;
                closeButton.textContent = 'Close Ad';
            }
        }, 1000);
        
        adState.lastInterstitialTime = now;
        console.log('📊 Analytics: Interstitial ad shown');
    }

    function closeInterstitialAd() {
        const overlay = document.getElementById('interstitial-ad-overlay');
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.remove('show');
        }, 300);
        console.log('✅ Interstitial ad closed');
    }

    // =============================================
    // GAME INITIALIZATION
    // =============================================
    function initGame() {
        // Don't load save on refresh - start fresh
        // loadGame(); // Disabled for fresh start on refresh

        // Setup canvas and rendering
        initCanvas();

        // Setup UI event handlers
        setupEventHandlers();

        // Start game loops
        requestAnimationFrame(renderFrame);
        setInterval(economyTick, CONFIG.TICK_INTERVAL);
        setInterval(updateUI, CONFIG.UI_UPDATE_INTERVAL);
        
        // Save on page unload (tab switch, close, etc)
        window.addEventListener('beforeunload', saveGame);
        window.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                saveGame();
            }
        });

        // Initial UI update
        updateUI();

        console.log('Space Exploration Clicker initialized! (Fresh start)');
    }

    // Setup help overlay close button early (works on both splash and game screen)
    function setupHelpOverlay() {
        const closeButton = document.getElementById('close-help');
        if (closeButton) {
            closeButton.onclick = function() {
                console.log('Help overlay closed');
                hideHelpOverlay();
                if (gameState) gameState.showHelp = false;
            };
        }
    }

    // Start splash screen when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupHelpOverlay();
            showSplashScreen();
        });
    } else {
        setupHelpOverlay();
        showSplashScreen();
    }

})();

