#!/usr/bin/env python
# log_cleanup.py

import os
import datetime
import pickle

def clean_logs():
    """Clear log files older than two weeks"""
    log_dir = '/home/nathan/clubfinder/data_collection/logs'
    two_weeks_ago = datetime.datetime.now() - datetime.timedelta(days=14)
    
    for root, dirs, files in os.walk(log_dir):
        for file in files:
            if file.endswith('.log') or file.endswith('.pkl'):
                file_path = os.path.join(root, file)
                
                # Skip if file doesn't exist (rare but possible race condition)
                if not os.path.exists(file_path):
                    continue
                    
                mod_time = datetime.datetime.fromtimestamp(os.path.getmtime(file_path))
                file_size = os.path.getsize(file_path) / (1024 * 1024)  # Size in MB
                
                # If the file is older than two weeks OR larger than 10MB, handle it
                if mod_time < two_weeks_ago or file_size > 10:
                    try:
                        if file.endswith('.log'):
                            # Option 1: Clear the file
                            with open(file_path, 'w') as f:
                                f.write(f"# Log cleared on {datetime.datetime.now()}\n")
                            print(f"Cleared log file: {file_path} (Age: {(datetime.datetime.now() - mod_time).days} days, Size: {file_size:.2f}MB)")
                            
                            # Option 2: Archive and clear (uncomment if you want this instead)
                            # archive_path = file_path + f".{mod_time.strftime('%Y%m%d')}"
                            # os.rename(file_path, archive_path)
                            # open(file_path, 'w').close()
                            # print(f"Archived log file to {archive_path}")
                            
                        elif file.endswith('.pkl'):
                            # For pickle files, reset to an empty state
                            # You might want different handling for different pickle files
                            if 'api_call_log' in file:
                                # For API call logs, keep entries from the last 2 weeks
                                try:
                                    with open(file_path, 'rb') as f:
                                        data = pickle.load(f)
                                    
                                    # Filter to keep only recent entries
                                    if isinstance(data, dict):
                                        filtered_data = {k: v for k, v in data.items() 
                                                        if v > two_weeks_ago}
                                        with open(file_path, 'wb') as f:
                                            pickle.dump(filtered_data, f)
                                        print(f"Cleaned up pickle file: {file_path} (removed {len(data) - len(filtered_data)} old entries)")
                                except Exception as e:
                                    print(f"Error processing pickle file {file_path}: {e}")
                    except Exception as e:
                        print(f"Error clearing log file {file_path}: {e}")

if __name__ == "__main__":
    print(f"Starting log cleanup at {datetime.datetime.now()}")
    clean_logs()
    print(f"Finished log cleanup at {datetime.datetime.now()}")