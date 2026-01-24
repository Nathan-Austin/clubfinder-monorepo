import sys

class BrokenPipeProtection:
    def __init__(self, original_stream):
        self.original_stream = original_stream

    def write(self, data):
        try:
            self.original_stream.write(data)
            self.original_stream.flush()
        except BrokenPipeError:
            # Silently handle broken pipe
            pass
        except Exception as e:
            # Log other exceptions to a file instead of stdout/stderr
            with open("stream_errors.log", "a") as f:
                f.write(f"Stream error: {str(e)}\n")

    def flush(self):
        try:
            self.original_stream.flush()
        except BrokenPipeError:
            pass
        except Exception:
            pass

    def __getattr__(self, attr):
        return getattr(self.original_stream, attr)
