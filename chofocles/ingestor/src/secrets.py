"""Cifrado simétrico de credenciales sensibles (SMTP/IMAP del chofer).

Compatible byte-a-byte con el módulo `api/src/secrets.js` de chofocles.
Algoritmo: AES-256-GCM. Clave: CHOFOCLES_SECRETS_KEY (32 bytes en base64).
Formato persistido: base64( IV[12] || ciphertext || authTag[16] ).
"""
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_LENGTH = 12
AUTH_TAG_LENGTH = 16
KEY_LENGTH = 32

_cached_key: bytes | None = None


def _get_key() -> bytes:
    global _cached_key
    if _cached_key is not None:
        return _cached_key
    raw = os.environ.get('CHOFOCLES_SECRETS_KEY')
    if not raw:
        raise RuntimeError('CHOFOCLES_SECRETS_KEY no definida en entorno')
    key = base64.b64decode(raw)
    if len(key) != KEY_LENGTH:
        raise RuntimeError(
            f'CHOFOCLES_SECRETS_KEY debe ser {KEY_LENGTH} bytes en base64 '
            f'(recibidos {len(key)})'
        )
    _cached_key = key
    return _cached_key


def encrypt(plaintext: str) -> str:
    if not isinstance(plaintext, str):
        raise TypeError('encrypt: plaintext debe ser str')
    key = _get_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(IV_LENGTH)
    # AESGCM.encrypt devuelve ciphertext+authTag concatenados al final.
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    blob = iv + ct_with_tag
    return base64.b64encode(blob).decode('ascii')


def decrypt(encoded: str) -> str:
    if not isinstance(encoded, str):
        raise TypeError('decrypt: encoded debe ser str')
    key = _get_key()
    blob = base64.b64decode(encoded)
    if len(blob) <= IV_LENGTH + AUTH_TAG_LENGTH:
        raise ValueError('decrypt: payload demasiado corto')
    iv = blob[:IV_LENGTH]
    ct_with_tag = blob[IV_LENGTH:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ct_with_tag, None)
    return plaintext.decode('utf-8')


def _reset_key_cache() -> None:
    """Solo para tests."""
    global _cached_key
    _cached_key = None
