from flask import (
    Flask,
    session,
    render_template,
    redirect,
    url_for,
    request,
    jsonify,
    send_from_directory,
    send_file,
)
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
import traceback

app = Flask(__name__)
app.config.from_object(DevelopmentConfig)

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
# Load the countries at app startup
COUNTRIES = load_countries()
# Reverse lookup (name to code)
COUNTRY_CODES = {v: k for k, v in COUNTRIES.items()}

# Decorator to ensure calibration is done
def require_calibration(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not all(k in session for k in ["x", "y", "diameter"]):
            return redirect(url_for("calibrate"))
        return f(*args, **kwargs)

    return decorated_function


# Image processing functions
def crop_center(img, cropx, cropy):
    y, x = img.shape[:2]
    startx = x // 2 - (cropx // 2)
    starty = y // 2 - (cropy // 2)
    return img[starty : starty + cropy, startx : startx + cropx]


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
        d
        for d in os.listdir(country_path)
        if os.path.isdir(os.path.join(country_path, d)) and d != "images"
    ]

    if decades and "all" not in decades:
        decades.append("all")

    return sorted(decades)


def pick_song(country_code, decade, exclude_path=None):
    """Pick a random song from the country and decade, optionally excluding the last played song."""
    if decade == "all":
        country_path = os.path.join(ARCHIVE_PATH, country_code)
        decades = [
            d
            for d in os.listdir(country_path)
            if os.path.isdir(os.path.join(country_path, d)) and d != "all"
        ]

        if not decades:
            return None, None
        decade = random.choice(decades)

    dir_path = os.path.join(ARCHIVE_PATH, country_code, decade)
    if not os.path.isdir(dir_path):
        return None, None

    songs = []
    for root, dirs, files in os.walk(dir_path):
        mp3s = [f for f in files if f.lower().endswith(".mp3")]
        for mp3 in mp3s:
            full_path = os.path.join(root, mp3)
            if exclude_path and os.path.abspath(full_path) == os.path.abspath(exclude_path):
                continue
            songs.append((full_path, root))

    # Fallback: if only one song exists and it was excluded, allow it
    if not songs and exclude_path:
        for root, dirs, files in os.walk(dir_path):
            mp3s = [f for f in files if f.lower().endswith(".mp3")]
            for mp3 in mp3s:
                full_path = os.path.join(root, mp3)
                songs.append((full_path, root))
                break  # only need one fallback

    if not songs:
        return None, None

    song_path, song_dir = random.choice(songs)

    metadata = {}
    json_files = [f for f in os.listdir(song_dir) if f.lower().endswith(".json")]
    for json_file in json_files:
        try:
            with open(os.path.join(song_dir, json_file), "r") as f:
                metadata = json.load(f)
                break
        except:
            continue

    # Add country info to metadata
    country_code, country_name = get_country_from_path(song_path)
    metadata["country_code"] = country_code
    metadata["country_name"] = country_name

    return song_path, metadata


def pick_random_song_from_archive():
    mp3_files = []
    print("[DEBUG] Starting to walk through archive to find mp3 files...")
    for root, dirs, files in os.walk(ARCHIVE_PATH):
        for fname in files:
            if fname.lower().endswith('.mp3'):
                full_path = os.path.join(root, fname)
                mp3_files.append(full_path)
    print(f"[DEBUG] Found {len(mp3_files)} mp3 files in archive.")

    if not mp3_files:
        print("[DEBUG] No mp3 files found, returning None.")
        return None, None

    chosen = random.choice(mp3_files)
    print(f"[DEBUG] Randomly chosen mp3 file: {chosen}")

    meta_path = os.path.splitext(chosen)[0] + '.json'
    metadata = {}
    if os.path.exists(meta_path):
        print(f"[DEBUG] Metadata JSON found at: {meta_path}, loading...")
        try:
            with open(meta_path, 'r') as f:
                metadata = json.load(f)
            print(f"[DEBUG] Metadata loaded: {metadata}")
        except Exception as e:
            print(f"[DEBUG] Error loading metadata JSON: {e}")
    else:
        print(f"[DEBUG] No metadata JSON found for chosen mp3.")

    country_code, country_name = get_country_from_path(chosen)
    print(f"[DEBUG] Country code from path: {country_code}")
    print(f"[DEBUG] Country name from path: {country_name}")

    metadata["country_code"] = country_code
    metadata["country_name"] = country_name

    print(f"[DEBUG] Final metadata sent to front end: {metadata}")

    return chosen, metadata



def get_country_from_path(song_path):
    try:
        parts = os.path.normpath(song_path).split(os.sep)
        print(f"[DEBUG] song_path: {song_path}")
        print(f"[DEBUG] parts: {parts}")

        if "archive" in parts:
            archive_index = parts.index("archive")
            print(f"[DEBUG] archive_index: {archive_index}")
            country_code = parts[archive_index + 1]
            print(f"[DEBUG] country_code from path: {country_code}")

            country_name = COUNTRIES.get(country_code, "Unknown Country")
            print(f"[DEBUG] country_name: {country_name}")

            return country_code, country_name
        else:
            print("[DEBUG] 'archive' not in path")
    except Exception as e:
        print(f"[ERROR] Failed in get_country_from_path: {e}")

    return None, "Unknown Country"






# ------------------------------
# Routes
# ------------------------------


@app.route("/")
def index():
    for key in ["current_country", "song", "decade", "selected_decade", "global_shuffle"]:
        session.pop(key, None) 
    if all(k in session for k in ["x", "y", "diameter"]):
        return redirect(url_for("main_interface"))
    return redirect(url_for("calibrate"))



@app.route("/calibrate")
def calibrate():
    return render_template("calibrate.html")


@app.route("/recalibrate")
def recalibrate():
    session.pop("x", None)
    session.pop("y", None)
    session.pop("diameter", None)
    return redirect(url_for("index"))


@app.route("/save", methods=["POST"])
def save():
    data = request.get_json()
    session["x"] = data["x"]
    session["y"] = data["y"]
    session["diameter"] = data["diameter"]
    return "", 204  # HTMX likes 204 for "no content"


@app.route("/main")
@require_calibration
def main_interface():
    country_code = session.get("current_country")
    country_name = COUNTRIES.get(country_code, "Unknown Country")
    decades = []
    selected_decade = None

    if country_code:
        decades = get_available_decades(country_code)
        selected_decade = session.get("selected_decade")

    song_info = session.get("song_info")
    global_shuffle = session.get("global_shuffle", False)  # ✅ Add this

    return render_template(
        "main_ui.html",
        x=session.get("x"),
        y=session.get("y"),
        diameter=session.get("diameter"),
        country_code=country_code,
        country_name=country_name,
        decades=decades,
        selected_decade=selected_decade,
        song_info=song_info,
        global_shuffle=global_shuffle 
    )



@app.route("/image_processing", methods=["POST"])
@require_calibration
def image_processing():
    try:
        if "photo" not in request.files:
            return jsonify({"status": "error", "message": "No photo uploaded"}), 400

        file = request.files["photo"]
        if file.filename == "":
            return jsonify({"status": "error", "message": "Empty filename"}), 400

        # Convert to OpenCV format
        file_bytes = np.frombuffer(file.read(), np.uint8)
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if image is None:
            return (
                jsonify({"status": "error", "message": "Failed to decode image"}),
                400,
            )

        # Crop the center
        cropped = crop_center(image, 200, 350)

        # Convert to grayscale and threshold
        gray = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY)

        # Optional: Save debug images (for development only)
        debug_dir = os.path.join(app.static_folder, "debug")
        os.makedirs(debug_dir, exist_ok=True)

        cv2.imwrite(os.path.join(debug_dir, "debug_cropped.jpg"), cropped)
        cv2.imwrite(os.path.join(debug_dir, "debug_gray.jpg"), gray)
        cv2.imwrite(os.path.join(debug_dir, "debug_original.jpg"), image)
        print("Received image upload")

        # OCR
        processed_pil = Image.fromarray(gray)
        custom_config = (
            r'--oem 3 --psm 6 -c tessedit_char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ"'
        )
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
                session["global_shuffle"] = False

            return jsonify(
                {
                    "status": "success",
                    "result": {
                        "country": country_name,
                        "country_code": country_code,
                        "decades": decades,
                    },
                }
            )
            
        else:
            return jsonify(
                {
                    "status": "error",
                    "message": "No country detected. Try to center the country name in the viewfinder and ensure it's well lit.",
                }
            )

    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return jsonify(
            {
                "status": "error",
                "message": f"Error processing image: {str(e)}",
            }
        )

@app.route("/select_decade/<decade>")
@require_calibration
def select_decade(decade):
    country_code = session.get("current_country")
    if not country_code:
        return redirect(url_for("main_ui"))

    decades = get_available_decades(country_code)
    if decade in decades:
        session["selected_decade"] = decade

    return redirect(url_for("main_ui"))


@app.route("/navigate_decades/<direction>")
@require_calibration
def navigate_decades(direction):
    country_code = session.get("current_country")
    if not country_code:
        return redirect(url_for("main_interface"))

    decades = get_available_decades(country_code)
    if not decades:
        return redirect(url_for("main_interface"))

    current_decade = session.get("selected_decade")
    if not current_decade or current_decade not in decades:
        session["selected_decade"] = decades[0]
    else:
        current_index = decades.index(current_decade)
        if direction == "next":
            next_index = (current_index + 1) % len(decades)
        else:  # previous
            next_index = (current_index - 1) % len(decades)
        session["selected_decade"] = decades[next_index]

    return redirect(url_for("main_interface"))


@app.route("/play_music")
def play_music():
    global_shuffle_mode = session.get("global_shuffle", False)
    
    if global_shuffle_mode:
        song_path, metadata = pick_random_song_from_archive()
    else:
        country_code = session.get("current_country")
        decade = session.get("selected_decade")
        if not country_code or not decade:
            return jsonify({'status': 'error', 'message': 'Missing country or decade selection'})
        song_path, metadata = pick_song(country_code, decade)

    if not song_path:
        return jsonify({'status': 'error', 'message': 'No songs found'})

    # Extract country info from path, similar to pick_random_song_from_archive
    country_code, country_name = get_country_from_path(song_path)
    metadata["country_code"] = country_code
    metadata["country_name"] = country_name

    # Store the current song path in the session
    session["current_song"] = song_path
    
    song_info = {
        'artist': metadata.get('artist', 'Unknown Artist'),
        'title': metadata.get('title', 'Untitled'),
        'year': metadata.get('year', 'Unknown Year'),
    }
    
    # Store song info in session
    session["song_info"] = song_info

    return jsonify({
        'status': 'success',
        'music_files': [os.path.basename(song_path)],
        'song_info': song_info,
        'country': metadata.get('country_name', 'Unknown')
    })



@app.route("/play/<filename>")
def play(filename):
    # First check if we have the current song path in the session
    song_path = session.get("current_song")
    
    # If we don't have a stored path, or the filename doesn't match, search for it
    if not song_path or os.path.basename(song_path) != filename:
        # Search for the file in the archive
        for root, dirs, files in os.walk(ARCHIVE_PATH):
            for file in files:
                if file == filename:
                    song_path = os.path.join(root, file)
                    # Update the session with the found path
                    session["current_song"] = song_path
                    break
            if song_path and os.path.basename(song_path) == filename:
                break
    
    if not song_path or not os.path.exists(song_path):
        return f"Song not found: {filename}", 404
    
    return send_file(song_path, mimetype="audio/mpeg")
  

@app.route("/global_shuffle", methods=["POST"])
@require_calibration
def global_shuffle():
    try:
        # Mark that we're in global shuffle mode
        session["global_shuffle"] = True

        # Clear other session keys
        session.pop("current_country", None)
        session.pop("selected_decade", None)
        session.pop("current_song", None)

        # Pick a random song from the archive
        song_path, metadata = pick_random_song_from_archive()
        if not song_path:
            return jsonify({'status': 'error', 'message': 'No songs found in archive'}), 404

        # Store the current song path in the session
        session["current_song"] = song_path

        # Prepare song info for display
        song_info = {
            'artist': metadata.get('artist', 'Unknown Artist'),
            'title': metadata.get('title', 'Untitled'),
            'year': metadata.get('year', 'Unknown Year'),
        }

        # Store song info in session
        session["song_info"] = song_info

        # Return in the same format as the play_music route
        return jsonify({
            'status': 'success',
            'music_files': [os.path.basename(song_path)],
            'song_info': song_info,
            'country': metadata.get('country_name', 'Unknown'),
            'country_code': metadata.get('country_code', '')
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'Error: {str(e)}'}), 500


# ------------------------------
# Development Server
# ------------------------------

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)  # plain HTTP, local only


