#!/bin/bash

LOG_DIR="/home/nathan/clubfinder/data_collection/logs"
LOG_FILE="$LOG_DIR/cron.log"
DETAIL_LOG_FILE="$LOG_DIR/cron_details.log"
SCRIPT_PATH="/home/nathan/clubfinder/data_collection/data_collection.py"
LOCKFILE="/tmp/data_col.lock"
CONDA_ENV="data_col_env"

CONDA_PATH="/home/nathan/anaconda3/bin/conda"
CONDA_SH="/home/nathan/anaconda3/etc/profile.d/conda.sh"

mkdir -p "$LOG_DIR"

# Exit if already running
if [ -e "$LOCKFILE" ]; then
  echo "[WARN] $(date): Job already running. Exiting." >> "$LOG_FILE"
  exit 1
fi

touch "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

echo "[INFO] === Run started at $(date) ===" >> "$LOG_FILE"

# Check if conda.sh exists
if [ ! -f "$CONDA_SH" ]; then
  echo "[ERROR] Conda initialization file not found at $CONDA_SH." >> "$LOG_FILE"
  echo "Looking for alternatives..." >> "$DETAIL_LOG_FILE"
  find /home/nathan -name conda.sh 2>/dev/null >> "$DETAIL_LOG_FILE"
  exit 1
fi

# Source conda.sh to initialize conda in this shell
echo "[INFO] Initializing conda from $CONDA_SH" >> "$DETAIL_LOG_FILE"
source "$CONDA_SH"

# Activate the conda environment
echo "[INFO] Activating conda environment: $CONDA_ENV" >> "$DETAIL_LOG_FILE"
conda activate "$CONDA_ENV"

# Verify environment was activated
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to activate conda environment '$CONDA_ENV'. Check if it exists." >> "$LOG_FILE"
  conda env list >> "$DETAIL_LOG_FILE"
  exit 1
fi

# Run the Python script
echo "[INFO] Running Python script: $SCRIPT_PATH" >> "$DETAIL_LOG_FILE"
python "$SCRIPT_PATH" >> "$DETAIL_LOG_FILE" 2>&1
STATUS=$?

# Deactivate the conda environment
conda deactivate

# Log completion status
if [ $STATUS -eq 0 ]; then
  echo "[INFO] Script completed successfully at $(date)" >> "$LOG_FILE"
else
  echo "[ERROR] Script failed with exit code $STATUS at $(date)" >> "$LOG_FILE"
  # Show recent errors from the detailed log
  echo "[ERROR] Recent error messages:" >> "$LOG_FILE"
  grep -i "error\|exception\|failed" "$DETAIL_LOG_FILE" | tail -n 10 >> "$LOG_FILE"
fi

echo "[INFO] === Run finished ===" >> "$LOG_FILE"