// Animation frame references
let scanAnimationFrame = null;
let captureAnimationFrame = null;

// Camera state variables
let scanActive = true;
let isCameraProcessing = false;
let processingProgress = 0;
let scanAngle = 0;
let escHeld = false;
let escStartTime = null;
let escAnimationFrame = null;
let detectedCountry = null;

const video = document.getElementById('camera');
const canvas = document.getElementById('mask');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const countryDisplay = document.getElementById('country-display');

let lastImageCaptureTime = Date.now();
let autoCameraShutdownTimer = null;

// Use the x, y, and diameter values passed from Flask
// These variables should be declared in the HTML template

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;
  drawMask();
  positionOverlayContent(); // Add this line
  if (!escHeld) drawRadarOverlay();
}

function positionOverlayContent() {
  const overlayContent = document.getElementById('overlay-content');
  if (overlayContent) {
    // Position the overlay content precisely over the circular mask area
    overlayContent.style.left = x - diameter / 2 + 'px';
    overlayContent.style.top = y - diameter / 2 + 'px';
    overlayContent.style.width = diameter + 'px';
    overlayContent.style.height = diameter + 'px';

    // Adjust metadata display for better positioning within circle
    const metadataDisplay = document.getElementById('metadata-display');
    if (metadataDisplay) {
      // If the circle is very small, adjust font size
      if (diameter < 400) {
        metadataDisplay.style.fontSize = 'clamp(14px, 1.8vw, 20px)';
      }
    }

    // Adjust decades navigation position based on circle size
    const decadesNav = document.getElementById('decades-nav');
    if (decadesNav) {
      // Adjust vertical position based on circle size
      const bottomPosition = diameter < 500 ? '12%' : '15%';
      decadesNav.style.bottom = bottomPosition;

      // For very small circles, make buttons smaller
      if (diameter < 400) {
        const buttons = decadesNav.querySelectorAll('button');
        buttons.forEach((button) => {
          button.style.padding = '3px 6px';
          button.style.fontSize = '0.9rem';
        });
      }
    }
  }
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
      })
      .catch((err) => {
        console.error('Error accessing camera: ', err);
        alert(
          'Could not access camera. Please check permissions and try again.'
        );
      });
  } else {
    alert("Sorry, your browser doesn't support camera access");
  }
}

function drawRadarOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);

  const outerRadius = diameter / 2;

  // Don't draw regular UI if we're processing an image
  if (isCameraProcessing) {
    drawCaptureProcessingUI(outerRadius);
    return;
  }

  // Draw the circular frame
  drawCircularFrame(outerRadius);

  // Draw scan line
  drawScanLine(outerRadius);

  // Add CRT scan noise effect
  addScanNoise(outerRadius);

  // Draw target box
  drawTargetBox();

  // Draw subtle grid lines
  drawGridLines(outerRadius);

  // Continue animation
  if (scanActive && !escHeld) {
    scanAnimationFrame = requestAnimationFrame(drawRadarOverlay);
  }
}

function drawCircularFrame(radius) {
  // Draw outer circle with glow
  octx.beginPath();
  octx.arc(x, y, radius, 0, Math.PI * 2);

  // Create gradient for outer ring
  const gradient = octx.createLinearGradient(x - radius, y, x + radius, y);
  gradient.addColorStop(0, 'rgba(0, 230, 80, 0.8)'); // Green glow
  gradient.addColorStop(0.5, 'rgba(0, 255, 100, 1)');
  gradient.addColorStop(1, 'rgba(0, 230, 80, 0.8)');

  octx.strokeStyle = gradient;
  octx.lineWidth = 2;
  octx.shadowBlur = 10;
  octx.shadowColor = 'rgba(0, 255, 90, 0.7)';
  octx.stroke();

  // Draw inner frame
  octx.beginPath();
  octx.arc(x, y, radius - 8, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(0, 200, 80, 0.4)';
  octx.lineWidth = 1;
  octx.shadowBlur = 0;
  octx.stroke();
}

function drawScanLine(radius) {
  // Update scan angle
  scanAngle = (scanAngle + 0.01) % (Math.PI * 2);

  // Draw radar sweep line
  octx.beginPath();
  octx.moveTo(x, y);
  octx.lineTo(
    x + Math.cos(scanAngle) * radius,
    y + Math.sin(scanAngle) * radius
  );

  // Create gradient for scan line
  const scanGradient = octx.createLinearGradient(
    x,
    y,
    x + Math.cos(scanAngle) * radius,
    y + Math.sin(scanAngle) * radius
  );
  scanGradient.addColorStop(0, 'rgba(0, 255, 90, 0.9)');
  scanGradient.addColorStop(1, 'rgba(0, 255, 90, 0.1)');

  octx.strokeStyle = scanGradient;
  octx.lineWidth = 2;
  octx.shadowBlur = 15;
  octx.shadowColor = 'rgba(0, 255, 90, 0.7)';
  octx.stroke();

  // Draw afterglow arc
  octx.beginPath();
  octx.arc(x, y, radius - 4, scanAngle - 0.6, scanAngle);
  const afterglowGradient = octx.createRadialGradient(x, y, 0, x, y, radius);
  afterglowGradient.addColorStop(0, 'rgba(0, 255, 90, 0)');
  afterglowGradient.addColorStop(0.7, 'rgba(0, 255, 90, 0.1)');
  afterglowGradient.addColorStop(1, 'rgba(0, 255, 90, 0.3)');

  octx.strokeStyle = afterglowGradient;
  octx.lineWidth = radius - 8;
  octx.shadowBlur = 0;
  octx.stroke();
}

function addScanNoise(radius) {
  // Create random CRT noise dots
  octx.fillStyle = 'rgba(0, 255, 90, 0.3)';

  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const dotSize = Math.random() * 1.5;

    octx.beginPath();
    octx.arc(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      dotSize,
      0,
      Math.PI * 2
    );
    octx.fill();
  }

  // Add scan line effect (horizontal lines)
  octx.globalAlpha = 0.05;
  for (let i = 0; i < overlay.height; i += 4) {
    if (Math.random() > 0.7) continue;
    octx.fillRect(x - radius, i, radius * 2, 1);
  }
  octx.globalAlpha = 1.0;
}

function drawTargetBox() {
  // Draw a box inside the circular area (centered)
  const boxSize = diameter * 0.6; // Smaller than circle
  const boxX = x - boxSize / 2;
  const boxY = y - boxSize / 2;

  // Draw corners instead of full rectangle for a targeting reticle look
  const cornerLength = boxSize * 0.2;

  octx.strokeStyle = 'rgba(0, 255, 90, 0.8)';
  octx.lineWidth = 1.5;

  // Top-left corner
  octx.beginPath();
  octx.moveTo(boxX, boxY + cornerLength);
  octx.lineTo(boxX, boxY);
  octx.lineTo(boxX + cornerLength, boxY);
  octx.stroke();

  // Top-right corner
  octx.beginPath();
  octx.moveTo(boxX + boxSize - cornerLength, boxY);
  octx.lineTo(boxX + boxSize, boxY);
  octx.lineTo(boxX + boxSize, boxY + cornerLength);
  octx.stroke();

  // Bottom-right corner
  octx.beginPath();
  octx.moveTo(boxX + boxSize, boxY + boxSize - cornerLength);
  octx.lineTo(boxX + boxSize, boxY + boxSize);
  octx.lineTo(boxX + boxSize - cornerLength, boxY + boxSize);
  octx.stroke();

  // Bottom-left corner
  octx.beginPath();
  octx.moveTo(boxX + cornerLength, boxY + boxSize);
  octx.lineTo(boxX, boxY + boxSize);
  octx.lineTo(boxX, boxY + boxSize - cornerLength);
  octx.stroke();

  // Center crosshair
  octx.beginPath();
  octx.moveTo(x - 10, y);
  octx.lineTo(x + 10, y);
  octx.moveTo(x, y - 10);
  octx.lineTo(x, y + 10);
  octx.stroke();

  // Small circle in center
  octx.beginPath();
  octx.arc(x, y, 3, 0, Math.PI * 2);
  octx.stroke();
}

function drawGridLines(radius) {
  octx.strokeStyle = 'rgba(0, 255, 90, 0.2)';
  octx.lineWidth = 1;

  // Draw concentric circles
  for (let r = radius / 4; r < radius; r += radius / 4) {
    octx.beginPath();
    octx.arc(x, y, r, 0, Math.PI * 2);
    octx.stroke();
  }

  // Draw radial lines
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
    octx.beginPath();
    octx.moveTo(x, y);
    octx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    octx.stroke();
  }
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());

  // Set alignment to center
  ctx.textAlign = 'center';

  // Vertically center the whole block
  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}


function captureAndSend() {
  if (isCameraProcessing) return;

  // Cancel any running animations
  [scanAnimationFrame, captureAnimationFrame].forEach((frame) => {
    if (frame) cancelAnimationFrame(frame);
  });
  scanAnimationFrame = null;
  captureAnimationFrame = null;

  // Flash effect
  const flashOverlay = document.createElement('div');
  Object.assign(flashOverlay.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: '1000',
    opacity: '1',
    transition: 'opacity 0.5s',
  });
  document.body.appendChild(flashOverlay);
  setTimeout(() => {
    flashOverlay.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(flashOverlay);
    }, 500);
  }, 100);

  // Begin processing
  isCameraProcessing = true;
  // Auto-hide metadata display during processing
  const metadataDisplay = document.getElementById('metadata-display');
  if (metadataDisplay) {
    metadataDisplay.style.display = 'none';
  }
  processingProgress = 0;
  drawRadarOverlay();

  // === CROP FULL-RES AREA ===

  const boxSize = diameter * 0.6;

  // Scale UI center position from screen to video pixel space
  const videoRect = video.getBoundingClientRect();
  const scaleX = video.videoWidth / videoRect.width;
  const scaleY = video.videoHeight / videoRect.height;

  const actualVideoX = (x - videoRect.left) * scaleX;
  const actualVideoY = (y - videoRect.top) * scaleY;

  const cropWidth = boxSize * scaleX;
  const cropHeight = boxSize * scaleY;

  const cropX = actualVideoX - cropWidth / 2;
  const cropY = actualVideoY - cropHeight / 2;

  // Create canvas at crop resolution (no downscaling)
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = cropWidth;
  tempCanvas.height = cropHeight;

  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  // Convert to blob
  const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
  const blob = dataURLToBlob(dataUrl);

  // Send to server
  const formData = new FormData();
  formData.append('photo', blob, 'capture.jpg');

  const animateProcessing = () => {
    processingProgress += 0.02;
    if (processingProgress > 1) processingProgress = 0;
    drawRadarOverlay();
    if (isCameraProcessing) {
      captureAnimationFrame = requestAnimationFrame(animateProcessing);
    }
  };
  animateProcessing();

  console.log('Sending image to server...');

  fetch('/image_processing', {
    method: 'POST',
    body: formData,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Network response was not ok: ' + response.status);
      }
      return response.json();
    })
    .then((data) => {
      console.log('Server response:', data);
      handleImageProcessingResponse(data);
    })
    .catch((error) => {
      console.error('Error:', error);
      handleImageProcessingError();
    });
  lastImageCaptureTime = Date.now(); // 🕒 Update activity timestamp
  resetCameraShutdownTimer(); // 🔁 Restart shutdown timer
}

function resetCameraShutdownTimer() {
  if (autoCameraShutdownTimer) {
    clearTimeout(autoCameraShutdownTimer);
  }

  autoCameraShutdownTimer = setTimeout(() => {
    const video = document.getElementById('camera');
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      video.srcObject = null;
      console.log('Camera auto-shutdown after inactivity');
    }
  }, 180000); // 3 minutes = 180,000 ms
}

// Helper function to convert dataURL to Blob
function dataURLToBlob(dataURL) {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// Handle the response from the server
function handleImageProcessingResponse(data) {
  console.log('Processing server response:', data);

  // Cancel any ongoing animations
  if (captureAnimationFrame) {
    cancelAnimationFrame(captureAnimationFrame);
    captureAnimationFrame = null;
  }

  // End processing state
  isCameraProcessing = false;

  // Show results based on status
  if (data.status === 'success') {
    showResultsOverlay(data);

    // If the country was detected successfully, reload the page to show decades
    if (
      data.result &&
      (data.result.country || typeof data.result === 'string')
    ) {
      setTimeout(() => {
        window.location.href = '/main';
      }, 3000);
    }
  } else {
    showErrorOverlay(data.message || 'Processing failed');
  }

  // Resume normal scanning after delay if we're not redirecting
  if (
    data.status !== 'success' ||
    !data.result ||
    (!data.result.country && typeof data.result !== 'string')
  ) {
    setTimeout(() => {
      if (!escHeld) {
        scanActive = true;
        drawRadarOverlay();
      }
    }, 3000);
  }
}

// Handle processing errors
function handleImageProcessingError() {
  console.error('Image processing failed');

  // Cancel any ongoing animations
  if (captureAnimationFrame) {
    cancelAnimationFrame(captureAnimationFrame);
    captureAnimationFrame = null;
  }

  // End processing state with error
  isCameraProcessing = false;

  // Show error message
  showErrorOverlay('Connection failed');

  // Resume normal scanning after 3 seconds
  setTimeout(() => {
    if (!escHeld) {
      scanActive = true;
      drawRadarOverlay();
    }
  }, 3000);
}

function drawCaptureProcessingUI(radius) {
  const outerRadius = radius;

  // Draw the circular frame
  octx.beginPath();
  octx.arc(x, y, outerRadius, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(0, 230, 80, 0.8)';
  octx.lineWidth = 3;
  octx.shadowBlur = 10;
  octx.shadowColor = 'rgba(0, 255, 90, 0.7)';
  octx.stroke();

  // Draw scanning circle animation
  octx.beginPath();
  octx.arc(x, y, outerRadius - 20, 0, Math.PI * 2 * processingProgress);
  octx.strokeStyle = 'rgba(0, 255, 200, 0.9)';
  octx.lineWidth = 4;
  octx.stroke();

  // Draw horizontal scan line moving from top to bottom
  const scanLineY = y - outerRadius + outerRadius * 2 * processingProgress;
  octx.beginPath();
  octx.moveTo(x - outerRadius, scanLineY);
  octx.lineTo(x + outerRadius, scanLineY);
  octx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
  octx.lineWidth = 2;
  octx.shadowBlur = 15;
  octx.shadowColor = 'rgba(0, 255, 255, 0.9)';
  octx.stroke();
  octx.shadowBlur = 0;

  // Add some CRT scan noise
  addScanNoise(outerRadius);

  // Text
  octx.fillStyle = 'rgba(0, 255, 170, 1)';
  octx.font = 'bold 20px monospace';
  octx.textAlign = 'center';
  octx.fillText('PROCESSING IMAGE...', x, y);

  // Technical-looking randomly changing numbers below
  octx.font = '14px monospace';
  const techText1 = `ANALYZING: ${Math.floor(Math.random() * 999)
    .toString()
    .padStart(3, '0')}.${Math.floor(Math.random() * 999)
    .toString()
    .padStart(3, '0')}`;
  const techText2 = `SEQUENCE: ${Math.floor(Math.random() * 999)
    .toString()
    .padStart(3, '0')}/${Math.floor(Math.random() * 999)
    .toString()
    .padStart(3, '0')}`;
  octx.fillText(techText1, x, y + 30);
  octx.fillText(techText2, x, y + 50);
}

function showResultsOverlay(data) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const outerRadius = diameter / 2;

  // Draw the main circle stroke first (so it’s not clipped)
  octx.beginPath();
  octx.arc(x, y, outerRadius, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(0, 230, 80, 0.8)';
  octx.lineWidth = 3;
  octx.shadowBlur = 10;
  octx.shadowColor = 'rgba(0, 255, 90, 0.7)';
  octx.stroke();

  // Save and clip for internal drawing
  octx.save();
  octx.beginPath();
  octx.arc(x, y, outerRadius - 10, 0, Math.PI * 2);
  octx.clip();

  // Draw inner completion indicator
  octx.beginPath();
  octx.arc(x, y, outerRadius - 20, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(0, 255, 120, 0.4)';
  octx.lineWidth = 2;
  octx.stroke();

  // CRT scan noise
  addScanNoise(outerRadius);

  // Title (with text wrapping if necessary)
  octx.fillStyle = 'rgba(0, 255, 170, 1)';
  octx.font = 'bold 22px monospace';
  octx.textAlign = 'center';
  octx.fillText('ANALYSIS COMPLETE', x, y - 40);

  // Footer text (wrapped if necessary)
  octx.font = '14px monospace';
  drawWrappedText(octx, 'REDIRECTING TO COUNTRY VIEW...', x, y + outerRadius - 40, outerRadius * 1.8, 18);

  // Country extraction (wrapped)
  let countryName = 'Unknown';
  if (data.result) {
    if (typeof data.result === 'object' && data.result.country) {
      countryName = data.result.country;
    } else if (typeof data.result === 'string') {
      countryName = data.result;
    }
  }

  // Draw country name (with wrapping)
  octx.font = 'bold 24px monospace';
  drawWrappedText(octx, `DETECTED: ${countryName}`, x, y + 20, outerRadius * 1.8, 24);

  // Restore unclipped context
  octx.restore();

  // Update any HTML
  if (countryDisplay) {
    countryDisplay.innerText = `Detected: ${countryName}`;
  }
}



function showErrorOverlay(errorMessage) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const outerRadius = diameter / 2;

  // Draw the circular frame with error color
  octx.beginPath();
  octx.arc(x, y, outerRadius, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(230, 50, 50, 0.8)';
  octx.lineWidth = 3;
  octx.shadowBlur = 10;
  octx.shadowColor = 'rgba(255, 50, 50, 0.7)';
  octx.stroke();

  // Add some CRT scan noise
  addScanNoise(outerRadius);

  // Title
  octx.fillStyle = 'rgba(255, 80, 80, 1)';
  octx.font = 'bold 22px monospace';
  octx.textAlign = 'center';
  octx.fillText('ERROR', x, y - 80); // <-- Shifted higher

  // Error message (wrapped)
  octx.fillStyle = 'rgba(255, 150, 150, 1)';
  octx.font = '16px monospace';
  const maxWidth = diameter * 0.8;
  const lineHeight = 20;
  const messageY = y; // Centered in the middle
  drawWrappedText(octx, errorMessage, x, messageY, maxWidth, lineHeight);

  // Footer
  octx.font = '14px monospace';
  octx.fillText('PRESS ENTER TO TRY AGAIN', x, y + 80); // <-- Shifted lower
}

function startRecalibrationOverlay() {
  escHeld = true;
  escStartTime = Date.now();
  scanActive = false;

  // Cancel any running animation frames
  if (scanAnimationFrame) {
    cancelAnimationFrame(scanAnimationFrame);
    scanAnimationFrame = null;
  }

  // Hide the overlay content during recalibration
  const overlayContent = document.getElementById('overlay-content');
  if (overlayContent) {
    overlayContent.style.visibility = 'hidden'; // Hide but keep in the DOM
  }

  animateRecalibrationOverlay();
}

function stopRecalibrationOverlay(triggerRedirect = false) {
  escHeld = false;
  escStartTime = null;

  if (escAnimationFrame) {
    cancelAnimationFrame(escAnimationFrame);
    escAnimationFrame = null;
  }

  // Show the overlay content again if we're not redirecting
  if (!triggerRedirect) {
    const overlayContent = document.getElementById('overlay-content');
    if (overlayContent) {
      overlayContent.style.visibility = 'visible';
    }
  }

  scanActive = true;
  drawRadarOverlay(); // Restart radar animation

  if (triggerRedirect) {
    window.location.href = '/recalibrate';
  }
}

function animateRecalibrationOverlay() {
  const now = Date.now();
  const elapsed = now - escStartTime;
  const duration = 3000;
  const progress = Math.min(elapsed / duration, 1);

  // Completely clear the overlay before drawing recalibration UI
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;
  octx.clearRect(0, 0, overlay.width, overlay.height);

  // Also clear the mask canvas to remove any potential artifacts
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMask(); // Redraw the mask

  // Save the current context state
  octx.save();

  // Draw the outer circle first
  const outerRadius = diameter / 2;
  octx.beginPath();
  octx.arc(x, y, outerRadius, 0, Math.PI * 2);

  // Create gradient transitioning from red to green based on progress
  const gradient = octx.createLinearGradient(x - 50, y, x + 50, y);
  gradient.addColorStop(
    0,
    `rgb(${255 - progress * 255}, ${progress * 255}, 0)`
  ); // red → green
  octx.strokeStyle = gradient;
  octx.lineWidth = 6;
  octx.stroke();

  // Now draw the inner glow using a clip path
  octx.beginPath();
  // Create a clip path slightly smaller than the outer circle
  const innerClipRadius = outerRadius - octx.lineWidth;
  octx.arc(x, y, innerClipRadius, 0, Math.PI * 2);
  octx.clip();

  // Draw a larger circle with blur that will be clipped to only show inner glow
  octx.beginPath();
  octx.arc(x, y, outerRadius, 0, Math.PI * 2);
  octx.shadowBlur = 20; // Start with a smaller blur radius
  octx.shadowColor = `rgba(${255 - progress * 255}, ${progress * 255}, 0, 0.8)`;
  octx.strokeStyle = gradient;
  octx.lineWidth = 3;
  octx.stroke();

  // Add multiple inner glows with different intensities for a stronger effect
  for (let i = 1; i <= 3; i++) {
    octx.shadowBlur = 8 * i;
    octx.globalAlpha = 0.3 / i; // Decreasing opacity for each layer
    octx.stroke();
  }

  // Restore context to remove clipping path
  octx.restore();

  // Reset shadow and global alpha
  octx.shadowBlur = 0;
  octx.shadowColor = 'transparent';
  octx.globalAlpha = 1.0;

  // Add CRT scan lines effect
  octx.globalAlpha = 0.1;
  for (let i = 0; i < overlay.height; i += 3) {
    if (Math.random() > 0.7) continue;
    octx.fillStyle = `rgba(${255 - progress * 255}, ${progress * 255}, 0, 0.2)`;
    octx.fillRect(x - outerRadius, i, outerRadius * 2, 1);
  }
  octx.globalAlpha = 1.0;

  // Message text
  octx.fillStyle = 'rgba(0, 255, 90, 1)'; // CRT green color
  octx.font = 'bold 20px monospace'; // Use monospace for technical CRT look
  octx.textAlign = 'center';
  const message =
    progress >= 1 ? 'RELEASE TO RECALIBRATE' : 'HOLD ESC TO RECALIBRATE...';
  drawWrappedText(octx, message, x, y, diameter * 0.8, 24);

  // Progress indicator as a circle
  if (progress < 1) {
    octx.beginPath();
    octx.arc(x, y + 50, 15, 0, Math.PI * 2 * progress);
    octx.strokeStyle = `rgba(${255 - progress * 255}, ${progress * 255}, 0, 1)`;
    octx.lineWidth = 3;
    octx.stroke();
  }

  // Keep going if still held
  if (escHeld) {
    escAnimationFrame = requestAnimationFrame(animateRecalibrationOverlay);
  }
}

function startShuffleOverlay() {
  shuffleHeld = true;
  shuffleStartTime = Date.now();

  // Cancel any existing frame
  if (shuffleAnimationFrame) {
    cancelAnimationFrame(shuffleAnimationFrame);
    shuffleAnimationFrame = null;
  }

  animateShuffleOverlay();
}

function stopShuffleOverlay() {
  shuffleHeld = false;

  if (shuffleAnimationFrame) {
    cancelAnimationFrame(shuffleAnimationFrame);
    shuffleAnimationFrame = null;
  }

  // Clear the overlay
  octx.clearRect(0, 0, overlay.width, overlay.height);
}


function toggleMetadataDisplay() {
  const metadataDisplay = document.getElementById('metadata-display');
  if (metadataDisplay) {
    metadataDisplay.style.display =
      metadataDisplay.style.display === 'none' ? 'block' : 'none';
  }
}

// --- Initialization ---
initCamera();
window.addEventListener('resize', () => {
  resize();
  positionOverlayContent();
});
resize();
positionOverlayContent();
drawRadarOverlay();

// Preload recalibration sound element once
const recalSound = document.getElementById('recal-sound');

// --- Keyboard Event Handlers ---

document.addEventListener('keydown', (e) => {
  const key = e.key;

  console.log('Key pressed:', key);

  switch (key) {
    case 'Enter':
      if (!isCameraProcessing) {
        captureAndSend();
      }
      break;

    case 'Backspace':
      if (!escHeld) {
        escHeld = true;
        escStartTime = Date.now();
        startRecalibrationOverlay();

        // Play recalibration sound from the start
        if (recalSound) {
          recalSound.currentTime = 0;
          recalSound.play().catch(err => console.warn('Audio play error:', err));
        }
      }
      break;

    case '+':
      if (!isCameraProcessing) {
        toggleCamera();
      }
      break;

    case 'Subtract':
      window.location.href = '/';
      break;

    default:
      // Check for NumpadSubtract separately, because its e.key is 'Subtract' but code is 'NumpadSubtract'
      if (e.code === 'NumpadSubtract') {
        window.location.href = '/';
      }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Backspace' && escHeld) {
    escHeld = false;
    const elapsed = Date.now() - escStartTime;
    const completed = elapsed >= 3000;
    stopRecalibrationOverlay(completed);

    // Stop and reset recalibration sound
    if (recalSound) {
      recalSound.pause();
      recalSound.currentTime = 0;
    }
  }
});

// --- Helper Function to toggle camera on/off ---
function toggleCamera() {
  const video = document.getElementById('camera');

  if (!video.srcObject) {
    // Camera is off, so turn it on
    initCamera();
    resetCameraShutdownTimer(); // Start auto-shutdown timer

    // Hide metadata when camera is on
    document.getElementById('metadata-display').style.display = 'none';
  } else {
    // Camera is on, so turn it off
    const tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    video.srcObject = null;

    // Cancel auto-shutdown if it was running
    if (autoCameraShutdownTimer) {
      clearTimeout(autoCameraShutdownTimer);
      autoCameraShutdownTimer = null;
    }

    // Show metadata when camera is off
    document.getElementById('metadata-display').style.display = 'block';
  }
}


