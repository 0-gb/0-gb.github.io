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
const HIT_THRESHOLD = 5;

// A* Pathfinding
class AStar {
    constructor() {
        this.gridWidth = Math.ceil(canvas.width / TILE_SIZE);
        this.gridHeight = Math.ceil(canvas.height / TILE_SIZE);
    }

    // CHANGED: Helper to check if a grid cell is blocked by an obstacle OR another unit
    isBlocked(gx, gy, movingUnit = null) {
        // Bounds check
        if (gx < 0 || gy < 0 || gx >= this.gridWidth || gy >= this.gridHeight) return true;
        
        // Static obstacle check
        const wx = gx * TILE_SIZE;
        const wy = gy * TILE_SIZE;
        for (let ob of game.obstacles) {
            if (ob.x === wx && ob.y === wy) return true;
        }

        // NEW: Dynamic unit check
        const tileRect = { x: wx, y: wy, width: TILE_SIZE, height: TILE_SIZE };
        for (const other of game.units) {
            // Ignore the unit that is calculating the path
            if (movingUnit && other.id === movingUnit.id) continue;

            // Simple circle-rectangle intersection test
            const circle = { x: other.x, y: other.y, radius: other.size };
            const closestX = Math.max(tileRect.x, Math.min(circle.x, tileRect.x + tileRect.width));
            const closestY = Math.max(tileRect.y, Math.min(circle.y, tileRect.y + tileRect.height));
            const distanceSq = Math.pow(circle.x - closestX, 2) + Math.pow(circle.y - closestY, 2);

            if (distanceSq < (circle.radius * circle.radius)) {
                return true; // The tile is blocked by another unit
            }
        }
        return false;
    }


    // Heuristic: Euclidean distance between grid cells
    heuristic(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // CHANGED: Find path using A*, now accepts the moving unit to ignore it in checks
    findPath(startX, startY, targetX, targetY, movingUnit = null) {
        const startGX = Math.floor(startX / TILE_SIZE);
        const startGY = Math.floor(startY / TILE_SIZE);
        const targetGX = Math.floor(targetX / TILE_SIZE);
        const targetGY = Math.floor(targetY / TILE_SIZE);

        if (this.isBlocked(startGX, startGY, movingUnit)) {
            return null;
        }
        if (this.isBlocked(targetGX, targetGY, movingUnit)) {
            return null;
        }

        if (startGX === targetGX && startGY === targetGY) {
            return [{ x: startX, y: startY }, { x: targetGX * TILE_SIZE + TILE_SIZE / 2, y: targetGY * TILE_SIZE + TILE_SIZE / 2 }];
        }

        const openSet = new Set();
        const openHeap = [];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${startGX},${startGY}`;
        const targetKey = `${targetGX},${targetGY}`;

        function setG(key, value) { gScore.set(key, value); }
        function getG(key) { return gScore.has(key) ? gScore.get(key) : Infinity; }
        function setF(key, value) { fScore.set(key, value); }
        function getF(key) { return fScore.has(key) ? fScore.get(key) : Infinity; }

        openSet.add(startKey);
        openHeap.push(startKey);
        setG(startKey, 0);
        setF(startKey, this.heuristic(startGX, startGY, targetGX, targetGY));
        cameFrom.set(startKey, null);

        const neighbors = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];

        while (openSet.size > 0) {
            let currentKey = null;
            let bestF = Infinity;
            let bestIndex = -1;
            for (let i = 0; i < openHeap.length; i++) {
                const k = openHeap[i];
                const f = getF(k);
                if (f < bestF) {
                    bestF = f;
                    currentKey = k;
                    bestIndex = i;
                }
            }

            if (currentKey === null) break;

            if (currentKey === targetKey) {
                return this.reconstructPath(cameFrom, currentKey, startX, startY);
            }

            openSet.delete(currentKey);
            if (bestIndex > -1) openHeap.splice(bestIndex, 1);

            const [cx, cy] = currentKey.split(',').map(Number);

            for (let [dx, dy] of neighbors) {
                const nx = cx + dx;
                const ny = cy + dy;
                const neighborKey = `${nx},${ny}`;

                if (nx < 0 || ny < 0 || nx >= this.gridWidth || ny >= this.gridHeight) continue;
                // CHANGED: Pass movingUnit to isBlocked check
                if (this.isBlocked(nx, ny, movingUnit)) continue;

                if (dx !== 0 && dy !== 0) {
                    // CHANGED: Pass movingUnit to corner-cutting check
                    if (this.isBlocked(cx + dx, cy, movingUnit) || this.isBlocked(cx, cy + dy, movingUnit)) {
                        continue;
                    }
                }

                const tentativeG = getG(currentKey) + ((dx === 0 || dy === 0) ? 1 : Math.SQRT2);

                if (tentativeG < getG(neighborKey)) {
                    cameFrom.set(neighborKey, currentKey);
                    setG(neighborKey, tentativeG);
                    const h = this.heuristic(nx, ny, targetGX, targetGY);
                    setF(neighborKey, tentativeG + h);

                    if (!openSet.has(neighborKey)) {
                        openSet.add(neighborKey);
                        openHeap.push(neighborKey);
                    }
                }
            }
        }
        return null;
    }

    reconstructPath(cameFrom, currentKey, startX, startY) {
        const path = [];
        let current = currentKey;
        
        const nodes = [];
        while (current) {
            const [x, y] = current.split(',').map(Number);
            nodes.unshift({ 
                x: x * TILE_SIZE + TILE_SIZE / 2, 
                y: y * TILE_SIZE + TILE_SIZE / 2 
            });
            current = cameFrom.get(current);
        }

        path.push({ x: startX, y: startY });
        if (nodes.length > 0) {
            const firstNode = nodes[0];
            const startTileX = Math.floor(startX / TILE_SIZE);
            const startTileY = Math.floor(startY / TILE_SIZE);
            const firstNodeTileX = Math.floor(firstNode.x / TILE_SIZE);
            const firstNodeTileY = Math.floor(firstNode.y / TILE_SIZE);
            
            if (startTileX === firstNodeTileX && startTileY === firstNodeTileY) {
                nodes.shift();
            }
        }
        path.push(...nodes);
        return path;
    }
}

// Global A* instance
const pathfinder = new AStar();

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

// Base Unit class
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
    
    constructor(x, y, team, type) {
        this.id = generateId();
        this.x = x;
        this.y = y;
        this.team = team;
        this.type = type;
        this.selected = false;
        
        this.hp = 0;
        this.maxHp = 0;
        this.damage = 0;
        this.range = 0;
        this.attackSpeed = 0;
        this.moveSpeed = 0;
        this.size = 0;
        
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
        
        this.path = null;
        this.currentPathIndex = 0;
        
        this.attackAnimationTime = 0;
        this.attackAnimationDuration = 300; // ms

        // NEW: Properties for collision handling and waiting
        this.isWaiting = false;
        this.waitTimer = 0;
        this.MAX_WAIT_TIME = 300; // ms to wait before recalculating path
    }
    
    update(deltaTime) {
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
        
        if (this.attackAnimationTime > 0) {
            this.attackAnimationTime -= deltaTime;
            if (this.attackAnimationTime <= 0) {
                this.isAttacking = false;
            }
        }
        
        if (this.attackTarget && this.attackTarget.hp > 0) {
            const dist = this.distanceTo(this.attackTarget);
            if (dist <= this.range) {
                this.moving = false;
                this.targetX = this.x;
                this.targetY = this.y;
                if (this.attackCooldown <= 0 && !this.isAttacking) {
                    this.performAttack();
                }
            } else {
                this.targetX = this.attackTarget.x;
                this.targetY = this.attackTarget.y;
                this.moving = true;
            }
        } else if (this.attackTarget && this.attackTarget.hp <= 0) {
            this.attackTarget = null;
        }
        
        if (this.moving && !this.isAttacking) {
            if (this.formation) {
                // Formation movement
                const dx = this.targetX - this.x;
                const dy = this.targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > 2) {
                    let currentSpeed = this.moveSpeed * this.speedBoost;
                    if (this.formation.isMoving) {
                        currentSpeed = this.formation.speed;
                    }
                    if (this.formationPosition) {
                        const formDist = Math.sqrt(
                            Math.pow(this.x - this.formationPosition.x, 2) +
                            Math.pow(this.y - this.formationPosition.y, 2)
                        );
                        if (formDist > 5 && formDist < FORMATION_SPEED_BOOST_RANGE) {
                            currentSpeed *= FORMATION_SPEED_BOOST;
                        }
                    }
                    
                    const moveX = (dx / dist) * currentSpeed;
                    const moveY = (dy / dist) * currentSpeed;
                    const newX = this.x + moveX;
                    const newY = this.y + moveY;
                    
                    // CHANGED: Removed repulsion logic
                    if (!this.checkObstacleCollision(newX, newY)) {
                        this.x = newX;
                        this.y = newY;
                    }
                } else {
                    this.moving = false;
                    if (this.formation && !this.formation.isMoving) {
                        this.formation.checkFormationReady();
                    }
                }
            } else {
                // Single unit movement with A*
                this.followPath(deltaTime);
            }
        } else {
            this.moving = false;
        }
    }
    
    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;
        this.attackTarget.takeDamage(this.damage);
    }
    
    takeDamage(damage) {
        this.hp -= damage;
        if (this.hp <= 0) {
            this.hp = 0;
            const index = game.units.indexOf(this);
            if (index > -1) {
                game.units.splice(index, 1);
            }
        }
    }
    
    // REMOVED: calculateRepulsion() function deleted entirely.

    // NEW: Helper function to check for collisions with other units
    isCollidingWithUnits(x, y) {
        for (const other of game.units) {
            if (other.id === this.id) continue;
            const distSq = Math.pow(x - other.x, 2) + Math.pow(y - other.y, 2);
            const minDisSq = Math.pow(this.size + other.size, 2);
            if (distSq < minDisSq) {
                return true; // Collision detected
            }
        }
        return false;
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
    
    // CHANGED: Rewritten path following logic
    followPath(deltaTime) {
        if (!this.path || this.currentPathIndex >= this.path.length) {
            this.moving = false;
            this.isWaiting = false;
            return;
        }

        // If waiting, update timer and check if we should recalculate path
        if (this.isWaiting) {
            this.waitTimer += deltaTime;
            if (this.waitTimer >= this.MAX_WAIT_TIME) {
                this.isWaiting = false;
                this.waitTimer = 0;
                // Recalculate path to the final destination
                const finalTarget = this.path[this.path.length - 1];
                this.setPath(finalTarget.x, finalTarget.y);
            }
            return; // Don't move while waiting
        }

        const targetWaypoint = this.path[this.currentPathIndex];
        const dx = targetWaypoint.x - this.x;
        const dy = targetWaypoint.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) { // Reached waypoint
            this.currentPathIndex++;
            if (this.currentPathIndex >= this.path.length) {
                this.moving = false;
            }
            return;
        }

        // Calculate prospective move for this frame
        const currentSpeed = this.moveSpeed * this.speedBoost;
        const moveX = (dx / dist) * currentSpeed;
        const moveY = (dy / dist) * currentSpeed;
        const nextX = this.x + moveX;
        const nextY = this.y + moveY;

        // Check for collision with other units before moving
        if (this.isCollidingWithUnits(nextX, nextY)) {
            this.isWaiting = true; // Blocked, so start waiting
            this.waitTimer = 0;
            return; // Stop moving this frame
        }
        
        // Path is clear, perform the move
        this.x = nextX;
        this.y = nextY;
    }
    
    // CHANGED: setPath now passes the unit itself to the pathfinder
    setPath(targetX, targetY) {
        // Pass 'this' so the pathfinder can ignore this unit in its obstacle checks
        this.path = pathfinder.findPath(this.x, this.y, targetX, targetY, this);
        this.currentPathIndex = 0;
        this.moving = true;
        // Reset waiting state on new path
        this.isWaiting = false;
        this.waitTimer = 0;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.team === 1 ? game.team1Color : game.team2Color;
        if (this.type === 'catapult') {
            ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const typeSymbol = this.type === 'knight' ? 'K' : 
                          (this.type === 'archer' ? 'A' : 
                          (this.type === 'catapult' ? 'C' : 'P'));
        ctx.fillText(typeSymbol, 0, 4);
        if (this.selected) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-this.size, -this.size - 10, this.size * 2, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(-this.size, -this.size - 10, this.size * 2 * (this.hp / this.maxHp), 4);
        }
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

// Knight class - melee unit
class Knight extends Unit {
    constructor(x, y, team) {
        super(x, y, team, 'knight');
        this.hp = this.maxHp = 120;
        this.damage = 25;
        this.range = 40;
        this.attackSpeed = 900;
        this.moveSpeed = 1.4;
        this.size = 16;
    }
}

// Catapult class - siege unit
class Catapult extends Unit {
    constructor(x, y, team) {
        super(x, y, team, 'catapult');
        this.hp = this.maxHp = 200;
        this.damage = 50;
        this.range = 250;
        this.attackSpeed = 3000;
        this.moveSpeed = 0.5;
        this.size = 20;
        this.projectileSize = 5;
        this.projectileSpeed = 2;
    }
    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;
        const projectile = new Projectile(
            this.x, this.y, this.attackTarget.x, this.attackTarget.y,
            this.damage, this.projectileSize, this.projectileSpeed,
            this, this.attackTarget, this.type
        );
        game.projectiles.push(projectile);
    }
}

// Archer class - ranged unit
class Archer extends Unit {
    constructor(x, y, team) {
        super(x, y, team, 'archer');
        this.hp = this.maxHp = 80;
        this.damage = 15;
        this.range = 150;
        this.attackSpeed = 1500;
        this.moveSpeed = 1.0;
        this.size = 14;
        this.projectileSize = 3;
        this.projectileSpeed = 4;
    }
    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;
        const projectile = new Projectile(
            this.x, this.y, this.attackTarget.x, this.attackTarget.y,
            this.damage, this.projectileSize, this.projectileSpeed,
            this, this.attackTarget, this.type
        );
        game.projectiles.push(projectile);
    }
}

// Pikeman class - melee unit with anti-cavalry bonus
class Pikeman extends Unit {
    constructor(x, y, team) {
        super(x, y, team, 'pikeman');
        this.hp = this.maxHp = 100;
        this.damage = 18;
        this.range = 40;
        this.attackSpeed = 1100;
        this.moveSpeed = 1.1;
        this.size = 15;
    }
    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;
        let actualDamage = this.damage;
        if (this.attackTarget && this.attackTarget.type === 'knight') {
            actualDamage *= 1.5;
        }
        this.attackTarget.takeDamage(actualDamage);
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
        this.targetX = targetX;
        this.targetY = targetY;
        this.shooterUnit = shooterUnit;
        this.targetUnit = targetUnit;
        this.damageType = damageType;
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
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
        let xdif = this.targetX - this.x;
        if (this.vx < 0) xdif = this.x - this.targetX;
        let ydif = this.targetY - this.y;
        if (this.vy < 0) ydif = this.y - this.targetY;
        if (xdif <= HIT_THRESHOLD && ydif <= HIT_THRESHOLD) {
            this.active = false;
            const dist = Math.sqrt(Math.pow(this.x - this.targetUnit.x, 2) + Math.pow(this.y - this.targetUnit.y, 2));
            if (dist < this.targetUnit.size) {
                this.targetUnit.takeDamage(this.damage);
            }
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
        this.centerX = units.reduce((sum, u) => sum + u.x, 0) / units.length;
        this.centerY = units.reduce((sum, u) => sum + u.y, 0) / units.length;
        this.assignFormationPositions();
        units.forEach(unit => unit.formation = this);
    }
    assignFormationPositions() {
        const spacing = 40;
        const cols = Math.ceil(Math.sqrt(this.units.length));
        this.units.forEach((unit, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            unit.formationPosition = {
                x: this.centerX + (col - cols / 2) * spacing,
                y: this.centerY + (row - Math.ceil(this.units.length / cols) / 2) * spacing
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

// The rest of your code (drawing, initialization, input handling) remains largely the same
// as it correctly calls the modified Unit methods.

function drawGrid() {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x - game.camera.x % TILE_SIZE, 0);
        ctx.lineTo(x - game.camera.x % TILE_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y - game.camera.y % TILE_SIZE);
        ctx.lineTo(canvas.width, y - game.camera.y % TILE_SIZE);
        ctx.stroke();
    }
}

function init() {
    for (let i = 0; i < 30; i++) {
        const gridX = Math.floor(Math.random() * (canvas.width / TILE_SIZE)) * TILE_SIZE;
        const gridY = Math.floor(Math.random() * (canvas.height / TILE_SIZE)) * TILE_SIZE;
        game.obstacles.push({ x: gridX, y: gridY });
    }
    for (let i = 0; i < 5; i++) {
        const unitType = Math.floor(Math.random() * 4);
        switch(unitType) {
            case 0: game.units.push(new Knight(100 + i * 50, 200, 1)); break;
            case 1: game.units.push(new Archer(100 + i * 50, 200, 1)); break;
            case 2: game.units.push(new Catapult(100 + i * 50, 200, 1)); break;
            case 3: game.units.push(new Pikeman(100 + i * 50, 200, 1)); break;
        }
    }
    for (let i = 0; i < 5; i++) {
        const unitType = Math.floor(Math.random() * 3);
        switch(unitType) {
            case 0: game.units.push(new Knight(500 + i * 50, 400, 2)); break;
            case 1: game.units.push(new Archer(500 + i * 50, 400, 2)); break;
            case 2: game.units.push(new Pikeman(500 + i * 50, 400, 2)); break;
        }
    }
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        game.dragStart = { x: e.clientX, y: e.clientY };
        game.isDragging = false;
        const clickedUnit = getUnitAt(e.clientX, e.clientY);
        if (clickedUnit && !e.shiftKey) {
            game.selectedUnits.forEach(u => u.selected = false);
            game.selectedUnits = [];
        }
        if (clickedUnit) {
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
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            game.isDragging = true;
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0 && game.isDragging) {
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
            if (unit.x > rect.x && unit.x < rect.x + rect.width &&
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
            game.selectedUnits.forEach(unit => {
                unit.attackTarget = targetUnit;
                unit.formation = null;
                unit.formationPosition = null;
            });
        } else {
            if (game.selectedUnits.length > 1) {
                new Formation(game.selectedUnits, e.clientX, e.clientY);
            } else {
                game.selectedUnits[0].setPath(e.clientX, e.clientY);
                game.selectedUnits[0].attackTarget = null;
                game.selectedUnits[0].formation = null;
            }
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 's') {
        game.selectedUnits.forEach(unit => {
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
    
    // Draw grid
    drawGrid();
    
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
