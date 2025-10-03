// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game constants
const GRID_SIZE = 20;
const TILE_SIZE = 32;
const FORMATION_WAIT_PERCENTAGE = 0.6;
const FORMATION_SPEED_BOOST_RANGE = 10 * TILE_SIZE;
const FORMATION_SPEED_BOOST = 1.5;

// ID Generator
let nextId = 1;
function generateId() {
    return nextId++;
}

// Game state
const game = {
    camera: { x: 0, y: 0 },
    selectedUnits: [],
    units: [],
    obstacles: [],
    projectiles: [],
    mousePos: { x: 0, y: 0 },
    dragStart: null,
    isDragging: false,
    keys: {},
    team1Color: '#4444ff',
    team2Color: '#ff4444'
};

// Unit class
class Unit {
    static Stance = {
        STANDING: 'standing',
        MOVING: 'moving',
        MOVING_IN_FORMATION: 'moving in formation',
        CHASING_A_FORMATION: 'chasing a formation',
        CHASING_A_TARGET: 'chasing a target',
        ATTACKING_AT_PLACE: 'attacking at place',
        STRIKING: 'striking'
    };
    constructor(x, y, team, type = 'melee') {
        this.id = generateId();
        this.x = x;
        this.y = y;
        this.team = team;
        this.type = type; // 'melee', 'ranged', 'catapult'
        this.selected = false;
        this.hp = this.maxHp = type === 'catapult' ? 200 : (type === 'melee' ? 100 : 80);
        this.damage = type === 'catapult' ? 50 : (type === 'melee' ? 20 : 15);
        this.range = type === 'catapult' ? 250 : (type === 'ranged' ? 150 : 40);
        this.attackSpeed = type === 'catapult' ? 3000 : (type === 'melee' ? 1000 : 1500);
        this.moveSpeed = type === 'catapult' ? 0.5 : (type === 'melee' ? 1.2 : 1.0);
        this.size = type === 'catapult' ? 20 : 15;
        
        this.targetX = x;
        this.targetY = y;
        this.attackTarget = null;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.moving = false;
        this.formation = null;
        this.formationPosition = null;
        this.speedBoost = 1;
        this.stance = Unit.Stance.STANDING;
        
        // For attack animation
        this.attackAnimationTime = 0;
        this.attackAnimationDuration = 300; // ms
    }
    
    update(deltaTime) {
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
        
        // Update attack animation
        if (this.attackAnimationTime > 0) {
            this.attackAnimationTime -= deltaTime;
            if (this.attackAnimationTime <= 0) {
                this.isAttacking = false;
            }
        }
        
        // Check if we have an attack target
        if (this.attackTarget && this.attackTarget.hp > 0) {
            const dist = this.distanceTo(this.attackTarget);
            
            if (dist <= this.range) {
                // In range, stop and attack
                this.moving = false;
                this.targetX = this.x;
                this.targetY = this.y;
                
                if (this.attackCooldown <= 0 && !this.isAttacking) {
                    this.performAttack();
                }
            } else {
                // Move towards target
                this.targetX = this.attackTarget.x;
                this.targetY = this.attackTarget.y;
                this.moving = true;
            }
        } else if (this.attackTarget && this.attackTarget.hp <= 0) {
            this.attackTarget = null;
        }
        
        // Movement
        if (this.moving && !this.isAttacking) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 2) {
                // Check if in formation and calculate speed
                let currentSpeed = this.moveSpeed * this.speedBoost;
                
                if (this.formation) {
                    // If in formation, use formation speed
                    if (this.formation.isMoving) {
                        currentSpeed = this.formation.speed;
                    }
                    
                    // Check distance to formation position for speed boost
                    if (this.formationPosition) {
                        const formDist = Math.sqrt(
                            Math.pow(this.x - this.formationPosition.x, 2) +
                            Math.pow(this.y - this.formationPosition.y, 2)
                        );
                        
                        if (formDist > 5 && formDist < FORMATION_SPEED_BOOST_RANGE) {
                            currentSpeed *= FORMATION_SPEED_BOOST;
                        }
                    }
                }
                
                const moveX = (dx / dist) * currentSpeed;
                const moveY = (dy / dist) * currentSpeed;
                
                // Check collision with obstacles
                const newX = this.x + moveX;
                const newY = this.y + moveY;
                
                if (!this.checkObstacleCollision(newX, newY)) {
                    // Check unit collision/repulsion
                    const repulsion = this.calculateRepulsion();
                    this.x = newX + repulsion.x;
                    this.y = newY + repulsion.y;
                }
            } else {
                this.moving = false;
                if (this.formation && !this.formation.isMoving) {
                    this.formation.checkFormationReady();
                }
            }
        } else {
            this.moving = false;
        }
    }
    
    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;
        
        if (this.type === 'melee') {
            // Melee always hits
            this.attackTarget.takeDamage(this.damage);
        } else {
            // Create projectile for ranged/catapult
            const projectile = new Projectile(
                this.x, 
                this.y,
                this.attackTarget.x, 
                this.attackTarget.y,
                this.damage,
                this.type === 'catapult' ? 5 : 3,
                this.type === 'catapult' ? 2 : 4,
                this, 
                this.attackTarget,
                this.type

            );
            game.projectiles.push(projectile);
        }
    }
    
    takeDamage(damage) {
        this.hp -= damage;
        if (this.hp <= 0) {
            this.hp = 0;
            // Remove from game units
            const index = game.units.indexOf(this);
            if (index > -1) {
                game.units.splice(index, 1);
            }
        }
    }
    
    calculateRepulsion() {
        const repulsion = { x: 0, y: 0 };
        
        // Only apply repulsion if moving
        if (!this.moving) return repulsion;
        
        game.units.forEach(other => {
            if (other === this) return;
            
            const dist = this.distanceTo(other);
            const minDist = this.size + other.size;
            
            if (dist < minDist && dist > 0) {
                // Only repel if the other unit is not attacking
                if (!other.isAttacking) {
                    const force = (minDist - dist) / minDist * 0.5;
                    const dx = this.x - other.x;
                    const dy = this.y - other.y;
                    repulsion.x += (dx / dist) * force;
                    repulsion.y += (dy / dist) * force;
                }
            }
        });
        
        return repulsion;
    }
    
    checkObstacleCollision(x, y) {
        for (let obstacle of game.obstacles) {
            if (x + this.size > obstacle.x &&
                x - this.size < obstacle.x + TILE_SIZE &&
                y + this.size > obstacle.y &&
                y - this.size < obstacle.y + TILE_SIZE) {
                return true;
            }
        }
        return false;
    }
    
    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    draw(ctx) {
        // Draw unit
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Unit body
        ctx.fillStyle = this.team === 1 ? game.team1Color : game.team2Color;
        if (this.type === 'catapult') {
            // Draw catapult as square
            ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
        } else {
            // Draw other units as circles
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw type indicator
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const typeSymbol = this.type === 'melee' ? 'M' : (this.type === 'ranged' ? 'R' : 'C');
        ctx.fillText(typeSymbol, 0, 4);
        
        // Draw selection ring
        if (this.selected) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Draw health bar
        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-this.size, -this.size - 10, this.size * 2, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(-this.size, -this.size - 10, this.size * 2 * (this.hp / this.maxHp), 4);
        }
        
        // Draw attack animation
        if (this.isAttacking && this.attackAnimationTime > 0) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 10, 0, Math.PI * 2 * (this.attackAnimationTime / this.attackAnimationDuration));
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

// Projectile class
class Projectile {
    constructor(x, y, targetX, targetY, damage, size, speed, shooterUnit, targetUnit, damageType) {
        this.x = x;
        this.y = y;
        this.damage = damage;
        this.size = size;
        this.speed = speed;
        this.targetX = targetX
        this.targetY = targetY
        this.shooterUnit = shooterUnit
        this.targetUnit = targetUnit
        this.damageType = damageType

        const dx = this.targetX - x;
        const dy = this.targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
        
        this.active = true;
    }
    
    update() {
        if (!this.active) return;
        
        this.x += this.vx;
        this.y += this.vy;

        // Remove if out of bounds
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
        const dist = Math.sqrt(Math.pow(this.x - this.targetX, 2) + Math.pow(this.y - this.targetY, 2));
            if (dist < this.targetUnit.size){
                this.targetUnit.takeDamage(this.damage);
                this.active = false;
            }
    }
    
    draw(ctx) {
        if (!this.active) return;
        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Formation class
class Formation {
    constructor(units, targetX, targetY) {
        this.units = units;
        this.targetX = targetX;
        this.targetY = targetY;
        this.isMoving = false;
        this.speed = Math.min(...units.map(u => u.moveSpeed));
        
        // Calculate center of mass
        this.centerX = units.reduce((sum, u) => sum + u.x, 0) / units.length;
        this.centerY = units.reduce((sum, u) => sum + u.y, 0) / units.length;
        
        // Assign formation positions
        this.assignFormationPositions();
        
        // Set formation reference in units
        units.forEach(unit => {
            unit.formation = this;
        });
    }
    
    assignFormationPositions() {
        const spacing = 40;
        const cols = Math.ceil(Math.sqrt(this.units.length));
        
        this.units.forEach((unit, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            
            unit.formationPosition = {
                x: this.centerX + (col - cols/2) * spacing,
                y: this.centerY + (row - Math.ceil(this.units.length/cols)/2) * spacing
            };
            
            unit.targetX = unit.formationPosition.x;
            unit.targetY = unit.formationPosition.y;
            unit.moving = true;
        });
    }
    
    checkFormationReady() {
        const unitsInPosition = this.units.filter(unit => {
            if (!unit.formationPosition) return false;
            const dist = Math.sqrt(
                Math.pow(unit.x - unit.formationPosition.x, 2) +
                Math.pow(unit.y - unit.formationPosition.y, 2)
            );
            return dist < 10;
        });
        
        if (unitsInPosition.length >= this.units.length * FORMATION_WAIT_PERCENTAGE) {
            this.startMoving();
        }
    }
    
    startMoving() {
        this.isMoving = true;
        
        const dx = this.targetX - this.centerX;
        const dy = this.targetY - this.centerY;
        
        this.units.forEach(unit => {
            unit.targetX = unit.formationPosition.x + dx;
            unit.targetY = unit.formationPosition.y + dy;
            unit.moving = true;
        });
    }
    
    breakFormation() {
        this.units.forEach(unit => {
            unit.formation = null;
            unit.formationPosition = null;
            unit.speedBoost = 1;
        });
    }
}

// Initialize game
function init() {
    // Create obstacles
    for (let i = 0; i < 30; i++) {
        game.obstacles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height
        });
    }
    
    // Create initial units
    for (let i = 0; i < 5; i++) {
        const type = ['melee', 'ranged', 'catapult'][Math.floor(Math.random() * 3)];
        game.units.push(new Unit(100 + i * 50, 200, 1, type));
    }
    
    for (let i = 0; i < 5; i++) {
        const type = ['melee', 'ranged'][Math.floor(Math.random() * 2)];
        game.units.push(new Unit(500 + i * 50, 400, 2, type));
    }
}

// Input handling
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        game.dragStart = { x: e.clientX, y: e.clientY };
        game.isDragging = false;
        
        // Check if clicking on a unit
        const clickedUnit = getUnitAt(e.clientX, e.clientY);
        
        if (clickedUnit && !e.shiftKey) {
            // Clear previous selection
            game.selectedUnits.forEach(u => u.selected = false);
            game.selectedUnits = [];
        }
        
        if (clickedUnit && clickedUnit.team === 1) {
            if (!clickedUnit.selected) {
                clickedUnit.selected = true;
                game.selectedUnits.push(clickedUnit);
            }
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    game.mousePos = { x: e.clientX, y: e.clientY };
    
    if (game.dragStart && !game.isDragging) {
        const dx = e.clientX - game.dragStart.x;
        const dy = e.clientY - game.dragStart.y;
        if (Math.sqrt(dx*dx + dy*dy) > 5) {
            game.isDragging = true;
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0 && game.isDragging) {
        // Box select
        const rect = {
            x: Math.min(game.dragStart.x, e.clientX),
            y: Math.min(game.dragStart.y, e.clientY),
            width: Math.abs(e.clientX - game.dragStart.x),
            height: Math.abs(e.clientY - game.dragStart.y)
        };
        
        if (!e.shiftKey) {
            game.selectedUnits.forEach(u => u.selected = false);
            game.selectedUnits = [];
        }
        
        game.units.forEach(unit => {
            if (unit.team === 1 &&
                unit.x > rect.x && unit.x < rect.x + rect.width &&
                unit.y > rect.y && unit.y < rect.y + rect.height) {
                if (!unit.selected) {
                    unit.selected = true;
                    game.selectedUnits.push(unit);
                }
            }
        });
    }
    
    game.dragStart = null;
    game.isDragging = false;
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    if (game.selectedUnits.length > 0) {
        const targetUnit = getUnitAt(e.clientX, e.clientY);
        
        if (targetUnit && targetUnit.team !== 1) {
            // Attack command
            game.selectedUnits.forEach(unit => {
                unit.attackTarget = targetUnit;
                unit.formation = null;
                unit.formationPosition = null;
            });
        } else {
            // Move command
            if (game.selectedUnits.length > 1) {
                // Create formation
                const formation = new Formation(game.selectedUnits, e.clientX, e.clientY);
            } else {
                // Single unit move
                game.selectedUnits[0].targetX = e.clientX;
                game.selectedUnits[0].targetY = e.clientY;
                game.selectedUnits[0].moving = true;
                game.selectedUnits[0].attackTarget = null;
                game.selectedUnits[0].formation = null;
            }
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 's') {
        // Stop command
        game.selectedUnits.forEach(unit => {
            unit.targetX = unit.x;
            unit.targetY = unit.y;
            unit.moving = false;
            unit.attackTarget = null;
            if (unit.formation) {
                unit.formation.breakFormation();
            }
        });
    }
});

function getUnitAt(x, y) {
    for (let unit of game.units) {
        const dist = Math.sqrt(Math.pow(x - unit.x, 2) + Math.pow(y - unit.y, 2));
        if (dist < unit.size) {
            return unit;
        }
    }
    return null;
}

// Game loop
let lastTime = 0;
function gameLoop(currentTime) {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    // Update
    game.units.forEach(unit => unit.update(deltaTime));
    
    // Update projectiles
    game.projectiles = game.projectiles.filter(p => {
        p.update();
        return p.active;
    });
    
    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw obstacles
    ctx.fillStyle = '#666';
    game.obstacles.forEach(obstacle => {
        ctx.fillRect(obstacle.x, obstacle.y, TILE_SIZE, TILE_SIZE);
    });
    
    // Draw units
    game.units.forEach(unit => unit.draw(ctx));
    
    // Draw projectiles
    game.projectiles.forEach(p => p.draw(ctx));
    
    // Draw selection box
    if (game.isDragging && game.dragStart) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            game.dragStart.x,
            game.dragStart.y,
            game.mousePos.x - game.dragStart.x,
            game.mousePos.y - game.dragStart.y
        );
        ctx.setLineDash([]);
    }
    
    // Draw UI
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Selected: ${game.selectedUnits.length} units`, 10, 30);
    ctx.fillText('Controls: Left click/drag - Select | Right click - Move/Attack | S - Stop', 10, canvas.height - 10);
    
    requestAnimationFrame(gameLoop);
}

// Start game
init();
requestAnimationFrame(gameLoop);

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
