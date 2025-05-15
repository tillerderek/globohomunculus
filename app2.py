from flask import Flask, session, render_template, redirect, url_for, request, jsonify, send_from_directory, send_file
from dotenv import load_dotenv
load_dotenv()
from config import DevelopmentConfig
import os
import cv2
import numpy as np
import pytesseract
import json
from PIL import Image
from functools import wraps
import random

app = Flask(__name__)
app.config.from_object(DevelopmentConfig)

UPLOAD_FOLDER = "uploads"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max-limit

# Update this to your actual archive path
ARCHIVE_PATH = "/mnt/ssd/globemusic/archive"

# ------------------------------
# Helper Functions
# ------------------------------

# Load countries from the JSON file
def load_countries():
    try:
        # Path to your country list file
        country_file_path = os.path.join(os.path.dirname(__file__), "countries.json")
        with open(country_file_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading countries file: {e}")
        # Fallback to a minimal set in case of error
        return {
            "FRA": "France",
            "BRA": "Brazil",
            "JPN": "Japan",
            "USA": "United States of America",
            "DEU": "Germany",
            "NGA": "Nigeria",
        }

# Decorator to ensure calibration is done
def require_calibration(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not all(k in session for k in ['x', 'y', 'diameter']):
            return redirect(url_for('calibrate'))
        return f(*args, **kwargs)
    return decorated_function

# Image processing functions
def crop_center(img, cropx, cropy):
    y, x = img.shape[:2]
    startx = x // 2 - (cropx // 2)
    starty = y // 2 - (cropy // 2)
    return img[starty:starty+cropy, startx:startx+cropx]
  
def build_queue(country, decade):
    """Collect and shuffle songs for a given country/decade."""
    songs = []
    # Decide which countries to scan
    if country == 'all':
        country_list = [d for d in os.listdir(ARCHIVE_PATH) if os.path.isdir(os.path.join(ARCHIVE_PATH, d))]
    else:
        country_list = [country]
    for c in country_list:
        base_country = os.path.join(ARCHIVE_PATH, c)
        if not os.path.isdir(base_country):
            continue
        # Decide which decades to scan
        if decade == 'all':
            decade_list = [d for d in os.listdir(base_country) if os.path.isdir(os.path.join(base_country, d))]
        else:
            decade_list = [decade]
        for d in decade_list:
            base_dir = os.path.join(base_country, d)
            if not os.path.isdir(base_dir):
                continue
            for root, dirs, files in os.walk(base_dir):
                for filename in files:
                    if filename.lower().endswith('.mp3'):
                        # Store path relative to the static folder for URL building
                        rel_path = os.path.relpath(os.path.join(root, filename), ARCHIVE_PATH)
                        songs.append(f"/archive/{rel_path}")

                        songs.append(rel_path)
    random.shuffle(songs)  # Shuffle the list in place:contentReference[oaicite:3]{index=3}
    session['queue'] = songs

def detect_country(text, country_codes):
    # First try direct name matching
    for name in country_codes:
        if name.upper() in text.upper():
            return name, country_codes[name]
    
    # If no direct match, try more fuzzy matching
    # This could be enhanced with more sophisticated text matching
    words = text.upper().split()
    for name in country_codes:
        for word in words:
            if len(word) >= 3 and word in name.upper():
                return name, country_codes[name]
    
    return None, None

def get_available_decades(country_code):
    country_path = os.path.join(ARCHIVE_PATH, country_code)
    if not os.path.isdir(country_path):
        return []

    decades = [
        d for d in os.listdir(country_path)
        if os.path.isdir(os.path.join(country_path, d)) and d != "images"
    ]

    if decades and "all" not in decades:
        decades.append("all")

    return sorted(decades)



def pick_song(country_code, decade):
    """Pick a random song from the country and decade"""
    if decade == "all":
        # Get all decade directories
        country_path = os.path.join(ARCHIVE_PATH, country_code)
        decades = [
            d
            for d in os.listdir(country_path)
            if os.path.isdir(os.path.join(country_path, d)) and d != "all"
        ]

        # Randomly select a decade
        if not decades:
            return None, None
        decade = random.choice(decades)

    dir_path = os.path.join(ARCHIVE_PATH, country_code, decade)
    if not os.path.isdir(dir_path):
        return None, None

    # Look for subdirectories that might contain songs
    songs = []
    for root, dirs, files in os.walk(dir_path):
        mp3s = [f for f in files if f.lower().endswith(".mp3")]
        for mp3 in mp3s:
            songs.append((os.path.join(root, mp3), root))

    if not songs:
        return None, None

    # Select a random song
    song_path, song_dir = random.choice(songs)

    # Try to find metadata json file
    metadata = {}
    json_files = [f for f in os.listdir(song_dir) if f.lower().endswith(".json")]
    for json_file in json_files:
        try:
            with open(os.path.join(song_dir, json_file), "r") as f:
                metadata = json.load(f)
                break
        except:
            continue

    return song_path, metadata
def get_music_files(country_code, decade):
    if decade == "all":
        # Get files from all decades
        music_files = []
        country_path = os.path.join(ARCHIVE_PATH, country_code)
        for decade_dir in os.listdir(country_path):
            if os.path.isdir(os.path.join(country_path, decade_dir)) and decade_dir != "all":
                decade_path = os.path.join(country_path, decade_dir)
                files = [os.path.join(decade_dir, f) for f in os.listdir(decade_path) 
                         if f.endswith(('.mp3', '.wav', '.ogg'))]
                music_files.extend(files)
    else:
        # Get files from specific decade
        decade_path = os.path.join(ARCHIVE_PATH, country_code, decade)
        if os.path.isdir(decade_path):
            music_files = [f for f in os.listdir(decade_path) 
                           if f.endswith(('.mp3', '.wav', '.ogg'))]
        else:
            music_files = []
    
    return music_files
  

# Load the countries at app startup
COUNTRIES = load_countries()
# Reverse lookup (name to code)
COUNTRY_CODES = {v: k for k, v in COUNTRIES.items()}

# ------------------------------
# Routes
# ------------------------------

@app.route('/')
def index():
    if all(k in session for k in ['x', 'y', 'diameter']):
        return redirect(url_for('main_interface'))
    return redirect(url_for('calibrate'))

@app.route('/calibrate')
def calibrate():
    return render_template('calibrate.html')

@app.route('/recalibrate')
def recalibrate():
    session.pop('x', None)
    session.pop('y', None)
    session.pop('diameter', None)
    return redirect(url_for('index'))

@app.route('/save', methods=['POST'])
def save():
    data = request.get_json()
    session['x'] = data['x']
    session['y'] = data['y']
    session['diameter'] = data['diameter']
    return '', 204  # HTMX likes 204 for "no content"

@app.route('/main')
@require_calibration
def main_interface():
    country_code = session.get('current_country')
    country_name = COUNTRIES.get(country_code, "Unknown Country")
    
    decades = []
    selected_decade = None
    
    if country_code:
        decades = get_available_decades(country_code)
        selected_decade = session.get('selected_decade')
    
    song_info = session.get('song_info')  # <-- this was missing

    return render_template(
        'main_ui.html',
        x=session.get('x'),
        y=session.get('y'),
        diameter=session.get('diameter'),
        country_code=country_code,
        country_name=country_name,
        decades=decades,
        selected_decade=selected_decade,
        song_info=song_info
    )

@app.route('/archive/<path:filename>')
def serve_archive_file(filename):
    return send_from_directory(ARCHIVE_PATH, filename)

  
@app.route('/image_processing', methods=['POST'])
@require_calibration
def image_processing():
    try:
        if 'photo' not in request.files:
            return jsonify({'status': 'error', 'message': 'No photo uploaded'}), 400

        file = request.files['photo']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'Empty filename'}), 400

        # Convert to OpenCV format
        file_bytes = np.frombuffer(file.read(), np.uint8)
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if image is None:
            return jsonify({'status': 'error', 'message': 'Failed to decode image'}), 400

        # Crop the center
        cropped = crop_center(image, 200, 350)

        # Convert to grayscale and threshold
        gray = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY)

        # Optional: Save debug images (for development only)
        debug_dir = os.path.join(app.static_folder, 'debug')
        os.makedirs(debug_dir, exist_ok=True)
        
        cv2.imwrite(os.path.join(debug_dir, "debug_cropped.jpg"), cropped)
        cv2.imwrite(os.path.join(debug_dir, "debug_gray.jpg"), gray)
        cv2.imwrite(os.path.join(debug_dir, "debug_original.jpg"), image)
        print("Received image upload")

        # OCR       
        processed_pil = Image.fromarray(gray)
        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ"'
        text = pytesseract.image_to_string(processed_pil, config=custom_config)

        print("=== OCR RESULT ===")
        print(text)
        print("==================")

        country_name, country_code = detect_country(text, COUNTRY_CODES)

        if country_code:
            decades = get_available_decades(country_code)
            session["current_country"] = country_code
            
            # If there are decades available, select the first one by default
            if decades:
                session["selected_decade"] = decades[0]
                
            return jsonify({
                "status": "success",
                "result": {
                    "country": country_name,
                    "country_code": country_code,
                    "decades": decades,
                }
            })
        else:
            return jsonify({
                "status": "error",
                "message": "No country detected. Try to center the country name in the viewfinder and ensure it's well lit.",
            })

    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Error processing image: {str(e)}",
        })
        

@app.route('/select_decade/<decade>')
@require_calibration
def select_decade(decade):
    country_code = session.get('current_country')
    if not country_code:
        return redirect(url_for('main_ui'))
    
    decades = get_available_decades(country_code)
    if decade in decades:
        session['selected_decade'] = decade

        # Reset and rebuild the queue for the new country/decade selection
        session.pop('queue', None)
        build_queue(country_code, decade)
        
    return redirect(url_for('main_ui'))



@app.route('/navigate_decades/<direction>')
@require_calibration
def navigate_decades(direction):
    country_code = session.get('current_country')
    if not country_code:
        return redirect(url_for('main_interface'))
    
    decades = get_available_decades(country_code)
    if not decades:
        return redirect(url_for('main_interface'))
    
    current_decade = session.get('selected_decade')
    if not current_decade or current_decade not in decades:
        session['selected_decade'] = decades[0]
    else:
        current_index = decades.index(current_decade)
        if direction == 'next':
            next_index = (current_index + 1) % len(decades)
        else:  # previous
            next_index = (current_index - 1) % len(decades)
        session['selected_decade'] = decades[next_index]
    
    return redirect(url_for('main_interface'))

# Modify the play_music route to build a queue and return the first song
@app.route('/play_music', methods=["GET"])
@require_calibration
def play_music():
    country_code = session.get('current_country')
    decade = session.get('selected_decade')

    if not country_code or not decade:
        return jsonify({"status": "error", "message": "Country or decade not selected"})

    try:
        # Build a queue for the selected country/decade
        build_queue(country_code, decade)
        
        # Get the first song from the queue
        queue = session.get('queue', [])
        if not queue:
            return jsonify({
                "status": "error",
                "message": f"No music found for {COUNTRIES.get(country_code, country_code)} in {decade}"
            })
        
        # Get the first song path and remove it from the queue
        first_song = queue.pop(0)
        session['queue'] = queue
        
        # Make sure we have the full path to the song
        if first_song.startswith(ARCHIVE_PATH):
            song_path = first_song
        else:
            song_path = os.path.join(ARCHIVE_PATH, first_song)
        
        # Store current song info in session
        session["current_song"] = song_path
        session["current_decade"] = decade
        
        # Get metadata if available
        metadata = {}
        song_dir = os.path.dirname(song_path)
        json_files = [f for f in os.listdir(song_dir) if f.lower().endswith(".json")]
        for json_file in json_files:
            try:
                with open(os.path.join(song_dir, json_file), "r") as f:
                    metadata = json.load(f)
                    break
            except:
                continue
        
        # Store song info in session
        session["song_info"] = metadata
        
        return jsonify({
            "status": "success",
            "music_files": [os.path.basename(song_path)],
            "country": COUNTRIES.get(country_code, country_code),
            "decade": decade,
            "song_info": metadata,
            "play_url": f"/play/{os.path.basename(song_path)}",
            "queue_size": len(queue)
        })
    except Exception as e:
        print(f"Error selecting music: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Error selecting music: {str(e)}"
        })

# Update the next_song route to serve the next song in the queue
@app.route('/next_song')
def next_song():
    queue = session.get('queue', [])
    if not queue:
        # If queue is empty, try to rebuild using the last country/decade
        country_code = session.get('current_country')
        decade = session.get('selected_decade')
        if country_code and decade:
            build_queue(country_code, decade)
            queue = session.get('queue', [])
            if not queue:
                return jsonify({"status": "error", "message": "No more songs in queue"}), 404
        else:
            return jsonify({"status": "error", "message": "Queue is empty"}), 404

    # Get the next song path and remove it from the queue
    next_song_path = queue.pop(0)
    session['queue'] = queue
    
    # Make sure we have the full path to the song
    if next_song_path.startswith(ARCHIVE_PATH):
        song_path = next_song_path
    else:
        song_path = os.path.join(ARCHIVE_PATH, next_song_path)
    
    # Update current song in session
    session["current_song"] = song_path
    
    # Get metadata if available
    metadata = {}
    song_dir = os.path.dirname(song_path)
    json_files = [f for f in os.listdir(song_dir) if f.lower().endswith(".json")]
    for json_file in json_files:
        try:
            with open(os.path.join(song_dir, json_file), "r") as f:
                metadata = json.load(f)
                break
        except:
            continue
    
    # Store song info in session
    session["song_info"] = metadata
    
    filename = os.path.basename(song_path)
    
    return jsonify({
        "status": "success",
        "filename": filename,
        "play_url": f"/play/{filename}",
        "song_info": metadata,
        "queue_size": len(queue)
    })

@app.route('/music/<country_code>/<decade>/<path:filename>')
def serve_music(country_code, decade, filename):
    """Serve music files from the archive"""
    music_dir = os.path.join(ARCHIVE_PATH, country_code, decade)
    return send_from_directory(music_dir, filename)

# ------------------------------
# Development Server
# ------------------------------

if __name__ == "__main__":
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    
    # Create debug directory if it doesn't exist
    debug_dir = os.path.join(app.static_folder, 'debug')
    os.makedirs(debug_dir, exist_ok=True)

    # For development with camera access
    app.run(host="0.0.0.0", port=5000)
    # For HTTPS: app.run(host="0.0.0.0", port=5000, debug=True, ssl_context="adhoc")