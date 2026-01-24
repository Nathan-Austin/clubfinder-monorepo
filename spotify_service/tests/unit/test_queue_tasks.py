import pytest
import json
import os
import shutil
from unittest.mock import patch, Mock
from spotify_automation.tasks.queue_tasks import migrate_file_queue_task

@pytest.fixture
def temp_queue_dir(tmp_path):
    queue_dir = tmp_path / "pending_queue"
    queue_dir.mkdir()
    return queue_dir

class TestQueueTasks:
    @patch('spotify_automation.tasks.queue_tasks.add_user_task')
    @patch('spotify_automation.tasks.queue_tasks.add_bar_task')
    @patch('spotify_automation.tasks.queue_tasks.os.getcwd')
    def test_migrate_file_queue_success(self, mock_getcwd, mock_bar_task, mock_user_task, temp_queue_dir):
        # Setup
        mock_getcwd.return_value = str(temp_queue_dir.parent)
        
        # Create a user file
        user_data = {"id": "u1", "email": "u1@ex.com", "type": "user"}
        with open(temp_queue_dir / "user_1.json", "w") as f:
            json.dump(user_data, f)
            
        # Create a bar file
        bar_data = {"id": "b1", "email": "b1@ex.com", "type": "bar"}
        with open(temp_queue_dir / "bar_1.json", "w") as f:
            json.dump(bar_data, f)
            
        # Execute
        result = migrate_file_queue_task()
        
        # Verify
        assert result["total"] == 2
        assert result["user_tasks"] == 1
        assert result["bar_tasks"] == 1
        
        mock_user_task.delay.assert_called_with("u1", "u1@ex.com")
        mock_bar_task.delay.assert_called_with("b1", "b1@ex.com")
        
        # Check files moved
        assert not (temp_queue_dir / "user_1.json").exists()
        assert (temp_queue_dir / "migrated" / "user_1.json").exists()
        assert (temp_queue_dir / "migrated" / "bar_1.json").exists()

    @patch('spotify_automation.tasks.queue_tasks.os.getcwd')
    def test_migrate_file_queue_corrupt(self, mock_getcwd, temp_queue_dir):
        mock_getcwd.return_value = str(temp_queue_dir.parent)
        
        # Create invalid file
        with open(temp_queue_dir / "corrupt.json", "w") as f:
            f.write("not json")
            
        # Execute
        result = migrate_file_queue_task()
        
        # Verify
        assert result["failed"] == 1
        assert (temp_queue_dir / "corrupt" / "corrupt.json").exists()
