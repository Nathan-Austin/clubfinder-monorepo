#!/bin/bash
source /home/nathan/anaconda3/etc/profile.d/conda.sh
conda activate base
export PYTHONPATH=/home/nathan/clubfinder/barfindr/src
cd /home/nathan/clubfinder/barfindr
celery -A src.barfindr.celery:app worker --loglevel=info -Q celery,spotify,maintenance
