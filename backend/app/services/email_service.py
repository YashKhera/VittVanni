import smtplib
import traceback
from email.message import EmailMessage

from app.config import settings


def send_email(to: str, subject: str, body: str) -> bool:
    host = settings.SMTP_HOST
    if not host:
        return False
    username = settings.SMTP_USERNAME
    password = settings.SMTP_PASSWORD
    from_addr = settings.EMAIL_FROM or username
    if not from_addr:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(body)

    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(host, settings.SMTP_PORT, timeout=30) as server:
                if username and password:
                    server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, settings.SMTP_PORT, timeout=30) as server:
                server.starttls()
                if username and password:
                    server.login(username, password)
                server.send_message(msg)
        return True
    except Exception as exc:
        print(f"[EMAIL] send failed to {to}: {type(exc).__name__}: {exc}")
        print(traceback.format_exc())
        return False