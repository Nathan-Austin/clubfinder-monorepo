from flask import Flask
from .endpoints import api_bp
from ..celery import app as celery_app


def create_app():
    app = Flask(__name__)
    app.register_blueprint(api_bp, url_prefix="/api")
    print(f"DEBUG: API Celery Broker: {celery_app.conf.broker_url}")
    return app


if __name__ == "__main__":
    app = create_app()
    # Listen on all interfaces
    app.run(host="0.0.0.0", port=5000)
