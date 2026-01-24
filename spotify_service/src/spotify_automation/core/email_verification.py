import sys
import imaplib
import email
from email.header import decode_header
import chardet
import re
import time
import logging
from .stream_protection import BrokenPipeProtection


class EmailVerificationHandler:
    def __init__(
        self,
        email_address,
        email_password,
        imap_server="mail.spacemail.com",
        imap_port=993,
    ):
        self.email_address = email_address
        self.email_password = email_password
        self.imap_server = imap_server
        self.imap_port = imap_port
        self.mail = None

    # Use extracted BrokenPipeProtection
    sys.stdout = BrokenPipeProtection(sys.stdout)
    sys.stderr = BrokenPipeProtection(sys.stderr)

    def decode_text(self, text, default_encoding="utf-8"):
        """Safely decode text with multiple encoding attempts"""
        if isinstance(text, str):
            return text

        if isinstance(text, bytes):
            # Try chardet first
            detected = chardet.detect(text)
            if detected and detected["confidence"] > 0.5:
                try:
                    return text.decode(detected["encoding"])
                except:
                    pass
                    # Try common encodings
            encodings = ["utf-8", "latin-1", "iso-8859-1", "ascii", "windows-1252"]
            for encoding in encodings:
                try:
                    return text.decode(encoding)
                except:
                    continue
                    # Fall back to replacing invalid characters
            return text.decode(default_encoding, errors="replace")

        return str(text)

    def get_email_content(self, email_message):
        """Safely extract email content handling various encodings"""
        try:
            # Get subject
            subject = email_message.get("Subject", "")
            if subject:
                decoded_header = decode_header(subject)[0]
                subject_text = decoded_header[0]
                encoding = decoded_header[1]
                if encoding:
                    try:
                        subject = subject_text.decode(encoding)
                    except:
                        subject = self.decode_text(subject_text)
                else:
                    subject = self.decode_text(subject_text)
            print(f"Processing email with subject: {subject}")
            # Get body
            body = ""
            if email_message.is_multipart():
                for part in email_message.walk():
                    if part.get_content_type() == "text/plain":
                        try:
                            payload = part.get_payload(decode=True)
                            body = self.decode_text(payload)
                            break
                        except Exception as e:
                            print(f"Error decoding multipart: {str(e)}")
                            continue
            else:
                try:
                    payload = email_message.get_payload(decode=True)
                    body = self.decode_text(payload)
                except Exception as e:
                    print(f"Error decoding body: {str(e)}")
            return subject, body
        except Exception as e:
            print(f"Error getting email content: {str(e)}")
            return "", ""

    def get_verification_code(self, wait_time=120, check_interval=10):
        """
        Monitor inbox for Spotify verification code with improved handling for Snap/venv.

        Args:
            wait_time (int): Total time to wait for code in seconds
            check_interval (int): How often to check for new emails

        Returns:
            str: Verification code if found, None otherwise
        """
        logger = logging.getLogger(__name__)

        try:
            if not self.mail:
                logger.info("No active email connection, attempting to connect")
                if not self.connect():
                    logger.error("Failed to connect to email server")
                    return None

            # Record start time to only accept emails newer than this
            from datetime import datetime

            start_timestamp = datetime.now()
            logger.info(f"Monitoring inbox for Spotify verification code...")
            logger.info(
                f"Will only consider emails after {start_timestamp.strftime('%H:%M:%S')}"
            )

            start_time = time.time()
            last_check_time = 0
            email_check_count = 0

            while time.time() - start_time < wait_time:
                try:
                    current_time = time.time()
                    # Only log periodically to avoid excessive output
                    if current_time - last_check_time >= check_interval:
                        remaining_time = wait_time - (current_time - start_time)
                        logger.info(
                            f"Waiting for verification code... {int(remaining_time)}s remaining"
                        )
                        last_check_time = current_time
                        email_check_count += 1

                        # Check inbox
                        try:
                            self.mail.select("INBOX")
                            date = datetime.now().strftime("%d-%b-%Y")

                            # Look for emails from Spotify with verification code in subject
                            # Try multiple search patterns to increase chances of finding it
                            search_patterns = [
                                '(ON {date} FROM "Spotify" SUBJECT "Anmeldecode")',
                                '(ON {date} FROM "Spotify" SUBJECT "code")',
                                '(ON {date} FROM "Spotify" SUBJECT "verification")',
                                '(SINCE {date} FROM "Spotify")',
                            ]

                            for pattern in search_patterns:
                                try:
                                    _, messages = self.mail.search(
                                        None, pattern.format(date=date)
                                    )
                                    if messages and messages[0]:
                                        break
                                except Exception as search_error:
                                    logger.warning(
                                        f"Search pattern failed: {str(search_error)}"
                                    )
                                    continue

                            if messages and messages[0]:
                                email_ids = messages[0].split()
                                # Process newest emails first (reversed)
                                for email_id in reversed(email_ids):
                                    try:
                                        _, msg = self.mail.fetch(email_id, "(RFC822)")
                                        email_body = msg[0][1]
                                        email_message = email.message_from_bytes(
                                            email_body
                                        )

                                        # Get email content safely
                                        subject, body = self.get_email_content(
                                            email_message
                                        )

                                        # Extract verification code using multiple patterns
                                        code_patterns = [
                                            r"(\d{6})",  # Exactly 6 digits
                                            r"\*\*(\d{6})\*\*",  # 6 digits between asterisks
                                            r"code[:\s]+(\d{6})",  # "code" followed by 6 digits
                                            r"verification[:\s]+(\d{6})",  # "verification" followed by 6 digits
                                        ]

                                        for pattern in code_patterns:
                                            # Check subject
                                            match = re.search(pattern, subject)
                                            if match:
                                                code = (
                                                    match.group(1)
                                                    if len(match.groups()) > 0
                                                    else match.group(0)
                                                )
                                                logger.info(
                                                    f"Found verification code in subject: {code}"
                                                )
                                                return code

                                            # Check body
                                            if body:
                                                match = re.search(pattern, body)
                                                if match:
                                                    code = (
                                                        match.group(1)
                                                        if len(match.groups()) > 0
                                                        else match.group(0)
                                                    )
                                                    logger.info(
                                                        f"Found verification code in body: {code}"
                                                    )
                                                    return code

                                    except Exception as email_error:
                                        logger.error(
                                            f"Error processing email: {str(email_error)}"
                                        )
                                        continue
                        except Exception as inbox_error:
                            logger.error(f"Error checking inbox: {str(inbox_error)}")
                            # Try to reconnect if there's an issue
                            try:
                                self.mail.close()
                                self.mail.logout()
                            except:
                                pass
                            self.mail = None
                            if not self.connect():
                                logger.error("Failed to reconnect to email server")
                                time.sleep(check_interval)

                    # Short sleep between iterations to prevent CPU spin
                    time.sleep(1)

                except Exception as e:
                    logger.error(f"Error in verification code loop: {str(e)}")
                    time.sleep(check_interval)

            logger.info("Timeout waiting for verification code")
            return None

        except Exception as e:
            logger.error(f"Error in get_verification_code: {str(e)}")
            return None

        finally:
            try:
                if self.mail:
                    self.mail.close()
                    self.mail.logout()
            except:
                pass

    def connect(self):
        """Establish connection to email server with better error handling for Snap/venv"""
        try:
            # Use logger instead of direct print to avoid broken pipe issues
            logger = logging.getLogger(__name__)
            logger.info(f"Connecting to {self.imap_server}...")

            # Use socket timeout to prevent hanging connections
            import socket

            default_timeout = socket.getdefaulttimeout()
            socket.setdefaulttimeout(30)  # 30 second timeout

            try:
                # Create a new IMAP connection with explicit timeout
                self.mail = imaplib.IMAP4_SSL(self.imap_server, self.imap_port)
                self.mail.login(self.email_address, self.email_password)
                logger.info("Successfully connected to email server")
                return True
            finally:
                # Restore default timeout
                socket.setdefaulttimeout(default_timeout)

        except Exception as e:
            # Log error instead of printing
            logger = logging.getLogger(__name__)
            logger.error(f"Connection failed: {str(e)}")

            # Handle specific errors
            if "Broken pipe" in str(e):
                logger.error(
                    "Broken pipe detected - likely an issue with containerized environment"
                )
            elif "Connection refused" in str(e):
                logger.error(
                    "Connection refused - email server may be blocking requests"
                )
            elif "Authentication failed" in str(e):
                logger.error("Authentication failed - check credentials")

            return False
