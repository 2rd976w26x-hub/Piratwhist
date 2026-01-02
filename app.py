from flask import Flask, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")

@app.get("/")
def index():
    return send_from_directory(".", "piratwhist.html")

@app.get("/<path:path>")
def static_files(path: str):
    return send_from_directory(".", path)
