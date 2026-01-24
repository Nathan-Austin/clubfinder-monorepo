from flask import Blueprint, request, jsonify
from celery.result import AsyncResult
from ..celery import app as celery_app
from ..tasks import (
    add_user_task,
    add_bar_task,
    create_spotify_app_task,
    refresh_app_credentials_task,
)

api_bp = Blueprint("api", __name__)


@api_bp.route("/add_user", methods=["POST"])
def add_user_endpoint():
    data = request.json
    user_id = data.get("user_id")
    spotify_email = data.get("spotify_email")

    if not user_id or not spotify_email:
        return jsonify({"error": "Missing user_id or spotify_email"}), 400

    # Dispatch to Celery
    task = add_user_task.delay(user_id, spotify_email)

    # Handle sync mode for backward compatibility
    if request.args.get("sync") == "true":
        try:
            # Wait for result with timeout (e.g. 5 minutes)
            result = task.get(timeout=300)
            return jsonify({"status": "success", "result": result})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    return jsonify({"status": "queued", "task_id": task.id}), 202


@api_bp.route("/add_bar", methods=["POST"])
def add_bar_endpoint():
    data = request.json
    bar_id = data.get("bar_id")
    spotify_email = data.get("spotify_email")

    if not bar_id or not spotify_email:
        return jsonify({"error": "Missing bar_id or spotify_email"}), 400

    task = add_bar_task.delay(bar_id, spotify_email)

    if request.args.get("sync") == "true":
        try:
            result = task.get(timeout=300)
            return jsonify({"status": "success", "result": result})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    return jsonify({"status": "queued", "task_id": task.id}), 202


@api_bp.route("/create_app", methods=["POST"])
def create_app_endpoint():
    data = request.json or {}
    app_type = data.get("app_type", "user")

    task = create_spotify_app_task.delay(app_type)
    return jsonify({"status": "queued", "task_id": task.id}), 202


@api_bp.route("/refresh_credentials", methods=["POST"])
def refresh_credentials_endpoint():
    data = request.json
    app_name = data.get("app_name")

    if not app_name:
        return jsonify({"error": "Missing app_name"}), 400

    task = refresh_app_credentials_task.delay(app_name)
    return jsonify({"status": "queued", "task_id": task.id}), 202


@api_bp.route("/migrate_queue", methods=["POST"])
def migrate_queue_endpoint():
    """Trigger migration of legacy file queue to Celery"""
    from ..tasks import migrate_file_queue_task

    task = migrate_file_queue_task.delay()
    return jsonify({"status": "migration_started", "task_id": task.id}), 202


@api_bp.route("/task_status/<task_id>", methods=["GET"])
def task_status_endpoint(task_id):
    result = AsyncResult(task_id, app=celery_app)
    response = {"state": result.state, "ready": result.ready()}
    if result.ready():
        if result.successful():
            response["result"] = result.result
        else:
            response["error"] = str(result.result)

    return jsonify(response)
