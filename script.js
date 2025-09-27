const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ========================
// Unit class
// ========================
class Unit {
  constructor(x, y, speedMultiplier = 1) {
    this.x = x;
    this.y = y;
    this.size = 8 * speedMultiplier;           // bigger circle for faster units
    this.color = speedMultiplier > 1 ? "orange" : "white"; // distinguish fast units
    this.selected = false;
    this.speed = 2 * speedMultiplier;
    this.target = { x: x, y: y };
  }

  update() {
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.speed) {
      this.x += (dx / dist) * this.speed;
      this.y += (dy / dist) * this.speed;
    }
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.selected ? "cyan" : this.color;
    ctx.fill();
  }
}

// ========================
// Units
// ========================
const units = [
  new Unit(100, 100,3),                // normal
  new Unit(200, 150,3),                // normal
  new Unit(150, 250, 1.5),           // faster unit
  new Unit(300, 300,3),                // normal
  new Unit(400, 200, 1.5),           // faster unit
  new Unit(250, 350,3) ,                // normal
  new Unit(100, 100,3),                // normal
  new Unit(200, 150,3),                // normal
  new Unit(150, 250, 1.5),           // faster unit
  new Unit(300, 300,3),                // normal
  new Unit(400, 200, 1.5),           // faster unit
  new Unit(250, 350,3)   ,              // normal
  new Unit(100, 100,3),                // normal
  new Unit(200, 150,3),                // normal
  new Unit(150, 250, 1.5),           // faster unit
  new Unit(300, 300,3),                // normal
  new Unit(400, 200, 1.5),           // faster unit
  new Unit(250, 350,3)                 // normal
];

// ========================
// Drag selection
// ========================
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragEnd = { x: 0, y: 0 };

// ========================
// Helper functions
// ========================

// Compute center of mass of units
function computeCenter(units) {
  let sumX = 0, sumY = 0;
  for (const u of units) {
    sumX += u.x;
    sumY += u.y;
  }
  return { x: sumX / units.length, y: sumY / units.length };
}

// Find best rectangle for n units (rows × cols)
function bestRectangle(n) {
  let rows = 1;
  for (let i = Math.floor(Math.sqrt(n)); i >= 1; i--) {
    if (n % i === 0) {
      rows = i;
      break;
    }
  }
  const cols = Math.ceil(n / rows);
  return { rows, cols };
}

// ========================
// Input handlers
// ========================

// Left mouse down
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    isDragging = true;
    dragStart = { x: e.offsetX, y: e.offsetY };
    dragEnd = { x: e.offsetX, y: e.offsetY };

    // Deselect all initially
    for (const unit of units) unit.selected = false;
  }
});

// Mouse move
canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    dragEnd = { x: e.offsetX, y: e.offsetY };
  }
});

// Mouse up
canvas.addEventListener("mouseup", (e) => {
  if (e.button === 0 && isDragging) {
    isDragging = false;
    const x1 = Math.min(dragStart.x, dragEnd.x);
    const y1 = Math.min(dragStart.y, dragEnd.y);
    const x2 = Math.max(dragStart.x, dragEnd.x);
    const y2 = Math.max(dragStart.y, dragEnd.y);

    for (const unit of units) {
      if (unit.x >= x1 && unit.x <= x2 && unit.y >= y1 && unit.y <= y2) {
        unit.selected = true;
      }
    }
  }
});

// Right click: move selected units in formation
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const selectedUnits = units.filter(u => u.selected);
  if (selectedUnits.length === 0) return;

  const targetX = e.offsetX;
  const targetY = e.offsetY;

  const center = computeCenter(selectedUnits);
  const dx = targetX - center.x;
  const dy = targetY - center.y;
  const angle = Math.atan2(dy, dx);

  const n = selectedUnits.length;
  const { rows, cols } = bestRectangle(n);
  const spacing = 50;

  // Compute all formation positions
  let formationTargets = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (i >= n) break;
      const offsetX = (c - (cols - 1) / 2) * spacing; // perpendicular to movement
      const offsetY = (r - (rows - 1) / 2) * spacing; // along movement
      const rotatedX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle);
      const rotatedY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle);
      formationTargets.push({ x: targetX + rotatedX, y: targetY + rotatedY });
      i++;
    }
  }

  // Sort units by distance from center (furthest first)
  selectedUnits.sort((a, b) => {
    const da = Math.hypot(a.x - center.x, a.y - center.y);
    const db = Math.hypot(b.x - center.x, b.y - center.y);
    return db - da;
  });

  // Assign closest available formation target to each unit
  const assignedTargets = [];
  for (const unit of selectedUnits) {
    let closestIndex = 0;
    let minDist = Infinity;
    for (let j = 0; j < formationTargets.length; j++) {
      if (assignedTargets.includes(j)) continue;
      const dist = Math.hypot(unit.x - formationTargets[j].x, unit.y - formationTargets[j].y);
      if (dist < minDist) {
        minDist = dist;
        closestIndex = j;
      }
    }
    unit.target = formationTargets[closestIndex];
    assignedTargets.push(closestIndex);
  }
});

// ========================
// Game loop
// ========================
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update and draw units
  for (const unit of units) {
    unit.update();
    unit.draw();
  }

  // Draw drag box if dragging
  if (isDragging) {
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      dragStart.x,
      dragStart.y,
      dragEnd.x - dragStart.x,
      dragEnd.y - dragStart.y
    );
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();
