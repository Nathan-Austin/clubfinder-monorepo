import sys
import imaplib
import email
from email.header import decode_header
import chardet
import re
import time
import logging
import socket
from datetime import datetime
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
            detected = chardet.detect(text)
            if detected and detected["confidence"] > 0.5:
                try:
                    return text.decode(detected["encoding"])
                except Exception:
                    pass

            encodings = ["utf-8", "latin-1", "iso-8859-1", "ascii", "windows-1252"]
            for encoding in encodings:
                try:
                    return text.decode(encoding)
                except Exception:
                    continue
            return text.decode(default_encoding, errors="replace")

        return str(text)

    def _decode_subject(self, email_message):
        """Extract and decode email subject."""
        subject = email_message.get("Subject", "")
        if subject:
            try:
                decoded_header = decode_header(subject)[0]
                subject_text = decoded_header[0]
                encoding = decoded_header[1]
                if encoding:
                    try:
                        return subject_text.decode(encoding)
                    except Exception:
                        return self.decode_text(subject_text)
                return self.decode_text(subject_text)
            except Exception:
                return self.decode_text(subject)
        return subject

    def _extract_body(self, email_message):
        """Extract and decode email body."""
        body = ""
        try:
            if email_message.is_multipart():
                for part in email_message.walk():
                    if part.get_content_type() == "text/plain":
                        try:
                            payload = part.get_payload(decode=True)
                            return self.decode_text(payload)
                        except Exception:
                            continue
            else:
                try:
                    payload = email_message.get_payload(decode=True)
                    return self.decode_text(payload)
                except Exception:
                    pass
        except Exception as e:
            print(f"Error decoding body: {str(e)}")
        return body

    def get_email_content(self, email_message):
        """Safely extract email content handling various encodings"""
        try:
            subject = self._decode_subject(email_message)
            print(f"Processing email with subject: {subject}")
            body = self._extract_body(email_message)
            return subject, body
        except Exception as e:
            print(f"Error getting email content: {str(e)}")
            return "", ""

    def _find_verification_code_in_text(self, subject, body):
        """Search for verification code patterns in subject and body."""
        logger = logging.getLogger(__name__)
        code_patterns = [
            r"(\d{6})",
            r"\*\*(\d{6})\*\*",
            r"code[:\s]+(\d{6})",
            r"verification[:\s]+(\d{6})",
        ]

        for pattern in code_patterns:
            match = re.search(pattern, subject)
            if match:
                code = match.group(1) if match.groups() else match.group(0)
                logger.info(f"Found verification code in subject: {code}")
                return code

            if body:
                match = re.search(pattern, body)
                if match:
                    code = match.group(1) if match.groups() else match.group(0)
                    logger.info(f"Found verification code in body: {code}")
                    return code
        return None

    def _search_inbox(self):
        """Search inbox for relevant Spotify emails."""
        self.mail.select("INBOX")
        date = datetime.now().strftime("%d-%b-%Y")
        search_patterns = [
            '(ON {date} FROM "Spotify" SUBJECT "Anmeldecode")',
            '(ON {date} FROM "Spotify" SUBJECT "code")',
            '(ON {date} FROM "Spotify" SUBJECT "verification")',
            '(SINCE {date} FROM "Spotify")',
        ]

        messages = None
        for pattern in search_patterns:
            try:
                _, messages = self.mail.search(None, pattern.format(date=date))
                if messages and messages[0]:
                    return messages[0].split()
            except Exception:
                continue
        return []

    def _process_emails(self, email_ids):
        """Process a list of email IDs to find verification code."""
        for email_id in reversed(email_ids):
            try:
                _, msg = self.mail.fetch(email_id, "(RFC822)")
                email_body = msg[0][1]
                email_message = email.message_from_bytes(email_body)
                subject, body = self.get_email_content(email_message)
                code = self._find_verification_code_in_text(subject, body)
                if code:
                    return code
            except Exception:
                continue
        return None

    def get_verification_code(self, wait_time=120, check_interval=10):
        """Monitor inbox for Spotify verification code."""
        logger = logging.getLogger(__name__)
        if not self.mail and not self.connect():
            return None

        start_time = time.time()
        last_check_time = 0

        while time.time() - start_time < wait_time:
            try:
                current_time = time.time()
                if current_time - last_check_time >= check_interval:
                    last_check_time = current_time
                    logger.info(
                        f"Waiting for code... {int(wait_time - (current_time - start_time))}s left"  # noqa: E501
                    )

                    try:
                        email_ids = self._search_inbox()
                        if email_ids:
                            code = self._process_emails(email_ids)
                            if code:
                                return code
                    except Exception:
                        self._reconnect()
                time.sleep(1)
            except Exception as e:
                logger.error(f"Error in verification loop: {str(e)}")
                time.sleep(check_interval)

        return None

    def _reconnect(self):
        """Attempt to reconnect to the email server."""
        try:
            if self.mail:
                self.mail.close()
                self.mail.logout()
        except Exception:
            pass
        self.mail = None
        self.connect()

    def connect(self):
        """Establish connection to email server."""
        logger = logging.getLogger(__name__)
        try:
            logger.info(f"Connecting to {self.imap_server}...")
            default_timeout = socket.getdefaulttimeout()
            socket.setdefaulttimeout(30)

            try:
                self.mail = imaplib.IMAP4_SSL(self.imap_server, self.imap_port)
                self.mail.login(self.email_address, self.email_password)
                logger.info("Successfully connected to email server")
                return True
            finally:
                socket.setdefaulttimeout(default_timeout)

        except Exception as e:
            logger.error(f"Connection failed: {str(e)}")
            return False

    def close(self):
        """Close connection."""
        try:
            if self.mail:
                self.mail.close()
                self.mail.logout()
        except Exception:
            pass
