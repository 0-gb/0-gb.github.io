const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

class Unit {
  constructor(x, y, speedMultiplier = 1) {
    this.x = x;
    this.y = y;
    this.size = 8 * speedMultiplier;
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


const units = [
  new Unit(100, 100),
  new Unit(200, 150),
  new Unit(150, 250),
  new Unit(300, 300),
  new Unit(400, 200),
  new Unit(250, 350),
  new Unit(270, 110),
  new Unit(480, 110),
  new Unit(450, 340),
  new Unit(490, 210),
  new Unit(400, 300, 1.5),
  new Unit(250, 300, 1.5),
  new Unit(270, 300, 1.5),
  new Unit(480, 300, 1.5),
  new Unit(450, 300, 1.5),
  new Unit(490, 300, 1.5),
  new Unit(230, 300, 1.5),
  new Unit(230, 300, 1.5),
];

let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragEnd = { x: 0, y: 0 };

// Handle mouse down
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) { // Left mouse
    isDragging = true;
    dragStart = { x: e.offsetX, y: e.offsetY };
    dragEnd = { x: e.offsetX, y: e.offsetY };

    // If not dragging, assume deselect all
    for (const unit of units) {
      unit.selected = false;
    }
  }
});

// Handle mouse move (update drag box)
canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    dragEnd = { x: e.offsetX, y: e.offsetY };
  }
});

// Handle mouse up (complete drag selection)
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
// Helper: compute center of mass of selected units
function computeCenter(units) {
  let sumX = 0, sumY = 0;
  for (const u of units) {
    sumX += u.x;
    sumY += u.y;
  }
  return { x: sumX / units.length, y: sumY / units.length };
}

// Helper: find best rectangle (rows × cols) for n units, as square as possible
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


// Handle right-click for movement with formation alignment
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const selectedUnits = units.filter(u => u.selected);
  if (selectedUnits.length === 0) return;

  const targetX = e.offsetX;
  const targetY = e.offsetY;

  const center = computeCenter(selectedUnits);

  // Movement vector
  const dx = targetX - center.x;
  const dy = targetY - center.y;
  const angle = Math.atan2(dy, dx);

  // Compute rectangle dimensions
  const n = selectedUnits.length;
  const { rows, cols } = bestRectangle(n);
  const spacing = 30;

  // Offsets in local rectangle coordinates
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (i >= n) break;

      // Centered offsets
      const offsetX = (c - (cols - 1) / 2) * spacing; // perpendicular to movement
      const offsetY = (r - (rows - 1) / 2) * spacing; // along movement

      // Rotate offsets by movement angle
      const rotatedX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle);
      const rotatedY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle);

      // Set target relative to click point
      selectedUnits[i].target = {
        x: targetX + rotatedX,
        y: targetY + rotatedY
      };

      i++;
    }
  }
});

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const unit of units) {
    unit.update();
    unit.draw();
  }

  // Draw drag selection box if dragging
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
