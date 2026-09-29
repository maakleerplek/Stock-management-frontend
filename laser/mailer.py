"""Sends the cellar storage mails (storage.py).

MAIL_BACKEND picks how:
    graph   Microsoft Graph sendMail as MAIL_FROM, with an app registration
            (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET) that has
            the application permission Mail.Send.
    smtp    SMTP with STARTTLS (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD).
    empty   no mail; the message is only printed to the log.

send() raises when the mail did not go out, so the caller can try again later.
"""
import os
import smtplib
import time
from email.message import EmailMessage

import requests

BACKEND = os.environ.get('MAIL_BACKEND', '').strip().lower()
MAIL_FROM = os.environ.get('MAIL_FROM', '')

_graph_token = {'value': '', 'until': 0.0}


def send(to: str, subject: str, text: str):
    if BACKEND == 'graph':
        _send_graph(to, subject, text)
    elif BACKEND == 'smtp':
        _send_smtp(to, subject, text)
    else:
        print(f'[mail] (not sent, MAIL_BACKEND is empty) to {to}: {subject}\n{text}')


def _graph_access_token() -> str:
    if time.time() < _graph_token['until']:
        return _graph_token['value']
    tenant = os.environ['GRAPH_TENANT_ID']
    r = requests.post(f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token', data={
        'grant_type': 'client_credentials',
        'client_id': os.environ['GRAPH_CLIENT_ID'],
        'client_secret': os.environ['GRAPH_CLIENT_SECRET'],
        'scope': 'https://graph.microsoft.com/.default',
    }, timeout=15)
    if not r.ok:
        raise RuntimeError(f'Graph token: {r.status_code} {r.text[:300]}')
    data = r.json()
    _graph_token['value'] = data['access_token']
    _graph_token['until'] = time.time() + int(data.get('expires_in', 3600)) - 60
    return _graph_token['value']


def _send_graph(to: str, subject: str, text: str):
    r = requests.post(
        f'https://graph.microsoft.com/v1.0/users/{MAIL_FROM}/sendMail',
        headers={'Authorization': f'Bearer {_graph_access_token()}'},
        json={'message': {'subject': subject,
                          'body': {'contentType': 'Text', 'content': text},
                          'toRecipients': [{'emailAddress': {'address': to}}]},
              'saveToSentItems': True},
        timeout=15)
    if r.status_code != 202:
        raise RuntimeError(f'Graph sendMail: {r.status_code} {r.text[:300]}')


def _send_smtp(to: str, subject: str, text: str):
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = MAIL_FROM, to, subject
    msg.set_content(text)
    with smtplib.SMTP(os.environ.get('SMTP_HOST', 'smtp.office365.com'),
                      int(os.environ.get('SMTP_PORT', '587')), timeout=15) as s:
        s.starttls()
        if os.environ.get('SMTP_USER'):
            s.login(os.environ['SMTP_USER'], os.environ.get('SMTP_PASSWORD', ''))
        s.send_message(msg)
