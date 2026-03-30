"""
Gmail Integration for Ninjacart GRN Email Automation
Reads emails from Gmail, extracts CSV attachments, and processes GRN data
"""
import os
import base64
import csv
import io
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Any
import warnings
from pathlib import Path

from dotenv import load_dotenv
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

# Load environment from backend/.env
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

logger = logging.getLogger("freshflow.gmail")

# Gmail API Scopes
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

# Environment variables
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
# Default redirect URI - can be overridden dynamically
DEFAULT_GMAIL_REDIRECT_URI = os.environ.get('GMAIL_REDIRECT_URI', 'https://harvest-hub-384.emergent.host/api/oauth/gmail/callback')


def get_oauth_flow(redirect_uri: str = None):
    """Create OAuth flow for Gmail authorization"""
    uri = redirect_uri or DEFAULT_GMAIL_REDIRECT_URI
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        },
        scopes=GMAIL_SCOPES,
        redirect_uri=uri
    )


def get_authorization_url(state: str, redirect_uri: str = None) -> str:
    """Generate Gmail OAuth authorization URL"""
    flow = get_oauth_flow(redirect_uri)
    url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        state=state
    )
    return url


def exchange_code_for_tokens(code: str, redirect_uri: str = None) -> Dict[str, Any]:
    """Exchange authorization code for tokens"""
    flow = get_oauth_flow(redirect_uri)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        flow.fetch_token(code=code)
    
    creds = flow.credentials
    
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "expires_at": creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None
    }


def get_gmail_credentials(token_data: Dict[str, Any]) -> Credentials:
    """Get Gmail credentials from stored token data, refreshing if needed"""
    creds = Credentials(
        token=token_data["access_token"],
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_data.get("client_id", GOOGLE_CLIENT_ID),
        client_secret=token_data.get("client_secret", GOOGLE_CLIENT_SECRET)
    )
    
    # Check if token is expired
    expires_at = token_data.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) >= expires_at:
            logger.info("Gmail token expired, refreshing...")
            creds.refresh(GoogleRequest())
    
    return creds


def get_gmail_service(token_data: Dict[str, Any]):
    """Get Gmail API service instance"""
    creds = get_gmail_credentials(token_data)
    return build('gmail', 'v1', credentials=creds)


def search_ninjacart_emails(service, max_results: int = 10, after_date: str = None) -> List[Dict]:
    """
    Search for Ninjacart GRN emails
    Returns list of email message IDs
    """
    # Build search query for Ninjacart emails
    query_parts = [
        'from:ninjacart OR from:Ninjacart OR subject:ninjacart OR subject:GRN'
    ]
    
    if after_date:
        query_parts.append(f'after:{after_date}')
    
    query = ' '.join(query_parts)
    
    try:
        result = service.users().messages().list(
            userId='me',
            q=query,
            maxResults=max_results
        ).execute()
        
        return result.get('messages', [])
    except Exception as e:
        logger.error(f"Error searching emails: {e}")
        return []


def get_email_content(service, message_id: str) -> Dict[str, Any]:
    """
    Get full email content including body and attachments
    """
    try:
        message = service.users().messages().get(
            userId='me',
            id=message_id,
            format='full'
        ).execute()
        
        headers = {h['name']: h['value'] for h in message['payload'].get('headers', [])}
        
        result = {
            'id': message_id,
            'subject': headers.get('Subject', ''),
            'from': headers.get('From', ''),
            'date': headers.get('Date', ''),
            'body_text': '',
            'body_html': '',
            'attachments': []
        }
        
        # Parse email body and attachments
        def parse_parts(parts):
            for part in parts:
                mime_type = part.get('mimeType', '')
                filename = part.get('filename', '')
                
                if filename and part.get('body', {}).get('attachmentId'):
                    # This is an attachment
                    result['attachments'].append({
                        'filename': filename,
                        'mime_type': mime_type,
                        'attachment_id': part['body']['attachmentId'],
                        'size': part['body'].get('size', 0)
                    })
                elif mime_type == 'text/plain':
                    data = part.get('body', {}).get('data', '')
                    if data:
                        result['body_text'] = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                elif mime_type == 'text/html':
                    data = part.get('body', {}).get('data', '')
                    if data:
                        result['body_html'] = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                elif 'parts' in part:
                    parse_parts(part['parts'])
        
        payload = message.get('payload', {})
        if 'parts' in payload:
            parse_parts(payload['parts'])
        else:
            # Single part message
            mime_type = payload.get('mimeType', '')
            data = payload.get('body', {}).get('data', '')
            if data:
                decoded = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                if mime_type == 'text/plain':
                    result['body_text'] = decoded
                elif mime_type == 'text/html':
                    result['body_html'] = decoded
        
        return result
    except Exception as e:
        logger.error(f"Error getting email content: {e}")
        return None


def download_attachment(service, message_id: str, attachment_id: str) -> bytes:
    """Download email attachment"""
    try:
        attachment = service.users().messages().attachments().get(
            userId='me',
            messageId=message_id,
            id=attachment_id
        ).execute()
        
        data = attachment.get('data', '')
        return base64.urlsafe_b64decode(data)
    except Exception as e:
        logger.error(f"Error downloading attachment: {e}")
        return None


def parse_ninjacart_csv(csv_content: bytes) -> List[Dict[str, Any]]:
    """
    Parse Ninjacart GRN CSV file
    Expected columns: Product Name, Ordered Qty, Received Qty, Rate, etc.
    """
    try:
        # Try different encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                text = csv_content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            text = csv_content.decode('utf-8', errors='ignore')
        
        # Parse CSV
        reader = csv.DictReader(io.StringIO(text))
        items = []
        
        for row in reader:
            # Normalize column names (handle variations)
            normalized = {k.lower().strip().replace(' ', '_'): v for k, v in row.items()}
            
            # Extract relevant fields with fallbacks
            item = {
                'product_name': normalized.get('product_name') or normalized.get('product') or normalized.get('item_name') or '',
                'ordered_qty': parse_float(normalized.get('ordered_qty') or normalized.get('order_qty') or normalized.get('dispatched_qty') or '0'),
                'received_qty': parse_float(normalized.get('received_qty') or normalized.get('grn_qty') or normalized.get('actual_qty') or '0'),
                'rate': parse_float(normalized.get('rate') or normalized.get('price') or normalized.get('unit_price') or '0'),
                'amount': parse_float(normalized.get('amount') or normalized.get('total') or normalized.get('value') or '0'),
                'unit': normalized.get('unit') or normalized.get('uom') or 'Kg',
                'remarks': normalized.get('remarks') or normalized.get('comment') or ''
            }
            
            # Calculate amount if not provided
            if item['amount'] == 0 and item['received_qty'] > 0 and item['rate'] > 0:
                item['amount'] = item['received_qty'] * item['rate']
            
            if item['product_name']:
                items.append(item)
        
        return items
    except Exception as e:
        logger.error(f"Error parsing CSV: {e}")
        return []


def parse_float(value: str) -> float:
    """Safely parse float from string"""
    if not value:
        return 0.0
    try:
        # Remove common formatting
        cleaned = re.sub(r'[^\d.-]', '', str(value))
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def parse_ninjacart_email_body(body_text: str) -> List[Dict[str, Any]]:
    """
    Parse Ninjacart GRN data from email body text
    This is a fallback if CSV attachment is not available
    """
    items = []
    
    # Try to extract tabular data from email body
    lines = body_text.split('\n')
    
    # Look for patterns like: "Product Name | Qty | Rate | Amount"
    for line in lines:
        # Skip empty lines or headers
        if not line.strip() or 'product' in line.lower() and 'qty' in line.lower():
            continue
        
        # Try to parse pipe-delimited or tab-delimited data
        parts = re.split(r'[|\t]', line)
        if len(parts) >= 3:
            try:
                item = {
                    'product_name': parts[0].strip(),
                    'received_qty': parse_float(parts[1] if len(parts) > 1 else '0'),
                    'rate': parse_float(parts[2] if len(parts) > 2 else '0'),
                    'amount': parse_float(parts[3] if len(parts) > 3 else '0'),
                }
                if item['product_name'] and item['received_qty'] > 0:
                    items.append(item)
            except (IndexError, ValueError):
                continue
    
    return items


def mark_email_as_read(service, message_id: str):
    """Mark email as read"""
    try:
        service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'removeLabelIds': ['UNREAD']}
        ).execute()
    except Exception as e:
        logger.error(f"Error marking email as read: {e}")


def add_label_to_email(service, message_id: str, label_name: str = "FreshFlow-Processed"):
    """Add a label to email to mark it as processed"""
    try:
        # First, get or create the label
        labels = service.users().labels().list(userId='me').execute()
        label_id = None
        
        for label in labels.get('labels', []):
            if label['name'] == label_name:
                label_id = label['id']
                break
        
        if not label_id:
            # Create the label
            new_label = service.users().labels().create(
                userId='me',
                body={'name': label_name, 'labelListVisibility': 'labelShow', 'messageListVisibility': 'show'}
            ).execute()
            label_id = new_label['id']
        
        # Apply label to message
        service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'addLabelIds': [label_id]}
        ).execute()
        
        return True
    except Exception as e:
        logger.error(f"Error adding label: {e}")
        return False
