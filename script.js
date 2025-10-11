// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TILE_SIZE = 32;
const FORMATION_WAIT_PERCENTAGE = 0.95;
const FORMATION_OBSTACLE_AVOIDANCE_DISTANCE = 15;
const FORMATION_SPEED_BOOST_RANGE = 10 * TILE_SIZE;
const FORMATION_CHASING_SPEED_BOOST = 1.5;
const HIT_THRESHOLD = 5;
const FORMATION_UNIT_DISTANCE = 20
const FORMATION_PIECE_DISTANCE  = 15
const MIN_RANGE_BUFFER = 20
const OBSTACLE_COUNT = 15


// Stance enum - available to all classes
const Stance = {
    STANDING: 'standing',
    MOVING: 'moving',
    MOVING_IN_FORMATION: 'moving in formation',
    CHASING_A_FORMATION: 'chasing a formation',
    CHASING_A_TARGET: 'chasing a target',
    ATTACKING_AT_PLACE: 'attacking at place',
    STRIKING: 'striking'
};

class AStar {
    constructor() {
        this.gridWidth = Math.ceil(canvas.width / TILE_SIZE);
        this.gridHeight = Math.ceil(canvas.height / TILE_SIZE);
    }

    // Helper: check if a grid cell is blocked by an obstacle
    isBlocked(gx, gy) {
        if (gx < 0 || gy < 0 || gx >= this.gridWidth || gy >= this.gridHeight) return true;
        // obstacles are stored in world coordinates aligned to the grid
        const wx = gx * TILE_SIZE;
        const wy = gy * TILE_SIZE;
        for (let ob of game.obstacles) {
            if (ob.x === wx && ob.y === wy) return true;
        }
        return false;
    }

    // Heuristic: Euclidean distance between grid cells
    heuristic(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Find path using A* algorithm
    findPath(startX, startY, targetX, targetY) {
        // Convert world coords to grid coords
        const startGX = Math.floor(startX / TILE_SIZE);
        const startGY = Math.floor(startY / TILE_SIZE);
        const targetGX = Math.floor(targetX / TILE_SIZE);
        const targetGY = Math.floor(targetY / TILE_SIZE);

        // If start or target is outside or blocked, bail out
        if (this.isBlocked(startGX, startGY)) {
            return null;
        }
        if (this.isBlocked(targetGX, targetGY)) {
            return null;
        }

        // If start and target are same tile, return immediate path (start -> center of tile)
        if (startGX === targetGX && startGY === targetGY) {
            return [{ x: startX, y: startY }, { x: targetGX * TILE_SIZE + TILE_SIZE / 2, y: targetGY * TILE_SIZE + TILE_SIZE / 2 }];
        }

        // A* structures
        const openSet = new Set();
        const openHeap = []; // array of nodes for selecting lowest f (simple linear search)
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

        // 8-direction neighbors
        const neighbors = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];

        while (openSet.size > 0) {
            // find node in openHeap with lowest fScore
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

            // if reached target, reconstruct
            if (currentKey === targetKey) {
                const rawPath = this.reconstructPath(cameFrom, currentKey, startX, startY, targetX, targetY);
                // Smooth the path before returning it
                return this.smoothPath(rawPath, game.obstacles);
            }

            // remove current from openSet and openHeap
            openSet.delete(currentKey);
            if (bestIndex > -1) openHeap.splice(bestIndex, 1);

            const [cx, cy] = currentKey.split(',').map(Number);

            for (let [dx, dy] of neighbors) {
                const nx = cx + dx;
                const ny = cy + dy;
                const neighborKey = `${nx},${ny}`;

                // bounds & blocked check
                if (nx < 0 || ny < 0 || nx >= this.gridWidth || ny >= this.gridHeight) continue;
                if (this.isBlocked(nx, ny)) continue;

                // Prevent cutting corners: if diagonal, ensure both adjacent orthogonals are free
                if (dx !== 0 && dy !== 0) {
                    if (this.isBlocked(cx + dx, cy) || this.isBlocked(cx, cy + dy)) {
                        continue;
                    }
                }

                // tentative g score
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

    reconstructPath(cameFrom, currentKey, startX, startY, targetX, targetY) {
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

        // Always start from actual position
        path.push({ x: startX, y: startY });

        // Skip the first node if it’s the same tile we started in
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

        // Add nodes but override the final one with exact target
        if (nodes.length > 0) {
            path.push(...nodes.slice(0, -1)); // all but last
        }
        path.push({ x: targetX, y: targetY }); // exact target point

        return path;
    }

    smoothPath(rawPath, obstacles) {
        if (rawPath.length <= 2) {
            return rawPath; // No smoothing needed for paths with 2 or fewer points
        }

        const smoothedPath = [rawPath[0]]; // Start with the first point
        let currentIndex = 0;

        while (currentIndex < rawPath.length - 1) {
            let nextIndex = currentIndex + 1;
            while (nextIndex < rawPath.length) {
                const startPoint = smoothedPath[smoothedPath.length - 1];
                const endPoint = rawPath[nextIndex];
                let hasObstacle = false;

                // Check if the line between startPoint and endPoint intersects any obstacles
                for (const obstacle of obstacles) {
                    if (lineIntersectsAABB(startPoint.x, startPoint.y, endPoint.x, endPoint.y, obstacle)) {
                        hasObstacle = true;
                        break;
                    }
                }

                if (!hasObstacle) {
                    // If there's no obstacle, we can skip all intermediate points
                    nextIndex++;
                } else {
                    // If there's an obstacle, we can only go up to the previous point
                    nextIndex--;
                    break;
                }
            }

            if (nextIndex >= rawPath.length) {
                nextIndex = rawPath.length - 1;
            }

            if (nextIndex > currentIndex) {
                smoothedPath.push(rawPath[nextIndex]);
                currentIndex = nextIndex;
            } else {
                // If we couldn't find a clear path, move to the next point
                currentIndex++;
                if (currentIndex < rawPath.length) {
                    smoothedPath.push(rawPath[currentIndex]);
                }
            }
        }

        return smoothedPath;
    }
}

// Helper function to check if a line segment intersects an AABB
function lineIntersectsAABB(x1, y1, x2, y2, obstacle) {
    // Check if either endpoint is inside the obstacle
    if ((x1 >= obstacle.x && x1 <= obstacle.x + TILE_SIZE &&
         y1 >= obstacle.y && y1 <= obstacle.y + TILE_SIZE) ||
        (x2 >= obstacle.x && x2 <= obstacle.x + TILE_SIZE &&
         y2 >= obstacle.y && y2 <= obstacle.y + TILE_SIZE)) {
        return true;
    }

    // Check if the line segment intersects any of the edges of the AABB
    const edges = [
        // Top edge
        { x1: obstacle.x, y1: obstacle.y, x2: obstacle.x + TILE_SIZE, y2: obstacle.y },
        // Right edge
        { x1: obstacle.x + TILE_SIZE, y1: obstacle.y, x2: obstacle.x + TILE_SIZE, y2: obstacle.y + TILE_SIZE },
        // Bottom edge
        { x1: obstacle.x, y1: obstacle.y + TILE_SIZE, x2: obstacle.x + TILE_SIZE, y2: obstacle.y + TILE_SIZE },
        // Left edge
        { x1: obstacle.x, y1: obstacle.y, x2: obstacle.x, y2: obstacle.y + TILE_SIZE }
    ];

    for (const edge of edges) {
        if (lineSegmentsIntersect(x1, y1, x2, y2, edge.x1, edge.y1, edge.x2, edge.y2)) {
            return true;
        }
    }

    return false;
}

// Helper function to check if two line segments intersect
function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Calculate the direction of the lines
    const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
    const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

    // If uA and uB are between 0 and 1, the lines intersect
    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
        return true;
    }

    return false;
}

// Global A* instance
const pathfinder = new AStar();

// Base Unit class
class Unit {
    constructor(x, y, team, type) {
        this.x = x;
        this.y = y;
        this.team = team;
        this.type = type;
        this.selected = false;

        // Unit stats will be set by child classes
        this.hp = 0;
        this.maxHp = 0;
        this.damage = 0;
        this.maxRange = 0;
        this.attackSpeed = 0;
        this.moveSpeed = 0;
        this.radius = 0;

        this.targetX = x;
        this.targetY = y;
        this.attackTarget = null;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.moving = false;
        this.formation = null;
        this.formationPosition = null;
        this.formationOrder = 0; // Default value, will be overridden by child classes

        // For pathfinding
        this.path = null;
        this.currentPathIndex = 0;

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

            // Check if we're in the valid attack range (not too close, not too far)
            const tooClose = this.minRange && dist < this.minRange;
            const tooFar = dist > this.maxRange;
            const inRange = !tooClose && !tooFar;

            if (inRange) {
                // In range, stop and attack
                this.moving = false;
                this.path = null; // Clear path when in range
                this.targetX = this.x;
                this.targetY = this.y;

                if (this.attackCooldown <= 0 && !this.isAttacking) {
                    this.performAttack();
                }
            } else if (tooClose) {
                const dx = this.x - this.attackTarget.x;
                const dy = this.y - this.attackTarget.y;
                const angle = Math.atan2(dy, dx);
                
                const safeDistance = this.minRange + MIN_RANGE_BUFFER;
                const retreatX = this.attackTarget.x + Math.cos(angle) * safeDistance;
                const retreatY = this.attackTarget.y + Math.sin(angle) * safeDistance;
                
                const needsNewPath = !this.path || 
                                    this.currentPathIndex >= this.path.length ||
                                    Math.abs(this.targetX - retreatX) > TILE_SIZE / 2 ||
                                    Math.abs(this.targetY - retreatY) > TILE_SIZE / 2;
                
                if (needsNewPath) {
                    this.targetX = retreatX;
                    this.targetY = retreatY;
                    
                    if (!this.formation) {
                        this.setPath(retreatX, retreatY);
            } else {
                        this.moving = true;
                    }
                }
            } else if (tooFar) {
                const needsNewPath = !this.path || 
                                    this.currentPathIndex >= this.path.length ||
                                    Math.abs(this.targetX - this.attackTarget.x) > TILE_SIZE / 2 ||
                                    Math.abs(this.targetY - this.attackTarget.y) > TILE_SIZE / 2;
                
                if (needsNewPath) {
                this.targetX = this.attackTarget.x;
                this.targetY = this.attackTarget.y;
                    
                    if (!this.formation) {
                        this.setPath(this.attackTarget.x, this.attackTarget.y);
                    } else {
                this.moving = true;
                    }
                }
            }
        } else if (this.attackTarget && this.attackTarget.hp <= 0) {
            this.attackTarget = null;
        }

        if (this.moving && !this.isAttacking) {
            if (this.formation) {
                const dx = this.targetX - this.x;
                const dy = this.targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 2) {
                    let currentSpeed = this.moveSpeed;

                    if (this.formation.isMoving) {
                        currentSpeed = this.formation.speed;
                    }

                    if (this.formationPosition) {
                        const formDist = Math.sqrt(
                            Math.pow(this.x - this.formationPosition.x, 2) +
                            Math.pow(this.y - this.formationPosition.y, 2)
                        );

                        if (formDist > 5 && formDist < FORMATION_SPEED_BOOST_RANGE) {
                            currentSpeed *= FORMATION_CHASING_SPEED_BOOST;
                        }
                    }

                    let moveX = (dx / dist) * currentSpeed;
                    let moveY = (dy / dist) * currentSpeed;

                    const newX = this.x + moveX;
                    const newY = this.y + moveY;
                    
                    // Check if the new position would collide with obstacles
                    if (!this.checkObstacleCollision(newX, newY)) {
                        this.x = newX;
                        this.y = newY;
                    } else {
                        // Collision detected, stop moving and recalculate path
                        this.moving = false;
                        if (this.formation && !this.formation.isMoving) {
                            this.formation.checkFormationReady();
                        }
                    }
                } else {
                    this.moving = false;
                    if (this.formation && !this.formation.isMoving) {
                        this.formation.checkFormationReady();
                    }
                }
            } else {
                // Single unit movement with A* pathfinding
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

            if (this.formation && other.formation && this.formation === other.formation) {
                return;
            }

            const dist = this.distanceTo(other);
            const minDist = this.radius + other.radius;

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

        game.obstacles.forEach(obstacle => {
            const closestX = Math.max(obstacle.x, Math.min(this.x, obstacle.x + TILE_SIZE));
            const closestY = Math.max(obstacle.y, Math.min(this.y, obstacle.y + TILE_SIZE));
            
            const dx = this.x - closestX;
            const dy = this.y - closestY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist*0.5 < this.radius) {
                const force = (this.radius - dist) / this.radius * 0.8; // Stronger repulsion from obstacles
                repulsion.x += -(dx / dist) * force;
                repulsion.y += -(dy / dist) * force;
            }
        });

        return repulsion;
    }

    checkObstacleCollision(x, y) {
        for (let obstacle of game.obstacles) {
            if (x + this.radius > obstacle.x &&
                x - this.radius < obstacle.x + TILE_SIZE &&
                y + this.radius > obstacle.y &&
                y - this.radius < obstacle.y + TILE_SIZE) {
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

    followPath(deltaTime) {
        if (!this.path || this.currentPathIndex >= this.path.length) {
            this.moving = false;
            return;
        }

        // Current target waypoint
        const targetWaypoint = this.path[this.currentPathIndex];
        let dx = targetWaypoint.x - this.x;
        let dy = targetWaypoint.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        const isFinalWaypoint = (this.currentPathIndex === this.path.length - 1);
        const currentSpeed = this.moveSpeed;

        // If we're exactly on the waypoint already
        if (dist === 0) {
            if (isFinalWaypoint) {
                this.moving = false;
            }
            this.currentPathIndex++;
            return;
        }


        if (isFinalWaypoint) {
            const SNAP_TOLERANCE = 2; // pixels

            // If we're very close, snap exactly and finish
            if (dist <= SNAP_TOLERANCE) {
                this.x = targetWaypoint.x;
                this.y = targetWaypoint.y;
                this.currentPathIndex++;
                this.moving = false;
                return;
            }

            // Otherwise, move toward final waypoint (and guard against overshoot caused by repulsion)
            const moveX = (dx / dist) * currentSpeed;
            const moveY = (dy / dist) * currentSpeed;
            const repulsion = this.calculateRepulsion();

            const newX = this.x + moveX + repulsion.x;
            const newY = this.y + moveY + repulsion.y;

            // Check if the new position would collide with obstacles
            if (!this.checkObstacleCollision(newX, newY)) {
            // If the movement would pass the waypoint (dot product <= 0) — snap to avoid skipping
            const dot = (targetWaypoint.x - this.x) * (targetWaypoint.x - newX) +
                (targetWaypoint.y - this.y) * (targetWaypoint.y - newY);
            if (dot <= 0) {
                this.x = targetWaypoint.x;
                this.y = targetWaypoint.y;
                this.currentPathIndex++;
                this.moving = false;
                return;
            }

            // Otherwise apply the move normally
            this.x = newX;
            this.y = newY;
            } else {
                // Collision detected, recalculate path
                this.setPath(targetWaypoint.x, targetWaypoint.y);
            }
            return; // important: don't fall-through to non-final logic
        }

        // -- NON-final waypoint behavior with collision detection --
        if (dist < TILE_SIZE / 2) {
            // reached intermediate waypoint, go to next
            this.currentPathIndex++;
            if (this.currentPathIndex >= this.path.length) {
                this.moving = false;
                return;
            }
        } else {
            // move toward intermediate waypoint
            const moveX = (dx / dist) * currentSpeed;
            const moveY = (dy / dist) * currentSpeed;
            const repulsion = this.calculateRepulsion();
            
            const newX = this.x + moveX + repulsion.x;
            const newY = this.y + moveY + repulsion.y;
            
            // Check if the new position would collide with obstacles
            if (!this.checkObstacleCollision(newX, newY)) {
                this.x = newX;
                this.y = newY;
            } else {
                // Collision detected, recalculate path
                this.setPath(targetWaypoint.x, targetWaypoint.y);
            }
        }
    }

    // Set path for movement
    setPath(targetX, targetY) {
        this.path = pathfinder.findPath(this.x, this.y, targetX, targetY);
        this.path[this.path.length - 1].x = targetX
        this.path[this.path.length - 1].y = targetY
        this.currentPathIndex = 0;
        this.moving = true;
    }

    draw(ctx) {
        // Draw unit as circle
        ctx.save();
        ctx.translate(this.x, this.y);

        // Unit body - always draw as circle
        ctx.fillStyle = this.team === 1 ? game.team1Color : game.team2Color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw type indicator (simplified)
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const typeSymbol = this.type === 'knight' ? 'K' :
            (this.type === 'archer' ? 'A' :
                (this.type === 'catapult' ? 'C' : 'P'));
        ctx.fillText(typeSymbol, 0, 4);

        // Draw selection ring
        if (this.selected) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw health bar
        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-this.radius, -this.radius - 10, this.radius * 2, 4);
            ctx.fillStyle = 'green';
            ctx.fillRect(-this.radius, -this.radius - 10, this.radius * 2 * (this.hp / this.maxHp), 4);
        }

        // Draw attack animation
        if (this.isAttacking && this.attackAnimationTime > 0) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2 * (this.attackAnimationTime / this.attackAnimationDuration));
            ctx.stroke();
        }

        ctx.restore();
    }
}

class Formation {
    constructor(units, targetX, targetY) {
        this.allUnits = units; // Keep reference to all original units
        this.targetX = targetX;
        this.targetY = targetY;
        this.isMoving = false;

        // Center of mass (initial)
        this.centerX = units.reduce((sum, u) => sum + u.x, 0) / units.length;
        this.centerY = units.reduce((sum, u) => sum + u.y, 0) / units.length;

        // A* path for formation center
        this.centerPath = null;
        this.currentCenterPathIndex = 0;

        // Direction and orientation
        this.offsetX = this.targetX - this.centerX;
        this.offsetY = this.targetY - this.centerY;
        this.dist = Math.hypot(this.offsetX, this.offsetY) || 1e-6;
        this.angle = Math.atan2(this.offsetY, this.offsetX);
        this.dir = { x: this.offsetX / this.dist, y: this.offsetY / this.dist };

        units.forEach(unit => {
            unit.formation = this;
            unit.inFormation = true;
            if ('facing' in unit) unit.facing = this.angle;
        });
        this.speed = Math.min(...units.map(u => u.moveSpeed));

        // Assign formation positions ONCE (never recalculate)
        this.assignFormationPositions();

    }

    rotateLocal(x, y) {
        const c = Math.cos(this.angle), s = Math.sin(this.angle);
        return { 
            x: x * c - y * s, 
            y: x * s + y * c 
        };
    }

    getUnitsPerRow(totalUnits) {
        if (totalUnits <= 18) return 6;
        if (totalUnits <= 30) return 10;
        return 14;
    }

    // Create formation piece for one unit type
    createFormationPiece(units, offsetX) {
        const unitsPerRow = this.getUnitsPerRow(units.length);
        const rows = Math.ceil(units.length / unitsPerRow);
        
        const positions = [];
        
        for (let row = 0; row < rows; row++) {
            const startIdx = row * unitsPerRow;
            const endIdx = Math.min(startIdx + unitsPerRow, units.length);
            const unitsInRow = endIdx - startIdx;
            
            // Center units in each row (rows go perpendicular to movement)
            const rowWidth = (unitsInRow - 1) * FORMATION_UNIT_DISTANCE;
            const startY = -rowWidth / 2;
            
            for (let i = 0; i < unitsInRow; i++) {
                const unitIdx = startIdx + i;
                positions.push({
                    unit: units[unitIdx],
                    localX: offsetX - row * FORMATION_UNIT_DISTANCE, // X = forward/back
                    localY: startY + i * FORMATION_UNIT_DISTANCE      // Y = left/right (perpendicular)
                });
            }
        }
        
        return {
            units: units,
            positions: positions,
            width: rows * FORMATION_UNIT_DISTANCE // width in forward direction
        };
    }

    assignFormationPositions() {
        // Group units by type (formationOrder)
        const unitsByType = {};
        this.allUnits.forEach(unit => {
            const order = unit.formationOrder !== undefined ? unit.formationOrder : 999;
            if (!unitsByType[order]) {
                unitsByType[order] = [];
            }
            unitsByType[order].push(unit);
        });

        // Sort by formationOrder (0 at front, higher numbers at back)
        const sortedOrders = Object.keys(unitsByType)
            .map(Number)
            .sort((a, b) => a - b);

        // Create formation pieces
        // Order 0 should be at front (highest X in local space since +X is forward)
        this.formationPieces = [];
        let currentOffsetX = 0;

        // Calculate total formation width first to center it
        let totalWidth = 0;
        sortedOrders.forEach((order, index) => {
            const units = unitsByType[order];
            const unitsPerRow = this.getUnitsPerRow(units.length);
            const rows = Math.ceil(units.length / unitsPerRow);
            const pieceWidth = rows * FORMATION_UNIT_DISTANCE;
            totalWidth += pieceWidth;
            if (index < sortedOrders.length - 1) {
                totalWidth += FORMATION_PIECE_DISTANCE;
            }
        });

        // Start from front (positive X)
        currentOffsetX = totalWidth / 2;

        sortedOrders.forEach((order, index) => {
            const units = unitsByType[order];
            
            // Adjust offset to account for this piece's width
            const unitsPerRow = this.getUnitsPerRow(units.length);
            const rows = Math.ceil(units.length / unitsPerRow);
            const pieceWidth = rows * FORMATION_UNIT_DISTANCE;
            
            // Position piece so its front edge is at currentOffsetX
            const pieceOffsetX = currentOffsetX - (pieceWidth - FORMATION_UNIT_DISTANCE) / 2;
            
            const piece = this.createFormationPiece(units, pieceOffsetX);
            this.formationPieces.push(piece);
            
            // Move offset for next piece (if any)
            if (index < sortedOrders.length - 1) {
                currentOffsetX -= (pieceWidth + FORMATION_PIECE_DISTANCE);
            }
        });

        // Assign world positions to all units
        this.formationPieces.forEach(piece => {
            piece.positions.forEach(pos => {
                const { unit, localX, localY } = pos;
                
                // Store local coordinates (these NEVER change)
                unit.formationSlot = { localX, localY };
                
                // Calculate initial world position (assembly point)
                const r = this.rotateLocal(localX, localY);
                unit.formationPosition = {
                    x: this.centerX + r.x,
                    y: this.centerY + r.y
                };
                
                unit.targetX = unit.formationPosition.x;
                unit.targetY = unit.formationPosition.y;
                unit.moving = true;
            });
        });
    }

    // Get only units still in formation
    getActiveUnits() {
        return this.allUnits.filter(u => u.inFormation);
    }

    checkFormationReady() {
        const activeUnits = this.getActiveUnits();
        if (activeUnits.length === 0) return;

        const unitsInPosition = activeUnits.filter(unit => {
            if (!unit.formationPosition) return false;
            const dx = unit.x - unit.formationPosition.x;
            const dy = unit.y - unit.formationPosition.y;
            return Math.hypot(dx, dy) < 10;
        });

        if (unitsInPosition.length >= activeUnits.length * FORMATION_WAIT_PERCENTAGE) {
            this.startMoving();
        }
    }

    startMoving() {
        this.isMoving = true;

        // Calculate A* path for formation center
        this.centerPath = pathfinder.findPath(this.centerX, this.centerY, this.targetX, this.targetY);
        this.currentCenterPathIndex = 0;

        // Update destination for all units (including those removed - they keep their slot)
        this.updateUnitPositions();

        // Update facing for all units
        this.allUnits.forEach(unit => {
            if ('facing' in unit) unit.facing = this.angle;
        });
    }

    // Update formation center and unit positions
    updateFormationCenter(deltaTime) {
        if (!this.centerPath || this.currentCenterPathIndex >= this.centerPath.length) {
            this.isMoving = false;
            return;
        }

        // Current target waypoint for center
        const targetWaypoint = this.centerPath[this.currentCenterPathIndex];
        let dx = targetWaypoint.x - this.centerX;
        let dy = targetWaypoint.y - this.centerY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        const isFinalWaypoint = (this.currentCenterPathIndex === this.centerPath.length - 1);
        const currentSpeed = this.speed;

        // If we're exactly on the waypoint already
        if (dist === 0) {
            if (isFinalWaypoint) {
                this.isMoving = false;
            }
            this.currentCenterPathIndex++;
            this.updateUnitPositions();
            return;
        }

        if (isFinalWaypoint) {
            const SNAP_TOLERANCE = 2; // pixels

            // If we're very close, snap exactly and finish
            if (dist <= SNAP_TOLERANCE) {
                this.centerX = targetWaypoint.x;
                this.centerY = targetWaypoint.y;
                this.currentCenterPathIndex++;
                this.isMoving = false;
                this.updateUnitPositions();
                return;
            }

            // Otherwise, move toward final waypoint
            const moveX = (dx / dist) * currentSpeed;
            const moveY = (dy / dist) * currentSpeed;

            const newCenterX = this.centerX + moveX;
            const newCenterY = this.centerY + moveY;

            // If the movement would pass the waypoint - snap to avoid skipping
            const dot = (targetWaypoint.x - this.centerX) * (targetWaypoint.x - newCenterX) +
                (targetWaypoint.y - this.centerY) * (targetWaypoint.y - newCenterY);
            if (dot <= 0) {
                this.centerX = targetWaypoint.x;
                this.centerY = targetWaypoint.y;
                this.currentCenterPathIndex++;
                this.isMoving = false;
            } else {
                // Otherwise apply the move normally
                this.centerX = newCenterX;
                this.centerY = newCenterY;
            }
            
            this.updateUnitPositions();
            return;
        }

        // Non-final waypoint behavior
        if (dist < TILE_SIZE / 2) {
            // reached intermediate waypoint, go to next
            this.currentCenterPathIndex++;
            if (this.currentCenterPathIndex >= this.centerPath.length) {
                this.isMoving = false;
                return;
            }
        } else {
            // move toward intermediate waypoint
            const moveX = (dx / dist) * currentSpeed;
            const moveY = (dy / dist) * currentSpeed;

            this.centerX += moveX;
            this.centerY += moveY;
        }

        this.updateUnitPositions();
    }

    // Update all unit positions based on current formation center
    updateUnitPositions() {
        this.allUnits.forEach(unit => {
            if (!unit.formationSlot || !unit.inFormation) return;

            const { localX, localY } = unit.formationSlot;
            const r = this.rotateLocal(localX, localY);
            const destX = this.centerX + r.x;
            const destY = this.centerY + r.y;

            unit.targetX = destX;
            unit.targetY = destY;
            unit.formationPosition = { x: destX, y: destY };
            unit.moving = true;
        });
    }

    // Check if unit's movement path intersects obstacles
    checkUnitPathObstacles(unit, destX, destY) {
        const startX = unit.x;
        const startY = unit.y;
        const radius = unit.radius;

        // Get the direction vector of the movement
        const dx = destX - startX;
        const dy = destY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return; // No movement

        // Normalize direction
        const dirX = dx / length;
        const dirY = dy / length;

        // Calculate perpendicular direction (90 degrees rotated)
        const perpX = -dirY;
        const perpY = dirX;

        // Create two lines offset by unit radius in perpendicular direction
        const line1StartX = startX + perpX * radius;
        const line1StartY = startY + perpY * radius;
        const line1EndX = destX + perpX * radius;
        const line1EndY = destY + perpY * radius;

        const line2StartX = startX - perpX * radius;
        const line2StartY = startY - perpY * radius;
        const line2EndX = destX - perpX * radius;
        const line2EndY = destY - perpY * radius;

        // Check both lines for obstacle intersections
        const line1Intersects = this.lineIntersectsObstacles(line1StartX, line1StartY, line1EndX, line1EndY);
        const line2Intersects = this.lineIntersectsObstacles(line2StartX, line2StartY, line2EndX, line2EndY);

        if (line1Intersects || line2Intersects) {
            console.log(`Unit ${unit.type} path intersects obstacles: line1=${line1Intersects}, line2=${line2Intersects}`);
        }
    }

    // Check if a line segment intersects any obstacles
    lineIntersectsObstacles(x1, y1, x2, y2) {
        for (const obstacle of game.obstacles) {
            if (this.lineIntersectsRectangle(x1, y1, x2, y2, obstacle.x, obstacle.y, TILE_SIZE, TILE_SIZE)) {
                return true;
            }
        }
        return false;
    }

    // Check if line segment intersects rectangle
    lineIntersectsRectangle(x1, y1, x2, y2, rectX, rectY, rectWidth, rectHeight) {
        // Check if line is completely outside rectangle
        if (Math.max(x1, x2) < rectX || Math.min(x1, x2) > rectX + rectWidth ||
            Math.max(y1, y2) < rectY || Math.min(y1, y2) > rectY + rectHeight) {
            return false;
        }

        // Check if line intersects any of the rectangle's edges
        const edges = [
            [rectX, rectY, rectX + rectWidth, rectY], // top
            [rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight], // right
            [rectX, rectY + rectHeight, rectX + rectWidth, rectY + rectHeight], // bottom
            [rectX, rectY, rectX, rectY + rectHeight] // left
        ];

        for (const [ex1, ey1, ex2, ey2] of edges) {
            if (this.linesIntersect(x1, y1, x2, y2, ex1, ey1, ex2, ey2)) {
                return true;
            }
        }

        return false;
    }

    // Check if two line segments intersect
    linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        // Calculate direction vectors
        const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
        const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

        // If uA and uB are between 0-1, lines intersect
        return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
    }

    draw(ctx) {
        const activeUnits = this.getActiveUnits();
        if (activeUnits.length === 0) return;

        // Draw formation bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        activeUnits.forEach(unit => {
            if (!unit.formationPosition) return;
            minX = Math.min(minX, unit.formationPosition.x);
            maxX = Math.max(maxX, unit.formationPosition.x);
            minY = Math.min(minY, unit.formationPosition.y);
            maxY = Math.max(maxY, unit.formationPosition.y);
        });

        const padding = 10;
        ctx.save();
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            minX - padding, 
            minY - padding, 
            (maxX - minX) + padding * 2, 
            (maxY - minY) + padding * 2
        );
        ctx.setLineDash([]);

        // Draw slot markers (for ALL units, even removed ones - grayed out)
        this.allUnits.forEach(unit => {
            if (!unit.formationPosition) return;
            
            ctx.fillStyle = unit.inFormation ? '#888' : '#444';
            const squareSize = unit.inFormation ? 4 : 3;
            
            ctx.fillRect(
                unit.formationPosition.x - squareSize / 2,
                unit.formationPosition.y - squareSize / 2,
                squareSize,
                squareSize
            );
        });

        // Draw path
        ctx.strokeStyle = '#4aa3ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.centerX, this.centerY);
        ctx.lineTo(this.targetX, this.targetY);
        ctx.stroke();
        
        // Draw arrow at target to show direction
        const arrowSize = 15;
        ctx.fillStyle = '#4aa3ff';
        ctx.save();
        ctx.translate(this.targetX, this.targetY);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-arrowSize, -arrowSize/2);
        ctx.lineTo(-arrowSize, arrowSize/2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        ctx.restore();
    }
}

// Knight class - melee unit
class Knight extends Unit {
    constructor(x, y, team) {
        super(x, y, team, 'knight');
        this.hp = this.maxHp = 120;
        this.damage = 25;
        this.maxRange = 40;
        this.attackSpeed = 900;
        this.moveSpeed = 1.4;
        this.radius = 8; // Reduced by half from 16
        this.formationOrder = 1;
    }
}

// Catapult class - siege unit
class Catapult extends Unit {
    constructor(x, y, team) {
        super(x, y, team, 'catapult');
        this.hp = this.maxHp = 200;
        this.damage = 50;
        this.maxRange = 250;
        this.minRange = 50;
        this.attackSpeed = 3000;
        this.moveSpeed = 0.5;
        this.radius = 10; // Reduced by half from 20
        this.formationOrder = 3;
        
        // Catapult-specific projectile properties
        this.projectileSize = 2.5; // Reduced by half from 5
        this.projectileSpeed = 2;
    }

    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;

        // Create projectile with catapult-specific properties
        const projectile = new Projectile(
            this.x,
            this.y,
            this.attackTarget.x,
            this.attackTarget.y,
            this.damage,
            this.projectileSize,
            this.projectileSpeed,
            this,
            this.attackTarget,
            this.type
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
        this.maxRange = 150;
        this.attackSpeed = 1500;
        this.moveSpeed = 1.0;
        this.radius = 7; // Reduced by half from 14
        this.formationOrder = 2;
        
        // Archer-specific projectile properties
        this.projectileSize = 1.5; // Reduced by half from 3
        this.projectileSpeed = 4;
    }

    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;

        // Create projectile with archer-specific properties
        const projectile = new Projectile(
            this.x,
            this.y,
            this.attackTarget.x,
            this.attackTarget.y,
            this.damage,
            this.projectileSize,
            this.projectileSpeed,
            this,
            this.attackTarget,
            this.type
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
        this.maxRange = 40;
        this.attackSpeed = 1100;
        this.moveSpeed = 1.1;
        this.radius = 7.5; // Reduced by half from 15
        this.formationOrder = 0;
    }

    performAttack() {
        this.isAttacking = true;
        this.attackAnimationTime = this.attackAnimationDuration;
        this.attackCooldown = this.attackSpeed;

        // Pikeman deals bonus damage to cavalry units (Knights)
        let actualDamage = this.damage;
        if (this.attackTarget && this.attackTarget.type === 'knight') {
            actualDamage *= 1.5; // 50% bonus damage vs cavalry
        }

        // Melee always hits
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

        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
        let xdif = this.targetX - this.x
        if (this.vx < 0)
            xdif = this.x - this.targetX
        let ydif = this.targetY - this.y
        if (this.vy < 0)
            ydif = this.y - this.targetY
        if (xdif <= HIT_THRESHOLD && ydif <= HIT_THRESHOLD) {
            this.active = false;

            // Check damage type to determine damage behavior
            if (this.damageType === 'catapult') {
                // Catapult: damage all units in impact area
                const impactRadius = this.size * 4; // Area of effect radius
                game.units.forEach(unit => {
                    const dist = Math.sqrt(Math.pow(this.x - unit.x, 2) + Math.pow(this.y - unit.y, 2));
                    if (dist < impactRadius && unit !== this.shooterUnit) {
                        unit.takeDamage(this.damage);
                    }
                });
            } else {
                // Archer: single target damage (original logic)
                const dist = Math.sqrt(Math.pow(this.x - this.targetUnit.x, 2) + Math.pow(this.y - this.targetUnit.y, 2));
                if (dist < this.targetUnit.radius)
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
    team2Color: '#ff4444',

    // ADDED: perimeter/path data
    pNodes: [],          // Array of p-nodes [{id, r, c, x, y, clusterId, prevId, nextId}]
    pathCells: [],       // Array of [r, c] for every perimeter cell
    pathMask: [],        // 2D boolean grid for quick lookup/visualization
    compGrid: [],        // 2D component ID grid (0 = free, >0 = obstacle cluster id)
    compCount: 0,        // Number of obstacle clusters
    obstacleSet: new Set() // Set of "r,c" for obstacle tiles
};

// ADDED: helpers and perimeter computation
const DIR4 = [[-1,0],[1,0],[0,-1],[0,1]];
const DIR8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function inBounds(r, c, rows, cols) {
    return r >= 0 && c >= 0 && r < rows && c < cols;
}
function keyRC(r, c) {
    return `${r},${c}`;
}
function parseKey(k) {
    const [r, c] = k.split(',').map(Number);
    return [r, c];
}
function adjacent8(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;
}
function gridSize() {
    const rows = Math.floor(canvas.height / TILE_SIZE);
    const cols = Math.floor(canvas.width / TILE_SIZE);
    return { rows, cols };
}

// Label connected obstacle components (4-connected)
function labelComponents(rows, cols, obstacleSet) {
    const compGrid = Array.from({ length: rows }, () => Array(cols).fill(0));
    let compCount = 0;
    const compStats = new Map(); // cid -> {sr, sc, n}

    obstacleSet.forEach(k => {
        const [sr, sc] = parseKey(k);
        if (compGrid[sr][sc] !== 0) return;

        compCount++;
        compStats.set(compCount, { sr: 0, sc: 0, n: 0 });

        const q = [[sr, sc]];
        compGrid[sr][sc] = compCount;

        while (q.length) {
            const [r, c] = q.shift();
            const stat = compStats.get(compCount);
            stat.sr += r; stat.sc += c; stat.n += 1;

            for (const [dr, dc] of DIR4) {
                const rr = r + dr, cc = c + dc;
                if (!inBounds(rr, cc, rows, cols)) continue;
                if (!obstacleSet.has(keyRC(rr, cc))) continue;
                if (compGrid[rr][cc] !== 0) continue;
                compGrid[rr][cc] = compCount;
                q.push([rr, cc]);
            }
        }
    });

    return { compGrid, compCount, compStats };
}

function computeCentroids(compStats) {
    const centroids = new Map(); // cid -> {r, c}
    compStats.forEach((stat, cid) => {
        centroids.set(cid, { r: stat.sr / stat.n, c: stat.sc / stat.n });
    });
    return centroids;
}

// Build path mask for free tiles that touch obstacle(s) (8-neigh), and which cluster(s) they touch
function buildPathMask(rows, cols, compGrid) {
    const pathMask = Array.from({ length: rows }, () => Array(cols).fill(false));
    const pathCells = [];
    const touches = new Map(); // cid -> Set("r,c")

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (compGrid[r][c] > 0) continue; // obstacle cell

            const neighComps = new Set();
            for (const [dr, dc] of DIR8) {
                const rr = r + dr, cc = c + dc;
                if (!inBounds(rr, cc, rows, cols)) continue;
                const cid = compGrid[rr][cc];
                if (cid > 0) neighComps.add(cid);
            }
            if (neighComps.size > 0) {
                pathMask[r][c] = true;
                pathCells.push([r, c]);
                neighComps.forEach(cid => {
                    if (!touches.has(cid)) touches.set(cid, new Set());
                    touches.get(cid).add(keyRC(r, c));
                });
            }
        }
    }
    return { pathMask, pathCells, touches };
}

// Build ordered p-nodes with prev/next around each component
function buildPNodes(touches, centroids) {
    const pNodes = [];
    const idOf = new Map(); // `${cid}|r,c` -> nodeId

    // First pass: create nodes sorted by angle around obstacle centroid
    const orderedByComp = new Map(); // cid -> [[r,c], ...]

    touches.forEach((cellSet, cid) => {
        if (!centroids.has(cid)) return;
        const center = centroids.get(cid);
        const cells = Array.from(cellSet).map(parseKey);

        function angle(pos) {
            const [r, c] = pos;
            return Math.atan2(r - center.r, c - center.c);
        }
        cells.sort((a, b) => angle(a) - angle(b));
        orderedByComp.set(cid, cells);

        // Create nodes without links first
        for (const [r, c] of cells) {
            const id = pNodes.length;
            idOf.set(`${cid}|${keyRC(r, c)}`, id);
            pNodes.push({
                id,
                r,
                c,
                x: c * TILE_SIZE,
                y: r * TILE_SIZE,
                clusterId: cid,
                prevId: null,
                nextId: null,
                directions: []  // ADDED: array to hold direction enums
            });
        }
    });

    // Second pass: assign prev/next preferring 8-neigh continuity
    orderedByComp.forEach((cells, cid) => {
        const n = cells.length;
        if (n === 0) return;
        const maxScan = Math.min(12, n);

        for (let i = 0; i < n; i++) {
            // find next
            let nextIdx = -1;
            for (let k = 1; k <= maxScan; k++) {
                const j = (i + k) % n;
                if (adjacent8(cells[i], cells[j])) { nextIdx = j; break; }
            }
            if (nextIdx === -1) nextIdx = (i + 1) % n;

            // find prev
            let prevIdx = -1;
            for (let k = 1; k <= maxScan; k++) {
                const j = (i - k + n) % n;
                if (adjacent8(cells[i], cells[j])) { prevIdx = j; break; }
            }
            if (prevIdx === -1) prevIdx = (i - 1 + n) % n;

            const meId   = idOf.get(`${cid}|${keyRC(cells[i][0], cells[i][1])}`);
            const prevId = idOf.get(`${cid}|${keyRC(cells[prevIdx][0], cells[prevIdx][1])}`);
            const nextId = idOf.get(`${cid}|${keyRC(cells[nextIdx][0], cells[nextIdx][1])}`);
            pNodes[meId].prevId = prevId;
            pNodes[meId].nextId = nextId;
        }
    });

    return pNodes;
}

// Compute full perimeter data (call after obstacles are placed or changed)
function computePerimeterData() {
    const { rows, cols } = gridSize();

    // Build obstacle set from current obstacles
    const obstacleSet = new Set();
    for (const obst of game.obstacles) {
        const r = Math.floor(obst.y / TILE_SIZE);
        const c = Math.floor(obst.x / TILE_SIZE);
        if (inBounds(r, c, rows, cols)) obstacleSet.add(keyRC(r, c));
    }

    const { compGrid, compCount, compStats } = labelComponents(rows, cols, obstacleSet);
    const centroids = computeCentroids(compStats);
    const { pathMask, pathCells, touches } = buildPathMask(rows, cols, compGrid);
    const pNodes = buildPNodes(touches, centroids);

    // Store on game
    game.obstacleSet = obstacleSet;
    game.compGrid = compGrid;
    game.compCount = compCount;
    game.pathMask = pathMask;
    game.pathCells = pathCells;
    game.pNodes = pNodes;
    game.clean_node_positions = getUniquePNodePositions()
    game.clean_node_positions = findAdjacentNodes(game.clean_node_positions)
    


    // Optional: peek at some nodes in console
    console.log(`Perimeter computed: clusters=${compCount}, pNodes=${pNodes.length}`);
    if (pNodes.length) {
        console.log("Sample p-nodes:", pNodes.slice(0, Math.min(10, pNodes.length)));
    }
}

// ADDED: render path overlay (free tiles only)
function drawPathOverlay() {
    if (!game.pathCells || game.pathCells.length === 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(84, 180, 122, 0.35)'; // semi-transparent green
    for (const [r, c] of game.pathCells) {
        ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    ctx.restore();
}

// Get unique row-column pairs from pNodes, excluding obstacle positions
function getUniquePNodePositions() {
    if (!game.pNodes || game.pNodes.length === 0) return [];
    
    const uniquePositions = new Set();
    const result = [];
    
    for (const node of game.pNodes) {
        const key = keyRC(node.r, node.c);
        
        // Check if this position is not an obstacle
        const isObstacle = game.obstacleSet.has(key);
        
        if (!uniquePositions.has(key) && !isObstacle) {
            uniquePositions.add(key);
            result.push({ r: node.r, c: node.c });
        }
    }
    
    return result;
}

// Find adjacent nodes for each node in clean_node_positions and store them
function findAdjacentNodes(clean_node_positions) {
    if (!clean_node_positions || clean_node_positions.length === 0) return [];
    
    // Create a map for quick lookup of nodes by position
    const positionMap = new Map();
    clean_node_positions.forEach((node, index) => {
        const key = keyRC(node.r, node.c);
        positionMap.set(key, { node, index });
    });
    
    // Define 8-direction neighbors
    const directions = [
        [-1, 0],
        [0, -1],           [0, 1],
         [1, 0]
    ];
    
    // For each node, find adjacent nodes
    clean_node_positions.forEach(node => {
        node.adjacentNodes = [];
        
        for (const [dr, dc] of directions) {
            const adjR = node.r + dr;
            const adjC = node.c + dc;
            const adjKey = keyRC(adjR, adjC);
            
            if (positionMap.has(adjKey)) {
                const adjacentNode = positionMap.get(adjKey).node;
                node.adjacentNodes.push(adjacentNode);
            }
        }
    });
    
    return clean_node_positions;
}



// Draw grid function
function drawGrid() {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;

    // Draw vertical lines
    for (let x = 0; x <= canvas.width; x += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x - game.camera.x % TILE_SIZE, 0);
        ctx.lineTo(x - game.camera.x % TILE_SIZE, canvas.height);
        ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y <= canvas.height; y += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y - game.camera.y % TILE_SIZE);
        ctx.lineTo(canvas.width, y - game.camera.y % TILE_SIZE);
        ctx.stroke();
    }
}

// Initialize game
function init() {
    // Create obstacles aligned to grid
    for (let i = 0; i < OBSTACLE_COUNT; i++) {
        const gridX = Math.floor(Math.random() * (canvas.width / TILE_SIZE)) * TILE_SIZE;
        const gridY = Math.floor(Math.random() * (canvas.height / TILE_SIZE)) * TILE_SIZE;

        game.obstacles.push({
            x: gridX,
            y: gridY
        });
    }

    // ADDED: after placing obstacles, compute perimeter/p-nodes
    computePerimeterData();

        // Create initial units using specific classes
    for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 5; i++) {
            const unitType = Math.floor(Math.random() * 4);
            switch (unitType) {
                case 0:
                    game.units.push(new Knight(100 + i * 15, 150+j*15, 1));
                    break;
                case 1:
                    game.units.push(new Archer(100 + i * 15, 150+j*15, 1));
                    break;
                case 2:
                    game.units.push(new Catapult(100 + i * 15, 150+j*15, 1));
                    break;
                case 3:
                    game.units.push(new Pikeman(100 + i * 15, 150+j*15, 1));
                    break;
            }
        }
    }

    for (let i = 0; i < 5; i++) {
        const unitType = Math.floor(Math.random() * 3); // Enemy team doesn't have catapults
        switch (unitType) {
            case 0:
                game.units.push(new Knight(500 + i * 50, 400, 2));
                break;
            case 1:
                game.units.push(new Archer(500 + i * 50, 400, 2));
                break;
            case 2:
                game.units.push(new Pikeman(500 + i * 50, 400, 2));
                break;
        }
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

        if (clickedUnit) {
            // Allow selecting units from any team
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
            // Allow selecting units from any team
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
                // Single unit move with A* pathfinding
                game.selectedUnits[0].setPath(e.clientX, e.clientY);
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
            unit.formation = null;
        });
    }
});

function getUnitAt(x, y) {
    for (let unit of game.units) {
        const dist = Math.sqrt(Math.pow(x - unit.x, 2) + Math.pow(y - unit.y, 2));
        if (dist < unit.radius) {
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

    // Update formations
    const formations = new Set();
    game.units.forEach(unit => {
        if (unit.formation) {
            formations.add(unit.formation);
        }
    });
    formations.forEach(formation => {
        if (formation.isMoving) {
            formation.updateFormationCenter(deltaTime);
        }
    });

    // Update projectiles
    game.projectiles = game.projectiles.filter(p => {
        p.update();
        return p.active;
    });

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid();

    // ADDED: draw path overlay (keeps tiles free; purely visual)
    drawPathOverlay();

    // Draw obstacles
    ctx.fillStyle = '#666';
    game.obstacles.forEach(obstacle => {
        ctx.fillRect(obstacle.x, obstacle.y, TILE_SIZE, TILE_SIZE);
    });

    // Draw units
    game.units.forEach(unit => unit.draw(ctx));

    // Draw projectiles
    game.projectiles.forEach(p => p.draw(ctx));

    // Draw formations
    const drawnFormations = new Set();
    game.units.forEach(unit => {
        if (unit.formation) {
            drawnFormations.add(unit.formation);
        }
    });
    drawnFormations.forEach(formation => formation.draw(ctx));

    // Draw red cross at center of mass for multiple selected units
    if (game.selectedUnits.length > 1) {
        // Calculate center of mass
        const centerX = game.selectedUnits.reduce((sum, unit) => sum + unit.x, 0) / game.selectedUnits.length;
        const centerY = game.selectedUnits.reduce((sum, unit) => sum + unit.y, 0) / game.selectedUnits.length;

        // Draw red cross
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        const crossSize = 10;

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(centerX - crossSize, centerY);
        ctx.lineTo(centerX + crossSize, centerY);
        ctx.stroke();

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - crossSize);
        ctx.lineTo(centerX, centerY + crossSize);
        ctx.stroke();
    }

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

    // ADDED: recompute perimeter on resize so grid/p-mask match new size
    computePerimeterData();
});
