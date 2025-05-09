// Start camera with back-facing camera
function initCamera() {
  const video = document.createElement('video');
  video.setAttribute('id', 'camera');
  video.setAttribute('autoplay', true);
  video.setAttribute('playsinline', true);
  video.style.position = 'absolute';
  video.style.top = 0;
  video.style.left = 0;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  video.style.zIndex = -1; // Ensure canvas is on top

  document.body.insertBefore(video, document.body.firstChild);

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false
  })
  .then((stream) => {
    video.srcObject = stream;
  })
  .catch((err) => {
    console.error("Camera access error:", err);
    alert("Could not access camera. Please check permissions and try again.");
  });
}
initCamera();

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');

let dotX = window.innerWidth / 2;
let dotY = window.innerHeight / 2;
let diameter = 50;
let mode = 'move-dot';

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mode === 'resize-circle') {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, diameter / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'green';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  ctx.fill();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', e => {
  const step = 3;
  if (mode === 'move-dot') {
    if (e.code === 'Numpad8') dotY -= step;
    if (e.code === 'Numpad2') dotY += step;
    if (e.code === 'Numpad4') dotX -= step;
    if (e.code === 'Numpad6') dotX += step;
    if (e.code === 'Enter') mode = 'resize-circle';
  } else if (mode === 'resize-circle') {
    if (e.code === 'Numpad8') diameter += step;
    if (e.code === 'Numpad2') diameter -= step;
    if (e.code === 'Enter') {
      saveCalibration();
    }
  }
  draw();
});

function saveCalibration() {
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x: dotX, y: dotY, diameter: diameter })
  }).then(() => {
    window.location.href = '/';  // redirect to main UI
  });
}

resizeCanvas();
