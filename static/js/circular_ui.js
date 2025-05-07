const video = document.getElementById('camera');
const canvas = document.getElementById('mask');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawMask();
}

function drawMask() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, y, diameter / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function initCamera() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((stream) => {
        video.srcObject = stream;

        // If you had other UI toggles like cameraScreen.classList.remove('hidden'), do them here
      })
      .catch((err) => {
        console.error('Error accessing camera: ', err);
        alert('Could not access camera. Please check permissions and try again.');
      });
  } else {
    alert("Sorry, your browser doesn't support camera access");
  }
}
initCamera();

window.addEventListener('resize', resize);
resize();

function drawOverlay() {
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;

  octx.clearRect(0, 0, overlay.width, overlay.height);

  // Draw a box inside the circular area (centered)
  const boxSize = diameter * 0.6; // Smaller than circle
  const boxX = x - boxSize / 2;
  const boxY = y - boxSize / 2;

  octx.strokeStyle = 'red';
  octx.lineWidth = 2;
  octx.strokeRect(boxX, boxY, boxSize, boxSize);
}
