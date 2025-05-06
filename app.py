from flask import Flask, session, render_template, redirect, url_for, request, jsonify
from dotenv import load_dotenv
load_dotenv()
from config import DevelopmentConfig  
import os

app = Flask(__name__)
app.config.from_object(DevelopmentConfig)

@app.route('/')
def index():
    if all(k in session for k in ['x', 'y', 'diameter']):
        return render_template('main_ui.html', **session)
    return redirect(url_for('calibrate'))

@app.route('/calibrate')
def calibrate():
    return render_template('calibrate.html')

@app.route('/save', methods=['POST'])
def save():
    data = request.get_json()
    session['x'] = data['x']
    session['y'] = data['y']
    session['diameter'] = data['diameter']
    return '', 204  # HTMX likes 204 for "no content"


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
