const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

class Unit {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 8;
    this.color = "white";
    this.selected = false;
    this.speed = 2;
    this.target = { x: x, y: y };
  }

  update() {
    // Move towards target
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
];

let selectedUnit = null;

// Handle left-click: select
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) { // Left click
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;
    selectedUnit = null;

    for (const unit of units) {
      const dist = Math.hypot(unit.x - mouseX, unit.y - mouseY);
      if (dist < unit.size) {
        selectedUnit = unit;
      }
      unit.selected = (unit === selectedUnit);
    }
  }
});

// Handle right-click: move
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Prevent context menu
  if (selectedUnit) {
    selectedUnit.target = { x: e.offsetX, y: e.offsetY };
  }
});

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const unit of units) {
    unit.update();
    unit.draw();
  }

  requestAnimationFrame(gameLoop);
}

gameLoop();
