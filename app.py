from flask import Flask, send_from_directory

# Serve static files directly from repo root
app = Flask(__name__, static_folder=".", static_url_path="")

@app.get("/")
def index():
    # Main app file
    return send_from_directory(".", "piratwhist.html")

@app.get("/<path:path>")
def static_files(path: str):
    # CSS/JS/etc.
    return send_from_directory(".", path)
