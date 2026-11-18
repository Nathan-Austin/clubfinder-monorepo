import os
import sys

# Make the data_collection modules importable when pytest runs from anywhere
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
